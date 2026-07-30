// Swappable Q&A interface for Emotion Lens, mirroring the mock/real pattern
// used throughout this backend. Unlike the vision/narration providers, this
// returns plain text, not JSON — a real answer to a real question doesn't
// need a schema, which sidesteps the JSON-compliance issues seen elsewhere.

const path = require('path');
const { getIamToken } = require('../vision/iamAuth');
const { retrieveNarrativeGuidelines } = require('../rag/retrieve');
const { cached, cacheKeyFor } = require('../shared/diskCache');
const { cascade, orderedCascadeSteps, REAL_PROVIDERS } = require('../shared/cascade');
const { verifyCitations } = require('./citationGuard');
const QA_CACHE_DIR = path.join(__dirname, '.cache');

function mockAnswer(storyBible, question) {
  const q = question.toLowerCase();
  const nameMatch = storyBible.match(/^([A-Z][a-zA-Z]*) appears in/gm) || [];
  const names = nameMatch.map((m) => m.replace(' appears in', ''));
  const mentioned = names.find((name) => q.includes(name.toLowerCase()));

  if (mentioned) {
    const linesBlock = storyBible.split('\n').find((line) => line.startsWith(`${mentioned} appears`));
    return `(Mock answer — no real Q&A provider configured.) Based on the page: ${linesBlock}`;
  }
  return "(Mock answer — no real Q&A provider configured.) I don't have enough information tagged in this mock response to answer that specifically.";
}

function buildPrompt(storyBible, question, unverifiedQuotes) {
  const guidelines = retrieveNarrativeGuidelines()
    .map((g) => `- ${g}`)
    .join('\n');

  // Only present on a retry: the citation guard (citationGuard.js) found
  // that a previous answer quoted text that doesn't actually appear in the
  // story bible below — this is fed back so the model can self-correct
  // instead of the guard silently discarding the whole answer.
  const correctionNote = unverifiedQuotes && unverifiedQuotes.length
    ? `\n\nIMPORTANT: In a previous attempt you put the following in quotation marks, but it does not appear verbatim in the page breakdown below: ${unverifiedQuotes.map((q) => `"${q}"`).join(', ')}. Only use quotation marks around text that appears exactly in the breakdown — paraphrase without quotes otherwise.\n`
    : '';

  return `You are answering a reader's question about a comic page, for a blind or low-vision
listener. Follow these principles:
${guidelines}${correctionNote}

Here is the structured breakdown of the page, in reading order:
${storyBible}

Question: ${question}

Answer in 1-4 spoken sentences. Do not repeat the question. Do not use markdown formatting.`;
}

async function watsonxAnswer(storyBible, question, unverifiedQuotes) {
  const { WATSONX_URL, WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_TEXT_MODEL_ID } = process.env;
  if (!WATSONX_URL || !WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    throw new Error('watsonx not configured: set WATSONX_URL, WATSONX_API_KEY, WATSONX_PROJECT_ID');
  }

  const iamToken = await getIamToken(WATSONX_API_KEY);
  const res = await fetch(`${WATSONX_URL}/ml/v1/text/chat?version=2024-05-01`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${iamToken}`,
    },
    body: JSON.stringify({
      model_id: WATSONX_TEXT_MODEL_ID || 'ibm/granite-3-8b-instruct',
      project_id: WATSONX_PROJECT_ID,
      max_tokens: 300,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(storyBible, question, unverifiedQuotes) }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`watsonx request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('watsonx returned an empty answer');
  return text.trim();
}

/** Alternate provider: Google Gemini (non-IBM) — same stand-in reasoning
 * as vision/visionProvider.js's Gemini path. */
async function geminiAnswer(storyBible, question, unverifiedQuotes) {
  const { callGeminiText } = require('../shared/geminiClient');
  const text = await callGeminiText(buildPrompt(storyBible, question, unverifiedQuotes));
  if (!text.trim()) throw new Error('Gemini returned an empty answer');
  return text.trim();
}

/** Local provider: Ollama (llama3.2:1b by default) — no key, no quota. */
async function localAnswer(storyBible, question, unverifiedQuotes) {
  const { callLocalText } = require('../shared/localClient');
  const text = await callLocalText(buildPrompt(storyBible, question, unverifiedQuotes));
  if (!text.trim()) throw new Error('local model returned an empty answer');
  return text.trim();
}

async function askProviders(provider, storyBible, question, unverifiedQuotes) {
  return cascade(
    orderedCascadeSteps(provider, {
      watsonx: () => watsonxAnswer(storyBible, question, unverifiedQuotes),
      gemini: () => geminiAnswer(storyBible, question, unverifiedQuotes),
      local: () => localAnswer(storyBible, question, unverifiedQuotes),
    })
  );
}

/** Returns `{ answer, citationWarning }`. `citationWarning` is true only
 * when a quoted claim in the final answer still couldn't be verified
 * against the story bible after one corrective retry — surfaced to the UI
 * the same way `usedMock` is, rather than silently letting a fabricated
 * quote through. */
async function answerQuestion(storyBible, question) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (!REAL_PROVIDERS.includes(provider)) {
    return { answer: mockAnswer(storyBible, question), citationWarning: false };
  }

  const key = cacheKeyFor(storyBible, question, 'cascade');
  const answer = await cached(QA_CACHE_DIR, key, () => askProviders(provider, storyBible, question));

  const check = verifyCitations(answer, storyBible);
  if (check.verified) return { answer, citationWarning: false };

  console.error('[emotionLens] citation guard flagged unverified quotes, retrying once:', check.unverifiedQuotes);
  const retryKey = cacheKeyFor(storyBible, question, 'cascade-citation-retry');
  const retryAnswer = await cached(QA_CACHE_DIR, retryKey, () =>
    askProviders(provider, storyBible, question, check.unverifiedQuotes)
  );
  const retryCheck = verifyCitations(retryAnswer, storyBible);
  if (!retryCheck.verified) {
    console.error('[emotionLens] citation still unverified after retry:', retryCheck.unverifiedQuotes);
  }
  return { answer: retryAnswer, citationWarning: !retryCheck.verified };
}

module.exports = { answerQuestion, mockAnswer };

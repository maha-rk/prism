// Swappable Q&A interface for Emotion Lens, mirroring the mock/real pattern
// used throughout this backend. Unlike the vision/narration providers, this
// returns plain text, not JSON — a real answer to a real question doesn't
// need a schema, which sidesteps the JSON-compliance issues seen elsewhere.

const path = require('path');
const { getIamToken } = require('../vision/iamAuth');
const { retrieveNarrativeGuidelines } = require('../rag/retrieve');
const { cached, cacheKeyFor } = require('../shared/diskCache');
const { cascade } = require('../shared/cascade');
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

function buildPrompt(storyBible, question) {
  const guidelines = retrieveNarrativeGuidelines()
    .map((g) => `- ${g}`)
    .join('\n');

  return `You are answering a reader's question about a comic page, for a blind or low-vision
listener. Follow these principles:
${guidelines}

Here is the structured breakdown of the page, in reading order:
${storyBible}

Question: ${question}

Answer in 1-4 spoken sentences. Do not repeat the question. Do not use markdown formatting.`;
}

async function watsonxAnswer(storyBible, question) {
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
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(storyBible, question) }] }],
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
async function geminiAnswer(storyBible, question) {
  const { callGeminiText } = require('../shared/geminiClient');
  const text = await callGeminiText(buildPrompt(storyBible, question));
  if (!text.trim()) throw new Error('Gemini returned an empty answer');
  return text.trim();
}

async function answerQuestion(storyBible, question) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (provider !== 'watsonx' && provider !== 'gemini') {
    return mockAnswer(storyBible, question);
  }
  const key = cacheKeyFor(storyBible, question, 'cascade');
  return cached(QA_CACHE_DIR, key, () =>
    provider === 'gemini'
      ? cascade('gemini', () => geminiAnswer(storyBible, question), 'watsonx', () => watsonxAnswer(storyBible, question))
      : cascade('watsonx', () => watsonxAnswer(storyBible, question), 'gemini', () => geminiAnswer(storyBible, question))
  );
}

module.exports = { answerQuestion, mockAnswer };

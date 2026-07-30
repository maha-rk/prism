// Swappable narrative-reconstruction interface — the second AI pass in
// Phase B. Takes the confirmed, ordered panel breakdown from Phase A and
// smooths it into a flowing narration: adding brief connective tissue
// between panels and resolving pronouns to established character names.
// It deliberately never rewrites dialogue or bbox/order data — those are
// the artist's/reader's own confirmed content, not the LLM's to change.
//
// Defaults to a mock (simple rotating connective phrases, no LLM call) so
// the pipeline works with zero credentials; set VISION_PROVIDER=watsonx to
// also drive this step from the same watsonx credentials (a text-only
// chat call, no image attached this time).

const path = require('path');
const { getIamToken } = require('../vision/iamAuth');
const { cached, cacheKeyFor } = require('../shared/diskCache');
const { cascade, orderedCascadeSteps, REAL_PROVIDERS } = require('../shared/cascade');
const RECONSTRUCT_CACHE_DIR = path.join(__dirname, '.cache');

const CONNECTIVES = ['Moments later,', 'Then,', 'Without warning,', 'Across the scene,', 'Just after,'];

function lowercaseFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function mockReconstructNarrative(panels) {
  return panels.map((panel, i) => {
    if (i === 0 || !panel.description) return panel;
    const connective = CONNECTIVES[(i - 1) % CONNECTIVES.length];
    return { ...panel, description: `${connective} ${lowercaseFirst(panel.description)}` };
  });
}

function extractJson(text) {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('reconstruction provider response did not contain JSON');
  return JSON.parse(match[0]);
}

function buildPrompt(panels) {
  const panelSummaries = panels
    .map((p, i) => `${i + 1}. [${p.id}] mood=${p.mood}; description="${p.description}"; dialogue=${JSON.stringify((p.dialogue || []).map((d) => d.speaker))}`)
    .join('\n');

  return `You are reconstructing a flowing audio narration from a panel-by-panel comic breakdown,
already confirmed in reading order by the reader. For each panel's description ONLY:
1. Add brief connective narration where the jump from the previous panel would feel abrupt
   (do not invent new plot events or visual details that were not already described).
2. Resolve vague references ("a figure", "someone") to the established character name once
   that character has already been introduced by name in an earlier panel's dialogue.
3. Keep each description to 1-3 sentences.
Do NOT change dialogue text, speaker names, bounding boxes, or reading order — only revise the
"description" field.

Panels in reading order:
${panelSummaries}

Do not show your reasoning and do not include any text before or after the JSON. Respond with
ONLY this JSON, nothing else: {"panels": [{"id": "p1", "description": "..."}, ...]} with one
entry per panel id.`;
}

/** Real provider: IBM watsonx.ai (text-only chat call, no image attached). */
async function watsonxReconstructNarrative(panels) {
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
      max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(panels) }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`watsonx request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return applyReconstruction(panels, text);
}

function applyReconstruction(panels, text) {
  const parsed = extractJson(text);
  if (!Array.isArray(parsed.panels)) throw new Error('missing panels array in reconstruction response');

  const revisedById = new Map(parsed.panels.map((p) => [p.id, p.description]));
  return panels.map((panel) => ({
    ...panel,
    description: revisedById.get(panel.id) ?? panel.description,
  }));
}

/** Alternate provider: Google Gemini (non-IBM) — same stand-in reasoning
 * as vision/visionProvider.js's Gemini path, used when watsonx's Lite-plan
 * token quota is exhausted. */
async function geminiReconstructNarrative(panels) {
  const { callGeminiText } = require('../shared/geminiClient');
  const text = await callGeminiText(buildPrompt(panels));
  return applyReconstruction(panels, text);
}

/** Local provider: Ollama (llama3.2:1b by default) — no key, no quota. */
async function localReconstructNarrative(panels) {
  const { callLocalText } = require('../shared/localClient');
  const text = await callLocalText(buildPrompt(panels));
  return applyReconstruction(panels, text);
}

async function reconstructNarrative(panels) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (!REAL_PROVIDERS.includes(provider)) {
    return mockReconstructNarrative(panels);
  }
  const key = cacheKeyFor(JSON.stringify(panels), 'cascade');
  return cached(RECONSTRUCT_CACHE_DIR, key, () =>
    cascade(
      orderedCascadeSteps(provider, {
        watsonx: () => watsonxReconstructNarrative(panels),
        gemini: () => geminiReconstructNarrative(panels),
        local: () => localReconstructNarrative(panels),
      })
    )
  );
}

module.exports = { reconstructNarrative, mockReconstructNarrative };

// Extracts a consistent visual-appearance description per named character
// from the already-analyzed panels — reused verbatim in every image-
// generation prompt that character appears in, so re-rendered panels stay
// as consistent as prompt-level description can make them (not pixel-
// identical the way a per-character fine-tune/LoRA would give — that's out
// of scope — but a real, meaningfully better technique than re-describing
// each character from scratch per panel).

const path = require('path');
const { getIamToken } = require('../vision/iamAuth');
const { cached, cacheKeyFor } = require('../shared/diskCache');
const { cascade } = require('../shared/cascade');
const CHARACTER_SHEET_CACHE_DIR = path.join(__dirname, '.cache');

function mockCharacterSheet(panels) {
  const sheet = {};
  for (const panel of panels) {
    for (const line of panel.dialogue || []) {
      if (sheet[line.speaker]) continue;
      sheet[line.speaker] = `a ${line.build || 'average'}-build ${line.gender === 'unknown' ? 'person' : line.gender}`;
    }
  }
  return sheet;
}

function extractJson(text) {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('character sheet response did not contain JSON');
  return JSON.parse(match[0]);
}

function buildPrompt(storyBible) {
  return `Given this structured breakdown of a comic page:
${storyBible}

For each named character, write a concise (1 sentence) physical appearance description
suitable for briefing an illustrator — hair, clothing, build, and any other visual detail
actually mentioned in the descriptions above. Do not invent details that aren't there; if
nothing specific is mentioned beyond gender/build, say so plainly rather than inventing detail.

Do not show your reasoning. Respond with ONLY this JSON object, nothing else:
{"CharacterName": "description", ...}`;
}

async function watsonxCharacterSheet(storyBible) {
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
      max_tokens: 1024,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(storyBible) }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`watsonx request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return extractJson(text);
}

/** Alternate provider: Google Gemini (non-IBM) — same stand-in reasoning
 * as vision/visionProvider.js's Gemini path. */
async function geminiCharacterSheet(storyBible) {
  const { callGeminiText } = require('../shared/geminiClient');
  const text = await callGeminiText(buildPrompt(storyBible));
  return extractJson(text);
}

async function buildCharacterSheet(storyBible, panels) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (provider === 'watsonx' || provider === 'gemini') {
    try {
      const key = cacheKeyFor(storyBible, 'cascade');
      return await cached(CHARACTER_SHEET_CACHE_DIR, key, () =>
        provider === 'gemini'
          ? cascade('gemini', () => geminiCharacterSheet(storyBible), 'watsonx', () => watsonxCharacterSheet(storyBible))
          : cascade('watsonx', () => watsonxCharacterSheet(storyBible), 'gemini', () => geminiCharacterSheet(storyBible))
      );
    } catch (err) {
      console.error('[imageGen] character sheet extraction failed, using mock fallback:', err.message);
      return mockCharacterSheet(panels);
    }
  }
  return mockCharacterSheet(panels);
}

module.exports = { buildCharacterSheet, mockCharacterSheet };

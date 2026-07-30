// Extracts a continuous emotional/atmospheric profile — from an image or a
// text description — used to drive Synesthesia Studio's generative
// soundscape synth. Unlike the comic-panel analysis, this doesn't need
// panel/dialogue structure at all, just a handful of continuous values, so
// it reuses the same watsonx/Gemini cascade infrastructure with a much
// simpler prompt and schema.

const { callWatsonxVision } = require('../vision/visionProvider');
const { callGeminiVision, callGeminiText } = require('../shared/geminiClient');
const { getIamToken } = require('../vision/iamAuth');
const { cached, cacheKeyFor } = require('../shared/diskCache');
const { cascade } = require('../shared/cascade');
const path = require('path');

const MOOD_CACHE_DIR = path.join(__dirname, '.cache');

function mockMood() {
  return {
    mood: 'calm',
    brightness: 0.5,
    energy: 0.3,
    warmth: 0.6,
    valence: 0.6,
    description: 'A calm, neutral atmosphere.',
  };
}

function extractJson(text) {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('mood response did not contain JSON');
  return JSON.parse(match[0]);
}

function clamp01(n, fallback) {
  return typeof n === 'number' && !Number.isNaN(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function validateMood(parsed) {
  return {
    mood: typeof parsed.mood === 'string' && parsed.mood ? parsed.mood : 'neutral',
    brightness: clamp01(parsed.brightness, 0.5),
    energy: clamp01(parsed.energy, 0.5),
    warmth: clamp01(parsed.warmth, 0.5),
    valence: clamp01(parsed.valence, 0.5),
    description: typeof parsed.description === 'string' ? parsed.description : '',
  };
}

const MOOD_SCHEMA_INSTRUCTIONS = `output an emotional/atmospheric profile as JSON with:
- mood: one word describing the overall mood/atmosphere
- brightness: a number from 0 (dark) to 1 (bright)
- energy: a number from 0 (calm, still) to 1 (chaotic, energetic)
- warmth: a number from 0 (cold, harsh) to 1 (warm, soft)
- valence: a number from 0 (sad, ominous) to 1 (happy, uplifting)
- description: one sentence describing the atmosphere

Do not show your reasoning. Respond with ONLY this JSON object, nothing else:
{"mood": "...", "brightness": 0.0, "energy": 0.0, "warmth": 0.0, "valence": 0.0, "description": "..."}`;

function buildImagePrompt() {
  return `You are an expert at reading the emotional atmosphere of an image for a generative ambient soundscape. Analyze the attached image and ${MOOD_SCHEMA_INSTRUCTIONS}`;
}

function buildTextPrompt(text) {
  return `You are an expert at reading the emotional atmosphere of a written description for a generative ambient soundscape. Description: "${text}"\n\nAnalyze it and ${MOOD_SCHEMA_INSTRUCTIONS}`;
}

// ---- Image path ----
async function watsonxMoodFromImage(imageBase64) {
  const text = await callWatsonxVision(imageBase64, buildImagePrompt());
  return validateMood(extractJson(text));
}
async function geminiMoodFromImage(imageBase64) {
  const text = await callGeminiVision(imageBase64, buildImagePrompt());
  return validateMood(extractJson(text));
}

async function moodFromImage(imageBase64) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (provider !== 'watsonx' && provider !== 'gemini') return mockMood();

  const key = cacheKeyFor(imageBase64, 'mood-image', 'cascade');
  return cached(MOOD_CACHE_DIR, key, () =>
    provider === 'gemini'
      ? cascade('gemini', () => geminiMoodFromImage(imageBase64), 'watsonx', () => watsonxMoodFromImage(imageBase64))
      : cascade('watsonx', () => watsonxMoodFromImage(imageBase64), 'gemini', () => geminiMoodFromImage(imageBase64))
  );
}

// ---- Text path ----
async function watsonxMoodFromText(text) {
  const { WATSONX_URL, WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_TEXT_MODEL_ID } = process.env;
  if (!WATSONX_URL || !WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    throw new Error('watsonx not configured: set WATSONX_URL, WATSONX_API_KEY, WATSONX_PROJECT_ID');
  }
  const iamToken = await getIamToken(WATSONX_API_KEY);
  const res = await fetch(`${WATSONX_URL}/ml/v1/text/chat?version=2024-05-01`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${iamToken}` },
    body: JSON.stringify({
      model_id: WATSONX_TEXT_MODEL_ID || 'ibm/granite-3-8b-instruct',
      project_id: WATSONX_PROJECT_ID,
      max_tokens: 300,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildTextPrompt(text) }] }],
    }),
  });
  if (!res.ok) {
    throw new Error(`watsonx request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const responseText = data.choices?.[0]?.message?.content ?? '';
  return validateMood(extractJson(responseText));
}
async function geminiMoodFromText(text) {
  const responseText = await callGeminiText(buildTextPrompt(text));
  return validateMood(extractJson(responseText));
}

async function moodFromText(text) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (provider !== 'watsonx' && provider !== 'gemini') return mockMood();

  const key = cacheKeyFor(text, 'mood-text', 'cascade');
  return cached(MOOD_CACHE_DIR, key, () =>
    provider === 'gemini'
      ? cascade('gemini', () => geminiMoodFromText(text), 'watsonx', () => watsonxMoodFromText(text))
      : cascade('watsonx', () => watsonxMoodFromText(text), 'gemini', () => geminiMoodFromText(text))
  );
}

module.exports = { moodFromImage, moodFromText, mockMood };

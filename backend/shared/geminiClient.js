// Shared Google Gemini call helpers (non-IBM) — a stand-in provider option
// used when watsonx's Lite-plan token quota is exhausted, since Gemini's
// plain multimodal *understanding* tier (text, and image-in/text-out) is
// genuinely free with no billing required. This is NOT the same as
// imageGen/imageProvider.js's Hugging Face path, which handles actual
// image *generation* — Gemini's image-generation tier needs billing,
// confirmed separately, and is not used here.

const DEFAULT_MODEL = 'gemini-flash-latest';

async function callGeminiText(prompt, modelId) {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini not configured: set GEMINI_API_KEY');
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId || DEFAULT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

async function callGeminiVision(imageBase64, prompt, modelId) {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini not configured: set GEMINI_API_KEY');
  }
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeMatch = imageBase64.match(/^data:(image\/[a-z]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId || DEFAULT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

module.exports = { callGeminiText, callGeminiVision };

// Local, zero-cost, zero-quota AI provider via Ollama running on localhost.
// Genuinely offline once models are pulled — no API key, no billing, no
// rate limit — so it's the one rung of the cascade that can never run out
// mid-demo the way watsonx's 300k/month or Gemini's 20/day free-tier caps
// did during development. See README for setup (`ollama pull moondream`,
// `ollama pull llama3.2:1b`). If Ollama isn't running or a model isn't
// pulled, these calls fail fast with a clear error and the cascade falls
// through to the next provider (or mock) exactly like any other provider
// failure — no special-casing needed at the call sites.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// llama3.2:3b, not the smaller/faster 1b: tested side by side on Emotion
// Lens's grounded-Q&A task specifically (the one place honesty matters
// most), 1b readily fabricated specific unstated backstory ("gangs have
// been active on this block") where 3b consistently hedged ("it seems...
// we can't say for certain") and stayed close to what the story bible
// actually said — a meaningfully better fit for a project built around not
// inventing things, worth the modest extra size/latency.
const LOCAL_TEXT_MODEL = process.env.LOCAL_TEXT_MODEL || 'llama3.2:3b';
// llava, not the smaller/faster moondream: moondream (a ~1.7GB model built
// for short image captioning) was tested against the real comic-analysis
// prompt and its full JSON schema and reliably returned malformed or empty
// output — too weak to follow a long, structured instruction set. llava
// (~4.7GB) reliably returns valid, schema-compliant JSON on the same
// prompt, at the cost of much higher latency (~60-90s vs. the cloud
// providers' few seconds) — an honest, disclosed tradeoff for the one
// provider rung that needs no API key and can't run out of quota.
const LOCAL_VISION_MODEL = process.env.LOCAL_VISION_MODEL || 'llava';

async function callOllama(model, prompt, images) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, images, stream: false }),
    });
  } catch (err) {
    throw new Error(`local Ollama not reachable at ${OLLAMA_URL} (is "ollama serve" running?): ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404) {
      throw new Error(`local Ollama model "${model}" not found — run "ollama pull ${model}" first`);
    }
    throw new Error(`local Ollama request failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.response || '';
}

/** Text-only local generation (narrative reconstruction, Q&A, character
 * sheets, mood-from-text). */
async function callLocalText(prompt, model) {
  return callOllama(model || LOCAL_TEXT_MODEL, prompt);
}

/** Local vision generation — `imageBase64` may be a raw base64 string or a
 * data: URL (the data: prefix is stripped, matching the other providers'
 * calling convention). */
async function callLocalVision(imageBase64, prompt, model) {
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  return callOllama(model || LOCAL_VISION_MODEL, prompt, [base64Data]);
}

module.exports = { callLocalText, callLocalVision };

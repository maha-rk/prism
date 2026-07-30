// Swappable vision-LLM interface for comic-page understanding, mirroring
// EchoCanvas's rag/llmProvider.js pattern. Defaults to a mock so the
// pipeline (panel detection -> reading order -> narration -> TTS) can be
// built, tested, and demoed with zero credentials; set
// VISION_PROVIDER=watsonx (plus WATSONX_* env vars) for real Granite Vision
// panel analysis.

const { SFX_VOCABULARY } = require('../sfx/sfxVocabulary');
const { getIamToken } = require('./iamAuth');

// A small, deterministic 4-panel demo story in a 2x2 grid — used whenever
// no real vision provider is configured, or the real call fails. Panels are
// normalized fractions of the page so they render sensibly over any
// uploaded image regardless of its actual dimensions.
function mockAnalyzeComicPage() {
  const gutter = 0.03;
  const half = (1 - gutter * 3) / 2;
  const positions = [
    { x: gutter, y: gutter },
    { x: gutter * 2 + half, y: gutter },
    { x: gutter, y: gutter * 2 + half },
    { x: gutter * 2 + half, y: gutter * 2 + half },
  ];
  const beats = [
    {
      caption: 'The night the signal went dark.',
      description:
        'A wide establishing shot of a rain-soaked rooftop at dusk, city lights blurring in the distance.',
      mood: 'tense',
      dialogue: [],
      sfx: ['rain', 'wind'],
    },
    {
      caption: '',
      description: 'Two figures crouch behind a satellite dish, one gesturing for quiet.',
      mood: 'anxious',
      dialogue: [{ speaker: 'Reyes', text: "Stay low. They're still scanning the block.", emotion: 'afraid', gender: 'male', build: 'average' }],
      sfx: ['heartbeat'],
    },
    {
      caption: '',
      description: 'Close on a hand prying open a rusted access panel, sparks catching the rain.',
      mood: 'urgent',
      dialogue: [{ speaker: 'Reyes', text: 'Got it. Thirty seconds, tops.', emotion: 'urgent', gender: 'male', build: 'average' }],
      sfx: ['crash'],
    },
    {
      caption: '',
      description: 'The city skyline floods back into light, the two figures silhouetted against it.',
      mood: 'relief',
      dialogue: [{ speaker: 'Mika', text: 'There. Now we run.', emotion: 'relieved', gender: 'female', build: 'average' }],
      sfx: ['whoosh'],
    },
  ];

  return {
    panels: positions.map((pos, i) => ({
      id: `p${i + 1}`,
      bbox: { x: pos.x, y: pos.y, w: half, h: half },
      suggestedOrder: i + 1,
      ...beats[i],
    })),
  };
}

function extractJson(text) {
  // Models sometimes wrap the JSON in a markdown code fence despite being told
  // not to — strip that before the brace search so it doesn't interfere.
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (!match) {
    dumpRawResponse(text);
    throw new Error('vision provider response did not contain JSON');
  }
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    dumpRawResponse(text);
    throw err;
  }
}

// Dumps the raw model response to disk whenever JSON extraction/parsing
// fails, so a real failure can be diagnosed from the actual text instead of
// guessing — the error message alone doesn't show what the model actually
// said just before/after the break point.
function dumpRawResponse(text) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '.debug');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `failed-response-${Date.now()}.txt`), text);
  } catch {
    // best-effort only, never let debug dumping mask the real error
  }
}

// Best-effort salvage parser for when the model ignores the "JSON only"
// instruction entirely and reverts to its natural markdown-bullet-outline
// style instead (a real, observed failure mode for this model — not
// hypothetical). Tolerant of the specific format actually seen in practice;
// not guaranteed to handle every possible variation, but turns an outright
// failure into real (if imperfectly parsed) content instead of the mock
// story whenever the shape is close to what's expected.
const SFX_SYNONYMS = {
  bang: 'gunshot',
  gunshot: 'gunshot',
  gun: 'gunshot',
  boom: 'explosion',
  explosion: 'explosion',
  blast: 'explosion',
  punch: 'punch',
  hit: 'punch',
  crash: 'crash',
  'glass break': 'glass_break',
  shatter: 'glass_break',
  footsteps: 'footsteps',
  steps: 'footsteps',
  'door creak': 'door_creak',
  creak: 'door_creak',
  whoosh: 'whoosh',
  rain: 'rain',
  thunder: 'thunder',
  wind: 'wind',
  heartbeat: 'heartbeat',
  silence: 'silence_tension',
  tension: 'silence_tension',
  crowd: 'crowd_murmur',
  murmur: 'crowd_murmur',
  fire: 'fire_crackle',
  crackle: 'fire_crackle',
};

function normalizeSfx(raw) {
  if (!raw || /^none$/i.test(raw.trim())) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .map((s) => SFX_SYNONYMS[s])
    .filter(Boolean);
}

function fieldValue(block, label) {
  const match = block.match(new RegExp(`${label}:\\s*(.+)`, 'i'));
  return match ? match[1].trim() : '';
}

function parseMarkdownFallback(text) {
  const blocks = text.split(/\*\*Panel\s*\d*[.:]*\*\*/i).slice(1);
  if (blocks.length === 0) return null;

  const panels = blocks.map((block, i) => {
    const bboxMatch = block.match(/Bounding Box:\s*\(([^)]+)\)/i);
    let bbox = { x: 0, y: 0, w: 1, h: 1 };
    if (bboxMatch) {
      const nums = bboxMatch[1].split(',').map((n) => parseFloat(n.trim()));
      if (nums.length === 4 && nums.every((n) => !Number.isNaN(n))) {
        const [x1, y1, x2, y2] = nums;
        bbox = { x: x1, y: y1, w: Math.max(0.01, x2 - x1), h: Math.max(0.01, y2 - y1) };
      }
    }

    const captionRaw = fieldValue(block, 'Caption');
    const caption = /^none$/i.test(captionRaw) ? '' : captionRaw.replace(/^"|"$/g, '');
    const description = fieldValue(block, 'Description');
    const mood = fieldValue(block, 'Mood') || 'neutral';
    const sfx = normalizeSfx(fieldValue(block, 'Sound Effects'));

    const dialogue = [];
    const dialogueSection = block.match(/Dialogue:([\s\S]*?)(?:\*\s*Mood:|$)/i)?.[1] || '';
    const speakerRe = /Speaker:\s*(.+)/gi;
    let m;
    const speakers = [];
    while ((m = speakerRe.exec(dialogueSection))) speakers.push(m[1].trim());
    if (speakers.length) {
      const texts = [...dialogueSection.matchAll(/Text:\s*(.+)/gi)].map((x) => x[1].trim().replace(/^"|"$/g, ''));
      const emotions = [...dialogueSection.matchAll(/Emotion:\s*(.+)/gi)].map((x) => x[1].trim().toLowerCase());
      const genders = [...dialogueSection.matchAll(/Gender:\s*(.+)/gi)].map((x) => x[1].trim().toLowerCase());
      const builds = [...dialogueSection.matchAll(/Build:\s*(.+)/gi)].map((x) => x[1].trim().toLowerCase());
      speakers.forEach((speaker, idx) => {
        dialogue.push({
          speaker,
          text: texts[idx] || '',
          emotion: emotions[idx] || 'neutral',
          gender: genders[idx] || 'unknown',
          build: builds[idx] || 'average',
        });
      });
    }

    return { id: `p${i + 1}`, bbox, suggestedOrder: i + 1, description, caption, dialogue, mood, sfx };
  });

  return { panels };
}

function validateShape(parsed) {
  if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    throw new Error('missing panels array');
  }
  parsed.panels.forEach((panel, i) => {
    if (typeof panel.id !== 'string') panel.id = `p${i + 1}`;
    const b = panel.bbox || {};
    if (![b.x, b.y, b.w, b.h].every((n) => typeof n === 'number')) {
      throw new Error(`panel ${panel.id} missing a numeric bbox`);
    }
    if (typeof panel.suggestedOrder !== 'number') panel.suggestedOrder = i + 1;
    if (typeof panel.description !== 'string') panel.description = '';
    if (typeof panel.caption !== 'string') panel.caption = '';
    // Lowercased here (the one shared choke point for both the JSON and
    // markdown-fallback paths) since the model is inconsistent about
    // capitalizing mood/emotion tags ("Friendly" vs "friendly"), and the
    // prosody lookup table is keyed lowercase — an uncaught case mismatch
    // silently produces zero emotional expression for that line.
    panel.mood = (typeof panel.mood === 'string' ? panel.mood : 'neutral').toLowerCase();
    if (!Array.isArray(panel.dialogue)) panel.dialogue = [];
    panel.dialogue.forEach((line) => {
      line.emotion = (typeof line.emotion === 'string' ? line.emotion : 'neutral').toLowerCase();
      if (!['male', 'female'].includes(line.gender)) line.gender = 'unknown';
      if (!['large', 'small'].includes(line.build)) line.build = 'average';
    });
    if (!Array.isArray(panel.sfx)) panel.sfx = [];
    panel.sfx = panel.sfx.filter((tag) => SFX_VOCABULARY.includes(tag));
  });
  return parsed;
}

async function callWatsonxVision(imageBase64, prompt) {
  const { WATSONX_URL, WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_MODEL_ID } = process.env;
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
      model_id: WATSONX_MODEL_ID || 'meta-llama/llama-3-2-11b-vision-instruct',
      project_id: WATSONX_PROJECT_ID,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`watsonx request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** Shared resilience strategy for any vision-LLM call: try to extract JSON;
 * if that fails, retry once (output is stochastic — a second attempt often
 * complies); if it still isn't JSON, try to salvage real content from a
 * markdown-bullet-outline response instead of discarding a real (if
 * imperfectly parsed) analysis in favor of the mock story. `callFn` does
 * the actual network call and returns raw text — provider-specific. */
async function analyzeWithRetryAndFallback(callFn, imageBase64, prompt) {
  const first = await callFn(imageBase64, prompt);
  try {
    return validateShape(extractJson(first));
  } catch (firstErr) {
    console.error('[vision] first attempt did not yield valid JSON, retrying once:', firstErr.message);
  }

  const second = await callFn(imageBase64, prompt);
  try {
    return validateShape(extractJson(second));
  } catch (secondErr) {
    console.error('[vision] retry also did not yield valid JSON, trying markdown fallback parse:', secondErr.message);
  }

  const salvaged = parseMarkdownFallback(second) || parseMarkdownFallback(first);
  if (salvaged) {
    console.error('[vision] salvaged panels from non-JSON markdown response');
    dumpRawResponse(`--- FIRST (salvaged) ---\n${first}\n\n--- SECOND (salvaged) ---\n${second}`);
    return validateShape(salvaged);
  }

  dumpRawResponse(`--- FIRST ---\n${first}\n\n--- SECOND ---\n${second}`);
  throw new Error('vision provider response did not contain usable JSON or a recognizable fallback format after retry');
}

/** Real provider: IBM watsonx.ai via a plain fetch call — same endpoint
 * shape as EchoCanvas's watsonxDescribeCanvas. The configured vision model
 * doesn't always comply with the "respond with only JSON" instruction (a
 * real, observed failure mode, not hypothetical — it's in a withdrawn
 * lifecycle state on this account, the only vision-capable model
 * available). */
async function watsonxAnalyzeComicPage(imageBase64, prompt) {
  console.error(`[vision] image payload: ${imageBase64.slice(0, 30)}... (${(imageBase64.length / 1024).toFixed(0)} KB base64)`);
  return analyzeWithRetryAndFallback(callWatsonxVision, imageBase64, prompt);
}

/** Alternate provider: Google Gemini (non-IBM). Not used by default — this
 * exists purely as a stand-in while watsonx's Lite-plan token quota is
 * exhausted, since Gemini's plain multimodal *understanding* tier (image
 * in, text out) is genuinely free with no billing required — unlike its
 * image-*generation* tier, which needs billing (see imageGen/). In testing
 * it was also noticeably more accurate/grounded than the withdrawn Llama
 * vision model on the same input, for what that's worth. */
async function geminiAnalyzeComicPage(imageBase64, prompt) {
  const { callGeminiVision } = require('../shared/geminiClient');
  return analyzeWithRetryAndFallback(callGeminiVision, imageBase64, prompt);
}

/** Local provider: Ollama running moondream (or whatever LOCAL_VISION_MODEL
 * is set to) on localhost — no API key, no quota, genuinely offline. The
 * weakest of the three vision models in practice, but it's the one rung
 * that can never run out mid-demo, so it's a real safety net, not just a
 * checkbox. */
async function localAnalyzeComicPage(imageBase64, prompt) {
  const { callLocalVision } = require('../shared/localClient');
  return analyzeWithRetryAndFallback(callLocalVision, imageBase64, prompt);
}

const path = require('path');
const { cached, cacheKeyFor } = require('../shared/diskCache');
const { cascade, orderedCascadeSteps, REAL_PROVIDERS } = require('../shared/cascade');
const ANALYZE_CACHE_DIR = path.join(__dirname, '.analyzeCache');

async function analyzeComicPage(imageBase64, prompt) {
  const provider = process.env.VISION_PROVIDER || 'mock';
  if (!REAL_PROVIDERS.includes(provider)) {
    return mockAnalyzeComicPage();
  }

  // Whichever provider is configured as primary is tried first (watsonx by
  // default, to maximize real IBM usage); the other real providers are
  // automatic fallbacks instead of dropping straight to the mock story —
  // including if watsonx's Lite-plan quota runs out mid-demo, or Gemini's
  // free-tier daily cap is hit. `local` (Ollama) is always the last real
  // rung tried, since it needs no key and can't run out of quota.
  const key = cacheKeyFor(imageBase64, prompt, 'cascade');
  return cached(ANALYZE_CACHE_DIR, key, () =>
    cascade(
      orderedCascadeSteps(provider, {
        watsonx: () => watsonxAnalyzeComicPage(imageBase64, prompt),
        gemini: () => geminiAnalyzeComicPage(imageBase64, prompt),
        local: () => localAnalyzeComicPage(imageBase64, prompt),
      })
    )
  );
}

module.exports = {
  analyzeComicPage,
  mockAnalyzeComicPage,
  callWatsonxVision,
  analyzeWithRetryAndFallback,
  extractJson,
  validateShape,
  parseMarkdownFallback,
  normalizeSfx,
};

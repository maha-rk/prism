// Swappable text-to-speech interface, mirroring EchoCanvas's stt/sttProvider.js
// pattern. Defaults to a mock (silent WAV) so the full pipeline can be
// exercised with zero credentials; set TTS_PROVIDER=watson (plus TTS_API_KEY
// / TTS_URL) for real IBM Watson Text to Speech.
//
// A fixed 5-voice pool (1 narrator + 4 character slots) — per the Phase B
// scope decision, this is real, distinct IBM voices rather than a bespoke
// "personality engine," and speaker->slot assignment is first-seen /
// round-robin rather than cross-chapter re-identification.
//
// Deliberately V3 (Dnn) voices, NOT the newer Expressive/Natural ones —
// verified empirically (byte-diffed real synthesized output, not just
// "the request didn't error"): `<express-as>` is REJECTED outright on the
// newer neural voices, and `<prosody>` is silently ACCEPTED but has ZERO
// audible effect on them (identical output regardless of rate/pitch/volume
// requested). V3 voices are the only ones on this account that actually
// respond to prosody, which is the only working emotion-control mechanism
// available at all — so they're the right choice even though newer voices
// sound better at a flat, unmodulated baseline.
const VOICE_TABLE = {
  narrator: 'en-US_MichaelV3Voice',
  'voice-1': 'en-US_AllisonV3Voice',
  'voice-2': 'en-US_HenryV3Voice',
  'voice-3': 'en-US_KevinV3Voice',
  'voice-4': 'en-US_OliviaV3Voice',
};

// SSML <prosody> adjustments per emotion tag — real SSML, not a fabricated
// "emotion API." Deltas are deliberately large enough to be clearly audible
// (small single-digit percentages were confirmed too subtle to notice).
// Unlisted/unknown emotion tags fall back to no adjustment.
const PROSODY_BY_EMOTION = {
  neutral: {},
  afraid: { rate: '-20%', pitch: '+30%' },
  anxious: { rate: '-10%', pitch: '+20%' },
  urgent: { rate: '+30%', pitch: '+10%' },
  angry: { rate: '+25%', pitch: '+15%', volume: 'x-loud' },
  sad: { rate: '-25%', pitch: '-20%' },
  relieved: { rate: '-10%', pitch: '+10%' },
  happy: { rate: '+20%', pitch: '+20%' },
  excited: { rate: '+30%', pitch: '+20%' },
  tense: { rate: '-10%', volume: 'soft' },
  curious: { rate: '-5%', pitch: '+15%' },
  hungry: { rate: '+5%', pitch: '+10%' },
  concerned: { rate: '-10%', pitch: '-5%' },
  relief: { rate: '-10%', pitch: '+10%' },
};

// A per-speaker baseline pitch shift from their tagged physical build — a
// large/muscular character reads deeper, a small character reads higher —
// layered underneath the per-line emotion prosody (nested <prosody> tags in
// SSML stack their effects), so a build-based baseline persists across all
// of a character's lines while emotion still varies line to line.
const PROSODY_BY_BUILD = {
  average: {},
  large: { pitch: '-12%' },
  small: { pitch: '+12%' },
};

function escapeSsml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Classic comic lettering uses "--" (or "---") to mark a trailing-off or
// interrupted beat ("What the--Grace's handkerchief--") — real punctuation
// TTS naturally pauses for, but a bare double-hyphen is just two ASCII
// characters to a speech engine, so it reads straight through. Converting
// it to an explicit SSML break makes that beat actually audible. Must run
// on already-escaped text so the inserted tag itself doesn't get escaped.
function insertDashBreaks(escapedText) {
  return escapedText.replace(/-{2,}/g, ' <break time="300ms"/> ');
}

function prosodyAttrs(prosody) {
  return Object.entries(prosody)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function wrapSsml(text, emotion, build) {
  const escaped = insertDashBreaks(escapeSsml(text));
  // Defensive lowercase at the lookup itself, not just at the source — a
  // case mismatch here silently means "no expression," not an error, so
  // this shouldn't depend on every caller upstream getting it right.
  const emotionAttrs = prosodyAttrs(PROSODY_BY_EMOTION[(emotion || '').toLowerCase()] || {});
  const buildAttrs = prosodyAttrs(PROSODY_BY_BUILD[(build || '').toLowerCase()] || {});

  let inner = escaped;
  if (emotionAttrs) inner = `<prosody ${emotionAttrs}>${inner}</prosody>`;
  if (buildAttrs) inner = `<prosody ${buildAttrs}>${inner}</prosody>`;
  return `<speak>${inner}</speak>`;
}

/** A short silent WAV — enough for the frontend playback pipeline (decode,
 * schedule, pan, sequence) to be built and tested without any TTS
 * credentials. Duration scales loosely with text length so a sequenced
 * playback still "feels" like it's reading at a plausible pace. */
function buildSilentWav(durationSeconds, sampleRate = 22050) {
  const numSamples = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  return buffer; // sample data left as zeros (silence) by Buffer.alloc
}

function mockSynthesize(text) {
  const wordCount = text.trim().split(/\s+/).length;
  const estimatedSeconds = Math.max(0.6, wordCount / 2.5);
  return buildSilentWav(estimatedSeconds);
}

async function watsonSynthesize(text, voiceSlot, emotion, build) {
  const { TTS_API_KEY, TTS_URL } = process.env;
  if (!TTS_API_KEY || !TTS_URL) {
    throw new Error('Watson Text to Speech not configured: set TTS_API_KEY, TTS_URL');
  }

  // Lazy require: keeps the mock path free of the ibm-watson dependency cost.
  const TextToSpeechV1 = require('ibm-watson/text-to-speech/v1');
  const { IamAuthenticator } = require('ibm-watson/auth');

  const client = new TextToSpeechV1({
    authenticator: new IamAuthenticator({ apikey: TTS_API_KEY }),
    serviceUrl: TTS_URL,
  });

  const voice = VOICE_TABLE[voiceSlot] || VOICE_TABLE.narrator;
  const response = await client.synthesize({
    text: wrapSsml(text, emotion, build),
    accept: 'audio/wav',
    voice,
  });
  // response.result is a Node.js Readable stream, not a Buffer directly.
  return streamToBuffer(response.result);
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Local, zero-cost, zero-quota TTS via macOS's built-in `say` — the same
// "always available, never runs out" rung the other providers get from
// Ollama (see shared/localClient.js). Voice variety comes from picking
// different named system voices per slot; emotion drives speaking rate,
// reusing PROSODY_BY_EMOTION's own `rate` percentage as the single source
// of truth rather than a second, duplicate emotion table. Honest
// limitation: unlike Watson's SSML, `say` has no reliable cross-voice pitch
// control, so build-based pitch (PROSODY_BY_BUILD) doesn't carry over
// locally — only the emotion-driven rate does.
const LOCAL_VOICE_TABLE = {
  narrator: 'Daniel',
  'voice-1': 'Samantha',
  'voice-2': 'Fred',
  'voice-3': 'Reed (English (US))',
  'voice-4': 'Kathy',
};
const LOCAL_BASE_RATE_WPM = 180;

function localRateFor(emotion) {
  const prosody = PROSODY_BY_EMOTION[(emotion || '').toLowerCase()] || {};
  const pct = prosody.rate ? parseFloat(prosody.rate) / 100 : 0;
  return Math.max(80, Math.round(LOCAL_BASE_RATE_WPM * (1 + pct)));
}

// `say` doesn't understand SSML breaks — approximate the same "audible
// pause on comic-lettering dashes" intent with a comma, which reliably
// triggers a brief pause in speech synthesis.
function insertPlainPauses(text) {
  return text.replace(/-{2,}/g, ', ');
}

async function localSynthesize(text, voiceSlot, emotion) {
  if (process.platform !== 'darwin') {
    throw new Error('local TTS ("say") is only available on macOS');
  }
  const { execFile } = require('child_process');
  const os = require('os');
  const crypto = require('crypto');

  const voice = LOCAL_VOICE_TABLE[voiceSlot] || LOCAL_VOICE_TABLE.narrator;
  const rate = localRateFor(emotion);
  const plainText = insertPlainPauses(text);
  const outPath = path.join(os.tmpdir(), `prism-local-tts-${crypto.randomUUID()}.wav`);

  await new Promise((resolve, reject) => {
    execFile(
      'say',
      ['-v', voice, '-r', String(rate), '-o', outPath, '--data-format=LEI16@22050', plainText],
      (err, stdout, stderr) => (err ? reject(new Error(`local "say" failed: ${err.message} ${stderr || ''}`)) : resolve())
    );
  });

  try {
    return await fs.promises.readFile(outPath);
  } finally {
    fs.promises.unlink(outPath).catch(() => {});
  }
}

// Disk-persisted cache — the real Watson provider is metered (10,000
// chars/month on the Lite plan). Persisting to disk (not just in-memory)
// means once a line has genuinely been paid for, it's never re-synthesized
// again even across backend restarts — important since a restart between
// now and submission would otherwise silently reset an in-memory cache and
// re-spend quota on lines already generated. Not applied to the mock path,
// since that costs nothing to begin with.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cascade } = require('../shared/cascade');

const CACHE_DIR = path.join(__dirname, '.cache');

function cacheKey(text, voiceSlot, emotion, build, provider) {
  // Keyed by the actual underlying voice identity for both providers (not
  // just the slot name) plus which provider was primary — otherwise
  // changing VOICE_TABLE's mapping (as happened once already), or toggling
  // TTS_PROVIDER between watson/local, would silently serve stale audio
  // synthesized with the wrong voice or engine.
  const watsonVoice = VOICE_TABLE[voiceSlot] || VOICE_TABLE.narrator;
  const localVoice = LOCAL_VOICE_TABLE[voiceSlot] || LOCAL_VOICE_TABLE.narrator;
  return crypto
    .createHash('sha256')
    .update(`${provider}::${watsonVoice}::${localVoice}::${emotion}::${build}::${text}`)
    .digest('hex');
}

function cachePath(key) {
  return path.join(CACHE_DIR, `${key}.wav`);
}

async function synthesize(text, voiceSlot, emotion, build = 'average') {
  const provider = process.env.TTS_PROVIDER || 'mock';
  if (provider !== 'watson' && provider !== 'local') {
    return mockSynthesize(text);
  }

  const key = cacheKey(text, voiceSlot, emotion, build, provider);
  const filePath = cachePath(key);
  if (fs.existsSync(filePath)) {
    return fs.promises.readFile(filePath);
  }

  // Whichever provider is configured as primary is tried first; the other
  // real provider is an automatic fallback before ever dropping to mock —
  // same cascade philosophy as every other AI call site in this backend.
  const steps =
    provider === 'local'
      ? [
          { label: 'local', fn: () => localSynthesize(text, voiceSlot, emotion) },
          { label: 'watson', fn: () => watsonSynthesize(text, voiceSlot, emotion, build) },
        ]
      : [
          { label: 'watson', fn: () => watsonSynthesize(text, voiceSlot, emotion, build) },
          { label: 'local', fn: () => localSynthesize(text, voiceSlot, emotion) },
        ];

  const audio = await cascade(steps);
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, audio);
  return audio;
}

module.exports = { synthesize, VOICE_TABLE, wrapSsml, insertDashBreaks, localRateFor, LOCAL_VOICE_TABLE };

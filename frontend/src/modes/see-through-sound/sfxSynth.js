// Procedural sound-effect synthesis via Web Audio — no audio asset files
// anywhere, so there's no licensing risk from borrowed SFX libraries (same
// reasoning as gesture-vision's chordSynth.js). Each tag here must match
// backend/sfx/sfxVocabulary.js exactly, since that's the fixed vocabulary
// the vision-LLM prompt is constrained to.

// Keyed by AudioContext so buffers are invalidated correctly if the app
// ever recreates its context, without assuming there's only ever one.
const noiseBufferCache = new WeakMap();

function getNoiseBuffer(ctx, seconds) {
  let perCtx = noiseBufferCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    noiseBufferCache.set(ctx, perCtx);
  }
  if (perCtx.has(seconds)) return perCtx.get(seconds);

  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  perCtx.set(seconds, buffer);
  return buffer;
}

function noiseSource(ctx, seconds) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx, seconds);
  return src;
}

function envelopeGain(ctx, dest, { attack = 0.01, hold = 0.1, release = 0.2, peak = 0.6 }) {
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.setValueAtTime(peak, now + attack + hold);
  gain.gain.linearRampToValueAtTime(0, now + attack + hold + release);
  gain.connect(dest);
  return gain;
}

function playRain(ctx, dest) {
  const src = noiseSource(ctx, 1.6);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3500;
  filter.Q.value = 0.6;
  const gain = envelopeGain(ctx, dest, { attack: 0.2, hold: 1.0, release: 0.4, peak: 0.25 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 1.6);
}

function playThunder(ctx, dest) {
  const src = noiseSource(ctx, 2.0);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  const gain = envelopeGain(ctx, dest, { attack: 0.05, hold: 0.3, release: 1.6, peak: 0.7 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 2.0);
}

function playWind(ctx, dest) {
  const src = noiseSource(ctx, 1.8);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, ctx.currentTime);
  filter.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.9);
  filter.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.8);
  const gain = envelopeGain(ctx, dest, { attack: 0.3, hold: 1.1, release: 0.4, peak: 0.3 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 1.8);
}

function playFootsteps(ctx, dest) {
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.32;
    const src = noiseSource(ctx, 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.08);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(t);
    src.stop(t + 0.08);
  }
}

function playHeartbeat(ctx, dest) {
  const beat = (t, freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.15);
  };
  const now = ctx.currentTime;
  beat(now, 60);
  beat(now + 0.18, 55);
}

function playDoorCreak(ctx, dest) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(180, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(260, ctx.currentTime + 0.9);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 500;
  filter.Q.value = 4;
  const gain = envelopeGain(ctx, dest, { attack: 0.1, hold: 0.6, release: 0.3, peak: 0.35 });
  osc.connect(filter);
  filter.connect(gain);
  osc.start();
  osc.stop(ctx.currentTime + 1.0);
}

function playCrash(ctx, dest) {
  const src = noiseSource(ctx, 0.4);
  const gain = envelopeGain(ctx, dest, { attack: 0.005, hold: 0.05, release: 0.3, peak: 0.8 });
  src.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 0.4);
}

function playPunch(ctx, dest) {
  // A body-hit thud: low-frequency oscillator burst plus a short noise
  // transient, distinct from crash's brighter, more debris-like character.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.7, ctx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(oscGain);
  oscGain.connect(dest);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);

  const src = noiseSource(ctx, 0.06);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  const gain = envelopeGain(ctx, dest, { attack: 0.002, hold: 0.02, release: 0.06, peak: 0.4 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 0.06);
}

function playGunshot(ctx, dest) {
  const src = noiseSource(ctx, 0.25);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 400;
  const gain = envelopeGain(ctx, dest, { attack: 0.001, hold: 0.02, release: 0.15, peak: 0.9 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 0.25);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.12);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.5, ctx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(oscGain);
  oscGain.connect(dest);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

function playExplosion(ctx, dest) {
  const src = noiseSource(ctx, 1.1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2500, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 1.0);
  const gain = envelopeGain(ctx, dest, { attack: 0.003, hold: 0.1, release: 1.0, peak: 0.9 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 1.1);
}

function playGlassBreak(ctx, dest) {
  const src = noiseSource(ctx, 0.35);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3000;
  const gain = envelopeGain(ctx, dest, { attack: 0.003, hold: 0.03, release: 0.3, peak: 0.6 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 0.35);
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2500 + Math.random() * 2500;
    const og = ctx.createGain();
    const t = ctx.currentTime + i * 0.02;
    og.gain.setValueAtTime(0.15, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og);
    og.connect(dest);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}

function playWhoosh(ctx, dest) {
  const src = noiseSource(ctx, 0.6);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(300, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + 0.5);
  filter.Q.value = 1;
  const gain = envelopeGain(ctx, dest, { attack: 0.05, hold: 0.2, release: 0.3, peak: 0.5 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 0.6);
}

function playSilenceTension(ctx, dest) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 48;
  const gain = envelopeGain(ctx, dest, { attack: 0.5, hold: 0.8, release: 0.7, peak: 0.08 });
  osc.connect(gain);
  osc.start();
  osc.stop(ctx.currentTime + 2.0);
}

function playCrowdMurmur(ctx, dest) {
  const src = noiseSource(ctx, 1.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 700;
  filter.Q.value = 0.5;
  const gain = envelopeGain(ctx, dest, { attack: 0.3, hold: 0.8, release: 0.4, peak: 0.2 });
  src.connect(filter);
  filter.connect(gain);
  src.start();
  src.stop(ctx.currentTime + 1.5);
}

function playFireCrackle(ctx, dest) {
  const crackleCount = 8;
  for (let i = 0; i < crackleCount; i++) {
    const t = ctx.currentTime + Math.random() * 1.3;
    const src = noiseSource(ctx, 0.04);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(t);
    src.stop(t + 0.04);
  }
}

const SFX_PLAYERS = {
  rain: playRain,
  thunder: playThunder,
  wind: playWind,
  footsteps: playFootsteps,
  heartbeat: playHeartbeat,
  door_creak: playDoorCreak,
  crash: playCrash,
  glass_break: playGlassBreak,
  whoosh: playWhoosh,
  silence_tension: playSilenceTension,
  crowd_murmur: playCrowdMurmur,
  fire_crackle: playFireCrackle,
  punch: playPunch,
  gunshot: playGunshot,
  explosion: playExplosion,
};

// Matches each function's actual scheduled length above — used by the
// player to know how long to wait before starting speech, so the effect
// and the narration never overlap and speech always stays intelligible.
const SFX_DURATIONS = {
  rain: 1.6,
  thunder: 2.0,
  wind: 1.8,
  footsteps: 0.8,
  heartbeat: 0.4,
  door_creak: 1.0,
  crash: 0.4,
  glass_break: 0.35,
  whoosh: 0.6,
  silence_tension: 2.0,
  crowd_murmur: 1.5,
  fire_crackle: 1.4,
  punch: 0.2,
  gunshot: 0.25,
  explosion: 1.1,
};

/** Plays a tagged SFX into `dest` (typically a per-panel StereoPannerNode
 * already connected to the destination, so the effect inherits that
 * panel's pan). Unknown tags are silently ignored. Returns the effect's
 * duration in seconds (0 if the tag is unknown), so callers can wait for it
 * to finish before starting speech over the same output. */
export function playSfxTag(ctx, tag, dest) {
  const player = SFX_PLAYERS[tag];
  if (!player) return 0;
  player(ctx, dest);
  return SFX_DURATIONS[tag] || 0;
}

export const KNOWN_SFX_TAGS = Object.keys(SFX_PLAYERS);

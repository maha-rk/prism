// Generative ambient soundscape engine — takes a continuous mood profile
// (brightness/energy/warmth/valence, each 0-1) and builds an evolving pad
// texture from it, rather than triggering one of a fixed set of discrete
// sound effects (see gesture-vision/chordSynth.js and
// see-through-sound/sfxSynth.js for that different, discrete approach).
// Purely procedural Web Audio — same "no licensed audio assets" reasoning
// used throughout this project, and notably this means the audio output
// here is always real, never silent, regardless of whether the mood
// analysis behind it came from a real provider or the mock fallback.

export class SoundscapeSynth {
  constructor(ctx) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(ctx.destination);
    this.layers = [];
  }

  /** Stops whatever's currently playing (fading out) and starts a fresh
   * soundscape from the given mood profile. */
  generate({ brightness = 0.5, energy = 0.5, warmth = 0.5, valence = 0.5 }) {
    this.stop();

    const baseFreq = 70 + brightness * 180;
    const waveform = warmth > 0.6 ? 'sine' : warmth > 0.3 ? 'triangle' : 'sawtooth';
    const numLayers = 2 + Math.round(energy * 3);
    // Consonant (major-ish) ratios for uplifting valence, slightly tenser
    // (minor-ish) ratios for darker valence — not a real chord/scale system
    // like chordSynth.js's, just enough interval variety for a pad texture.
    const ratios = valence > 0.5 ? [1, 1.25, 1.5, 2] : [1, 1.2, 1.4, 1.8];

    const now = this.ctx.currentTime;
    for (let i = 0; i < numLayers; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = waveform;
      osc.frequency.value = baseFreq * ratios[i % ratios.length];
      osc.detune.value = (Math.random() - 0.5) * 6;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200 + brightness * 3500;
      filter.Q.value = 0.7;

      const layerGain = this.ctx.createGain();
      const baseLevel = 0.6 / numLayers;
      layerGain.gain.value = baseLevel;

      // Slow LFO on this layer's gain for movement — rate tied to energy,
      // so a calmer mood breathes slowly and an energetic one shimmers
      // faster, rather than a static drone.
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.03 + energy * 0.25;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = baseLevel * 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(layerGain.gain);

      osc.connect(filter);
      filter.connect(layerGain);
      layerGain.connect(this.masterGain);

      osc.start();
      lfo.start();
      this.layers.push({ osc, lfo });
    }

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(0.7, now + 2.5);
  }

  stop() {
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + 1.2);

    const layersToStop = this.layers;
    this.layers = [];
    setTimeout(() => {
      layersToStop.forEach(({ osc, lfo }) => {
        try { osc.stop(); } catch { /* already stopped */ }
        try { lfo.stop(); } catch { /* already stopped */ }
      });
    }, 1300);
  }
}

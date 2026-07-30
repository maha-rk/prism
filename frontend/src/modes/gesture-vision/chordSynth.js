// Web Audio synth engine. Adapted from gesture-synth (github.com/ericwei97-cloud/gesture-synth,
// Eric Wei) — oscillators -> waveshaper -> lowpass filter -> master gain.

export class ChordSynth {
  constructor() {
    this.ctx = null;
    this.filter = null;
    this.waveShaper = null;
    this.masterGain = null;
    this.oscillators = [];
    this.currentKey = null;
    this.waveform = 'sawtooth';
    this.recordDestination = null;
  }

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.waveShaper = this.ctx.createWaveShaper();
    this.waveShaper.oversample = '4x'; // reduces aliasing harshness

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.7;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;

    this.waveShaper.connect(this.filter);
    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  /** A capturable MediaStream of exactly what's playing — taps the master
   * gain node into a MediaStreamAudioDestination alongside the speakers.
   * `connectMicrophone` can additionally mix a mic stream into this same
   * destination so recordings capture the player's voice too. */
  getRecordingStream() {
    if (!this.ctx) return null;
    if (!this.recordDestination) {
      this.recordDestination = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.recordDestination);
    }
    return this.recordDestination.stream;
  }

  /** Mixes a mic MediaStream into the recording destination only — NOT into
   * the audible output — so the player's voice is captured in recordings
   * without looping back through their own speakers. */
  connectMicrophone(micStream) {
    this.getRecordingStream(); // ensures recordDestination exists
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch { /* already disconnected */ }
    }
    this.micSource = this.ctx.createMediaStreamSource(micStream);
    this.micSource.connect(this.recordDestination);
  }

  disconnectMicrophone() {
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch { /* already disconnected */ }
      this.micSource = null;
    }
  }

  setWaveform(type) {
    this.waveform = type;
    this.currentKey = null; // forces oscillators to be rebuilt on next playNotes
  }

  setVolume(volume01) {
    if (!this.ctx) return;
    const clamped = Math.max(0, Math.min(1, volume01));
    this.masterGain.gain.linearRampToValueAtTime(clamped, this.ctx.currentTime + 0.05);
  }

  /** `tiltFactor` in [-1, 1]: negative = warmer/darker, positive = brighter/resonant sweep. */
  updateFilterSweep(tiltFactor) {
    if (!this.filter || !this.ctx) return;
    let targetFrequency = 1200;
    let targetQ = 0.7;

    if (tiltFactor < 0) {
      const intensity = Math.abs(tiltFactor);
      targetFrequency = 1200 - intensity * 950;
      targetQ = 0.7 + intensity * 1.5;
    } else if (tiltFactor > 0) {
      targetFrequency = 1200 + tiltFactor * 3800;
      targetQ = 0.7 + tiltFactor * 4.5;
    }

    const now = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(targetFrequency, now, 0.04);
    this.filter.Q.setTargetAtTime(targetQ, now, 0.04);
  }

  playNotes(freqs) {
    if (!this.ctx || freqs.length === 0) return;
    const key = freqs.map((f) => f.toFixed(1)).join(',');
    if (key === this.currentKey) return;

    this.oscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    this.oscillators = freqs.map((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = this.waveform;
      osc.frequency.value = freq;
      osc.connect(this.waveShaper);
      osc.start();
      return osc;
    });
    this.currentKey = key;
  }

  stop() {
    this.setVolume(0);
    this.oscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    this.oscillators = [];
    this.currentKey = null;
  }
}

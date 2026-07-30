import { playSfxTag } from './sfxSynth.js';

/** Sequences a flat list of narration/dialogue lines (each already decoded
 * to an AudioBuffer) one after another, panning each through a per-panel
 * StereoPannerNode. A panel's SFX plays first, as a brief scene-setting cue
 * — speech only starts once the effect finishes, so the two never overlap
 * and the spoken narration always stays clearly intelligible (accessibility
 * requirement: SFX is atmosphere, not something that should compete with or
 * mask the primary information channel). Line-to-line playback is chained
 * via `onended` rather than pre-scheduled AudioContext timestamps — simpler
 * to reason about, and the small gaps between lines are inaudible-to-
 * negligible for narration (unlike Gesture Vision's real-time needs). */
export class StoryPlayer {
  constructor(ctx) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    this.queue = [];
    this.index = -1;
    this.playing = false;
    this.currentSource = null;
    this.preRollTimer = null;

    this.onLineStart = null; // (index, item) => void
    this.onEnd = null;
  }

  load(queue) {
    this.stop();
    this.queue = queue;
    this.index = -1;
  }

  play() {
    if (this.playing || this.queue.length === 0) return;
    this.playing = true;
    this._playNext();
  }

  stop() {
    this.playing = false;
    if (this.preRollTimer) {
      clearTimeout(this.preRollTimer);
      this.preRollTimer = null;
    }
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
  }

  /** Stops playback but rewinds the queue position by one, so the next
   * `play()` replays the current line from its start rather than resuming
   * mid-clip (AudioBufferSourceNode has no native pause/resume) — the same
   * "restart current line" behavior most narrated-audio readers use. */
  pause() {
    this.stop();
    this.index -= 1;
  }

  _playNext() {
    if (!this.playing) return;
    this.index += 1;
    if (this.index >= this.queue.length) {
      this.playing = false;
      this.onEnd?.();
      return;
    }

    const item = this.queue[this.index];
    this.onLineStart?.(this.index, item);

    let preRollSeconds = 0;
    if (item.isPanelStart && item.sfx?.length) {
      const sfxPanner = this.ctx.createStereoPanner();
      sfxPanner.pan.value = item.pan;
      sfxPanner.connect(this.masterGain);
      for (const tag of item.sfx) {
        const duration = playSfxTag(this.ctx, tag, sfxPanner);
        preRollSeconds = Math.max(preRollSeconds, duration);
      }
    }

    const startSpeech = () => {
      this.preRollTimer = null;
      if (!this.playing) return; // paused/stopped during the pre-roll wait
      const source = this.ctx.createBufferSource();
      source.buffer = item.buffer;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = item.pan;
      source.connect(panner);
      panner.connect(this.masterGain);
      source.onended = () => {
        if (this.currentSource === source) this._playNext();
      };
      this.currentSource = source;
      source.start();
    };

    if (preRollSeconds > 0) {
      this.preRollTimer = setTimeout(startSpeech, preRollSeconds * 1000);
    } else {
      startSpeech();
    }
  }
}

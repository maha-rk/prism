// Hand-tracking + gesture classification. Adapted from gesture-synth
// (github.com/ericwei97-cloud/gesture-synth, Eric Wei) — the finger-extension
// tests, chord-quality dead-zone tilt calc, and chord-state debouncer are its
// design, ported here. Simplified: the original also computed a redundant
// major/minor guess from a single knuckle/wrist comparison inside chord
// classification, but only ever used the dead-zone tilt version downstream —
// this port keeps just the one that's actually authoritative.

import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FINGERS = {
  index: { pip: 6, tip: 8 },
  middle: { pip: 10, tip: 12 },
  ring: { pip: 14, tip: 16 },
  pinky: { pip: 18, tip: 20 },
};

function isFingerExtended(landmarks, name) {
  const { pip, tip } = FINGERS[name];
  return landmarks[tip].y < landmarks[pip].y;
}

function isThumbExtended(landmarks, handedness) {
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  return handedness === 'Right' ? thumbTip.x > thumbIp.x : thumbTip.x < thumbIp.x;
}

/** Wrist position relative to the knuckle span, with a dead zone so a
 * neutral, centered hand reads as exactly 0 — a stable "home" position a
 * blind player can return to by feel. Negative = tilted one way, positive =
 * the other; magnitude saturates at 1 past MAX_TRAVEL. */
function getHandHorizontalTilt(landmarks, handedness) {
  if (!landmarks || landmarks.length < 18) return 0;
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  if (!wrist || !middleMcp || !ringMcp) return 0;

  const minX = Math.min(middleMcp.x, ringMcp.x);
  const maxX = Math.max(middleMcp.x, ringMcp.x);
  const MAX_TRAVEL = 0.12;

  let tilt = 0;
  if (wrist.x < minX) tilt = (wrist.x - minX) / MAX_TRAVEL;
  else if (wrist.x > maxX) tilt = (wrist.x - maxX) / MAX_TRAVEL;

  tilt = Math.max(-1, Math.min(1, tilt));
  return handedness === 'Right' ? -tilt : tilt;
}

/** Left hand: which fingers are extended selects a scale degree I-VII. */
function classifyChordNumeral(landmarks) {
  const thumb = isThumbExtended(landmarks, 'Left');
  const index = isFingerExtended(landmarks, 'index');
  const middle = isFingerExtended(landmarks, 'middle');
  const ring = isFingerExtended(landmarks, 'ring');
  const pinky = isFingerExtended(landmarks, 'pinky');

  if (index && pinky && !middle && !ring && !thumb) return 'VI';
  if (index && pinky && !middle && !ring && thumb) return 'VII';

  const count = [thumb, index, middle, ring, pinky].filter(Boolean).length;
  return { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }[count] || null;
}

/** Right hand: how many fingers are extended selects chord quality/inversion (0-4). */
function getRightHandQualityIndex(landmarks) {
  return ['index', 'middle', 'ring', 'pinky'].filter((f) => isFingerExtended(landmarks, f)).length;
}

/** Right-hand height -> volume, broad and forgiving rather than pixel-precise. */
function getVolumeFromHeight(landmarks) {
  const TOP = 0.05, BOTTOM = 0.95;
  const clamped = Math.max(TOP, Math.min(BOTTOM, landmarks[0].y));
  return 1 - (clamped - TOP) / (BOTTOM - TOP);
}

const CHORD_HOLD_TIME_MS = 100; // musical state needs confidence before changing
const NULL_WINDOW_MS = 50; // absorbs momentary MediaPipe tracking dropouts

function sameChordState(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.chord === b.chord && a.isMajorMode === b.isMajorMode && a.qualityIndex === b.qualityIndex && a.octaveDown === b.octaveDown;
}

export class GestureHandTracker {
  constructor(videoEl) {
    this.video = videoEl;
    this.landmarker = null;
    this.stream = null;
    this.running = false;

    this._stableChordState = null;
    this._candidateChordState = null;
    this._candidateSince = 0;
    this._lastValidTime = 0;
    this._lastEmitted = null;

    this.onChordChange = null;     // (chordState | null)
    this.onContinuous = null;      // (volume01, filterTilt)
    this.onHandsLost = null;
    this.onFrame = null;           // (rawMediaPipeResult) — for drawing video+landmarks
  }

  async _ensureLandmarker() {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }
  }

  async start() {
    await this._ensureLandmarker();
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this._stableChordState = null;
    this._candidateChordState = null;
  }

  _stabilize(rawState, now) {
    if (rawState !== null) this._lastValidTime = now;

    let effective = rawState;
    if (rawState === null && now - this._lastValidTime < NULL_WINDOW_MS) {
      effective = this._candidateChordState;
    }

    if (!sameChordState(effective, this._candidateChordState)) {
      this._candidateChordState = effective;
      this._candidateSince = now;
    }

    if (now - this._candidateSince >= CHORD_HOLD_TIME_MS) {
      this._stableChordState = this._candidateChordState;
    }
    return this._stableChordState;
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const result = this.landmarker.detectForVideo(this.video, now);
    this.onFrame?.(result);

    let left = null, right = null;
    result.landmarks.forEach((landmarks, i) => {
      const handedness = result.handedness[i][0].categoryName;
      if (handedness === 'Left') left = landmarks;
      if (handedness === 'Right') right = landmarks;
    });

    let rawState = null;
    if (left) {
      const chord = classifyChordNumeral(left);
      if (chord) {
        rawState = {
          chord,
          isMajorMode: getHandHorizontalTilt(left, 'Left') >= 0,
          qualityIndex: right ? getRightHandQualityIndex(right) : 0,
          octaveDown: right ? isThumbExtended(right, 'Right') : false,
        };
      }
    }

    const stable = this._stabilize(rawState, now);
    if (!sameChordState(stable, this._lastEmitted)) {
      this._lastEmitted = stable;
      this.onChordChange?.(stable);
    }

    if (right) {
      this.onContinuous?.(getVolumeFromHeight(right), getHandHorizontalTilt(right, 'Right'));
    } else {
      this.onContinuous?.(0, 0);
    }

    if (!left && !right) this.onHandsLost?.();

    requestAnimationFrame(() => this._loop());
  }
}

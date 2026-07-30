import { GestureHandTracker } from './handGestures.js';
import { ChordSynth } from './chordSynth.js';
import { getChordName, getQualityLabel, getChordTones, getSolidNotes } from './musicTheory.js';
import { applyAccessProfile, getAccessProfile } from '../../shared/accessProfile.js';

applyAccessProfile();

const startOverlay = document.getElementById('startOverlay');
// The generic "focus the first actionable control" behavior would land on
// the key/tone selects (they appear first in DOM order), not the actually
// important first action here — starting the instrument. This is the one
// mode Creative Access Mode's "blind" profile matters most for (it's built
// for blind musicians), so it gets an explicit override rather than
// deferring to the generic heuristic.
if (getAccessProfile() === 'blind') startOverlay.focus();
const webcam = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlay');
const overlayCtx = overlayCanvas.getContext('2d');
const keySelect = document.getElementById('keySelect');
const toneSelect = document.getElementById('toneSelect');
const muteBtn = document.getElementById('muteBtn');
const statusLive = document.getElementById('statusLive');
const alertLive = document.getElementById('alertLive');
const chordDisplay = document.getElementById('chordDisplay');
const qualityDisplay = document.getElementById('qualityDisplay');
const distortionDisplay = document.getElementById('distortionDisplay');
const volumeBarEls = Array.from(document.querySelectorAll('.vol-bar'));
const helpButton = document.getElementById('helpButton');
const helpModal = document.getElementById('helpModal');
const closeHelp = document.getElementById('closeHelp');
const recordBtn = document.getElementById('recordBtn');

const synth = new ChordSynth();
const tracker = new GestureHandTracker(webcam);

let mediaRecorder = null;
let recordedChunks = [];

let calloutsMuted = false;
let currentChordState = null;
let lastAnnouncedRoot = null; // `${chord}-${isMajorMode}` — only re-announce when this changes
let hasTaughtRightHand = false; // right-hand tip is taught once, the moment it becomes relevant
let started = false;

function speakForce(text) {
  if (!text) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Respects the voice lock — used for automatic, incidental speech (chord callouts).
function speak(text) {
  if (calloutsMuted || !text) return;
  speakForce(text);
}

// `force: true` bypasses the voice lock — for speech the user deliberately asked
// for (the lock toggle's own confirmation, settings readout, help guide), which
// should always be audible even while locked. Otherwise locking would silence
// its own unlock confirmation and every deliberate space-bar request.
function announce(text, { speakAloud = false, force = false } = {}) {
  statusLive.textContent = text;
  if (speakAloud) (force ? speakForce : speak)(text);
}

// ---- Video -> canvas rendering (mirrored, "cover" fit, hand-landmark dots) ----
// Drawn so a sighted co-viewer/low-vision user can see hand position, same as
// the source project — but this is purely visual polish, not how a blind
// player operates the instrument (that's the spoken layer below).
function resizeCanvas() {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function computeCoverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sHeight = srcH;
    const sWidth = srcH * dstRatio;
    return { sx: (srcW - sWidth) / 2, sy: 0, sWidth, sHeight };
  }
  const sWidth = srcW;
  const sHeight = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sHeight) / 2, sWidth, sHeight };
}

function drawFrame(result) {
  const srcW = webcam.videoWidth, srcH = webcam.videoHeight;
  if (!srcW || !srcH) return;
  const canvasWidth = overlayCanvas.width, canvasHeight = overlayCanvas.height;
  const { sx, sy, sWidth, sHeight } = computeCoverRect(srcW, srcH, canvasWidth, canvasHeight);

  overlayCtx.save();
  overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  overlayCtx.translate(canvasWidth, 0);
  overlayCtx.scale(-1, 1);
  overlayCtx.drawImage(webcam, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, canvasHeight);

  overlayCtx.fillStyle = '#ffffff80';
  for (const landmarks of result.landmarks) {
    for (const point of landmarks) {
      const canvasX = ((point.x * srcW - sx) / sWidth) * canvasWidth;
      const canvasY = ((point.y * srcH - sy) / sHeight) * canvasHeight;
      overlayCtx.beginPath();
      overlayCtx.arc(canvasX, canvasY, 4, 0, Math.PI * 2);
      overlayCtx.fill();
    }
  }
  overlayCtx.restore();
}

function updateVolumeMeter(volume01) {
  const litCount = Math.round(volume01 * volumeBarEls.length);
  volumeBarEls.forEach((bar) => {
    const index = Number(bar.dataset.index);
    bar.classList.toggle('lit', index >= volumeBarEls.length - litCount);
  });
}

tracker.onFrame = (result) => drawFrame(result);

// Only the root chord / major-minor is spoken — that's the one thing a
// blind player genuinely can't infer from the sound alone. Quality,
// inversion, and octave change far more often (right-hand voicing tweaks
// on top of a held root) and are deliberately NOT spoken, or this narrates
// almost every gesture instead of just the meaningful ones. Same principle
// as volume/filter: continuous/frequent changes are conveyed by the sound
// and the on-screen display, not by interrupting speech.
tracker.onChordChange = (chordState) => {
  currentChordState = chordState;

  if (!chordState) {
    synth.setVolume(0);
    chordDisplay.textContent = '--';
    qualityDisplay.textContent = '--';
    lastAnnouncedRoot = null;
    return;
  }

  const keyName = keySelect.selectedOptions[0].dataset.note;
  const chordName = getChordName(chordState.chord, chordState.isMajorMode, keyName);
  const qualityLabel = getQualityLabel(chordState.isMajorMode, chordState.qualityIndex);

  if (chordName && qualityLabel) {
    chordDisplay.textContent = `${chordName}(${chordState.chord})`;
    qualityDisplay.textContent = `${qualityLabel}${chordState.octaveDown ? ' (-8ve)' : ''}`;

    const rootKey = `${chordState.chord}-${chordState.isMajorMode}`;
    if (rootKey !== lastAnnouncedRoot) {
      lastAnnouncedRoot = rootKey;
      if (!hasTaughtRightHand) {
        // Taught once, right when it's relevant — the left hand just proved
        // it works, so this is the moment to introduce the second hand,
        // not before.
        hasTaughtRightHand = true;
        announce(
          `${chordName}. That's your first chord. Now bring in your right hand: number of ` +
            'fingers shapes it, height controls volume, thumb drops an octave, tilt sweeps the tone filter.',
          { speakAloud: true }
        );
      } else {
        announce(chordName, { speakAloud: true });
      }
    } else {
      statusLive.textContent = `${chordName} ${qualityLabel}`; // still updates for screen readers, just not spoken
    }
  }
};

tracker.onContinuous = (volume01, filterTilt) => {
  synth.updateFilterSweep(filterTilt);
  distortionDisplay.textContent = `Filter: ${filterTilt >= 0 ? '+' : ''}${Math.round(filterTilt * 100)}%`;
  updateVolumeMeter(volume01);

  if (!currentChordState) {
    synth.setVolume(0);
    return;
  }
  const tones = getChordTones(currentChordState.chord, currentChordState.isMajorMode, Number(keySelect.value));
  let notes = getSolidNotes(tones, currentChordState.qualityIndex || 1, currentChordState.isMajorMode);
  if (currentChordState.octaveDown) notes = notes.map((f) => f / 2);
  synth.playNotes(notes);
  synth.setVolume(volume01);
};

tracker.onHandsLost = () => {
  synth.setVolume(0);
  updateVolumeMeter(0);
};

async function start() {
  synth.ensureContext();
  startOverlay.classList.add('hidden');
  overlayCanvas.classList.remove('dimmed');
  announce('Starting camera…', { speakAloud: true });
  try {
    await tracker.start();
    started = true;
    hasTaughtRightHand = false;
    announce(
      'Instrument ready. Hold up fingers on your left hand to try a chord. ' +
        'Press the help button anytime for the full guide.',
      { speakAloud: true }
    );
  } catch (err) {
    alertLive.textContent = 'Camera unavailable — gesture instrument cannot start.';
    speak('Camera unavailable, gesture instrument cannot start.');
    startOverlay.classList.remove('hidden');
    overlayCanvas.classList.add('dimmed');
  }
}

startOverlay.addEventListener('click', start);
startOverlay.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    start();
  }
});

toneSelect.addEventListener('change', () => synth.setWaveform(toneSelect.value));

// ---- Voice-driven settings (2 presses) ----
// Recites Key/Tone + their options, then listens for a spoken reply and
// applies it. A second double-press while listening cancels instead of
// re-triggering — same "press it again to close" rule as the help guide.
const KEY_ALIASES = {
  c: 'C', 'c sharp': 'Db', 'db': 'Db', 'd flat': 'Db',
  d: 'D', 'd sharp': 'Eb', 'eb': 'Eb', 'e flat': 'Eb',
  e: 'E',
  f: 'F', 'f sharp': 'Gb', 'gb': 'Gb', 'g flat': 'Gb',
  g: 'G', 'g sharp': 'Ab', 'ab': 'Ab', 'a flat': 'Ab',
  a: 'A', 'a sharp': 'Bb', 'bb': 'Bb', 'b flat': 'Bb',
  b: 'B',
};
const TONE_ALIASES = {
  'warm synth': 'triangle', warm: 'triangle', triangle: 'triangle',
  'bright synth': 'sawtooth', bright: 'sawtooth', sawtooth: 'sawtooth',
  'retro synth': 'square', retro: 'square', square: 'square',
};

function parseSettingsCommand(transcript) {
  const t = transcript.toLowerCase().trim();
  const toneMatch = Object.keys(TONE_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((phrase) => new RegExp(`\\b${phrase}\\b`).test(t));
  if (toneMatch) return { type: 'tone', value: TONE_ALIASES[toneMatch] };

  const keyMatch = Object.keys(KEY_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((phrase) => new RegExp(`\\b${phrase}\\b`).test(t));
  if (keyMatch) return { type: 'key', value: KEY_ALIASES[keyMatch] };

  return null;
}

let settingsListening = false;
let settingsRecognition = null;

function cancelSettingsListening() {
  if (settingsRecognition) {
    settingsRecognition.onend = null; // avoid the stray "didn't hear anything" from firing after an explicit cancel
    try { settingsRecognition.stop(); } catch { /* already stopped */ }
    settingsRecognition = null;
  }
  settingsListening = false;
}

function startSettingsListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    announce('Voice input for settings is not supported in this browser.', { speakAloud: true, force: true });
    return;
  }
  settingsListening = true;
  settingsRecognition = new SR();
  settingsRecognition.lang = 'en-US';
  settingsRecognition.interimResults = false;
  settingsRecognition.maxAlternatives = 1;

  settingsRecognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const parsed = parseSettingsCommand(transcript);
    cancelSettingsListening();
    if (!parsed) {
      announce(`Didn't catch a key or tone in "${transcript}". Press space twice to try again.`, {
        speakAloud: true,
        force: true,
      });
      return;
    }
    if (parsed.type === 'key') {
      const option = Array.from(keySelect.options).find((o) => o.dataset.note === parsed.value);
      keySelect.value = option.value;
      announce(`Key set to ${option.dataset.note}`, { speakAloud: true, force: true });
    } else {
      toneSelect.value = parsed.value;
      synth.setWaveform(parsed.value);
      announce(`Tone set to ${toneSelect.selectedOptions[0].textContent}`, { speakAloud: true, force: true });
    }
  };
  settingsRecognition.onerror = () => {
    const wasListening = settingsListening;
    cancelSettingsListening();
    if (wasListening) {
      announce("Didn't hear a response. Press space twice to try again.", { speakAloud: true, force: true });
    }
  };
  settingsRecognition.onend = () => {
    cancelSettingsListening();
  };
  settingsRecognition.start();
}

function speakSettingsOptionsThenListen() {
  const currentKey = keySelect.selectedOptions[0].textContent;
  const keyOptions = Array.from(keySelect.options).map((o) => o.textContent).join(', ');
  const currentTone = toneSelect.selectedOptions[0].textContent;
  const toneOptions = Array.from(toneSelect.options).map((o) => o.textContent).join(', ');
  const text =
    `Current settings. Key: ${currentKey}. Available keys: ${keyOptions}. ` +
    `Tone: ${currentTone}. Available tones: ${toneOptions}. Say a key or a tone to change it.`;
  statusLive.textContent = text;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  let listenerStarted = false;
  const beginListening = () => {
    if (listenerStarted) return;
    listenerStarted = true;
    startSettingsListening();
  };
  utterance.onend = beginListening;
  utterance.onerror = beginListening;
  window.speechSynthesis.speak(utterance);
  // Safety net: Chrome's speechSynthesis has a known bug where `onend` never
  // fires for longer utterances, which would otherwise leave this stuck
  // forever waiting to start listening. Estimate speaking time from word
  // count and start listening anyway if `onend` hasn't shown up by then.
  const estimatedSpeakMs = Math.max(3000, (text.split(/\s+/).length / 2.2) * 1000 + 1500);
  setTimeout(beginListening, estimatedSpeakMs);
}

function handleDoublePress() {
  if (settingsListening) {
    cancelSettingsListening();
    window.speechSynthesis.cancel();
    announce('Settings closed.', { speakAloud: true, force: true });
    return;
  }
  speakSettingsOptionsThenListen();
}

function toggleVoiceLock() {
  cancelSettingsListening();
  calloutsMuted = !calloutsMuted;
  muteBtn.setAttribute('aria-pressed', String(calloutsMuted));
  announce(calloutsMuted ? 'Voice locked' : 'Voice unlocked', { speakAloud: true, force: true });
}
muteBtn.addEventListener('click', toggleVoiceLock);

function handleTriplePress() {
  if (!helpModal.classList.contains('hidden')) {
    helpModal.classList.add('hidden');
    window.speechSynthesis.cancel();
    announce('Help closed.', { speakAloud: true, force: true });
    return;
  }
  cancelSettingsListening();
  helpModal.classList.remove('hidden');
  const text =
    'Gesture Vision guide. Left hand: number of fingers picks the scale degree, one through five. ' +
    'Index and pinky together is six. Index, pinky, and thumb together is seven. ' +
    'Tilt your left wrist left or right of center for major or minor — there is a dead zone in the middle. ' +
    'Right hand: number of fingers picks the chord quality — one is root position, two is first inversion, ' +
    'three is a seventh, four is an extended seventh. Extend your right thumb to drop an octave. ' +
    'Raise your right hand higher for more volume. Tilt your right hand left or right to sweep the tone filter. ' +
    'Chord and quality changes are spoken automatically. ' +
    'Press space once to lock or unlock the voice, twice to change your settings by voice, ' +
    'or three times to hear this guide again — press the same number of times again to close it.';
  announce(text, { speakAloud: true, force: true });
}

// Space-bar press counting: 1 press = lock/unlock the voice, 2 = voice-driven
// settings (press twice again to close), 3 = help guide (press three times
// again to close). All on one key so a player never takes a hand off the
// instrument to find a different key.
let spacePressCount = 0;
let spacePressTimer = null;
const SPACE_PRESS_WINDOW_MS = 600;

function handleSpacePress() {
  spacePressCount += 1;
  clearTimeout(spacePressTimer);
  spacePressTimer = setTimeout(() => {
    if (spacePressCount === 1) toggleVoiceLock();
    else if (spacePressCount === 2) handleDoublePress();
    else handleTriplePress();
    spacePressCount = 0;
  }, SPACE_PRESS_WINDOW_MS);
}

function downloadRecording(blob) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gesture-vision-${stamp}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let micStream = null;
let recordingStarting = false;

async function startRecording() {
  if (recordingStarting) return;
  recordingStarting = true;
  try {
    const stream = synth.getRecordingStream();
    if (!stream) {
      alertLive.textContent = 'Start the instrument before recording.';
      speak('Start the instrument before recording.');
      return;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      synth.connectMicrophone(micStream);
    } catch {
      micStream = null;
      announce('Microphone unavailable — recording music only.', { speakAloud: true, force: true });
    }

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(
      (t) => window.MediaRecorder?.isTypeSupported?.(t)
    ) || '';
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();
    recordBtn.setAttribute('aria-pressed', 'true');
    recordBtn.textContent = 'Stop recording (R)';
    announce('Recording started — your voice and the instrument are both being captured', { speakAloud: true });
  } finally {
    recordingStarting = false;
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    downloadRecording(blob);
    announce('Recording saved and downloaded', { speakAloud: true });
  };
  mediaRecorder.stop();
  synth.disconnectMicrophone();
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  recordBtn.setAttribute('aria-pressed', 'false');
  recordBtn.textContent = 'Record (R)';
}

recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  else startRecording();
});

helpButton.addEventListener('click', () => {
  helpModal.classList.remove('hidden');
  closeHelp.focus();
});
closeHelp.addEventListener('click', () => {
  helpModal.classList.add('hidden');
  helpButton.focus();
});
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') muteBtn.click();
  if (e.key === 'r' || e.key === 'R') recordBtn.click();
  if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) closeHelp.click();
  if (e.key === ' ' && started && !e.repeat) {
    e.preventDefault();
    handleSpacePress();
  }
});

import { SoundscapeSynth } from './soundscapeSynth.js';

const BACKEND_URL = window.PRISM_BACKEND_URL || 'http://localhost:3002';

const statusLive = document.getElementById('statusLive');
const alertLive = document.getElementById('alertLive');

function announce(text) {
  statusLive.textContent = text;
}
function alertUser(text) {
  alertLive.textContent = text;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ---- Tabs ----
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const tabPanels = {
  illustration: document.getElementById('panel-illustration'),
  'image-sound': document.getElementById('panel-image-sound'),
  'text-sound': document.getElementById('panel-text-sound'),
};
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(tabPanels).forEach(([key, panel]) => {
      panel.classList.toggle('hidden', key !== btn.dataset.tab);
    });
  });
});

// ==================== Image -> Illustration (Creative Content Translator) ====================
const pageInput = document.getElementById('pageInput');
const styleSelect = document.getElementById('styleSelect');
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeStatus = document.getElementById('analyzeStatus');
const mockWarning = document.getElementById('mockWarning');
const reimagineSection = document.getElementById('reimagineSection');
const reimagineStatus = document.getElementById('reimagineStatus');
const reimagineMockWarning = document.getElementById('reimagineMockWarning');
const gallery = document.getElementById('gallery');
const regenerateBtn = document.getElementById('regenerateBtn');
const restartBtn = document.getElementById('restartBtn');

let panels = [];

pageInput.addEventListener('change', () => {
  analyzeBtn.disabled = !pageInput.files?.length;
});

function renderGallery(images) {
  gallery.innerHTML = '';
  images.forEach((img) => {
    const panel = panels.find((p) => p.id === img.panelId);
    const item = document.createElement('div');
    item.className = 'gallery-item';

    const imageEl = document.createElement('img');
    imageEl.src = img.imageDataUrl;
    imageEl.alt = panel?.description || `Panel ${panel?.suggestedOrder ?? ''}`;

    const caption = document.createElement('p');
    caption.textContent = `Panel ${panel?.suggestedOrder ?? ''}: ${panel?.description || ''}`;

    item.append(imageEl, caption);
    gallery.appendChild(item);
  });
}

async function runReimagine() {
  reimagineMockWarning.classList.add('hidden');
  reimagineStatus.textContent = `Reimagining ${panels.length} panel(s) — this can take a while…`;
  announce(reimagineStatus.textContent);

  try {
    const res = await fetch(`${BACKEND_URL}/api/comic/reimagine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels, style: styleSelect.value }),
    });
    if (!res.ok) throw new Error(`reimagine failed: ${res.status}`);
    const data = await res.json();

    renderGallery(data.images);
    reimagineStatus.textContent = `${data.images.length} panel(s) reimagined.`;
    announce(reimagineStatus.textContent);
    regenerateBtn.classList.remove('hidden');

    if (data.usedMock) {
      const msg =
        `${data.mockCount} of ${data.images.length} panel(s) used a placeholder image because ` +
        'real image generation failed for them.';
      reimagineMockWarning.textContent = msg;
      reimagineMockWarning.classList.remove('hidden');
    }
  } catch (err) {
    console.error(err);
    alertUser('Could not reimagine the page — check that the backend server is running.');
    reimagineStatus.textContent = 'Reimagining failed.';
  }
}

analyzeBtn.addEventListener('click', async () => {
  const file = pageInput.files?.[0];
  if (!file) return;

  analyzeBtn.disabled = true;
  mockWarning.classList.add('hidden');
  reimagineSection.classList.add('hidden');
  regenerateBtn.classList.add('hidden');
  gallery.innerHTML = '';
  analyzeStatus.textContent = 'Analyzing page…';
  announce('Analyzing page…');

  try {
    const imageDataUrl = await readFileAsDataUrl(file);
    const res = await fetch(`${BACKEND_URL}/api/comic/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageDataUrl }),
    });
    if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
    const data = await res.json();

    panels = [...data.panels].sort((a, b) => a.suggestedOrder - b.suggestedOrder);
    reimagineSection.classList.remove('hidden');

    if (data.usedMock) {
      const msg =
        'The real vision analysis failed, so panels will be reimagined from placeholder demo ' +
        `content, not your actual page. Reason: ${data.mockReason || 'unknown error'}.`;
      mockWarning.textContent = msg;
      mockWarning.classList.remove('hidden');
      alertUser(msg);
      analyzeStatus.textContent = '';
    } else {
      analyzeStatus.textContent = `Found ${panels.length} panels.`;
      announce(analyzeStatus.textContent);
    }

    await runReimagine();
  } catch (err) {
    console.error(err);
    alertUser('Could not analyze the page — check that the backend server is running.');
    analyzeStatus.textContent = 'Analysis failed.';
  } finally {
    analyzeBtn.disabled = false;
  }
});

regenerateBtn.addEventListener('click', () => {
  regenerateBtn.disabled = true;
  runReimagine().finally(() => {
    regenerateBtn.disabled = false;
  });
});

restartBtn.addEventListener('click', () => {
  window.location.reload();
});

// ==================== Shared soundscape playback helper ====================
let audioCtx = null;
let soundscape = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    soundscape = new SoundscapeSynth(audioCtx);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return soundscape;
}

function describeMood(mood) {
  return `${mood.mood} — ${mood.description} (brightness ${mood.brightness.toFixed(2)}, energy ${mood.energy.toFixed(2)}, warmth ${mood.warmth.toFixed(2)}, valence ${mood.valence.toFixed(2)})`;
}

// Both soundscape tabs share one underlying synth instance — starting a new
// soundscape in one silently replaces whatever the other tab had playing,
// so its Play/Pause button would otherwise be left showing a stale state.
function resetOtherSoundscapeButton(exceptId) {
  ['imageSoundPlayBtn', 'textSoundPlayBtn'].forEach((id) => {
    if (id === exceptId) return;
    const btn = document.getElementById(id);
    if (btn) btn.textContent = 'Play';
  });
}

// ==================== Image -> Soundscape ====================
const soundImageInput = document.getElementById('soundImageInput');
const imageSoundBtn = document.getElementById('imageSoundBtn');
const imageSoundStatus = document.getElementById('imageSoundStatus');
const imageSoundMockWarning = document.getElementById('imageSoundMockWarning');
const imageSoundControls = document.getElementById('imageSoundControls');
const imageMoodDescription = document.getElementById('imageMoodDescription');
const imageSoundPlayBtn = document.getElementById('imageSoundPlayBtn');
const imageSoundStopBtn = document.getElementById('imageSoundStopBtn');

let currentImageMood = null;

soundImageInput.addEventListener('change', () => {
  imageSoundBtn.disabled = !soundImageInput.files?.length;
});

imageSoundBtn.addEventListener('click', async () => {
  const file = soundImageInput.files?.[0];
  if (!file) return;

  imageSoundBtn.disabled = true;
  imageSoundMockWarning.classList.add('hidden');
  imageSoundStatus.textContent = 'Reading the image’s mood…';
  announce(imageSoundStatus.textContent);

  try {
    const imageDataUrl = await readFileAsDataUrl(file);
    const res = await fetch(`${BACKEND_URL}/api/synesthesia/mood-from-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageDataUrl }),
    });
    if (!res.ok) throw new Error(`mood-from-image failed: ${res.status}`);
    const data = await res.json();

    currentImageMood = data.mood;
    imageMoodDescription.textContent = describeMood(data.mood);
    imageSoundControls.classList.remove('hidden');
    imageSoundStatus.textContent = 'Soundscape ready.';
    announce(imageSoundStatus.textContent);

    const synth = ensureAudio();
    synth.generate(data.mood);
    resetOtherSoundscapeButton('imageSoundPlayBtn');
    imageSoundPlayBtn.textContent = 'Pause';

    if (data.usedMock) {
      const msg = `The real mood analysis failed, so this is a generic placeholder mood. Reason: ${data.mockReason || 'unknown error'}.`;
      imageSoundMockWarning.textContent = msg;
      imageSoundMockWarning.classList.remove('hidden');
    }
  } catch (err) {
    console.error(err);
    alertUser('Could not read the image’s mood — check that the backend server is running.');
    imageSoundStatus.textContent = 'Failed.';
  } finally {
    imageSoundBtn.disabled = false;
  }
});

imageSoundPlayBtn.addEventListener('click', () => {
  const synth = ensureAudio();
  if (imageSoundPlayBtn.textContent === 'Play') {
    if (currentImageMood) synth.generate(currentImageMood);
    resetOtherSoundscapeButton('imageSoundPlayBtn');
    imageSoundPlayBtn.textContent = 'Pause';
  } else {
    synth.stop();
    imageSoundPlayBtn.textContent = 'Play';
  }
});
imageSoundStopBtn.addEventListener('click', () => {
  if (soundscape) soundscape.stop();
  imageSoundPlayBtn.textContent = 'Play';
});

// ==================== Text -> Soundscape ====================
const moodTextInput = document.getElementById('moodTextInput');
const textSoundBtn = document.getElementById('textSoundBtn');
const textSoundStatus = document.getElementById('textSoundStatus');
const textSoundMockWarning = document.getElementById('textSoundMockWarning');
const textSoundControls = document.getElementById('textSoundControls');
const textMoodDescription = document.getElementById('textMoodDescription');
const textSoundPlayBtn = document.getElementById('textSoundPlayBtn');
const textSoundStopBtn = document.getElementById('textSoundStopBtn');

let currentTextMood = null;

moodTextInput.addEventListener('input', () => {
  textSoundBtn.disabled = !moodTextInput.value.trim();
});

textSoundBtn.addEventListener('click', async () => {
  const text = moodTextInput.value.trim();
  if (!text) return;

  textSoundBtn.disabled = true;
  textSoundMockWarning.classList.add('hidden');
  textSoundStatus.textContent = 'Reading the mood…';
  announce(textSoundStatus.textContent);

  try {
    const res = await fetch(`${BACKEND_URL}/api/synesthesia/mood-from-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`mood-from-text failed: ${res.status}`);
    const data = await res.json();

    currentTextMood = data.mood;
    textMoodDescription.textContent = describeMood(data.mood);
    textSoundControls.classList.remove('hidden');
    textSoundStatus.textContent = 'Soundscape ready.';
    announce(textSoundStatus.textContent);

    const synth = ensureAudio();
    synth.generate(data.mood);
    resetOtherSoundscapeButton('textSoundPlayBtn');
    textSoundPlayBtn.textContent = 'Pause';

    if (data.usedMock) {
      const msg = `The real mood analysis failed, so this is a generic placeholder mood. Reason: ${data.mockReason || 'unknown error'}.`;
      textSoundMockWarning.textContent = msg;
      textSoundMockWarning.classList.remove('hidden');
    }
  } catch (err) {
    console.error(err);
    alertUser('Could not read the mood — check that the backend server is running.');
    textSoundStatus.textContent = 'Failed.';
  } finally {
    textSoundBtn.disabled = false;
  }
});

textSoundPlayBtn.addEventListener('click', () => {
  const synth = ensureAudio();
  if (textSoundPlayBtn.textContent === 'Play') {
    if (currentTextMood) synth.generate(currentTextMood);
    resetOtherSoundscapeButton('textSoundPlayBtn');
    textSoundPlayBtn.textContent = 'Pause';
  } else {
    synth.stop();
    textSoundPlayBtn.textContent = 'Play';
  }
});
textSoundStopBtn.addEventListener('click', () => {
  if (soundscape) soundscape.stop();
  textSoundPlayBtn.textContent = 'Play';
});

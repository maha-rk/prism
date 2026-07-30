import { StoryPlayer } from './player.js';
import { applyAccessProfile } from '../../shared/accessProfile.js';

applyAccessProfile();

const BACKEND_URL = window.PRISM_BACKEND_URL || 'http://localhost:3002';

const pageInput = document.getElementById('pageInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const uploadSection = document.getElementById('uploadSection');
const reviewSection = document.getElementById('reviewSection');
const narrateSection = document.getElementById('narrateSection');
const pageImage = document.getElementById('pageImage');
const panelOverlay = document.getElementById('panelOverlay');
const panelList = document.getElementById('panelList');
const confirmOrderBtn = document.getElementById('confirmOrderBtn');
const reanalyzeBtn = document.getElementById('reanalyzeBtn');
const mockWarning = document.getElementById('mockWarning');
const narrateMockWarning = document.getElementById('narrateMockWarning');
const narrateStatus = document.getElementById('narrateStatus');
const playerControls = document.getElementById('playerControls');
const playPauseBtn = document.getElementById('playPauseBtn');
const restartBtn = document.getElementById('restartBtn');
const transcript = document.getElementById('transcript');
const statusLive = document.getElementById('statusLive');
const alertLive = document.getElementById('alertLive');
const accessibilityReport = document.getElementById('accessibilityReport');
const accessibilityMethodologyNote = document.getElementById('accessibilityMethodologyNote');
const accessibilityFindings = document.getElementById('accessibilityFindings');
const boostContrastBtn = document.getElementById('boostContrastBtn');
const highContrastResult = document.getElementById('highContrastResult');
const highContrastImage = document.getElementById('highContrastImage');

let imageDataUrl = null;
let orderedPanels = [];
let audioCtx = null;
let player = null;

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

pageInput.addEventListener('change', () => {
  analyzeBtn.disabled = !pageInput.files?.length;
});

function resizeOverlay() {
  panelOverlay.width = pageImage.clientWidth;
  panelOverlay.height = pageImage.clientHeight;
}

function drawPanelOverlay() {
  resizeOverlay();
  const ctx = panelOverlay.getContext('2d');
  ctx.clearRect(0, 0, panelOverlay.width, panelOverlay.height);
  ctx.strokeStyle = '#e8a13d';
  ctx.lineWidth = 2;
  ctx.font = 'bold 16px monospace';

  orderedPanels.forEach((panel, i) => {
    const { x, y, w, h } = panel.bbox;
    const px = x * panelOverlay.width;
    const py = y * panelOverlay.height;
    const pw = w * panelOverlay.width;
    const ph = h * panelOverlay.height;
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = '#e8a13d';
    ctx.fillRect(px, py, 26, 22);
    ctx.fillStyle = '#111';
    ctx.fillText(String(i + 1), px + 7, py + 16);
  });
}

function renderPanelList() {
  panelList.innerHTML = '';
  orderedPanels.forEach((panel, i) => {
    const li = document.createElement('li');

    const orderEl = document.createElement('span');
    orderEl.className = 'panel-order';
    orderEl.textContent = String(i + 1);

    const descEl = document.createElement('span');
    descEl.className = 'panel-desc';
    const base = panel.caption ? `"${panel.caption}" — ${panel.description}` : panel.description;
    descEl.textContent = panel.sfx?.length ? `${base} [${panel.sfx.join(', ')}]` : base;

    const btnWrap = document.createElement('span');
    btnWrap.className = 'reorder-btns';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '↑ Move up';
    upBtn.setAttribute('aria-label', `Move panel ${i + 1} up`);
    upBtn.disabled = i === 0;
    upBtn.addEventListener('click', () => movePanel(i, -1));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '↓ Move down';
    downBtn.setAttribute('aria-label', `Move panel ${i + 1} down`);
    downBtn.disabled = i === orderedPanels.length - 1;
    downBtn.addEventListener('click', () => movePanel(i, 1));

    btnWrap.append(upBtn, downBtn);
    li.append(orderEl, descEl, btnWrap);
    panelList.appendChild(li);
  });
}

function renderAccessibilityReport(accessibility) {
  if (!accessibility) {
    accessibilityReport.classList.add('hidden');
    return;
  }

  accessibilityMethodologyNote.textContent = accessibility.methodologyNote;
  accessibilityFindings.innerHTML = '';
  highContrastResult.classList.add('hidden');

  const lowContrastPanels = accessibility.panelContrast.filter((p) => p.lowContrast);
  lowContrastPanels.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = `Panel ${p.id}: low visual contrast (approx. ratio ${p.contrastRatio}:1) — may be hard to distinguish for a low-vision viewer.`;
    accessibilityFindings.appendChild(li);
  });

  accessibility.structuralIssues.forEach((issue) => {
    const li = document.createElement('li');
    li.textContent = issue;
    accessibilityFindings.appendChild(li);
  });

  if (lowContrastPanels.length === 0 && accessibility.structuralIssues.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No contrast or structural issues found by these checks.';
    accessibilityFindings.appendChild(li);
  }

  boostContrastBtn.classList.toggle('hidden', lowContrastPanels.length === 0);
  accessibilityReport.classList.remove('hidden');
}

/** Real per-channel histogram-stretch contrast enhancement — deterministic
 * pixel math (find the actual min/max per RGB channel across the whole
 * image, then linearly stretch every pixel to use the full 0-255 range),
 * not an AI guess. Runs entirely in the browser via Canvas, no backend
 * round-trip needed since the original image is already loaded locally. */
function boostContrast(sourceImg) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceImg.naturalWidth;
  canvas.height = sourceImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.max(0, Math.min(255, ((data[i + c] - min) / range) * 255));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

boostContrastBtn.addEventListener('click', () => {
  highContrastImage.src = boostContrast(pageImage);
  highContrastResult.classList.remove('hidden');
  announce('High-contrast version generated below the accessibility notes.');
});

function movePanel(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= orderedPanels.length) return;
  [orderedPanels[index], orderedPanels[target]] = [orderedPanels[target], orderedPanels[index]];
  renderPanelList();
  drawPanelOverlay();
  announce(`Panel moved to position ${target + 1} of ${orderedPanels.length}`);
}

async function runAnalyze(triggerBtn) {
  triggerBtn.disabled = true;
  announce('Analyzing page…');
  mockWarning.classList.add('hidden');

  try {
    const res = await fetch(`${BACKEND_URL}/api/comic/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageDataUrl }),
    });
    if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
    const data = await res.json();

    orderedPanels = [...data.panels].sort((a, b) => a.suggestedOrder - b.suggestedOrder);

    pageImage.src = imageDataUrl;
    pageImage.onload = drawPanelOverlay;
    window.addEventListener('resize', drawPanelOverlay);

    renderPanelList();
    renderAccessibilityReport(data.accessibility);
    reviewSection.classList.remove('hidden');

    if (data.usedMock) {
      const msg =
        'The real vision analysis failed, so this is placeholder demo content, ' +
        'NOT a real reading of your uploaded page. ' +
        `Reason: ${data.mockReason || 'unknown error'}. Try Re-analyze this page.`;
      mockWarning.textContent = msg;
      mockWarning.classList.remove('hidden');
      alertUser(msg);
    } else {
      announce(`Found ${orderedPanels.length} panels. Review the reading order below.`);
    }
  } catch (err) {
    console.error(err);
    alertUser('Could not analyze the page — check that the backend server is running.');
  } finally {
    triggerBtn.disabled = false;
  }
}

analyzeBtn.addEventListener('click', async () => {
  const file = pageInput.files?.[0];
  if (!file) return;
  imageDataUrl = await readFileAsDataUrl(file);
  runAnalyze(analyzeBtn);
});

reanalyzeBtn.addEventListener('click', () => {
  if (!imageDataUrl) return;
  runAnalyze(reanalyzeBtn);
});

async function fetchTtsBuffer(ctx, text, voice, emotion, build) {
  const res = await fetch(`${BACKEND_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, emotion, build }),
  });
  if (!res.ok) throw new Error(`tts failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

function renderTranscript(queue) {
  transcript.innerHTML = '';
  queue.forEach((item) => {
    const li = document.createElement('li');
    // Sound effects were previously audio-only (synthesized by
    // playSfxTag in player.js) with no visible equivalent anywhere — a
    // deaf/hard-of-hearing reader following the transcript would silently
    // miss any panel whose meaning depended on one. Shown as a bracketed
    // cue, the standard closed-captioning convention (e.g. "[rain,
    // thunder]"), not just played.
    if (item.sfx?.length) {
      const sfxEl = document.createElement('span');
      sfxEl.className = 'sfx-caption';
      sfxEl.textContent = `[${item.sfx.join(', ')}]`;
      li.appendChild(sfxEl);
    }
    if (item.speaker) {
      const speakerEl = document.createElement('span');
      speakerEl.className = 'speaker';
      speakerEl.textContent = `${item.speaker}:`;
      li.appendChild(speakerEl);
    }
    li.appendChild(document.createTextNode(item.text));
    transcript.appendChild(li);
  });
}

confirmOrderBtn.addEventListener('click', async () => {
  confirmOrderBtn.disabled = true;
  narrateSection.classList.remove('hidden');
  narrateStatus.textContent = 'Reconstructing narrative…';
  narrateMockWarning.classList.add('hidden');

  try {
    const narrateRes = await fetch(`${BACKEND_URL}/api/comic/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels: orderedPanels }),
    });
    if (!narrateRes.ok) throw new Error(`narrate failed: ${narrateRes.status}`);
    const { script, usedFallback, fallbackReason } = await narrateRes.json();

    if (usedFallback) {
      const msg =
        'The narrative-smoothing pass failed, so panel descriptions are shown as originally ' +
        `detected, without the connective narration polish. Reason: ${fallbackReason || 'unknown error'}.`;
      narrateMockWarning.textContent = msg;
      narrateMockWarning.classList.remove('hidden');
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    player = new StoryPlayer(audioCtx);

    narrateStatus.textContent = 'Synthesizing voices…';
    const flatLines = [];
    for (const panel of script) {
      panel.lines.forEach((line, i) => {
        flatLines.push({
          panelId: panel.panelId,
          pan: panel.pan,
          sfx: i === 0 ? panel.sfx : [],
          isPanelStart: i === 0,
          speaker: line.type === 'dialogue' ? line.speaker : null,
          text: line.text,
          voice: line.voice,
          emotion: line.emotion,
          build: line.build || 'average',
        });
      });
    }

    const buffers = await Promise.all(
      flatLines.map((line) => fetchTtsBuffer(audioCtx, line.text, line.voice, line.emotion, line.build))
    );
    const queue = flatLines.map((line, i) => ({ ...line, buffer: buffers[i] }));

    renderTranscript(queue);
    player.load(queue);
    player.onLineStart = (index) => {
      Array.from(transcript.children).forEach((li, i) => li.classList.toggle('active', i === index));
      transcript.children[index]?.scrollIntoView({ block: 'nearest' });
    };
    player.onEnd = () => {
      playPauseBtn.textContent = 'Play';
      announce('Narration finished.');
    };

    narrateStatus.textContent = 'Narration ready.';
    playerControls.classList.remove('hidden');
    announce('Narration ready. Press play to begin.');
  } catch (err) {
    console.error(err);
    alertUser('Could not generate narration — check that the backend server is running.');
    narrateStatus.textContent = 'Narration failed.';
  }
});

playPauseBtn.addEventListener('click', () => {
  if (!player) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (player.playing) {
    player.pause();
    playPauseBtn.textContent = 'Play';
    announce('Paused.');
  } else {
    player.play();
    playPauseBtn.textContent = 'Pause';
    announce('Playing.');
  }
});

restartBtn.addEventListener('click', () => {
  window.location.reload();
});

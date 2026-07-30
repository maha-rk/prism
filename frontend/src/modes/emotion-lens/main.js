const BACKEND_URL = window.PRISM_BACKEND_URL || 'http://localhost:3002';

const pageInput = document.getElementById('pageInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeStatus = document.getElementById('analyzeStatus');
const mockWarning = document.getElementById('mockWarning');
const qaSection = document.getElementById('qaSection');
const pageImage = document.getElementById('pageImage');
const askForm = document.getElementById('askForm');
const questionInput = document.getElementById('questionInput');
const askBtn = document.getElementById('askBtn');
const askMockWarning = document.getElementById('askMockWarning');
const conversation = document.getElementById('conversation');
const restartBtn = document.getElementById('restartBtn');
const statusLive = document.getElementById('statusLive');
const alertLive = document.getElementById('alertLive');

let imageDataUrl = null;
let panels = [];
let audioCtx = null;
let currentSource = null;

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

analyzeBtn.addEventListener('click', async () => {
  const file = pageInput.files?.[0];
  if (!file) return;

  analyzeBtn.disabled = true;
  mockWarning.classList.add('hidden');
  analyzeStatus.textContent = 'Analyzing page…';
  announce('Analyzing page…');

  try {
    imageDataUrl = await readFileAsDataUrl(file);
    const res = await fetch(`${BACKEND_URL}/api/comic/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imageDataUrl }),
    });
    if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
    const data = await res.json();

    panels = [...data.panels].sort((a, b) => a.suggestedOrder - b.suggestedOrder);
    pageImage.src = imageDataUrl;
    qaSection.classList.remove('hidden');

    if (data.usedMock) {
      const msg =
        'The real vision analysis failed, so questions will be answered against placeholder ' +
        `demo content, not your actual page. Reason: ${data.mockReason || 'unknown error'}.`;
      mockWarning.textContent = msg;
      mockWarning.classList.remove('hidden');
      alertUser(msg);
      analyzeStatus.textContent = '';
    } else {
      analyzeStatus.textContent = `Found ${panels.length} panels. Ask a question below.`;
      announce(analyzeStatus.textContent);
    }
    questionInput.focus();
  } catch (err) {
    console.error(err);
    alertUser('Could not analyze the page — check that the backend server is running.');
    analyzeStatus.textContent = 'Analysis failed.';
  } finally {
    analyzeBtn.disabled = false;
  }
});

async function playAnswer(text) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'narrator', emotion: 'neutral' }),
    });
    if (!res.ok) throw new Error(`tts failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    currentSource = source;
  } catch (err) {
    console.error('Could not play spoken answer:', err);
  }
}

function addToConversation(question, answer) {
  const li = document.createElement('li');
  const q = document.createElement('p');
  q.className = 'question';
  q.textContent = question;
  const a = document.createElement('p');
  a.className = 'answer';
  a.textContent = answer;
  li.append(q, a);
  conversation.appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
}

askForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  askBtn.disabled = true;
  askMockWarning.classList.add('hidden');
  announce('Thinking…');

  try {
    const res = await fetch(`${BACKEND_URL}/api/comic/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels, question }),
    });
    if (!res.ok) throw new Error(`ask failed: ${res.status}`);
    const data = await res.json();

    addToConversation(question, data.answer);
    questionInput.value = '';
    announce('Answer ready.');
    playAnswer(data.answer);

    if (data.usedMock) {
      const msg = `The real Q&A provider failed, so that was a placeholder answer. Reason: ${data.mockReason || 'unknown error'}.`;
      askMockWarning.textContent = msg;
      askMockWarning.classList.remove('hidden');
    }
  } catch (err) {
    console.error(err);
    alertUser('Could not get an answer — check that the backend server is running.');
  } finally {
    askBtn.disabled = false;
    questionInput.focus();
  }
});

restartBtn.addEventListener('click', () => {
  window.location.reload();
});

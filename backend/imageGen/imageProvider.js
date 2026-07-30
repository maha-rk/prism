// Swappable image-generation interface for Creative Content Translator.
// Non-IBM by necessity — watsonx has no image-generation model at all
// (confirmed across every region on this account, not a Lite-plan gap).
// Google's Gemini image model was tried first but needs billing enabled
// despite its free text tier; Hugging Face's "hf-inference" provider
// (Stable Diffusion 3 Medium) is the one confirmed genuinely free, no card
// required. Defaults to a mock (a small solid-color placeholder PNG,
// generated locally) so the pipeline works with zero credentials.

const zlib = require('zlib');

/** A minimal solid-color PNG, built by hand (no canvas dependency) — same
 * technique used for this project's own test fixtures. Different colors
 * per call so a mock "gallery" of several mock panels is at least visually
 * distinguishable in the UI, rather than one repeated identical square. */
function buildSolidColorPng(r, g, b, size = 512) {
  // Simple CRC32 implementation (Node has no built-in crc32 export).
  const crcTable = (() => {
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function pngChunk(type, data) {
    const typeBuf = Buffer.from(type);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type: RGB
  const ihdr = pngChunk('IHDR', ihdrData);

  const rowBytes = size * 3;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = pngChunk('IDAT', zlib.deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const MOCK_COLORS = [
  [180, 140, 90],
  [90, 130, 160],
  [150, 90, 120],
  [110, 150, 100],
  [170, 110, 70],
];
let mockColorIndex = 0;

function mockGenerateImage() {
  const [r, g, b] = MOCK_COLORS[mockColorIndex % MOCK_COLORS.length];
  mockColorIndex += 1;
  const png = buildSolidColorPng(r, g, b, 256);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const HF_MODEL = 'stabilityai/stable-diffusion-3-medium-diffusers';

async function huggingfaceGenerateImage(prompt) {
  const { HF_API_KEY } = process.env;
  if (!HF_API_KEY) {
    throw new Error('Hugging Face not configured: set HF_API_KEY');
  }

  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${HF_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!res.ok) {
    throw new Error(`Hugging Face request failed: ${res.status} ${await res.text()}`);
  }
  // Response is raw image bytes directly, not JSON-wrapped.
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function generateImage(prompt) {
  const provider = process.env.IMAGE_PROVIDER || 'mock';
  if (provider === 'huggingface') {
    return huggingfaceGenerateImage(prompt);
  }
  return mockGenerateImage(prompt);
}

module.exports = { generateImage, mockGenerateImage };

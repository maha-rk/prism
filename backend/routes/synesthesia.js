const express = require('express');
const { moodFromImage, moodFromText, mockMood } = require('../synesthesia/moodProvider');

const router = express.Router();

router.post('/mood-from-image', async (req, res) => {
  const { imageBase64 } = req.body || {};
  if (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image')) {
    return res.status(400).json({ error: 'imageBase64 must be a data URL string' });
  }
  try {
    const mood = await moodFromImage(imageBase64);
    res.json({ mood, usedMock: false });
  } catch (err) {
    console.error('[/synesthesia/mood-from-image] provider failed, falling back to mock:', err.message);
    res.json({ mood: mockMood(), usedMock: true, mockReason: err.message });
  }
});

router.post('/mood-from-text', async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const mood = await moodFromText(text);
    res.json({ mood, usedMock: false });
  } catch (err) {
    console.error('[/synesthesia/mood-from-text] provider failed, falling back to mock:', err.message);
    res.json({ mood: mockMood(), usedMock: true, mockReason: err.message });
  }
});

module.exports = router;

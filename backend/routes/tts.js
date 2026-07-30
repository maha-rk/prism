const express = require('express');
const { synthesize } = require('../tts/ttsProvider');

const router = express.Router();

router.post('/', async (req, res) => {
  const { text, voice, emotion, build } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const audio = await synthesize(text, voice || 'narrator', emotion || 'neutral', build || 'average');
    res.set('Content-Type', 'audio/wav');
    res.send(audio);
  } catch (err) {
    console.error('[/tts] synthesis failed:', err.message);
    res.status(500).json({ error: 'synthesis failed' });
  }
});

module.exports = router;

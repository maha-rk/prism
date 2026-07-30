const express = require('express');
const { reconstructNarrative } = require('../narration/reconstructProvider');
const { buildScript } = require('../narration/buildScript');

const router = express.Router();

router.post('/', async (req, res) => {
  const { panels } = req.body || {};
  if (!Array.isArray(panels) || panels.length === 0) {
    return res.status(400).json({ error: 'panels must be a non-empty array' });
  }

  try {
    const reconstructed = await reconstructNarrative(panels);
    res.json({ ...buildScript(reconstructed), usedFallback: false });
  } catch (err) {
    console.error('[/comic/narrate] narrative reconstruction failed, using panel data as-is:', err.message);
    res.json({ ...buildScript(panels), usedFallback: true, fallbackReason: err.message });
  }
});

module.exports = router;

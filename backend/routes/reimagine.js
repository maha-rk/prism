const express = require('express');
const { buildStoryBible } = require('../emotionLens/storyBible');
const { buildCharacterSheet } = require('../imageGen/characterSheet');
const { generateImage } = require('../imageGen/imageProvider');
const { STYLE_PRESETS } = require('../imageGen/stylePresets');

const router = express.Router();

function buildPanelPrompt(panel, characterSheet, styleSuffix) {
  const speakers = [...new Set((panel.dialogue || []).map((d) => d.speaker))];
  const characterDescriptions = speakers
    .filter((name) => characterSheet[name])
    .map((name) => `${name}: ${characterSheet[name]}`)
    .join('. ');

  const parts = [panel.description || 'A comic panel scene.'];
  if (characterDescriptions) parts.push(`Characters — ${characterDescriptions}.`);
  parts.push(styleSuffix);
  return parts.join(' ');
}

router.post('/', async (req, res) => {
  const { panels, style } = req.body || {};
  if (!Array.isArray(panels) || panels.length === 0) {
    return res.status(400).json({ error: 'panels must be a non-empty array' });
  }
  const styleSuffix = STYLE_PRESETS[style] || STYLE_PRESETS.watercolor;

  const ordered = [...panels].sort((a, b) => a.suggestedOrder - b.suggestedOrder);
  const storyBible = buildStoryBible(ordered);
  const characterSheet = await buildCharacterSheet(storyBible, ordered);

  const { mockGenerateImage } = require('../imageGen/imageProvider');
  const realProviderConfigured = (process.env.IMAGE_PROVIDER || 'mock') === 'huggingface';

  const images = [];
  let usedMockCount = 0;
  for (const panel of ordered) {
    const prompt = buildPanelPrompt(panel, characterSheet, styleSuffix);
    try {
      const imageDataUrl = await generateImage(prompt);
      images.push({ panelId: panel.id, imageDataUrl, usedMock: !realProviderConfigured });
      if (!realProviderConfigured) usedMockCount += 1;
    } catch (err) {
      console.error(`[/comic/reimagine] image generation failed for panel ${panel.id}, using mock:`, err.message);
      images.push({ panelId: panel.id, imageDataUrl: mockGenerateImage(), usedMock: true, mockReason: err.message });
      usedMockCount += 1;
    }
  }

  res.json({ images, characterSheet, usedMock: usedMockCount > 0, mockCount: usedMockCount });
});

module.exports = router;

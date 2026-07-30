const express = require('express');
const { buildStoryBible } = require('../emotionLens/storyBible');
const { answerQuestion, mockAnswer } = require('../emotionLens/qaProvider');

const router = express.Router();

router.post('/', async (req, res) => {
  const { panels, question } = req.body || {};
  if (!Array.isArray(panels) || panels.length === 0) {
    return res.status(400).json({ error: 'panels must be a non-empty array' });
  }
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const storyBible = buildStoryBible(panels);

  try {
    const { answer, citationWarning } = await answerQuestion(storyBible, question);
    res.json({ answer, usedMock: false, citationWarning });
  } catch (err) {
    console.error('[/comic/ask] Q&A provider failed, falling back to mock:', err.message);
    res.json({ answer: mockAnswer(storyBible, question), usedMock: true, mockReason: err.message, citationWarning: false });
  }
});

module.exports = router;

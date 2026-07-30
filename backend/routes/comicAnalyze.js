const express = require('express');
const { retrieveGuidelines } = require('../rag/retrieve');
const { analyzeComicPage, mockAnalyzeComicPage } = require('../vision/visionProvider');
const { SFX_VOCABULARY } = require('../sfx/sfxVocabulary');
const { computeAccessibilityReport } = require('../accessibility/contrastChecker');
const { REAL_PROVIDERS } = require('../shared/cascade');

const router = express.Router();

function buildPrompt() {
  const guidelines = retrieveGuidelines()
    .map((g) => `- ${g}`)
    .join('\n');

  return `You are trained in professional audio-description methodology for sequential art
(comics/manga), helping build an audio story experience for a blind or low-vision reader.
Follow these principles:
${guidelines}

Given the attached comic page image:
1. Detect each panel and its bounding box as fractions of the page (x, y, w, h each in [0,1], origin top-left).
2. Suggest a reading order (1-indexed) based on standard left-to-right, top-to-bottom comic layout conventions.
3. For each panel, describe the essential visual content in 1-2 objective sentences (facts before interpretation, action before appearance).
4. Transcribe any caption text verbatim.
5. Transcribe any dialogue, attributing each line to whichever character is visually shown
   speaking it (the speech bubble's tail/pointer indicates who is talking) — identify the
   speaker by their actual established name if known, or a short visual description
   ("the man in the blue suit") if not yet named. IMPORTANT: casual address terms used INSIDE
   a line of dialogue ("pal", "buddy", "man", "sir") are the speaker talking TO someone else —
   never mistake a word like that for the name of who is speaking. When a panel has more than
   one line of dialogue, check each speech bubble's own pointer individually — do not assume
   the same speaker for every line in that panel. If any character's real name is spoken aloud
   anywhere on the page (their own introduction, or another character addressing them by name),
   use that actual name for them in every panel from then on — including panels before the name
   was revealed, if you can now tell it's the same character — instead of a generic visual
   description once a real name is available. Also tag each line with:
   - a one-word emotion tag
   - the speaker's apparent gender ("male", "female", or "unknown" if the art doesn't make it
     clear)
   - the speaker's apparent build ("large" for tall/heavy-set/muscular figures, "small" for
     short/slight/child-like figures, or "average" if unclear or unremarkable) based on their
     visual appearance in the panel
   These are used to pick a voice actor and pitch it appropriately, not to make claims about the
   character — hedge to "unknown"/"average" rather than guess.
6. Tag the panel's overall mood in one word.
7. Tag 0-2 sound cues per panel using ONLY these exact tags: ${SFX_VOCABULARY.join(', ')}. Comic
   sound-effect lettering drawn in the art (e.g. "POW", "BANG", "CRASH", "BOOM") is a direct cue
   to tag the matching effect — never leave sfx empty just because the only sound information is
   lettered directly on the page rather than narrated.

Do not show your reasoning, do not narrate the steps above, and do not include any text
before or after the JSON. Respond with ONLY this JSON object, nothing else:
{"panels": [{"id": "p1", "bbox": {"x":0,"y":0,"w":0,"h":0}, "suggestedOrder": 1, "description": "...", "caption": "", "dialogue": [{"speaker":"...", "text":"...", "emotion":"...", "gender":"...", "build":"..."}], "mood": "...", "sfx": ["..."]}]}`;
}

router.post('/', async (req, res) => {
  const { imageBase64 } = req.body || {};
  if (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image')) {
    return res.status(400).json({ error: 'imageBase64 must be a data URL string' });
  }

  try {
    const result = await analyzeComicPage(imageBase64, buildPrompt());
    // Accessibility report only computed when a real vision provider was
    // actually configured and used — NOT just "no error was thrown."
    // VISION_PROVIDER unset/mock returns the fixed mock story via a plain
    // return, not a throw, so relying on try/catch alone would still
    // compute real pixel math against the mock's generic, fictional
    // bounding boxes — real math applied to meaningless regions, which is
    // worse than not showing a report at all.
    const usedRealProvider = REAL_PROVIDERS.includes(process.env.VISION_PROVIDER || 'mock');
    let accessibility = null;
    if (usedRealProvider) {
      try {
        accessibility = await computeAccessibilityReport(imageBase64, result.panels);
      } catch (accessErr) {
        console.error('[/comic/analyze] accessibility report failed (non-fatal):', accessErr.message);
      }
    }
    res.json({ ...result, usedMock: false, accessibility });
  } catch (err) {
    console.error('[/comic/analyze] vision provider failed, falling back to mock:', err.message);
    // usedMock/mockReason surfaced to the frontend so a real failure never
    // silently looks like a real (but wrong) analysis of the uploaded page.
    res.json({ ...mockAnalyzeComicPage(), usedMock: true, mockReason: err.message, accessibility: null });
  }
});

module.exports = router;

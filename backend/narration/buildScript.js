// Deterministic assembly shared by both the mock and real narrative-
// reconstruction paths: voice-slot assignment (first-seen speaker -> next
// free slot matching their tagged gender, round-robin within that gender's
// pool after it's exhausted — per the Phase C scope decision against
// cross-chapter re-identification, this is gender-matching only, not any
// stronger identity claim), simple rule-based stereo panning from each
// panel's horizontal position on the page, and line sequencing (caption,
// then scene narration, then dialogue in order).
const { VOICE_TABLE } = require('../tts/ttsProvider');

const MALE_VOICES = ['voice-2', 'voice-3'];
const FEMALE_VOICES = ['voice-1', 'voice-4'];
const ALL_VOICES = ['voice-1', 'voice-2', 'voice-3', 'voice-4'];

function panFromBbox(bbox) {
  const centerX = bbox.x + bbox.w / 2; // 0 (left edge) .. 1 (right edge)
  return Math.max(-1, Math.min(1, centerX * 2 - 1));
}

// `counts` tracks how many speakers have drawn from each pool so far, so a
// 3rd same-gender character reuses the pool round-robin rather than bleeding
// into the other gender's voices.
function pickVoiceForGender(gender, counts) {
  if (gender === 'male') {
    const slot = MALE_VOICES[counts.male % MALE_VOICES.length];
    counts.male += 1;
    return slot;
  }
  if (gender === 'female') {
    const slot = FEMALE_VOICES[counts.female % FEMALE_VOICES.length];
    counts.female += 1;
    return slot;
  }
  // Gender unknown/unclear from the art — cycle through all 4 rather than
  // guess, same "hedge honestly" principle used elsewhere in this project.
  const slot = ALL_VOICES[counts.unknown % ALL_VOICES.length];
  counts.unknown += 1;
  return slot;
}

function buildScript(panels) {
  const speakerVoiceMap = {};
  const speakerBuildMap = {}; // first-seen build per speaker, so it stays consistent across lines
  const counts = { male: 0, female: 0, unknown: 0 };

  const script = panels.map((panel) => {
    const lines = [];
    if (panel.caption) {
      lines.push({ type: 'caption', voice: 'narrator', text: panel.caption, emotion: 'neutral' });
    }
    if (panel.description) {
      lines.push({ type: 'narration', voice: 'narrator', text: panel.description, emotion: panel.mood || 'neutral' });
    }
    for (const line of panel.dialogue || []) {
      if (!speakerVoiceMap[line.speaker]) {
        speakerVoiceMap[line.speaker] = pickVoiceForGender(line.gender || 'unknown', counts);
        speakerBuildMap[line.speaker] = line.build || 'average';
      }
      lines.push({
        type: 'dialogue',
        voice: speakerVoiceMap[line.speaker],
        speaker: line.speaker,
        text: line.text,
        emotion: line.emotion || 'neutral',
        build: speakerBuildMap[line.speaker],
      });
    }
    return {
      panelId: panel.id,
      pan: Number(panFromBbox(panel.bbox).toFixed(2)),
      lines,
      sfx: panel.sfx || [],
    };
  });

  const voiceMap = { narrator: { name: 'Narrator', watsonVoice: VOICE_TABLE.narrator } };
  for (const [speaker, slot] of Object.entries(speakerVoiceMap)) {
    voiceMap[slot] = { name: speaker, watsonVoice: VOICE_TABLE[slot], build: speakerBuildMap[speaker] };
  }

  return { script, voiceMap };
}

module.exports = { buildScript };

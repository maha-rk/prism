// Chord/scale math. Adapted from gesture-synth (github.com/ericwei97-cloud/gesture-synth,
// Eric Wei) — see README for attribution. No DOM/audio dependencies; pure functions.

// Semitone offset of each scale degree from the tonic, in a major scale.
const DEGREE_SEMITONES = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: -1 };

const NUMERAL_TO_DEGREE = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };

const MAJOR_SCALE = {
  A: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  Bb: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  B: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
  C: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  Db: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  D: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  Eb: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  E: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  F: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  Gb: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
  G: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  Ab: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
};

export function getDegreeFreq(tonicFreq, degree) {
  const semitones = DEGREE_SEMITONES[degree];
  let tonic = tonicFreq;
  // Drop these keys one octave — keeps the whole range in a comfortable register.
  if (tonic === 369.99 || tonic === 392.0 || tonic === 415.3) {
    tonic /= 2;
  }
  return tonic * Math.pow(2, semitones / 12);
}

export function getChordName(roman, isMajorMode, keyName) {
  if (!roman || roman === '--') return '';
  const degree = NUMERAL_TO_DEGREE[roman.toUpperCase()];
  if (!degree) return '';
  const root = MAJOR_SCALE[keyName][degree - 1];
  return isMajorMode ? root : `${root}m`;
}

const QUALITY_LABELS = {
  major: { 1: 'Major', 2: 'Major, 1st inversion', 3: 'Major 7th', 4: 'Dominant 7th' },
  minor: { 1: 'Minor', 2: 'Minor, 1st inversion', 3: 'Minor 7th', 4: 'Diminished 7th' },
};

export function getQualityLabel(isMajorMode, qualityIndex) {
  return QUALITY_LABELS[isMajorMode ? 'major' : 'minor'][qualityIndex] || null;
}

/** Raw interval frequencies relative to a chord's root, for the given roman-numeral degree. */
export function getChordTones(numeralStr, isMajorMode, tonicFreq) {
  if (!numeralStr || numeralStr === '--') return null;
  const degree = NUMERAL_TO_DEGREE[numeralStr.toUpperCase()];
  if (!degree) return null;

  const root = getDegreeFreq(tonicFreq, degree);
  const thirdSemitones = isMajorMode ? 4 : 3;
  const fifthSemitones = 7;
  const maj7Semitones = 11;
  const dom7Semitones = 10;
  const dim7Semitones = 9;
  const dim5Semitones = 6;

  const third = root * Math.pow(2, thirdSemitones / 12);
  const fifth = root * Math.pow(2, fifthSemitones / 12);

  return {
    root,
    third,
    fifth,
    octaveRoot: root * 2,
    octaveThird: third * 2,
    maj7Tone: root * Math.pow(2, maj7Semitones / 12),
    dom7Tone: root * Math.pow(2, dom7Semitones / 12),
    dim7Tone: root * Math.pow(2, dim7Semitones / 12),
    dim5Tone: root * Math.pow(2, dim5Semitones / 12),
  };
}

/** Which four tones actually sound, given the right hand's finger-count (1-4) and mode. */
export function getSolidNotes(tones, rightHandCount, isMajorMode) {
  if (!tones) return [];
  const { root, third, fifth, octaveRoot, octaveThird, maj7Tone, dom7Tone, dim7Tone, dim5Tone } = tones;

  if (isMajorMode) {
    switch (rightHandCount) {
      case 1: return [root, fifth, octaveRoot, octaveThird];
      case 2: return [third, fifth, octaveRoot, octaveThird];
      case 3: return [root, third, fifth, maj7Tone];
      case 4: return [root, third, fifth, dom7Tone];
      default: return [root, fifth, octaveRoot, octaveThird];
    }
  }
  switch (rightHandCount) {
    case 1: return [root, fifth, octaveRoot, octaveThird];
    case 2: return [third, fifth, octaveRoot, octaveThird];
    case 3: return [root, third, fifth, dom7Tone];
    case 4: return [root, third, dim5Tone, dim7Tone];
    default: return [root, fifth, octaveRoot, octaveThird];
  }
}

export { MAJOR_SCALE };

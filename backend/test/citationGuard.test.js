const { verifyCitations } = require('../emotionLens/citationGuard');

const storyBible = [
  'STORY IN READING ORDER:',
  'Panel 1 — Scene: A rain-soaked rooftop at dusk. — Mood: tense — Reyes says: "Stay low. They\'re still scanning the block." (afraid)',
  '',
  'CHARACTERS:',
  'Reyes appears in 1 line(s) — panel 1, feeling afraid: "Stay low. They\'re still scanning the block."',
].join('\n');

describe('verifyCitations', () => {
  it('verifies an answer that quotes real dialogue verbatim', () => {
    const result = verifyCitations('Reyes says "Stay low. They\'re still scanning the block."', storyBible);
    expect(result.verified).toBe(true);
    expect(result.unverifiedQuotes).toEqual([]);
  });

  it('flags a fabricated quote that never appears in the story bible', () => {
    const result = verifyCitations('Reyes says "I will never give up, no matter what."', storyBible);
    expect(result.verified).toBe(false);
    expect(result.unverifiedQuotes).toEqual(['I will never give up, no matter what.']);
  });

  it('passes an answer that paraphrases without quoting at all', () => {
    const result = verifyCitations('Reyes is telling someone to stay quiet because searchers are nearby.', storyBible);
    expect(result.verified).toBe(true);
  });

  it('is tolerant of case and punctuation differences in a real quote', () => {
    const result = verifyCitations('He says: "stay low, theyre still scanning the block"', storyBible);
    expect(result.verified).toBe(true);
  });

  it('flags only the fabricated quote when one of several quotes is real', () => {
    const answer = 'Reyes says "Stay low. They\'re still scanning the block." and then adds "we should retreat now."';
    const result = verifyCitations(answer, storyBible);
    expect(result.verified).toBe(false);
    expect(result.unverifiedQuotes).toEqual(['we should retreat now.']);
  });

  it('ignores quoted spans shorter than the minimum length (avoids noise from short asides)', () => {
    const result = verifyCitations('He said "no".', storyBible);
    expect(result.verified).toBe(true);
  });
});

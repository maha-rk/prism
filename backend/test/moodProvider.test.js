const { clamp01, validateMood, mockMood, extractJson } = require('../synesthesia/moodProvider');

describe('clamp01', () => {
  it('passes through an in-range number unchanged', () => {
    expect(clamp01(0.4, 0.5)).toBe(0.4);
  });

  it('clamps values above 1 down to 1', () => {
    expect(clamp01(5, 0.5)).toBe(1);
  });

  it('clamps values below 0 up to 0', () => {
    expect(clamp01(-3, 0.5)).toBe(0);
  });

  it('falls back for NaN or non-numeric input', () => {
    expect(clamp01(NaN, 0.5)).toBe(0.5);
    expect(clamp01('not a number', 0.5)).toBe(0.5);
    expect(clamp01(undefined, 0.5)).toBe(0.5);
  });
});

describe('validateMood', () => {
  it('fills in every field with a sensible default when given an empty object', () => {
    const result = validateMood({});
    expect(result).toEqual({
      mood: 'neutral',
      brightness: 0.5,
      energy: 0.5,
      warmth: 0.5,
      valence: 0.5,
      description: '',
    });
  });

  it('preserves valid provided values', () => {
    const result = validateMood({ mood: 'somber', brightness: 0.1, energy: 0.2, warmth: 0.3, valence: 0.9, description: 'A quiet dusk.' });
    expect(result).toEqual({ mood: 'somber', brightness: 0.1, energy: 0.2, warmth: 0.3, valence: 0.9, description: 'A quiet dusk.' });
  });

  it('discards a non-string description rather than throwing', () => {
    const result = validateMood({ description: 42 });
    expect(result.description).toBe('');
  });
});

describe('extractJson', () => {
  it('parses a fenced JSON mood response', () => {
    expect(extractJson('```json\n{"mood": "calm"}\n```')).toEqual({ mood: 'calm' });
  });

  it('throws when there is no JSON present', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('mockMood', () => {
  it('returns a fixed, fully-populated mood profile with no API calls', () => {
    const result = mockMood();
    expect(result.mood).toBe('calm');
    expect(result.description.length).toBeGreaterThan(0);
  });
});

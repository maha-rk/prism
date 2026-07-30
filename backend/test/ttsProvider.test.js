const { wrapSsml, insertDashBreaks, localRateFor, LOCAL_VOICE_TABLE, VOICE_TABLE } = require('../tts/ttsProvider');

describe('insertDashBreaks', () => {
  it('converts comic-lettering double dashes into an SSML break', () => {
    expect(insertDashBreaks('What the--Grace&apos;s handkerchief')).toContain('<break time="300ms"/>');
  });

  it('leaves text with no dashes unchanged', () => {
    expect(insertDashBreaks('Hello there.')).toBe('Hello there.');
  });
});

describe('wrapSsml', () => {
  it('applies emotion prosody and wraps in <speak>', () => {
    const ssml = wrapSsml('Hello', 'afraid', 'average');
    expect(ssml).toMatch(/^<speak>/);
    expect(ssml).toContain('<prosody');
    expect(ssml).toContain('rate="-20%"');
  });

  it('is case-insensitive on emotion lookup (defensive lowercase at the choke point)', () => {
    const lower = wrapSsml('Hello', 'afraid', 'average');
    const upper = wrapSsml('Hello', 'Afraid', 'average');
    expect(upper).toBe(lower);
  });

  it('applies no prosody wrapper for an unrecognized emotion', () => {
    const ssml = wrapSsml('Hello', 'not_a_real_emotion', 'average');
    expect(ssml).toBe('<speak>Hello</speak>');
  });

  it('escapes XML special characters before wrapping', () => {
    const ssml = wrapSsml('Tom & Jerry <fight>', 'neutral', 'average');
    expect(ssml).toContain('&amp;');
    expect(ssml).toContain('&lt;fight&gt;');
  });

  it('stacks build-based pitch under emotion prosody for a large build', () => {
    const ssml = wrapSsml('Hello', 'neutral', 'large');
    expect(ssml).toContain('pitch="-12%"');
  });
});

describe('localRateFor', () => {
  it('returns the base rate for a neutral or unrecognized emotion', () => {
    expect(localRateFor('neutral')).toBe(180);
    expect(localRateFor('not_a_real_emotion')).toBe(180);
  });

  it('speeds up for an urgent emotion, matching PROSODY_BY_EMOTION\'s +30%', () => {
    expect(localRateFor('urgent')).toBe(234);
  });

  it('slows down for a sad emotion, matching PROSODY_BY_EMOTION\'s -25%', () => {
    expect(localRateFor('sad')).toBe(135);
  });

  it('is case-insensitive', () => {
    expect(localRateFor('URGENT')).toBe(localRateFor('urgent'));
  });
});

describe('voice tables', () => {
  it('define the same five slots for both the Watson and local voice tables', () => {
    expect(Object.keys(LOCAL_VOICE_TABLE).sort()).toEqual(Object.keys(VOICE_TABLE).sort());
  });
});

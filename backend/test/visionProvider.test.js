const { extractJson, validateShape, parseMarkdownFallback, normalizeSfx, mockAnalyzeComicPage } = require('../vision/visionProvider');

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"panels": []}')).toEqual({ panels: [] });
  });

  it('strips a markdown code fence before parsing', () => {
    expect(extractJson('```json\n{"panels": []}\n```')).toEqual({ panels: [] });
  });

  it('throws when there is no JSON object in the text at all', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow();
  });
});

describe('validateShape', () => {
  function basePanel(overrides = {}) {
    return { bbox: { x: 0, y: 0, w: 1, h: 1 }, ...overrides };
  }

  it('rejects a response with no panels array', () => {
    expect(() => validateShape({})).toThrow();
    expect(() => validateShape({ panels: [] })).toThrow();
  });

  it('fills in missing id, suggestedOrder, description, and caption', () => {
    const result = validateShape({ panels: [basePanel()] });
    expect(result.panels[0].id).toBe('p1');
    expect(result.panels[0].suggestedOrder).toBe(1);
    expect(result.panels[0].description).toBe('');
    expect(result.panels[0].caption).toBe('');
  });

  it('throws when a panel bbox is missing numeric fields', () => {
    expect(() => validateShape({ panels: [{ bbox: { x: 0, y: 0 } }] })).toThrow(/bbox/);
  });

  it('lowercases mood and dialogue emotion regardless of source casing', () => {
    const result = validateShape({
      panels: [basePanel({ mood: 'Tense', dialogue: [{ text: 'hi', emotion: 'Afraid', gender: 'Male', build: 'Large' }] })],
    });
    expect(result.panels[0].mood).toBe('tense');
    expect(result.panels[0].dialogue[0].emotion).toBe('afraid');
  });

  it('normalizes an invalid gender/build to unknown/average instead of throwing', () => {
    const result = validateShape({
      panels: [basePanel({ dialogue: [{ text: 'hi', gender: 'inanimate', build: 'gigantic' }] })],
    });
    expect(result.panels[0].dialogue[0].gender).toBe('unknown');
    expect(result.panels[0].dialogue[0].build).toBe('average');
  });

  it('filters sfx tags down to the recognized vocabulary', () => {
    const result = validateShape({ panels: [basePanel({ sfx: ['rain', 'not_a_real_sfx_tag'] })] });
    expect(result.panels[0].sfx).toEqual(['rain']);
  });
});

describe('normalizeSfx', () => {
  it('maps known synonyms to their canonical tag', () => {
    expect(normalizeSfx('bang, boom')).toEqual(['gunshot', 'explosion']);
  });

  it('treats "none" as no sound effects', () => {
    expect(normalizeSfx('none')).toEqual([]);
  });

  it('drops unrecognized words rather than passing them through', () => {
    expect(normalizeSfx('a mysterious hum')).toEqual([]);
  });
});

describe('parseMarkdownFallback', () => {
  it('salvages panel data from the observed markdown-bullet-outline failure format', () => {
    const text = [
      '**Panel 1:**',
      '* Bounding Box: (0.0, 0.0, 0.5, 0.5)',
      '* Caption: "The night the signal went dark."',
      '* Description: A rooftop at dusk.',
      '* Mood: tense',
      '* Sound Effects: rain, wind',
      '* Dialogue:',
      '  + Speaker: Reyes',
      '  + Text: "Stay low."',
      '  + Emotion: afraid',
      '  + Gender: male',
      '  + Build: average',
    ].join('\n');

    const result = parseMarkdownFallback(text);
    expect(result.panels).toHaveLength(1);
    const panel = result.panels[0];
    expect(panel.caption).toBe('The night the signal went dark.');
    expect(panel.mood).toBe('tense');
    expect(panel.sfx).toEqual(['rain', 'wind']);
    expect(panel.dialogue[0]).toMatchObject({ speaker: 'Reyes', text: 'Stay low.', emotion: 'afraid' });
  });

  it('returns null when the text has no panel blocks to salvage', () => {
    expect(parseMarkdownFallback('I cannot help with that.')).toBeNull();
  });
});

describe('mockAnalyzeComicPage', () => {
  it('returns a fixed, non-empty 4-panel demo story', () => {
    const result = mockAnalyzeComicPage();
    expect(result.panels).toHaveLength(4);
    expect(result.panels.every((p) => typeof p.description === 'string' && p.description.length > 0)).toBe(true);
  });
});

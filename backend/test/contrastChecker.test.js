const { structuralIssues, contrastRatioFromSamples, relativeLuminance, computeAccessibilityReport } = require('../accessibility/contrastChecker');
const { Jimp } = require('jimp');

async function makeHalfBlackHalfWhiteImageBase64() {
  const img = new Jimp({ width: 100, height: 100, color: 0xffffffff });
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 50; x++) img.setPixelColor(0x000000ff, x, y);
  }
  const buf = await img.getBuffer('image/png');
  return `data:image/png;base64,${buf.toString('base64')}`;
}

describe('computeAccessibilityReport (full orchestration, real jimp decode)', () => {
  it('detects high contrast in the black half and low contrast in the uniform white half', async () => {
    const imageBase64 = await makeHalfBlackHalfWhiteImageBase64();
    const panels = [
      // Spans the black/white boundary at x=50 (pixels 25-75).
      { id: 'spans-boundary', bbox: { x: 0.25, y: 0, w: 0.5, h: 1 }, description: 'spans', suggestedOrder: 1, dialogue: [] },
      // Entirely within the uniform white region (pixels 50-100).
      { id: 'all-white', bbox: { x: 0.5, y: 0, w: 0.5, h: 1 }, description: 'right', suggestedOrder: 2, dialogue: [] },
    ];

    const report = await computeAccessibilityReport(imageBase64, panels);

    const spansBoundary = report.panelContrast.find((p) => p.id === 'spans-boundary');
    const allWhite = report.panelContrast.find((p) => p.id === 'all-white');
    expect(spansBoundary.contrastRatio).toBeGreaterThan(10);
    expect(spansBoundary.lowContrast).toBe(false);
    // Uniformly white -> no real contrast at all.
    expect(allWhite.contrastRatio).toBe(1);
    expect(allWhite.lowContrast).toBe(true);
    expect(report.structuralIssues).toEqual([]);
    expect(report.methodologyNote).toContain('not an exact check of the comic\'s lettering specifically');
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for pure black', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
  });

  it('returns close to 1 for pure white', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
  });

  it('weights green highest, matching the WCAG relative-luminance formula', () => {
    const green = relativeLuminance(0, 255, 0);
    const red = relativeLuminance(255, 0, 0);
    const blue = relativeLuminance(0, 0, 255);
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe('contrastRatioFromSamples', () => {
  it('returns null for an empty sample set', () => {
    expect(contrastRatioFromSamples([])).toBeNull();
  });

  it('returns 1 (no contrast) when every sample is identical', () => {
    expect(contrastRatioFromSamples([0.5, 0.5, 0.5, 0.5])).toBeCloseTo(1, 5);
  });

  it('returns the maximum WCAG ratio (21) for pure black vs. pure white samples', () => {
    const samples = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    expect(contrastRatioFromSamples(samples)).toBeCloseTo(21, 1);
  });

  it('is not thrown off by a single outlier pixel at realistic sample sizes (uses a tail average, not raw min/max)', () => {
    // At the real sampling scale (up to ~2500 points/panel), a single
    // antialiased outlier pixel lands in a tail of dozens of samples and
    // gets averaged out — this uses 99 mid-gray samples + 1 near-black
    // outlier (tail size 10 at the real 10% rate) to demonstrate that at
    // a realistic scale, not a tiny synthetic array where the tail could
    // shrink to size 1 and capture the outlier alone.
    const samples = [...Array(99).fill(0.5), 0.02];
    const ratio = contrastRatioFromSamples(samples);
    expect(ratio).toBeLessThan(3);
  });
});

describe('structuralIssues', () => {
  function panel(overrides = {}) {
    return { id: 'p1', description: 'A scene.', suggestedOrder: 1, dialogue: [], ...overrides };
  }

  it('reports no issues for well-formed panels', () => {
    const panels = [panel({ id: 'p1', suggestedOrder: 1 }), panel({ id: 'p2', suggestedOrder: 2 })];
    expect(structuralIssues(panels)).toEqual([]);
  });

  it('flags a duplicate reading-order value', () => {
    const panels = [panel({ id: 'p1', suggestedOrder: 1 }), panel({ id: 'p2', suggestedOrder: 1 })];
    expect(structuralIssues(panels).some((i) => i.includes('Reading order'))).toBe(true);
  });

  it('flags a gap in reading order', () => {
    const panels = [panel({ id: 'p1', suggestedOrder: 1 }), panel({ id: 'p2', suggestedOrder: 3 })];
    expect(structuralIssues(panels).some((i) => i.includes('Reading order'))).toBe(true);
  });

  it('flags a panel with an empty description', () => {
    const panels = [panel({ id: 'p1', description: '' })];
    expect(structuralIssues(panels).some((i) => i.includes('no scene description'))).toBe(true);
  });

  it('flags a dialogue line with no attributed speaker', () => {
    const panels = [panel({ id: 'p1', dialogue: [{ speaker: '', text: 'Hello?' }] })];
    expect(structuralIssues(panels).some((i) => i.includes('no attributed speaker'))).toBe(true);
  });

  it('does not flag a dialogue line that does have a speaker', () => {
    const panels = [panel({ id: 'p1', dialogue: [{ speaker: 'Reyes', text: 'Hello?' }] })];
    expect(structuralIssues(panels)).toEqual([]);
  });
});

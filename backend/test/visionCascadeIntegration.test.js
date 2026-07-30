// Integration test for the real 3-tier fallback chain through an actual
// provider file — cascade.test.js already covers cascade()/orderedCascadeSteps()
// as pure logic, but nothing exercised a real provider module falling
// through watsonx -> gemini -> local end-to-end. Uses the providers' own
// "not configured" guards for watsonx/gemini (real code path, no network
// call needed when credentials are absent) and patches only shared/
// localClient's exported callLocalVision function directly — see
// citationGuardIntegration.test.js for why a direct patch is used instead
// of vi.mock in this CommonJS codebase.
const path = require('path');
const fs = require('fs');
const localClient = require('../shared/localClient');

const ANALYZE_CACHE_DIR = path.join(__dirname, '..', 'vision', '.analyzeCache');

function clearAnalyzeCache() {
  if (!fs.existsSync(ANALYZE_CACHE_DIR)) return;
  for (const f of fs.readdirSync(ANALYZE_CACHE_DIR)) fs.unlinkSync(path.join(ANALYZE_CACHE_DIR, f));
}

const validPanelsJson = JSON.stringify({
  panels: [
    { id: 'p1', bbox: { x: 0, y: 0, w: 1, h: 1 }, suggestedOrder: 1, description: 'from local', caption: '', dialogue: [], mood: 'neutral', sfx: [] },
  ],
});

describe('analyzeComicPage 3-tier cascade integration', () => {
  const originalEnv = { ...process.env };
  const originalCallLocalVision = localClient.callLocalVision;

  beforeEach(() => {
    process.env.VISION_PROVIDER = 'watsonx';
    delete process.env.WATSONX_URL;
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    localClient.callLocalVision = originalCallLocalVision;
    clearAnalyzeCache();
  });

  it('falls through unconfigured watsonx and unconfigured gemini all the way to a working local provider', async () => {
    let callCount = 0;
    localClient.callLocalVision = () => {
      callCount += 1;
      return Promise.resolve(validPanelsJson);
    };

    const { analyzeComicPage } = require('../vision/visionProvider');
    const result = await analyzeComicPage('data:image/png;base64,AAAA', 'unique-test-prompt-cascade-falls-to-local');

    expect(result.panels[0].description).toBe('from local');
    expect(callCount).toBeGreaterThan(0);
  });

  it('tries local first when VISION_PROVIDER=local, without ever touching watsonx/gemini', async () => {
    process.env.VISION_PROVIDER = 'local';
    let callCount = 0;
    localClient.callLocalVision = () => {
      callCount += 1;
      return Promise.resolve(validPanelsJson);
    };

    const { analyzeComicPage } = require('../vision/visionProvider');
    const result = await analyzeComicPage('data:image/png;base64,AAAA', 'unique-test-prompt-local-primary');

    expect(result.panels[0].description).toBe('from local');
    expect(callCount).toBe(1);
  });

  it('rejects when every real provider fails, including local — leaving the mock fallback to the caller', async () => {
    localClient.callLocalVision = () => Promise.reject(new Error('local Ollama not reachable'));

    const { analyzeComicPage, mockAnalyzeComicPage } = require('../vision/visionProvider');
    await expect(analyzeComicPage('data:image/png;base64,AAAA', 'unique-test-prompt-all-fail')).rejects.toThrow();

    // analyzeComicPage itself throws on total failure (by design — the
    // caller, e.g. routes/comicAnalyze.js, is responsible for catching and
    // substituting the mock story); confirm that mock path is still there
    // and produces real content, independent of the cascade's failure.
    expect(mockAnalyzeComicPage().panels.length).toBeGreaterThan(0);
  });
});

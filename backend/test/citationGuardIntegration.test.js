// Integration test for the citation guard's actual retry wiring inside
// qaProvider.js — citationGuard.test.js already covers verifyCitations()
// in isolation, but nothing exercised the real retry-then-warn flow
// end-to-end. Patches shared/localClient's exported callLocalText function
// directly (rather than vi.mock, which relies on ESM-style hoisting that
// doesn't reliably intercept require() in a CommonJS codebase like this
// one) — qaProvider.js's own lazy `require('../shared/localClient')`
// resolves to the same cached module object, so the patched function is
// what actually gets called.
const path = require('path');
const fs = require('fs');
const localClient = require('../shared/localClient');

const QA_CACHE_DIR = path.join(__dirname, '..', 'emotionLens', '.cache');

function clearQaCache() {
  if (!fs.existsSync(QA_CACHE_DIR)) return;
  for (const f of fs.readdirSync(QA_CACHE_DIR)) fs.unlinkSync(path.join(QA_CACHE_DIR, f));
}

const storyBible = [
  'STORY IN READING ORDER:',
  'Panel 1 — Reyes says: "Stay low. They\'re still scanning the block." (afraid)',
  '',
  'CHARACTERS:',
  'Reyes appears in 1 line(s) — panel 1, feeling afraid: "Stay low. They\'re still scanning the block."',
].join('\n');

describe('answerQuestion citation-guard retry integration', () => {
  const originalProvider = process.env.VISION_PROVIDER;
  const originalCallLocalText = localClient.callLocalText;

  beforeEach(() => {
    process.env.VISION_PROVIDER = 'local';
  });

  afterEach(() => {
    process.env.VISION_PROVIDER = originalProvider;
    localClient.callLocalText = originalCallLocalText;
    clearQaCache();
  });

  it('retries once with the fabricated quote fed back, and clears the warning once the retry is grounded', async () => {
    const responses = [
      'Reyes says "I will never surrender, no matter the cost."',
      'Reyes seems afraid because the block is still being watched.',
    ];
    const calls = [];
    localClient.callLocalText = (prompt) => {
      calls.push(prompt);
      return Promise.resolve(responses[calls.length - 1]);
    };

    const { answerQuestion } = require('../emotionLens/qaProvider');
    const result = await answerQuestion(storyBible, 'unique-test-question-citation-retry-clears');

    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('I will never surrender, no matter the cost.');
    expect(result).toEqual({
      answer: 'Reyes seems afraid because the block is still being watched.',
      citationWarning: false,
    });
  });

  it('surfaces citationWarning: true when the retry still fabricates a quote', async () => {
    const responses = ['Reyes says "I will never surrender."', 'Reyes says "Still not in the story bible either."'];
    const calls = [];
    localClient.callLocalText = (prompt) => {
      calls.push(prompt);
      return Promise.resolve(responses[calls.length - 1]);
    };

    const { answerQuestion } = require('../emotionLens/qaProvider');
    const result = await answerQuestion(storyBible, 'unique-test-question-citation-retry-still-fails');

    expect(calls).toHaveLength(2);
    expect(result.citationWarning).toBe(true);
    expect(result.answer).toBe('Reyes says "Still not in the story bible either."');
  });

  it('does not retry at all when the first answer is already grounded', async () => {
    const calls = [];
    localClient.callLocalText = (prompt) => {
      calls.push(prompt);
      return Promise.resolve('Reyes says "Stay low. They\'re still scanning the block."');
    };

    const { answerQuestion } = require('../emotionLens/qaProvider');
    const result = await answerQuestion(storyBible, 'unique-test-question-citation-no-retry-needed');

    expect(calls).toHaveLength(1);
    expect(result.citationWarning).toBe(false);
  });
});

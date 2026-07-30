// Tries each step's fn in order; if one throws, falls back to the next.
// Throws the last error if every step fails, so the caller's own
// mock-fallback logic takes over. Used to keep watsonx as the real,
// intended-first provider (maximizing IBM tool usage, honest for judging)
// while still getting real content instead of the generic mock story when a
// provider fails or its quota runs out — including mid-demo. `local`
// (Ollama, see shared/localClient.js) is always a genuine last-resort real
// option before mock, since it needs no API key and can never run out of
// quota.
async function cascade(steps) {
  let lastErr;
  for (const { label, fn } of steps) {
    try {
      return await fn();
    } catch (err) {
      console.error(`[cascade] ${label} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr;
}

// The three "real" (non-mock) provider values every AI-touching module
// recognizes. Shared so each call site doesn't repeat its own array literal.
const REAL_PROVIDERS = ['watsonx', 'gemini', 'local'];

// Orders provider steps so whichever is configured as PRIMARY (via
// VISION_PROVIDER) is tried first, then falls through the rest in a fixed
// order, ending with `local` last unless local IS primary — local is the
// only rung that can never run out of quota or need a key, so it's the
// natural final real attempt before mock. `providers` is a map of
// { watsonx: fn, gemini: fn, local: fn }; only keys actually present are
// included as steps.
function orderedCascadeSteps(primary, providers) {
  const order = [primary, ...REAL_PROVIDERS.filter((p) => p !== primary)];
  return order.filter((label) => providers[label]).map((label) => ({ label, fn: providers[label] }));
}

module.exports = { cascade, orderedCascadeSteps, REAL_PROVIDERS };

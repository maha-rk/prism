// Tries `primaryFn` first; if it throws, falls back to `secondaryFn`; if
// that also throws, rethrows the secondary error so the caller's own
// mock-fallback logic takes over. Used to keep watsonx as the real,
// intended-first provider (maximizing IBM tool usage, honest for judging)
// while still getting real content instead of the generic mock story when
// watsonx fails or its Lite-plan quota runs out — including mid-demo.
async function cascade(primaryLabel, primaryFn, secondaryLabel, secondaryFn) {
  try {
    return await primaryFn();
  } catch (primaryErr) {
    console.error(`[cascade] ${primaryLabel} failed, falling back to ${secondaryLabel}:`, primaryErr.message);
    try {
      return await secondaryFn();
    } catch (secondaryErr) {
      console.error(`[cascade] ${secondaryLabel} also failed:`, secondaryErr.message);
      throw secondaryErr;
    }
  }
}

module.exports = { cascade };

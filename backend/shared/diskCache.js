// A tiny disk-persisted cache, shared by every watsonx-calling provider.
// watsonx's Lite plan has a hard monthly token quota (300k) — re-testing
// the same input repeatedly during development would otherwise re-spend
// tokens every time. Persisting to disk (not just in-memory) means it
// survives backend restarts too. Same pattern as tts/ttsProvider.js's
// cache, generalized so every provider doesn't reimplement it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function cacheKeyFor(...parts) {
  return crypto.createHash('sha256').update(parts.join('::')).digest('hex');
}

/** Runs `computeFn` and caches its resolved value on disk under `cacheDir`,
 * keyed by `key` — subsequent calls with the same key read from disk
 * instead of calling `computeFn` again. `computeFn`'s result must be
 * JSON-serializable. */
async function cached(cacheDir, key, computeFn) {
  const filePath = path.join(cacheDir, `${key}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  const result = await computeFn();
  await fs.promises.mkdir(cacheDir, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(result));
  return result;
}

module.exports = { cached, cacheKeyFor };

// Turns Emotion Lens's honesty principle ("cite evidence, don't invent
// backstory" — see rag/narrativeGuidelines.md) from a prompt-level request
// into a code-level check, the same way PlotWeaver's "Guardian" pass
// verifies a plot-hole agent's node-ID citations against the actual graph
// instead of just trusting the model said so. Here: any quoted dialogue in
// an answer is checked against the actual story bible text it was grounded
// on. A model that paraphrases without quoting is fine — hedging and
// paraphrase are the expected, encouraged behavior. A model that puts
// something in quotation marks that doesn't actually appear in the source
// is the one failure mode this specifically catches.

function normalize(s) {
  // Apostrophes are stripped to nothing, not replaced with a space — a
  // contraction like "they're" must collapse to "theyre" so it still
  // matches a paraphrase that dropped the apostrophe, rather than
  // splitting into "they re" and silently failing to match at all.
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuotedSpans(answer) {
  return [...answer.matchAll(/"([^"]{4,})"/g)].map((m) => m[1]);
}

/** Checks each double-quoted span in `answer` against `storyBible`'s actual
 * text (substring match after normalization — not exact, since models
 * commonly trim trailing punctuation or a leading "the" — this only needs
 * to catch outright fabrication, not reward verbatim-to-the-character
 * quoting). Returns `{ verified, unverifiedQuotes }`; `verified` is true
 * when there's nothing to flag. */
function verifyCitations(answer, storyBible) {
  const normalizedBible = normalize(storyBible);
  const unverifiedQuotes = extractQuotedSpans(answer).filter((quote) => !normalizedBible.includes(normalize(quote)));
  return { verified: unverifiedQuotes.length === 0, unverifiedQuotes };
}

module.exports = { verifyCitations };

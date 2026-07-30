// Naive include-all retrieval over the guidelines corpus, same approach as
// EchoCanvas's rag/retrieve.js — the corpus is small enough (~12 entries) to
// include in full rather than standing up embedding-similarity retrieval.

const fs = require('fs');
const path = require('path');

const GUIDELINES_PATH = path.join(__dirname, 'guidelines.md');
const NARRATIVE_GUIDELINES_PATH = path.join(__dirname, 'narrativeGuidelines.md');

function parseGuidelines(markdown) {
  return markdown
    .split('\n')
    .filter((line) => /^\d+\.\s/.test(line.trim()))
    .map((line) => line.replace(/^\d+\.\s/, '').trim());
}

const cache = new Map();

function retrieveFrom(filePath) {
  if (!cache.has(filePath)) {
    const markdown = fs.readFileSync(filePath, 'utf-8');
    cache.set(filePath, parseGuidelines(markdown));
  }
  return cache.get(filePath);
}

function retrieveGuidelines() {
  return retrieveFrom(GUIDELINES_PATH);
}

function retrieveNarrativeGuidelines() {
  return retrieveFrom(NARRATIVE_GUIDELINES_PATH);
}

module.exports = { retrieveGuidelines, retrieveNarrativeGuidelines };

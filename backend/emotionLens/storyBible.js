// Builds a structured "story bible" from already-analyzed panels — a
// per-panel summary plus a per-character index of every line they speak,
// with its emotion tag and which panel it's in. This is the "characters/
// events/relationships as indexed entities" the LLM is grounded on for
// Q&A, rather than re-feeding raw panel JSON or (at a larger scale) full
// chapter text — at this single-page scale it's a compact plain-text
// summary rather than an embedding-indexed store, but the same principle:
// structured entities, not a wall of undifferentiated prose.

function buildStoryBible(panels) {
  const ordered = [...panels].sort((a, b) => a.suggestedOrder - b.suggestedOrder);
  const characters = new Map(); // name -> [{ panelOrder, text, emotion }]

  const panelLines = ordered.map((panel) => {
    const parts = [`Panel ${panel.suggestedOrder}`];
    if (panel.caption) parts.push(`Caption: "${panel.caption}"`);
    if (panel.description) parts.push(`Scene: ${panel.description}`);
    if (panel.mood) parts.push(`Mood: ${panel.mood}`);
    for (const line of panel.dialogue || []) {
      parts.push(`${line.speaker} says: "${line.text}" (${line.emotion || 'neutral'})`);
      if (!characters.has(line.speaker)) characters.set(line.speaker, []);
      characters.get(line.speaker).push({
        panelOrder: panel.suggestedOrder,
        text: line.text,
        emotion: line.emotion || 'neutral',
      });
    }
    return parts.join(' — ');
  });

  const characterLines = [...characters.entries()].map(([name, lines]) => {
    const appearances = lines
      .map((l) => `panel ${l.panelOrder}, feeling ${l.emotion}: "${l.text}"`)
      .join('; ');
    return `${name} appears in ${lines.length} line(s) — ${appearances}`;
  });

  return [
    'STORY IN READING ORDER:',
    ...panelLines,
    '',
    'CHARACTERS:',
    characterLines.length ? characterLines.join('\n') : '(no named speakers)',
  ].join('\n');
}

module.exports = { buildStoryBible };

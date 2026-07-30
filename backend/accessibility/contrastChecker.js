// Real, deterministic accessibility checks — no AI, no model, no invented
// score. Two kinds of findings, both genuinely computable:
//
// 1. Approximate visual contrast per panel — real pixel math (WCAG's own
//    relative-luminance formula), sampled from the actual uploaded image.
//    Deliberately NOT called "WCAG text-contrast conformance": that
//    standard applies to specific text-on-background pairs with known
//    bounding boxes, and this pipeline doesn't separately detect lettering
//    regions — this measures overall light/dark separation within each
//    panel as an honest proxy, disclosed as such rather than oversold.
// 2. Structural issues drawn directly from the already-analyzed panel data
//    (reading-order gaps/duplicates, empty descriptions, unattributed
//    dialogue) — real, checkable facts, not estimates.
//
// No composite 0-100 "accessibility score" is produced anywhere in this
// module, on purpose: a single fabricated number would imply a validated
// measurement methodology this pipeline doesn't have (see README).

const { Jimp, intToRGBA } = require('jimp');

const LOW_CONTRAST_THRESHOLD = 3; // WCAG's own AA threshold for large text/graphics — the most lenient bar, appropriate for a proxy metric
const SAMPLE_GRID = 50; // up to 50x50 = 2500 sample points per panel, plenty for a luminance distribution without processing every pixel

function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r, g, b) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function sampleLuminances(image, bbox) {
  const x0 = Math.max(0, Math.floor(bbox.x * image.width));
  const y0 = Math.max(0, Math.floor(bbox.y * image.height));
  const w = Math.max(1, Math.floor(bbox.w * image.width));
  const h = Math.max(1, Math.floor(bbox.h * image.height));

  const stepX = Math.max(1, Math.floor(w / SAMPLE_GRID));
  const stepY = Math.max(1, Math.floor(h / SAMPLE_GRID));

  const luminances = [];
  for (let y = y0; y < Math.min(y0 + h, image.height); y += stepY) {
    for (let x = x0; x < Math.min(x0 + w, image.width); x += stepX) {
      const { r, g, b } = intToRGBA(image.getPixelColor(x, y));
      luminances.push(relativeLuminance(r, g, b));
    }
  }
  return luminances;
}

/** Contrast ratio between the average of the lightest and darkest 10% of
 * sampled pixels — more robust to single-pixel antialiasing noise than a
 * raw min/max, while still reflecting genuine light/dark separation. */
function contrastRatioFromSamples(luminances) {
  if (luminances.length === 0) return null;
  const sorted = [...luminances].sort((a, b) => a - b);
  const tailSize = Math.max(1, Math.floor(sorted.length * 0.1));
  const darkest = sorted.slice(0, tailSize);
  const lightest = sorted.slice(-tailSize);
  const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const L1 = avg(lightest);
  const L2 = avg(darkest);
  return (L1 + 0.05) / (L2 + 0.05);
}

async function contrastByPanel(imageBase64, panels) {
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const buffer = Buffer.from(base64Data, 'base64');
  const image = await Jimp.fromBuffer(buffer);

  return panels.map((panel) => {
    const luminances = sampleLuminances(image, panel.bbox);
    const contrastRatio = contrastRatioFromSamples(luminances);
    return {
      id: panel.id,
      contrastRatio: contrastRatio === null ? null : Math.round(contrastRatio * 10) / 10,
      lowContrast: contrastRatio !== null && contrastRatio < LOW_CONTRAST_THRESHOLD,
    };
  });
}

/** Real, checkable facts about the panel data itself — no image
 * processing needed, no AI call, just verifying properties that either
 * hold or don't. */
function structuralIssues(panels) {
  const issues = [];

  const orders = panels.map((p) => p.suggestedOrder);
  const expected = new Set(Array.from({ length: panels.length }, (_, i) => i + 1));
  const actual = new Set(orders);
  const hasDuplicates = new Set(orders).size !== orders.length;
  const missingOrGap = [...expected].some((n) => !actual.has(n));
  if (hasDuplicates || missingOrGap) {
    issues.push('Reading order is ambiguous or incomplete — some panels share the same position, or a position is missing.');
  }

  panels.forEach((panel) => {
    if (!panel.description || !panel.description.trim()) {
      issues.push(`Panel ${panel.id}: no scene description — nothing for a screen reader to convey here.`);
    }
    (panel.dialogue || []).forEach((line, i) => {
      if (!line.speaker || !line.speaker.trim()) {
        issues.push(`Panel ${panel.id}: dialogue line ${i + 1} has no attributed speaker — read aloud, this line won't be clear who's talking.`);
      }
    });
  });

  return issues;
}

const METHODOLOGY_NOTE =
  'Contrast is an approximate proxy (real pixel-luminance math, sampled per panel) — not a strict WCAG text-contrast conformance test, since exact lettering regions aren\'t separately detected. Structural issues (reading order, missing descriptions, unattributed dialogue) are exact, checked directly against the analyzed panel data. No composite score is produced.';

async function computeAccessibilityReport(imageBase64, panels) {
  const panelContrast = await contrastByPanel(imageBase64, panels);
  return {
    panelContrast,
    structuralIssues: structuralIssues(panels),
    methodologyNote: METHODOLOGY_NOTE,
  };
}

module.exports = { computeAccessibilityReport, structuralIssues, contrastRatioFromSamples, relativeLuminance };

const { test, expect } = require('../fixtures/base');
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'test-comic-page.png');

test.describe('See Through Sound', () => {
  test('upload -> analyze -> reorder -> narrate -> play, with zero console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });

    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('#reviewSection')).toBeVisible({ timeout: 15000 });

    const panelCount = await page.locator('#panelList li').count();
    expect(panelCount).toBeGreaterThan(0);

    await page.click('#confirmOrderBtn');
    await expect(page.locator('#playerControls')).toBeVisible({ timeout: 15000 });

    await page.click('#playPauseBtn');
    await expect(page.locator('#playPauseBtn')).toHaveText('Pause', { timeout: 10000 });

    expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('home link returns to the Prism landing page', async ({ page }) => {
    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });
    await page.click('.home-link');
    await expect(page).toHaveTitle('Prism');
  });

  test('renders the real accessibility report when the backend includes one', async ({ page }) => {
    // The mock-forced test backend never populates `accessibility` (it's
    // only computed on a real, non-mock vision analysis — see
    // routes/comicAnalyze.js). Route interception injects a realistic
    // payload so the frontend rendering logic itself gets exercised
    // without needing real AI credentials.
    await page.route('**/api/comic/analyze', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.accessibility = {
        panelContrast: [{ id: body.panels[0].id, contrastRatio: 1.2, lowContrast: true }],
        structuralIssues: ['Panel p2: dialogue line 1 has no attributed speaker — read aloud, this line won\'t be clear who\'s talking.'],
        methodologyNote: 'Contrast is an approximate proxy — not a strict WCAG text-contrast conformance test.',
      };
      await route.fulfill({ response, json: body });
    });

    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });
    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');

    await expect(page.locator('#accessibilityReport')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#accessibilityFindings li')).toHaveCount(2);
    await expect(page.locator('#accessibilityFindings')).toContainText('low visual contrast');
    await expect(page.locator('#accessibilityFindings')).toContainText('no attributed speaker');
    await expect(page.locator('#accessibilityMethodologyNote')).toContainText('not a strict WCAG text-contrast conformance test');
  });

  test('hides the accessibility report entirely when the backend has none to give (mock path)', async ({ page }) => {
    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });
    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('#reviewSection')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#accessibilityReport')).toBeHidden();
  });

  test('shows the "Generate high-contrast version" button only when a panel is flagged low-contrast, and it produces a real image', async ({ page }) => {
    await page.route('**/api/comic/analyze', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.accessibility = {
        panelContrast: [{ id: body.panels[0].id, contrastRatio: 1.1, lowContrast: true }],
        structuralIssues: [],
        methodologyNote: 'test',
      };
      await route.fulfill({ response, json: body });
    });

    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });
    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('#accessibilityReport')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#boostContrastBtn')).toBeVisible();

    await page.click('#boostContrastBtn');
    await expect(page.locator('#highContrastResult')).toBeVisible();
    const src = await page.locator('#highContrastImage').getAttribute('src');
    expect(src).toMatch(/^data:image\/png;base64,/);
  });

  test('hides the "Generate high-contrast version" button when nothing is flagged low-contrast', async ({ page }) => {
    await page.route('**/api/comic/analyze', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.accessibility = {
        panelContrast: [{ id: body.panels[0].id, contrastRatio: 15, lowContrast: false }],
        structuralIssues: [],
        methodologyNote: 'test',
      };
      await route.fulfill({ response, json: body });
    });

    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });
    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('#accessibilityReport')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#boostContrastBtn')).toBeHidden();
  });

  test('sound effects are shown as visible bracketed captions, not just played as audio', async ({ page }) => {
    await page.goto('/src/modes/see-through-sound/index.html', { waitUntil: 'networkidle' });
    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('#reviewSection')).toBeVisible({ timeout: 15000 });

    // The default mock story tags real sfx on every panel (rain/wind,
    // heartbeat, crash, whoosh) — visible in the pre-narration panel list.
    await expect(page.locator('#panelList')).toContainText('[');

    await page.click('#confirmOrderBtn');
    await expect(page.locator('#playerControls')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#transcript .sfx-caption').first()).toBeVisible();
  });
});

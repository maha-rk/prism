const { test, expect } = require('../fixtures/base');
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'test-comic-page.png');

test.describe('Emotion Lens', () => {
  test('upload -> analyze -> ask a question -> conversation accumulates, zero console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

    await page.goto('/src/modes/emotion-lens/index.html', { waitUntil: 'networkidle' });

    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('#qaSection')).toBeVisible({ timeout: 15000 });

    await page.fill('#questionInput', 'Why is the character afraid?');
    await page.click('#askBtn');
    await expect(page.locator('#conversation li')).toHaveCount(1, { timeout: 15000 });

    await page.fill('#questionInput', 'Who else appears on this page?');
    await page.click('#askBtn');
    await expect(page.locator('#conversation li')).toHaveCount(2, { timeout: 15000 });

    expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('home link returns to the Prism landing page', async ({ page }) => {
    await page.goto('/src/modes/emotion-lens/index.html', { waitUntil: 'networkidle' });
    await page.click('.home-link');
    await expect(page).toHaveTitle('Prism');
  });
});

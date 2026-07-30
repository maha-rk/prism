const { test, expect } = require('../fixtures/base');

test.describe('Gesture Vision', () => {
  test('starts the camera/instrument and shows its on-page title and controls', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

    await page.goto('/src/modes/gesture-vision/index.html', { waitUntil: 'networkidle' });

    // The mode title/home link sit above the pre-start overlay (z-index
    // fix) — must be visible and clickable even before the camera starts.
    await expect(page.locator('#modeHeader .mode-name')).toHaveText('Gesture Vision');

    await page.click('#startOverlay');
    await expect(page.locator('#startOverlay')).toHaveClass(/hidden/, { timeout: 10000 });

    await expect(page.locator('#recordBtn')).toBeVisible();
    await expect(page.locator('#muteBtn')).toBeVisible();

    expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('home link is reachable before the camera starts (not blocked by the start overlay)', async ({ page }) => {
    await page.goto('/src/modes/gesture-vision/index.html', { waitUntil: 'networkidle' });
    await page.click('a.home-link');
    await expect(page).toHaveTitle('Prism');
  });

  test('help modal opens and closes', async ({ page }) => {
    await page.goto('/src/modes/gesture-vision/index.html', { waitUntil: 'networkidle' });
    await page.click('#startOverlay');
    await page.click('#helpButton');
    await expect(page.locator('#helpModal')).not.toHaveClass(/hidden/);
    await page.click('#closeHelp');
    await expect(page.locator('#helpModal')).toHaveClass(/hidden/);
  });
});

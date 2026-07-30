const { test, expect } = require('../fixtures/base');
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'test-comic-page.png');

test.describe('Synesthesia Studio', () => {
  test('Image -> Illustration tab generates a gallery', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

    await page.goto('/src/modes/synesthesia-studio/index.html', { waitUntil: 'networkidle' });

    await page.setInputFiles('#pageInput', FIXTURE);
    await page.click('#analyzeBtn');
    await expect(page.locator('.gallery-item').first()).toBeVisible({ timeout: 15000 });

    expect(errors, `Unexpected console/page errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Image -> Soundscape tab produces a playable soundscape', async ({ page }) => {
    await page.goto('/src/modes/synesthesia-studio/index.html', { waitUntil: 'networkidle' });
    await page.click('.tab-btn[data-tab="image-sound"]');
    await page.setInputFiles('#soundImageInput', FIXTURE);
    await page.click('#imageSoundBtn');
    await expect(page.locator('#imageSoundControls')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#imageSoundPlayBtn')).toHaveText('Pause');
  });

  test('Text -> Soundscape tab produces a playable soundscape', async ({ page }) => {
    await page.goto('/src/modes/synesthesia-studio/index.html', { waitUntil: 'networkidle' });
    await page.click('.tab-btn[data-tab="text-sound"]');
    await page.fill('#moodTextInput', 'A stormy night at sea, waves crashing against the hull');
    await page.click('#textSoundBtn');
    await expect(page.locator('#textSoundControls')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#textSoundPlayBtn')).toHaveText('Pause');
  });

  test('starting a soundscape in one tab resets the other tab\'s stale Play/Pause button', async ({ page }) => {
    await page.goto('/src/modes/synesthesia-studio/index.html', { waitUntil: 'networkidle' });

    await page.click('.tab-btn[data-tab="image-sound"]');
    await page.setInputFiles('#soundImageInput', FIXTURE);
    await page.click('#imageSoundBtn');
    await expect(page.locator('#imageSoundPlayBtn')).toHaveText('Pause', { timeout: 15000 });

    await page.click('.tab-btn[data-tab="text-sound"]');
    await page.fill('#moodTextInput', 'A bright, cheerful morning in a garden');
    await page.click('#textSoundBtn');
    await expect(page.locator('#textSoundPlayBtn')).toHaveText('Pause', { timeout: 15000 });

    await page.click('.tab-btn[data-tab="image-sound"]');
    await expect(page.locator('#imageSoundPlayBtn')).toHaveText('Play');
  });

  test('home link returns to the Prism landing page', async ({ page }) => {
    await page.goto('/src/modes/synesthesia-studio/index.html', { waitUntil: 'networkidle' });
    await page.click('.home-link');
    await expect(page).toHaveTitle('Prism');
  });
});

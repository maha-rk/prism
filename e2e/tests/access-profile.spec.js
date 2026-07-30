const { test, expect } = require('../fixtures/base');

test.describe('Creative Access Mode', () => {
  test('selecting a profile on the landing page applies it there and persists across navigation to a mode page', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'networkidle' });

    await expect(page.locator('body')).toHaveClass(/access-none/);

    await page.selectOption('#accessProfileSelect', 'low-vision');
    await expect(page.locator('body')).toHaveClass(/access-low-vision/);

    await page.click('a.mode-card[href*="emotion-lens"]');
    await expect(page).toHaveURL(/emotion-lens/);
    await expect(page.locator('body')).toHaveClass(/access-low-vision/);
  });

  test('reloading the landing page restores the previously selected profile in the dropdown', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.selectOption('#accessProfileSelect', 'dyslexic');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#accessProfileSelect')).toHaveValue('dyslexic');
    await expect(page.locator('body')).toHaveClass(/access-dyslexic/);
  });

  test('blind profile moves focus to the start overlay on Gesture Vision specifically (not the first DOM control)', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.selectOption('#accessProfileSelect', 'blind');

    await page.goto('/src/modes/gesture-vision/index.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#startOverlay')).toBeFocused();
  });

  test('defaults to no profile / no special class on a fresh session', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('body')).toHaveClass(/access-none/);
    await expect(page.locator('#accessProfileSelect')).toHaveValue('none');
  });

  test('dyslexic profile switches headings to sans-serif too, not just body text', async ({ page }) => {
    // Regression test: headings set their own explicit font-family in each
    // page's stylesheet, so a naive `body.access-dyslexic { font-family: ... }`
    // rule (even with !important) doesn't reach them -- an element's own
    // explicit declaration always wins over an inherited value. Caught by
    // manual verification, not by an earlier version of this suite.
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.selectOption('#accessProfileSelect', 'dyslexic');

    const h1Font = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily);
    const cardH2Font = await page.locator('a.mode-card h2').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(h1Font).toContain('Verdana');
    expect(cardH2Font).toContain('Verdana');
  });
});

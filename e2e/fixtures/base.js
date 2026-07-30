// Every mode's main.js reads `window.PRISM_BACKEND_URL || 'http://localhost:3002'`
// — without this, tests would silently fall through to whatever's actually
// running on the real dev port 3002 (including real, non-mock credentials
// if backend/.env has them configured), instead of the isolated,
// mock-forced test backend playwright.config.js starts on port 3099. Every
// spec file should import `test`/`expect` from here, not directly from
// @playwright/test.
const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.PRISM_BACKEND_URL = 'http://localhost:3099';
    });
    await use(page);
  },
});

module.exports = { test, expect: base.expect };

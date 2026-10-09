const { chromium } = require('/Users/antonabyzov/Projects/research/independent-workbench-2026-10-07/t04-build/bundle-final/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.ANYMODEL_SITE_URL || 'https://anymodel.dev';
const out = process.env.ANYMODEL_SITE_EVIDENCE || path.join(__dirname, 'public-site');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Users/antonabyzov/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
  const checks = [];
  try {
    for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.match(await page.locator('h1').innerText(), /Keep your agent/);
      assert.equal(await page.locator('.version').innerText(), '2.0');
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, `${width}-${theme}.png`), fullPage: true });
      await page.locator('.theme-toggle').click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await page.locator('details').first().locator('summary').click();
      assert.equal(await page.locator('details').first().getAttribute('open'), '');
      await page.locator('.copy-btn').first().click();
      await page.waitForFunction(() => /copied|selected/.test(document.getElementById('copy-status').textContent));
      const badAnchors = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#"]')).filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash));
      assert.deepEqual(badAnchors, []);
      assert.deepEqual(errors, []);
      checks.push({ width, theme, status: response.status(), overflow: false, themePersistence: true, faq: true, copy: true, anchors: true, errors });
      await context.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const response = await page.goto(base + '/bench', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.match(await page.locator('body').innerText(), /16\/18 clean completed runs/);
    await page.screenshot({ path: path.join(out, 'historical-benchmark.png'), fullPage: true });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), base, headless: true, PWDEBUG: process.env.PWDEBUG, PLAYWRIGHT_HTML_OPEN: process.env.PLAYWRIGHT_HTML_OPEN, checks, historicalBenchmarkDisclosure: true }, null, 2));
    console.log(JSON.stringify({ passed: true, report: path.join(out, 'report.json'), cases: checks.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

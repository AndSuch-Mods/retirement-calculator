// Automated mobile-layout smoke test for the same static page used by the iPhone home-screen shortcut.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { mkdirSync } = require('node:fs');

async function waitForServer() {
  for (let n = 0; n < 100; n++) {
    try {
      const response = await fetch('http://127.0.0.1:8877/household.html');
      if (response.ok) return;
    } catch (_) {}
    await delay(100);
  }
  throw new Error('Static site failed to start');
}
async function run(browserType) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    page.on('console', message => {
      if (message.type() === 'error') errors.push('console: ' + message.text());
    });
    const tag = browserType.name();
    console.log('Checking ' + tag + ' mobile...');
    await page.goto('http://127.0.0.1:8877/household.html', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await page.locator('#plannerSectionYou').waitFor({ timeout: 15000 });
    await delay(500);
    let state = await page.evaluate(() => ({
      viewportWidth: innerWidth, scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight, bodyHeight: document.body.scrollHeight,
      title: document.getElementById('pageTitle')?.textContent,
      release: document.getElementById('appUpdated')?.textContent,
      sections: Array.from(document.querySelectorAll('.planner-section')).map(el => ({
        id: el.id, open: el.open, hidden: el.hidden, height: Math.round(el.getBoundingClientRect().height)
      }))
    }));
    console.log(tag, 'initial:', JSON.stringify(state));
    assert.ok(state.scrollHeight > state.viewportHeight + 200, 'Page is unexpectedly cut off at initial viewport');
    await page.locator('#plannerSectionYou > summary').click();
    await page.locator('#currentIncome').waitFor({ state: 'visible' });
    await page.locator('#currentIncome').fill('99000');
    await page.locator('#currentIncome').dispatchEvent('change');
    const income = await page.inputValue('#currentIncome');
    assert.equal(income, '99000');
    await page.locator('#plannerSectionLifestyle > summary').click();
    await page.locator('#desiredSpending').waitFor({ state: 'visible' });
    await page.locator('#desiredSpending').fill('70000');
    assert.equal(await page.inputValue('#desiredSpending'), '70000');
    await page.locator('#spouseEnabled').evaluate(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#plannerSectionSpouse > summary').click();
    await page.locator('#spouseTrsFutureServicePct').waitFor({ state: 'visible' });
    await page.locator('#spouseTrsFutureServicePct').fill('50');
    assert.equal(await page.inputValue('#spouseTrsFutureServicePct'), '50');
    await page.locator('#spouseTrsPlannedFederalServiceYears').fill('1');
    await page.locator('#spouseTrsPlannedFederalServiceYears').dispatchEvent('change');
    assert.equal(await page.inputValue('#spouseTrsPlannedFederalServiceYears'), '1');
    await page.locator('#projectionChart').scrollIntoViewIfNeeded({ timeout: 15000 });
    await page.locator('footer.disclaimer').scrollIntoViewIfNeeded({ timeout: 15000 });
    state = await page.evaluate(() => ({
      y: scrollY, scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      disclaimerVisible: (() => {
        const r = document.querySelector('footer.disclaimer').getBoundingClientRect();
        return r.top < innerHeight && r.bottom > 0;
      })()
    }));
    console.log(tag, 'after interactions:', JSON.stringify(state));
    assert.ok(state.y > 200, 'Cannot scroll beyond first viewport');
    assert.equal(state.disclaimerVisible, true, 'Footer is cut off / inaccessible');
    assert.deepEqual(errors, [], 'Browser console or JavaScript errors: ' + errors.join('\n'));
    mkdirSync('mobile-test-shots', { recursive: true });
    await page.screenshot({ path: 'mobile-test-shots/' + tag + '-mobile.png', fullPage: true });
    console.log(tag, 'mobile test passed');
  } finally {
    await browser.close();
  }
}
const server = spawn('python3', ['-m', 'http.server', '8877', '--bind', '127.0.0.1', '--directory', 'retirement-compass'], { stdio: 'ignore' });
(async () => {
  try {
    await waitForServer();
    for (const engine of [chromium, webkit]) await run(engine);
  } finally { server.kill(); }
})().catch(err => { console.error(err); process.exitCode = 1; });

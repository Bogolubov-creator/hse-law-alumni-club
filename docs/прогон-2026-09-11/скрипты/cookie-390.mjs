import { createRequire } from 'node:module';
const require = createRequire('/Users/buzanovsergey/hse-law-alumni-club-v2/apps/web/package.json');
const { chromium, devices } = require('@playwright/test');
const browser = await chromium.launch();
for (const w of [390, 360, 320]) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: 844 } });
  const p = await ctx.newPage();
  await p.goto('https://bogolubov-creator.github.io/club-pravo-hse-mirror/merch', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  console.log(w, JSON.stringify(await p.evaluate(() => {
    const b = document.querySelector('.club-cookie-banner').getBoundingClientRect();
    const btns = Array.from(document.querySelectorAll('.club-cookie-banner__btn')).map((x) => { const r = x.getBoundingClientRect(); return x.textContent.trim() + ' L' + Math.round(r.left) + ' R' + Math.round(r.right) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); });
    return { bannerR: Math.round(b.right), bannerH: Math.round(b.height), btns };
  })));
  await ctx.close();
}
await browser.close();

import { chromium } from '@playwright/test';
const BASE = 'https://bogolubov-creator.github.io/club-pravo-hse-mirror';
const OUT = process.argv[2];
const statics = ['/', '/dpo', '/merch', '/news', '/events', '/podcasts', '/join', '/cart', '/support', '/privacy'];
const browser = await chromium.launch();
const found = {};
const report = [];
for (const [name, vp, mobile] of [['desk', {width:1440,height:900}, false], ['mob', {width:390,height:844}, true]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,160)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0,160)));
  const routes = [...statics];
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: 'networkidle' }).catch(e => errors.push('NAV ' + r + ' ' + e.message));
    await page.waitForTimeout(1200);
    // discover first detail link on list pages
    if (name === 'desk') for (const [key, prefix] of [['program','/dpo/'],['product','/merch/'],['post','/news/'],['event','/events/']]) {
      if (!found[key] && (r === prefix.slice(0,-1))) {
        const href = await page.$$eval('a[href]', (as, p) => (as.map(a => a.getAttribute('href')).find(h => h && h.includes(p) && !h.endsWith(p))) || null, prefix);
        if (href) { found[key] = href.replace(/^.*club-pravo-hse-mirror/, ''); routes.push(found[key]); }
      }
    } else if (r === '/privacy') { for (const v of Object.values(found)) routes.push(v); }
    const file = `${OUT}/${name}${r.replace(/\//g,'_') || '_home'}.jpg`;
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 55 });
    report.push(`${name} ${r} h=${h} sw=${sw}${sw > vp.width ? ' HORIZONTAL-OVERFLOW' : ''}`);
  }
  report.push(`${name} console errors: ${errors.length}` + (errors.length ? '\n  ' + [...new Set(errors)].slice(0,12).join('\n  ') : ''));
  await ctx.close();
}
await browser.close();
console.log(report.join('\n'));
console.log('found:', JSON.stringify(found));

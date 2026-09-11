// 320px: горизонтальный overflow; MobileApp: cookie-баннер поверх скроллера, позиция при «назад», якорь.
import { createRequire } from 'node:module';
const require = createRequire('/Users/buzanovsergey/hse-law-alumni-club-v2/apps/web/package.json');
const { chromium, devices } = require('@playwright/test');
const BASE = 'https://bogolubov-creator.github.io/club-pravo-hse-mirror';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 320, height: 568 } });
const page = await ctx.newPage();
const routes = ['/', '/dpo', '/merch', '/news', '/podcasts', '/events', '/cart', '/join', '/support', '/privacy'];
for (const r of routes) {
  await page.goto(BASE + r, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const wide = Array.from(document.querySelectorAll('body *')).filter((e) => e.getBoundingClientRect().right > de.clientWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + (typeof e.className === 'string' ? e.className.split(' ').slice(0, 2).join('.') : '') + ' r=' + Math.round(e.getBoundingClientRect().right));
    return { sw: de.scrollWidth, cw: de.clientWidth, overflow: de.scrollWidth > de.clientWidth, wide, main: !!document.querySelector('main'), skip: !!document.querySelector('a.skip'), h1: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent.trim().slice(0, 40)) };
  });
  console.log(r.padEnd(10), JSON.stringify(info));
}
// MobileApp at 390: cookie banner overlap + back position
const ctx2 = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage();
await p2.goto(BASE + '/dpo', { waitUntil: 'load' });
await p2.waitForTimeout(3000);
const overlap = await p2.evaluate(() => {
  const sc = document.querySelector('.noscroll');
  const banner = document.querySelector('.club-cookie-banner');
  sc.scrollTop = sc.scrollHeight;
  const arts = sc.querySelectorAll('article');
  const last = arts[arts.length - 1].getBoundingClientRect();
  const b = banner ? banner.getBoundingClientRect() : null;
  const tabs = document.querySelector('nav.club-tab-bar').getBoundingClientRect();
  return { scrollerH: sc.clientHeight, scrollH: sc.scrollHeight, lastArticleBottom: Math.round(last.bottom), bannerTop: b ? Math.round(b.top) : null, bannerH: b ? Math.round(b.height) : null, tabsTop: Math.round(tabs.top), windowScrollY: window.scrollY, cookieVar: getComputedStyle(document.documentElement).getPropertyValue('--cookie-h') };
});
console.log('mobile /dpo overlap:', JSON.stringify(overlap));
// back position
await p2.evaluate(() => { const sc = document.querySelector('.noscroll'); sc.scrollTop = 2500; });
await p2.waitForTimeout(300);
const before = await p2.evaluate(() => document.querySelector('.noscroll').scrollTop);
await p2.evaluate(() => { const a = Array.from(document.querySelectorAll('a[href*="/dpo/"]')).filter((x) => x.getBoundingClientRect().top > 100 && x.getBoundingClientRect().top < 700 && x.textContent.trim())[0]; a.click(); });
await p2.waitForTimeout(1500);
const detailUrl = p2.url();
const detailScroll = await p2.evaluate(() => ({ docH: document.documentElement.scrollHeight, inner: document.querySelector('.noscroll')?.scrollHeight }));
await p2.goBack();
await p2.waitForTimeout(1500);
const after = await p2.evaluate(() => ({ top: document.querySelector('.noscroll')?.scrollTop, url: location.pathname }));
console.log('back-position: before', before, 'detail', detailUrl.split('/').pop(), detailScroll, 'after back', JSON.stringify(after));
// keyboard: tab order first 12 stops on mobile /dpo
await p2.goto(BASE + '/dpo', { waitUntil: 'load' }); await p2.waitForTimeout(2500);
const stops = [];
for (let i = 0; i < 14; i++) { await p2.keyboard.press('Tab'); stops.push(await p2.evaluate(() => { const a = document.activeElement; return a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent.trim().slice(0, 22)); })); }
console.log('tab order mobile /dpo:', stops.join(' > '));
// Escape closes mobile menu? at 900px (tablet burger)
const ctx3 = await browser.newContext({ viewport: { width: 900, height: 800 } });
const p3 = await ctx3.newPage();
await p3.goto(BASE + '/events', { waitUntil: 'load' }); await p3.waitForTimeout(2500);
await p3.click('button[aria-label="Открыть меню"]');
await p3.keyboard.press('Escape');
const menuAfterEsc = await p3.evaluate(() => !!document.querySelector('.club-mobile-menu'));
console.log('tablet burger menu still open after Escape:', menuAfterEsc);
// events quick view: h1 count
await p3.click('text=Быстрый просмотр');
await p3.waitForTimeout(500);
console.log('h1 count on /events with quick view open:', await p3.evaluate(() => document.querySelectorAll('h1').length), 'active:', await p3.evaluate(() => document.activeElement.getAttribute('role') || document.activeElement.tagName));
await browser.close();

// Измерение LCP/CLS/ресурсов на зеркале. Запуск: node perf-measure.mjs (из apps/web).
import { createRequire } from 'node:module';
const require = createRequire('/Users/buzanovsergey/hse-law-alumni-club-v2/apps/web/package.json');
const { chromium, devices } = require('@playwright/test');
import { writeFileSync } from 'node:fs';

const BASE = 'https://bogolubov-creator.github.io/club-pravo-hse-mirror/';
const PAGES = [
  ['/', BASE],
  ['/dpo', BASE + 'dpo'],
  ['/merch', BASE + 'merch'],
];
const PROFILES = [
  { name: 'desktop 1440x900', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'mobile 390x844', ctx: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
];

const OBSERVER = `
  window.__lcp = null; window.__cls = 0; window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lcp = { t: e.startTime, size: e.size, url: e.url || '', el: e.element ? (e.element.tagName + (e.element.id ? '#' + e.element.id : '') + (e.element.className && typeof e.element.className === 'string' ? '.' + e.element.className.split(' ').slice(0,2).join('.') : '') + ' :: ' + (e.element.textContent || '').trim().slice(0, 60)) : '?' }; } }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value; } }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
`;

const results = [];
const browser = await chromium.launch();
for (const prof of PROFILES) {
  for (const [label, url] of PAGES) {
    const context = await browser.newContext(prof.ctx);
    const page = await context.newPage();
    await page.addInitScript(OBSERVER);
    const responses = [];
    page.on('response', async (r) => {
      try {
        const h = r.headers();
        const buf = await r.body().catch(() => null);
        responses.push({ url: r.url(), type: r.request().resourceType(), status: r.status(), bytes: buf ? buf.length : 0, enc: h['content-encoding'] || '' , ct: h['content-type'] || '' });
      } catch { /* ignore */ }
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    // Заставляем LCP финализироваться: клик по body + скролл на пиксель и обратно
    await page.mouse.move(5, 5);
    await page.waitForTimeout(500);
    const vitals = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource').map((r) => ({ name: r.name, type: r.initiatorType, transfer: r.transferSize, decoded: r.decodedBodySize, dur: r.duration, start: r.startTime, end: r.responseEnd }));
      const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
      const lastLT = window.__lt.length ? Math.max(...window.__lt.map((t) => t.s + t.d)) : 0;
      const lastScript = Math.max(0, ...res.filter((r) => /\.js/.test(r.name)).map((r) => r.end));
      return {
        lcp: window.__lcp, cls: window.__cls, longTasks: window.__lt, paints,
        ttfb: nav?.responseStart, domContentLoaded: nav?.domContentLoadedEventEnd, load: nav?.loadEventEnd,
        ttiRough: Math.max(nav?.domContentLoadedEventEnd || 0, lastLT, lastScript),
        res,
        fontsLoaded: Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight),
        docHeight: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight,
        h1: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent.trim().slice(0, 60)),
        headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => h.tagName + ': ' + h.textContent.trim().slice(0, 50)),
        landmarks: Array.from(document.querySelectorAll('header,nav,main,footer,aside,[role]')).map((e) => e.tagName + (e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : '') + (e.getAttribute('aria-label') ? '(' + e.getAttribute('aria-label') + ')' : '')),
        scrollers: Array.from(document.querySelectorAll('*')).filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2; }).map((e) => e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0,2).join('.') : '') + ' ' + e.clientHeight + '/' + e.scrollHeight),
        buttonsNoName: Array.from(document.querySelectorAll('button,a')).filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim() || b.getAttribute('title'))).map((b) => b.outerHTML.slice(0, 120)),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    const wall = Date.now() - t0;
    const sum = (pred) => responses.filter(pred).reduce((a, r) => a + r.bytes, 0);
    const cnt = (pred) => responses.filter(pred).length;
    const isJs = (r) => /\.m?js(\?|$)/.test(r.url) || /javascript/.test(r.ct);
    const isCss = (r) => /\.css(\?|$)/.test(r.url) || /text\/css/.test(r.ct);
    const isFont = (r) => /\.(woff2?|ttf|otf)(\?|$)/.test(r.url) || /font/.test(r.ct);
    const isImg = (r) => r.type === 'image' || /image\//.test(r.ct);
    const biggest = responses.filter(isJs).sort((a, b) => b.bytes - a.bytes)[0];
    results.push({
      profile: prof.name, page: label, wallMs: wall,
      lcp: vitals.lcp, cls: +vitals.cls.toFixed(4), paints: vitals.paints, ttfb: vitals.ttfb, dcl: vitals.domContentLoaded, load: vitals.load, ttiRough: vitals.ttiRough,
      longTasks: vitals.longTasks.length, longTaskTotal: vitals.longTasks.reduce((a, t) => a + t.d, 0),
      js: { n: cnt(isJs), bytes: sum(isJs) }, css: { n: cnt(isCss), bytes: sum(isCss) }, fonts: { n: cnt(isFont), bytes: sum(isFont), status: responses.filter(isFont).map((r) => r.status + ' ' + r.url.split('/').pop()) },
      img: { n: cnt(isImg), bytes: sum(isImg), list: responses.filter(isImg).map((r) => r.url.split('/').pop() + ' ' + r.bytes) },
      total: { n: responses.length, bytes: sum(() => true) },
      biggestJs: biggest ? { url: biggest.url.split('/').pop(), bytes: biggest.bytes } : null,
      jsList: responses.filter(isJs).map((r) => r.url.split('/').pop() + ' ' + r.bytes),
      transferJs: vitals.res.filter((r) => /\.js/.test(r.name)).reduce((a, r) => a + r.transfer, 0),
      fontsLoaded: vitals.fontsLoaded, docHeight: vitals.docHeight, bodyHeight: vitals.bodyHeight,
      h1: vitals.h1, headings: vitals.headings, landmarks: vitals.landmarks, scrollers: vitals.scrollers, buttonsNoName: vitals.buttonsNoName, overflowX: vitals.overflowX,
      failed: responses.filter((r) => r.status >= 400).map((r) => r.status + ' ' + r.url),
    });
    console.log(prof.name, label, 'LCP', vitals.lcp?.t?.toFixed(0), vitals.lcp?.el, 'CLS', vitals.cls.toFixed(3));
    await context.close();
  }
}
await browser.close();
writeFileSync(new URL(process.argv[2] || './perf-results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('done');

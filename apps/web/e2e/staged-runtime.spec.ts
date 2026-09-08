import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('built service worker and local performance samples',async({browser},info)=>{
 test.skip(info.project.name!=='desktop','Замер Chromium, один одинаковый desktop viewport.');test.setTimeout(60000);
 const rows=[];
 for(const [candidate,url] of [['A-dev','http://localhost:5273/v2'],['B-dev','http://127.0.0.1:5373/'],['A-build','http://localhost:5274/v2']]){
  const context=await browser.newContext({serviceWorkers:"allow",viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();
  await page.addInitScript(()=>{(window as any).__perf={lcp:0,cls:0};new PerformanceObserver(list=>{for(const e of list.getEntries())(window as any).__perf.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries() as any)if(!e.hadRecentInput)(window as any).__perf.cls+=e.value}).observe({type:'layout-shift',buffered:true})});
  await page.goto(url!);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);
  const metrics=await page.evaluate(()=>({...(window as any).__perf,resources:performance.getEntriesByType('resource').length,transferBytes:(performance.getEntriesByType('resource') as PerformanceResourceTiming[]).reduce((s,r)=>s+r.transferSize,0),domContentLoaded:(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).domContentLoadedEventEnd}));rows.push({candidate,...metrics});
  if(candidate==='A-build'){
   await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();expect(await page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
   const cached=await page.evaluate(async()=>{const entries=[];for(const key of await caches.keys())for(const req of await(await caches.open(key)).keys())entries.push(new URL(req.url).pathname);return entries});expect(cached.some(p=>p.startsWith('/api'))).toBe(false);
   await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toBeVisible();await expect(page.getByRole('link',{name:'Клуб выпускников факультета права Вышки',exact:true})).toBeVisible();
   await page.screenshot({path:'/Users/macbook/alumni-staged-evidence/screenshots/offline-shell.png',fullPage:true});await context.setOffline(false);
  }
  await context.close();
 }
 writeFileSync('/Users/macbook/alumni-staged-evidence/performance.json',JSON.stringify({conditions:'Один холодный контекст Chromium на вариант; 1440×900; reduced motion; локальная сеть без throttling. A-dev/B-dev сравнимы по режиму, A-build отдельный. Не полевые CWV и не статистическая выборка.',rows},null,2));
});

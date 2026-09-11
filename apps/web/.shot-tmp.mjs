import { chromium } from '@playwright/test';
const B='http://localhost:4177/club-pravo-hse-mirror';
const [out, ...routes]=process.argv.slice(2);
const br=await chromium.launch();
for (const w of [1440, 390]) {
  const ctx=await br.newContext({viewport:{width:w,height:w>800?900:844},isMobile:w<800,hasTouch:w<800});
  const p=await ctx.newPage();
  for (const r of routes) {
    await p.goto(B+r,{waitUntil:'networkidle'}); await p.waitForTimeout(500);
    const c=p.getByRole('button',{name:/только необходимые/i}); if(await c.count()) { await c.click(); await p.waitForTimeout(200); }
    const name=(r==='/'?'главная':r.replace(/^\//,'').replace(/\//g,'-'));
    await p.screenshot({path:`${out}/${name}-${w}.jpg`,quality:60,fullPage:w>800});
  }
  await ctx.close();
}
await br.close();

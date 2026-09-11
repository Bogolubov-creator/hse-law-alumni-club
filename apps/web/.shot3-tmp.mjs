import { chromium } from '@playwright/test';
const B='http://localhost:4177/club-pravo-hse-mirror';
const out=process.argv[2];
const routes=['/','/dpo','/dpo/avtorskoe-pravo-v-informatsionnom-obschestve-472681893','/news','/events','/merch','/merch/hoodie-faculty','/podcasts','/cart','/join','/support','/privacy'];
const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await ctx.newPage();
for (const r of routes) {
  await p.goto(B+r,{waitUntil:'networkidle'}); await p.waitForTimeout(500);
  const c=p.getByRole('button',{name:/только необходимые/i}); if(await c.count()) { await c.click(); await p.waitForTimeout(150); }
  const over=await p.evaluate(()=>{const w=document.documentElement.clientWidth;const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>w+1&&r.width>0}).slice(0,3).map(e=>e.tagName+'.'+String(e.className).slice(0,30));return {sw:document.documentElement.scrollWidth,cw:w,bad}});
  const minFont=await p.evaluate(()=>Math.min(...[...document.querySelectorAll('body *')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize))));
  console.log(r, 'overflow', over.sw>over.cw?over:'no', 'minFont', minFont);
  const name=(r==='/'?'главная':r.replace(/^\//,'').replace(/\//g,'-').slice(0,40));
  await p.screenshot({path:`${out}/${name}-390.jpg`,quality:55,fullPage:true});
}
await br.close();

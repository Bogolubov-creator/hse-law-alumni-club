import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const out='/Users/macbook/alumni-staged-evidence/screenshots';
mkdirSync(out,{recursive:true});
for(const width of [390,1440]) for(const candidate of ['a','b']) test(`${candidate} baseline ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const base=candidate==='a'?'http://localhost:5273':'http://127.0.0.1:5373';
  const routes=candidate==='a'?['/','/','/dpo','/merch','/events','/lk']:['/','/dpo','/shop','/events','/cabinet'];
  if(candidate==='b') await page.goto('http://127.0.0.1:5398');
  const findings=[];
  for(const route of routes){
    await page.goto(base+route);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1600);
    const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    await page.screenshot({path:`${out}/${candidate}-${route.replaceAll('/','_')||'home'}-${width}.png`,fullPage:true});
    findings.push({route,...size,title:await page.title()});
  }
  writeFileSync(`${out}/${candidate}-${width}.json`,JSON.stringify(findings,null,2));
});

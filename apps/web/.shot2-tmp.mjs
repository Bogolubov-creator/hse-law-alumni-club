import { chromium } from '@playwright/test';
const B='http://localhost:4177/club-pravo-hse-mirror';
const out=process.argv[2];
const br=await chromium.launch();
{
 const ctx=await br.newContext({viewport:{width:1440,height:900}}); const p=await ctx.newPage();
 await p.goto(B+'/dpo',{waitUntil:'networkidle'}); await p.waitForTimeout(400);
 const c=p.getByRole('button',{name:/только необходимые/i}); if(await c.count()) await c.click();
 await p.screenshot({path:out+'/шапка-1440.jpg',quality:70,clip:{x:0,y:0,width:1440,height:200}});
 await p.getByRole('button',{name:'Поиск'}).click(); await p.waitForTimeout(300);
 await p.keyboard.type('право'); await p.waitForTimeout(400);
 await p.screenshot({path:out+'/поиск-1440.jpg',quality:70});
 console.log('search results', await p.evaluate(()=>[...document.querySelectorAll('.club-search__item strong')].map(e=>e.textContent).slice(0,8)));
 await p.keyboard.press('Escape'); await p.waitForTimeout(200);
 console.log('search closed', await p.locator('.club-search').count()===0);
 await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await p.waitForTimeout(300);
 await p.screenshot({path:out+'/подвал-1440.jpg',quality:70,clip:{x:0,y:900-420,width:1440,height:420}});
 await ctx.close();
}
{
 const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await ctx.newPage();
 await p.goto(B+'/events',{waitUntil:'networkidle'}); await p.waitForTimeout(400);
 const c=p.getByRole('button',{name:/только необходимые/i}); if(await c.count()) await c.click();
 await p.screenshot({path:out+'/шапка-390.jpg',quality:70});
 await p.getByRole('button',{name:'Открыть меню'}).click(); await p.waitForTimeout(300);
 await p.screenshot({path:out+'/меню-390.jpg',quality:70});
 console.log('h overflow 390:', await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth));
 await ctx.close();
}
await br.close();

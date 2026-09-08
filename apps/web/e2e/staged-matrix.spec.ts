import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out='/Users/macbook/alumni-staged-evidence/matrix';
const vars=Object.fromEntries(readFileSync('/Users/macbook/alumni-staged-evidence/local.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
// Снимки всех шаблонов: один последовательный проход, чтобы не перегружать локальный API.
test('full template matrix',async({page,request},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop','Размеры и темы задаются явно; мобильный WebKit проверяется отдельными сценариями.');
 test.setTimeout(240000);mkdirSync(out,{recursive:true});
 const login=await request.post('/api/auth/login',{data:{email:vars.TEST_ALUMNI_EMAIL,password:vars.TEST_ALUMNI_PASSWORD}});expect(login.ok()).toBe(true);const user=(await login.json()).token;
 const adminLogin=await request.post('/api/auth/admin-login',{data:{email:vars.ADMIN_EMAIL,password:vars.ADMIN_PASSWORD}});expect(adminLogin.ok()).toBe(true);const admin=(await adminLogin.json()).token;
 await page.addInitScript(({user,admin})=>{localStorage.setItem('club_token',user);localStorage.setItem('club_admin_token',admin);localStorage.setItem('club_cookie_consent','1');localStorage.setItem('club_pwa_dismiss','1')},{user,admin});
 const programs=await request.get('/api/programs').then(r=>r.json());const products=await request.get('/api/products').then(r=>r.json());const news=await request.get('/api/news').then(r=>r.json());const events=await request.get('/api/events').then(r=>r.json());
 const routes=['/v2','/v2/dpo',`/v2/dpo/${programs[0].slug}`,'/v2/merch',`/v2/merch/${products[0].slug}`,'/v2/news',`/v2/news/${news[0].slug}`,'/v2/events',`/v2/events/${events[0].id}`,'/v2/podcasts','/v2/cart','/v2/join','/v2/forgot','/v2/lk','/v2/lk?section=community','/v2/lk?section=achievements','/v2/lk/profile','/v2/privacy','/v2/confidential','/v2/requisites'];
 const rows:unknown[]=[];const errors:string[]=[];const failedResponses:{url:string;status:number}[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)failedResponses.push({url:new URL(r.url()).pathname,status:r.status()})});
 for(const theme of ['light','dark'] as const) for(const width of [320,360,390,768,1024,1280,1440]) {
   await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
   for(const [i,route] of routes.entries()) {
     await page.goto(route);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
     const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src'))}));
     expect.soft(dimensions.scroll,`${route} ${width} ${theme}`).toBeLessThanOrEqual(dimensions.width+1);
     await page.screenshot({path:`${out}/${theme}-${width}-${i}.png`,fullPage:true,animations:'disabled'});
     if([390,1440].includes(width))await page.screenshot({path:`${out}/${theme}-${width}-${i}-viewport.png`,animations:'disabled'});
     rows.push({route,theme,...dimensions});
   }
 }
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({colorScheme:'light'});await page.goto('/admin');
 for(const section of ['Обзор','Заявки','Выпускники','Подписки','Контент','Журнал']) {
   await page.locator('aside').getByRole('button',{name:new RegExp('^'+section)}).click();await page.waitForLoadState('networkidle');
   for(const width of [320,360,390,768,1024,1280,1440]) {
     await page.setViewportSize({width,height:900});const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);expect.soft(scroll,`admin ${section} ${width}`).toBeLessThanOrEqual(width+1);
     await page.screenshot({path:`${out}/admin-${section}-${width}.png`,fullPage:true,animations:'disabled'});rows.push({route:'/admin',section,width,scroll,role:'admin'});
   }
 }
 writeFileSync(`${out}/results.json`,JSON.stringify({rows,errors,failedResponses},null,2));expect(errors).toEqual([]);expect(failedResponses).toEqual([]);
});

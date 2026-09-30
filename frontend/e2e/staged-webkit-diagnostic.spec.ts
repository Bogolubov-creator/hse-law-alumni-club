import { test, expect, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';
for(const serviceWorkers of ['allow','block'] as const)test(`WebKit navigation ${serviceWorkers}`,async({browser},info)=>{
 test.skip(info.project.name!=='mobile','Диагностика WebKit');test.setTimeout(40000);
 const context=await browser.newContext({...devices["iPhone 13"],serviceWorkers});const page=await context.newPage();const events:any[]=[];
 page.on('response',r=>events.push({kind:'response',url:new URL(r.url()).pathname,status:r.status()}));page.on('requestfailed',r=>events.push({kind:'failed',url:new URL(r.url()).pathname,error:r.failure()}));page.on('pageerror',e=>events.push({kind:'error',message:e.message}));
 try{await page.goto('http://localhost:5274/this-page-does-not-exist',{waitUntil:'domcontentloaded',timeout:12000});await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/)}finally{writeFileSync(`/Users/macbook/alumni-staged-evidence/webkit-${serviceWorkers}.json`,JSON.stringify(events,null,2));await context.close()}
});

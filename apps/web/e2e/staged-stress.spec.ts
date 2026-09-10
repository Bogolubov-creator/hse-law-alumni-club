import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out='/Users/macbook/alumni-staged-evidence/stress';
test('reflow, intermediate widths, landscape and images',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Размеры задаются явно.');test.setTimeout(90000);mkdirSync(out,{recursive:true});
 await page.addInitScript(()=>localStorage.setItem('club_cookie_consent','1'));
 for(const width of [699,700,701,767,768,769,899,900,901,999,1000,1001,1100,1101,1920]){
  await page.setViewportSize({width,height:600});for(const route of ['/','/merch']){await page.goto(route);await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1)}
 }
 for(const route of ['/','/dpo','/merch','/lk','/join']){
  await page.setViewportSize({width:320,height:600});await page.goto(route);await page.waitForLoadState('networkidle');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await page.screenshot({path:`${out}/reflow-${route.replaceAll('/','_')}.png`,fullPage:true});
 }
 await page.setViewportSize({width:844,height:390});await page.goto('/merch');await page.getByRole('button',{name:'Выбрать размер',exact:true}).first().click();const modal=page.getByRole('dialog');await expect(modal).toBeVisible();await modal.getByRole('button',{name:'Закрыть',exact:true}).click({trial:true});await page.screenshot({path:`${out}/landscape-merch.png`});await page.keyboard.press('Escape');
 await page.route('**/api/products',async route=>{const response=await route.fetch();const data=await response.json();data[0].images=['/assets/nonexistent-test.jpg'];data[1].images=['/assets/themis.jpeg'];await route.fulfill({json:data})});
 await page.setViewportSize({width:390,height:844});await page.goto('/merch');await expect(page.locator('.club-merch-item').first().getByText('Фотография пока недоступна')).toBeVisible();await expect(page.locator('.club-merch-item').nth(1).locator('img')).toBeVisible();await page.screenshot({path:`${out}/broken-and-valid-image.png`,fullPage:true});
 await page.unroute('**/api/products');
 for(const route of ['/','/dpo','/merch','/join']){
  await page.setViewportSize({width:1280,height:900});await page.goto(route);await page.waitForLoadState('networkidle');
  // Проверка увеличенного текста: снимок вычисленных размеров до удвоения, без каскадного умножения.
  await page.evaluate(()=>{const rows=[...document.querySelectorAll<HTMLElement>('body *')].map(el=>({el,size:parseFloat(getComputedStyle(el).fontSize),line:getComputedStyle(el).lineHeight}));for(const {el,size,line}of rows){el.style.fontSize=`${size*2}px`;if(line!=='normal')el.style.lineHeight=`${parseFloat(line)*2}px`}});
  expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth),`${route} text200`).toBeLessThanOrEqual(1281);await page.screenshot({path:`${out}/text200-${route.replaceAll('/','_')}.png`,fullPage:true});
 }
});

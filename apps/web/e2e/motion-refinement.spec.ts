import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out='/Users/macbook/alumni-staged-evidence/motion';
test.beforeEach(async({page})=>{mkdirSync(out,{recursive:true});await page.addInitScript(()=>{localStorage.setItem('club_cookie_consent','1');localStorage.setItem('club_pwa_dismiss','1')});});
// Решение заказчика 12.09 (вечер): живое движение – один оркестрированный вход героя,
// проявление полос при прокрутке; при reduced-motion всё гаснет, содержание видно сразу.
test('герой входит один раз, reduced motion гасит движение без потери содержания',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 expect(await page.locator('.home-hero').evaluate(e=>e.getAnimations({subtree:true}).length)).toBeGreaterThan(0);
 await page.waitForTimeout(1800);
 await expect(page.locator('.home-hero__photo img')).toBeVisible();
 await page.screenshot({path:`${out}/intro-${info.project.name}.png`});
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
 expect(await page.locator('.home-hero').evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
 expect(await page.locator('.home-agenda').evaluate(e=>getComputedStyle(e).opacity)).toBe('1');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByRole('link',{name:/Вступить в клуб/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
test('афиша фильтрует название, место и формат без потери прямых ссылок',async({page},info)=>{
 const common={status:'published',points:0,description:'Локальное событие',my_rsvp:false};
 await page.route('**/api/events',r=>r.fulfill({json:[{...common,id:'online',title:'Онлайн-семинар',location:'Видеосвязь',format:'online',starts_at:'2027-09-08T12:00:00Z'},{...common,id:'offline',title:'Встреча выпускников',location:'Москва',format:'offline',starts_at:'2027-08-08T12:00:00Z'}]}));
 await page.goto('/events');await expect(page.locator('.club-event-row')).toHaveCount(2);
 await page.getByRole('combobox',{name:'Формат',exact:true}).selectOption('online');await expect(page.locator('.club-event-row')).toHaveCount(1);await expect(page.locator('.club-event-row')).toContainText('Онлайн-семинар');
 await page.getByLabel('Поиск по афише').fill('Москва');await expect(page.locator('.club-event-row')).toHaveCount(0);await expect(page.getByText('По выбранным условиям ближайших событий нет.',{exact:false})).toBeVisible();
 await page.getByRole('combobox',{name:'Формат',exact:true}).selectOption('all');await expect(page.locator('.club-event-row')).toHaveCount(1);
 await page.screenshot({path:`${out}/agenda-filter-${info.project.name}.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});
test('оператор в реквизитах и согласии одинаковый',async({page,request},info)=>{
 await page.goto('/requisites');
 await expect(page.locator('main')).toContainText('1257700005551');
 await expect(page.locator('main')).toContainText('9707041865');
 await expect(page.locator('main')).toContainText('Спиваков Алексей Игоревич');
 await expect(page.locator('main')).toContainText('72293692');
 await expect(page.locator('main')).not.toContainText('7714030726');
 await page.screenshot({path:`${out}/operator-${info.project.name}.png`});
 const config=await (await request.get('/api/support/config')).json();
 expect(config.consent).toContain('Автономная некоммерческая организация');
 expect(config.consent).toContain('Большая Черкизовская');
});

import { test, expect } from '@playwright/test';
import { preparePage, mockPublicApi } from './harness';
const post = { id: '1', slug: 'meeting', title: 'Клуб выпускников: встречи, идеи и новые возможности', excerpt: 'Встречаемся на факультете и обсуждаем планы профессионального сообщества.', body: 'Первая строка публикации.\nВторая строка сохраняет перенос.\n\nПриходите на встречи клуба и знакомьтесь с коллегами.', published_at: '2026-09-12T12:00:00Z' };
test.beforeEach(async ({ page }) => { await preparePage(page); await mockPublicApi(page); });
for (const width of [320, 768, 1440]) test(`news list and article ${width}`, async ({ page }, info) => {
 await page.setViewportSize({ width, height: 900 });
 await page.route('**/api/news', r => r.fulfill({ json: [post, { ...post, id: '2', slug: 'other', title: 'Другая публикация с длинным заголовком о жизни факультета' }] }));
 await page.route('**/api/news/meeting', r => r.fulfill({ json: post }));
 for (const route of ['/news', '/news/meeting']) {
  await page.goto(route); await expect(page.getByRole('heading', { name: route === '/news' ? 'Новости клуба' : post.title, level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  if (process.env.EDITORIAL_SCREENSHOTS) await page.screenshot({ path: `${process.env.EDITORIAL_SCREENSHOTS}/${route === '/news' ? 'news' : 'article'}-${info.project.name}-${width}.png`, fullPage: true });
 }
 await expect(page.locator('article')).toContainText('Вторая строка');
 await page.getByRole('link', { name: 'Все новости', exact: true }).click();
 await page.getByRole('link', { name: `Читать: ${post.title}`, exact: true }).click();
 await expect(page).toHaveURL(/\/news\/meeting$/);
});
test('missing article differs from recoverable server error', async ({ page }) => {
 let status = 503;
 await page.route('**/api/news/meeting', r => r.fulfill({ status, json: status === 200 ? post : { error: 'Ошибка' } }));
 await page.goto('/news/meeting');
 await expect(page.getByRole('heading', { name: 'Не удалось загрузить новость' })).toBeVisible({ timeout: 15000 });
 status = 200; await page.getByRole('button', { name: 'Повторить', exact: true }).click();
 await expect(page.getByRole('heading', { name: post.title })).toBeVisible();
 status = 404; await page.reload();
 await expect(page.getByRole('heading', { name: 'Новость не найдена' })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0);
});
test('agenda filters reset and preserve detail navigation', async ({ page }, info) => {
 const common = { status: 'published', points: 20, description: 'Встреча сообщества выпускников факультета права.', going: 3, my_rsvp: false, my_attended: false, cover: null, reg_url: null };
 await page.route('**/api/events', r => r.fulfill({ json: [
  { ...common, id: 'online', title: 'Онлайн-семинар', format: 'online', location: 'Видеосвязь', starts_at: '2030-09-15T12:00:00Z' },
  { ...common, id: 'offline', title: 'Встреча выпускников', format: 'offline', location: 'Москва', starts_at: '2030-10-15T12:00:00Z' },
 ] }));
 await page.goto('/events'); await expect(page.locator('.club-event-row')).toHaveCount(2);
 await page.getByLabel('Поиск по афише').fill('нет совпадений');
 await expect(page.locator('.club-event-row')).toHaveCount(0);
 await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
 await expect(page.locator('.club-event-row')).toHaveCount(2);
 if (process.env.EDITORIAL_SCREENSHOTS) await page.screenshot({ path: `${process.env.EDITORIAL_SCREENSHOTS}/agenda-${info.project.name}.png`, fullPage: true });
 await page.getByRole('link', { name: 'Онлайн-семинар', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Онлайн-семинар', level: 1 })).toBeVisible();
});

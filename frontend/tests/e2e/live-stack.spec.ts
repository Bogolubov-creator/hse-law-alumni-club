import { exerciseMedia } from "./live-media.js";
import { test, expect, type APIRequestContext, type Page, type APIResponse } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type SavedState = { token: string; previousToken: string; revokedAdmin: string; order: string; name: string; product: string; event: string };
const value = (name: string) => {
  const result = process.env[name];
  if (!result) throw new Error(`Отсутствует ${name}: запускайте scripts/test-live.sh`);
  return result;
};
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function json<T = Record<string, unknown>>(response: APIResponse): Promise<T> {
  // Не печатаем тела ответов: среди них есть одноразовые ссылки и сессии.
  expect(response.ok(), `${new URL(response.url()).pathname}: ${response.status()}`).toBe(true);
  return response.json();
}

async function mailLink(request: APIRequestContext, email: string, pathname: '/confirm' | '/reset'): Promise<string> {
  let link = '';
  await expect.poll(async () => {
    const inbox = await json<{ messages: Array<{ ID: string; To: Array<{ Address: string }> }> }>(await request.get(`${value('E2E_MAIL_URL')}/api/v1/messages`));
    for (const message of inbox.messages.filter(item => item.To.some(to => to.Address === email))) {
      const body = await json<{ Text: string }>(await request.get(`${value('E2E_MAIL_URL')}/api/v1/message/${message.ID}`));
      const found = body.Text.match(/https?:\/\/[^\s<>]+/g)?.find(candidate => new URL(candidate).pathname === pathname);
      if (found) { link = found; return true; }
    }
    return false;
  }, { timeout: 20_000, message: `Mailpit получил письмо ${pathname}` }).toBe(true);
  expect(new URL(link).origin).toBe(value('E2E_BASE_URL'));
  return link;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/lk');
  await page.getByLabel('Почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Войти в кабинет', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('club_token')))).toBe(true);
  return (await page.evaluate(() => localStorage.getItem('club_token')))!;
}

test('настоящий стек: пользователь, офис и сохранение данных', async ({ page, request, context }, info) => {
  const statePath = join(value('E2E_STATE_DIR'), `${info.project.name}.json`);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    localStorage.setItem('club_cookie_consent', 'essential');
    localStorage.setItem('club_pwa_dismiss', '1');
  });
  expect((await request.get('/api/ready')).status()).toBe(200);
  expect((await json<{ enabled: boolean }>(await request.get('/api/payments/config'))).enabled).toBe(false);

  if (process.env.E2E_LIVE_PHASE === 'read') {
    const state: SavedState = JSON.parse(readFileSync(statePath, 'utf8'));
    expect((await request.get('/api/me', { headers: auth(state.previousToken) })).status()).toBe(401);
    expect((await request.get('/api/admin/overview', { headers: auth(state.revokedAdmin) })).status()).toBe(401);
    const me = await json<{ alumni: { fio: string } }>(await request.get('/api/me', { headers: auth(state.token) }));
    expect(me.alumni.fio).toBe(state.name);
    const orders = await json<Array<{ number: string; status: string }>>(await request.get('/api/me/orders', { headers: auth(state.token) }));
    expect(orders.find(order => order.number === state.order)?.status).toBe('in_progress');
    const events = await json<Array<{ id: string; my_rsvp: boolean; my_attended: boolean }>>(await request.get('/api/events', { headers: auth(state.token) }));
    expect(events.find(event => event.id === state.event)).toMatchObject({ my_rsvp: true, my_attended: true });
    expect((await json<{ subscribed: boolean }>(await request.get('/api/podcasts', { headers: auth(state.token) }))).subscribed).toBe(true);
    await page.addInitScript(token => localStorage.setItem('club_token', token), state.token);
    await page.goto('/lk?section=orders');
    await expect(page.getByText(state.order, { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('orders-after-restart.png'), fullPage: true });
    await page.goto('/lk/profile');
    await expect(page.getByLabel('фио', { exact: true })).toHaveValue(state.name);
    await page.screenshot({ path: info.outputPath('profile-after-restart.png'), fullPage: true });
    expect(errors).toEqual([]);
    return;
  }
  expect(process.env.E2E_LIVE_PHASE).toBe('write');
  const email = `graduate-${info.project.name}@live.example.com`;
  const name = `Тест Выпускник ${info.project.name}`;
  await page.goto('/join');
  await page.getByLabel('фио', { exact: true }).fill(name);
  await page.getByLabel('почта', { exact: true }).fill(email);
  await page.getByLabel('год выпуска', { exact: true }).fill('2020');
  await page.getByLabel('образовательная программа', { exact: true }).fill('Право');
  await page.getByLabel(/^пароль/).fill(value('E2E_LIVE_PASSWORD'));
  await page.getByRole('checkbox').check();
  const registration = page.waitForResponse(r => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Подать заявку на вступление' }).click();
  expect((await registration).status()).toBe(200);
  await page.goto(await mailLink(request, email, '/confirm'));
  await expect(page.getByRole('heading', { name: 'Почта подтверждена', exact: true })).toBeVisible();
  const previousToken = await login(page, email, value('E2E_LIVE_PASSWORD'));
  expect((await request.patch('/api/me/profile', { headers: auth(previousToken), data: { fio: name } })).status()).toBe(403);

  const office = await context.newPage();
  await office.goto('/admin');
  await office.getByLabel('Почта', { exact: true }).fill(value('ADMIN_EMAIL'));
  await office.getByLabel('Пароль', { exact: true }).fill(value('ADMIN_PASSWORD'));
  const adminLogin = office.waitForResponse(response => response.url().endsWith('/api/auth/admin-login') && response.request().method() === 'POST');
  await office.getByRole('button', { name: 'Войти', exact: true }).click();
  expect((await adminLogin).status()).toBe(200);
  await expect(office.getByRole('heading', { name: 'Дашборд сайта' })).toBeVisible();
  const adminToken = (await office.evaluate(() => localStorage.getItem('club_admin_token')))!;
  expect(Boolean(adminToken), 'Браузер сохранил сессию офиса').toBe(true);
  const adminHeaders = auth(adminToken);
  await exerciseMedia(office, request, adminToken, info);
  const members = await json<{ items: Array<{ id: string; email: string }> }>(await request.get('/api/admin/members', { headers: adminHeaders }));
  const member = members.items.find(item => item.email === email);
  expect(Boolean(member)).toBe(true);
  await json(await request.patch(`/api/admin/members/${member!.id}`, { headers: adminHeaders, data: { verification_status: 'verified' } }));

  await page.goto('/lk/profile');
  const updatedName = `${name} Проверен`;
  await page.getByLabel('фио', { exact: true }).fill(updatedName);
  await page.getByRole('button', { name: 'сохранить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'сохранено', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('фио', { exact: true })).toHaveValue(updatedName);

  const program = await json<{ slug: string }>(await request.post('/api/admin/programs', { headers: adminHeaders, data: {
    title: `Локальный курс ${info.project.name}`, direction: 'Право', format: 'online', duration: '16 часов', price: 100000,
    description: 'Синтетическая запись для проверки заявки.', status: 'published',
  } }));
  await page.goto('/dpo');
  const course = page.locator('article.club-dpo-tile').filter({ has: page.getByText(`Локальный курс ${info.project.name}`, { exact: true }) });
  const added = page.waitForResponse(r => r.url().endsWith('/api/cart') && r.request().method() === 'POST');
  await course.getByRole('button', { name: 'В корзину' }).click();
  expect((await added).status()).toBe(200);
  await page.goto('/cart');
  await page.getByLabel('фио', { exact: true }).fill(updatedName);
  await page.getByLabel('телефон', { exact: true }).fill('+7 000 000-00-00');
  await page.getByLabel('почта', { exact: true }).fill(email);
  await page.getByRole('checkbox').check();
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Оформить заявку', exact: true }).click();
  const orderResponse = await submitted;
  expect(orderResponse.status()).toBe(200);
  const order: { number: string; total_estimate: number; notified: { ok: boolean } } = await orderResponse.json();
  expect(order.total_estimate).toBe(95000);
  expect(order.notified.ok).toBe(true);
  await expect(page.getByRole('heading', { name: 'Заявка отправлена в учебный офис' })).toBeVisible();
  await page.goto('/lk?section=orders');
  await expect(page.getByText(order.number, { exact: true })).toBeVisible();
  const officeOrders = await json<{ items: Array<{ id: string; number: string }> }>(await request.get('/api/admin/orders', { headers: adminHeaders }));
  const orderId = officeOrders.items.find(item => item.number === order.number)?.id;
  expect(Boolean(orderId)).toBe(true);
  await json(await request.patch(`/api/admin/orders/${orderId}`, { headers: adminHeaders, data: { status: 'in_progress' } }));

  const event = await json<{ id: string }>(await request.post('/api/admin/events', { headers: adminHeaders, data: {
    title: `Тестовая встреча ${info.project.name}`, starts_at: new Date(Date.now() + 86400_000).toISOString(), points: 60, status: 'published',
  } }));
  await json(await request.post(`/api/events/${event.id}/rsvp`, { headers: auth(previousToken), data: {} }));
  const roster = await json<Array<{ id: string }>>(await request.get(`/api/admin/events/${event.id}/rsvps`, { headers: adminHeaders }));
  expect(roster).toHaveLength(1);
  await json(await request.post(`/api/admin/events/rsvp/${roster[0].id}/attend`, { headers: adminHeaders, data: {} }));
  await json(await request.post(`/api/admin/events/rsvp/${roster[0].id}/attend`, { headers: adminHeaders, data: {} }));
  const ledger = await json<Array<{ reason: string }>>(await request.get('/api/me/ledger', { headers: auth(previousToken) }));
  expect(ledger.filter(item => item.reason === 'event')).toHaveLength(1);

  const subscription = await json<{ number: string }>(await request.post('/api/podcasts/subscribe', { headers: auth(previousToken), data: {} }));
  const repeatedSubscription = await json<{ number: string; already: boolean }>(await request.post('/api/podcasts/subscribe', { headers: auth(previousToken), data: {} }));
  expect(repeatedSubscription).toMatchObject({ number: subscription.number, already: true });
  await json(await request.post(`/api/admin/members/${member!.id}/podcast-sub`, { headers: adminHeaders, data: {} }));
  expect((await json<{ subscribed: boolean }>(await request.get('/api/podcasts', { headers: auth(previousToken) }))).subscribed).toBe(true);

  // Учётную запись редактора заранее создала команда оператора.
  const editor = await json<{ token: string }>(await request.post('/api/auth/admin-login', { data: { email: value('TEST_EDITOR_EMAIL'), password: value('TEST_EDITOR_PASSWORD') } }));
  expect((await request.get('/api/admin/programs', { headers: auth(editor.token) })).status()).toBe(200);
  expect((await request.patch(`/api/admin/members/${member!.id}`, { headers: auth(editor.token), data: { verification_status: 'rejected' } })).status()).toBe(403);
  expect((await request.get('/api/admin/support', { headers: auth(editor.token) })).status()).toBe(403);

  await page.goto('/lk');
  await page.getByRole('button', { name: 'выйти', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Вход для выпускников' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('club_token'))).toBeNull();
  await page.goto('/forgot');
  await page.getByLabel('почта', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Прислать ссылку' }).click();
  await page.goto(await mailLink(request, email, '/reset'));
  await page.getByLabel(/^новый пароль/).fill(value('E2E_LIVE_NEW_PASSWORD'));
  await page.getByLabel('повторите пароль', { exact: true }).fill(value('E2E_LIVE_NEW_PASSWORD'));
  const reset = page.waitForResponse(response => response.url().endsWith('/api/auth/reset') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  expect((await reset).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Пароль обновлён' })).toBeVisible();
  expect((await request.get('/api/me', { headers: auth(previousToken) })).status()).toBe(401);
  const token = await login(page, email, value('E2E_LIVE_NEW_PASSWORD'));
  await office.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(office.getByRole('heading', { name: 'Панель учебного офиса' })).toBeVisible();
  expect((await request.get('/api/admin/overview', { headers: adminHeaders })).status()).toBe(401);
  const state: SavedState = { token, previousToken, revokedAdmin: adminToken, order: order.number, name: updatedName, product: program.slug, event: event.id };
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await office.close();
});

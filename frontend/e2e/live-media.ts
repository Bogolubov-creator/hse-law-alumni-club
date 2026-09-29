import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

// Маленький настоящий PNG; загрузка и выдача проходят через действующий API и том.
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNQqZ4DAAICATy18HNuAAAAAElFTkSuQmCC', 'base64');
const AUDIO = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(90, 7)]);

export async function exerciseMedia(office: Page, request: APIRequestContext, adminToken: string, info: TestInfo) {
  const headers = { authorization: `Bearer ${adminToken}` };
  const errors: string[] = [];
  const onPageError = (error: Error) => errors.push(error.message);
  office.on('pageerror', onPageError);
  const name = `cover-${info.project.name}.png`;
  await office.getByRole('button', { name: 'Контент', exact: true }).click();
  await office.getByRole('button', { name: 'Медиа', exact: true }).click();
  await expect(office.getByRole('heading', { name: 'Медиа', exact: true })).toBeVisible();
  await expect(office.getByText('Файлов пока нет.', { exact: true })).toBeVisible();
  await office.getByLabel('Файл', { exact: true }).setInputFiles({ name, mimeType: 'image/png', buffer: IMAGE });
  const uploading = office.waitForResponse(response => response.url().endsWith('/api/admin/media') && response.request().method() === 'POST');
  await office.getByRole('button', { name: 'Загрузить', exact: true }).click();
  const uploaded = await uploading;
  expect(uploaded.status()).toBe(201);
  const image = await uploaded.json() as { id: string };
  const row = office.locator('article').filter({ has: office.getByRole('heading', { name, exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByLabel(`Ссылка на ${name}`, { exact: true })).toHaveValue(`/api/media/${image.id}`);
  await row.getByRole('button', { name: 'Просмотр', exact: true }).click();
  const preview = office.getByRole('dialog').getByRole('img', { name, exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);
  await office.getByRole('button', { name: 'Закрыть', exact: true }).click();
  expect(await office.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await office.screenshot({ path: info.outputPath('media-library.png'), fullPage: true });

  expect((await request.get(`/api/media/${image.id}`)).status()).toBe(404);
  expect((await request.get(`/api/admin/media/${image.id}/content`)).status()).toBe(401);
  const invalid = await request.post('/api/admin/media', { headers, multipart: { file: { name: 'not-a-photo.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>bad()</script></html>') } } });
  expect(invalid.status()).toBe(415);
  const audioResponse = await request.post('/api/admin/media', { headers, multipart: { file: { name: `audio-${info.project.name}.mp3`, mimeType: 'audio/mpeg', buffer: AUDIO } } });
  expect(audioResponse.status()).toBe(201);
  const audio = await audioResponse.json() as { id: string };
  const content = await request.post('/api/admin/news', { headers, data: {
    title: `Медиа проверка ${info.project.name}`, status: 'draft',
    body: `<img src="/api/media/${image.id}"><a href="/api/media/${audio.id}">Аудио</a>`,
  } });
  expect(content.status()).toBe(200);
  const news = await content.json() as { id: string };
  expect((await request.get(`/api/media/${image.id}`)).status()).toBe(404);
  expect((await request.patch(`/api/admin/news/${news.id}`, { headers, data: { status: 'published' } })).status()).toBe(200);
  const publicImage = await request.get(`/api/media/${image.id}`);
  expect(publicImage.status()).toBe(200);
  expect(publicImage.headers()['content-type']).toContain('image/png');
  expect(await publicImage.body()).toEqual(IMAGE);
  expect((await request.get(`/assets/${image.id}`)).status()).toBe(200);
  expect((await request.get(`/api/media/${audio.id}`)).status()).toBe(404);

  await row.getByRole('button', { name: 'Удалить', exact: true }).click();
  const blocked = office.waitForResponse(response => response.url().endsWith(`/api/admin/media/${image.id}`) && response.request().method() === 'DELETE');
  await office.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  expect((await blocked).status()).toBe(409);
  await expect(office.getByRole('alert')).toContainText('Файл используется');
  await expect(row).toBeVisible();
  expect((await request.delete(`/api/admin/news/${news.id}`, { headers })).status()).toBe(200);
  await row.getByRole('button', { name: 'Удалить', exact: true }).click();
  const deleting = office.waitForResponse(response => response.url().endsWith(`/api/admin/media/${image.id}`) && response.request().method() === 'DELETE');
  await office.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  expect((await deleting).status()).toBe(200);
  await expect(row).toHaveCount(0);
  expect((await request.get(`/api/admin/media/${image.id}/content`, { headers })).status()).toBe(404);
  expect((await request.delete(`/api/admin/media/${audio.id}`, { headers })).status()).toBe(200);
  expect((await request.post('/api/admin/news', { headers, data: { title: 'Удалённый файл', body: `<img src="/api/media/${image.id}">` } })).status()).toBe(400);
  await office.getByLabel('Найти файл', { exact: true }).fill('absent-file');
  await office.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(office.getByText('Файлы не найдены.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  office.off('pageerror', onPageError);
  await office.goto('/admin');
}

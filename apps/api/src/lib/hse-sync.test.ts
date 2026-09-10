import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@directus/sdk', async () => await import('../test/fake-sdk.js'));
vi.mock('./directus.js', async () => (await import('../test/fake-directus.js')).directusModuleMock);
vi.mock('@club/shared', async (actual) => ({ ...await actual<typeof import('@club/shared')>(), parseHseDpoCards: (text: string) => JSON.parse(text) }));
const { db, resetDb } = await import('../test/fake-directus.js');
const { syncDpoCatalog } = await import('./hse-sync.js');
const cards = [1, 2, 3].map(id => ({ hseId: String(id), url: `https://www.hse.ru/edu/dpo/${id}/`, title: `Программа ${id}`, category: 'Право', type: 'ПК', formatRaw: 'Онлайн', format: 'online', start: '1 октября 2026', duration: '2 недели', priceKop: 100000 }));
beforeEach(() => {
  resetDb({ programs: [{ id: 'manual', slug: 'manual', title: 'Программа 1', source_url: null, price: 999, description: 'Ручное содержание', status: 'published' }, { id: 'managed', slug: 'managed', title: 'Программа 2', source_url: cards[1]!.url, description: 'Описание редактора', modules: [{ title: 'Ручной модуль' }], price: 999, status: 'published' }] });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => JSON.stringify(url.includes('onlyNonactual') ? [] : cards) })));
});
afterEach(() => vi.unstubAllGlobals());
describe('Сохранность ДПО при синхронизации', () => {
  it('не преобразует одноимённую ручную программу и сохраняет модули управляемой', async () => {
    await syncDpoCatalog();
    expect(db.programs!.find(p => p.id === 'manual')).toMatchObject({ price: 999, source_url: null, description: 'Ручное содержание' });
    expect(db.programs!.find(p => p.id === 'managed')).toMatchObject({ price: 100000, description: 'Описание редактора', modules: [{ title: 'Ручной модуль' }] });
    const count = db.programs!.length;
    await syncDpoCatalog();
    expect(db.programs).toHaveLength(count);
  });
  it('недоступный второй список не изменяет и не архивирует каталог', async () => {
    const before = structuredClone(db.programs);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: !url.includes('onlyNonactual'), status: 503, text: async () => JSON.stringify(cards) })));
    await expect(syncDpoCatalog()).rejects.toThrow('HTTP 503');
    expect(db.programs).toEqual(before);
  });
  it('отсутствующая цена сохраняет ручную цену; новая программа остаётся черновиком', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => JSON.stringify(url.includes('onlyNonactual') ? [] : cards.map(c => ({ ...c, priceKop: 0 }))) })));
    await syncDpoCatalog();
    expect(db.programs!.find(p => p.id === 'managed')).toMatchObject({ price: 999 });
    expect(db.programs!.find(p => p.source_url === cards[0]!.url)).toMatchObject({ price: 0, status: 'draft' });
    await syncDpoCatalog();
    expect(db.programs!.find(p => p.source_url === cards[0]!.url)).toMatchObject({ price: 0, status: 'draft' });
  });
  it('пустой актуальный список не считается доказательством закрытия', async () => {
    const before = structuredClone(db.programs);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '[]' })));
    await expect(syncDpoCatalog()).rejects.toThrow('синк отменён');
    expect(db.programs).toEqual(before);
  });
});

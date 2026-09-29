import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@directus/sdk', async () => await import('../test/fake-sdk.js'));
vi.mock('./directus.js', async () => (await import('../test/fake-directus.js')).directusModuleMock);

const collectMock = vi.fn();
vi.mock('@club/shared', async (actual) => ({
  ...await actual<typeof import('@club/shared')>(),
  collectHseDpoCards: (...args: unknown[]) => collectMock(...args),
  HSE_DPO_ACTUAL_URL: 'https://www.hse.ru/edu/dpo/?orgUnit=22753',
  HSE_DPO_ALL_URL: 'https://www.hse.ru/edu/dpo/?onlyActual=0&orgUnit=22753',
}));

const { db, resetDb } = await import('../test/fake-directus.js');
const { syncDpoCatalog } = await import('./hse-sync.js');

const cards = [1, 2, 3].map(id => ({
  hseId: String(id),
  url: `https://www.hse.ru/edu/dpo/${id}/`,
  title: `Программа ${id}`,
  category: 'Право',
  type: 'ПК' as const,
  formatRaw: 'Онлайн',
  format: 'online' as const,
  start: '1 октября 2026',
  duration: '2 недели',
  priceKop: 100000,
}));

beforeEach(() => {
  resetDb({
    programs: [
      { id: 'manual', slug: 'manual', title: 'Программа 1', source_url: null, price: 999, description: 'Ручное содержание', status: 'published' },
      { id: 'managed', slug: 'managed', title: 'Программа 2', source_url: cards[1]!.url, description: 'Описание редактора', modules: [{ title: 'Ручной модуль' }], price: 999, status: 'published' },
    ],
  });
  // Актуальные – все 3; полный каталог добавляет ещё одну закрытую.
  const closed = {
    ...cards[0]!,
    hseId: '9',
    url: 'https://www.hse.ru/edu/dpo/9/',
    title: 'Программа закрытая',
  };
  collectMock.mockImplementation(async (url: string) => {
    if (String(url).includes('onlyActual=0')) return [...cards, closed];
    return cards;
  });
});
afterEach(() => {
  collectMock.mockReset();
  vi.unstubAllGlobals();
});

describe('Сохранность ДПО при синхронизации', () => {
  it('не преобразует одноимённую ручную программу и сохраняет модули управляемой', async () => {
    await syncDpoCatalog();
    expect(db.programs!.find(p => p.id === 'manual')).toMatchObject({ price: 999, source_url: null, description: 'Ручное содержание' });
    expect(db.programs!.find(p => p.id === 'managed')).toMatchObject({ price: 100000, description: 'Описание редактора', modules: [{ title: 'Ручной модуль' }] });
    const count = db.programs!.length;
    await syncDpoCatalog();
    expect(db.programs).toHaveLength(count);
  });

  it('ставит enrollment nonactual программам только из полного каталога', async () => {
    const r = await syncDpoCatalog();
    expect(r).toMatchObject({ actual: 3, nonactual: 1, total: 4 });
    expect(db.programs!.find(p => p.source_url === 'https://www.hse.ru/edu/dpo/9/')).toMatchObject({ enrollment: 'nonactual' });
    expect(db.programs!.find(p => p.id === 'managed')).toMatchObject({ enrollment: 'actual' });
  });

  it('недоступный полный каталог не изменяет и не архивирует каталог', async () => {
    const before = structuredClone(db.programs);
    collectMock.mockImplementation(async (url: string) => {
      if (String(url).includes('onlyActual=0')) throw new Error('hse.ru: HTTP 503');
      return cards;
    });
    await expect(syncDpoCatalog()).rejects.toThrow('HTTP 503');
    expect(db.programs).toEqual(before);
  });

  it('отсутствующая цена сохраняет ручную цену; новая программа остаётся черновиком', async () => {
    collectMock.mockImplementation(async (url: string) => {
      const zero = cards.map(c => ({ ...c, priceKop: 0 }));
      if (String(url).includes('onlyActual=0')) return zero;
      return zero;
    });
    await syncDpoCatalog();
    expect(db.programs!.find(p => p.id === 'managed')).toMatchObject({ price: 999 });
    expect(db.programs!.find(p => p.source_url === cards[0]!.url)).toMatchObject({ price: 0, status: 'draft' });
  });

  it('пустой актуальный список не считается доказательством закрытия', async () => {
    const before = structuredClone(db.programs);
    collectMock.mockResolvedValue([]);
    await expect(syncDpoCatalog()).rejects.toThrow('синк отменён');
    expect(db.programs).toEqual(before);
  });
});

/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import CartV2 from '../CartV2.js';

vi.mock('../../lib/title.js', () => ({ useHead: () => {} }));
vi.mock('../../v2/Shell.js', () => ({
  V2Shell: ({ children }: { children: ReactNode }) => children,
  ShowcaseHead: () => null, mono: {}, disp: {}, pageTitle: {},
}));

it.each([
  [new TypeError('Failed to fetch'), 'Не удалось изменить корзину'],
  [new Error('Недостаточно товара в наличии.'), 'недостаточно товара в наличии'],
])('показывает ошибку %s и позволяет повторить действие', async (failure, message) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const item = { type: 'merch', ref_id: 'hoodie', variant_sku: 'M', qty: 1, price: 420000, title: 'Худи' };
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
  client.setQueryData(['cart'], { items: [item], count: 1, subtotal: 420000 });
  const fetchMock = vi.fn().mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...item, qty: 2 }], count: 2, subtotal: 840000 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const host = document.createElement('div');
  const root = createRoot(host);
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(CartV2)))));
    const plus = () => host.querySelector<HTMLButtonElement>('[aria-label="Увеличить количество: Худи"]')!;
    await act(async () => { plus().click(); await settle(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe('1');
    expect(plus().disabled).toBe(false);
    await act(async () => { plus().click(); await settle(); });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe('2');
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body).qty).toBe(2);
  } finally {
    act(() => root.unmount()); client.clear(); vi.unstubAllGlobals();
  }
});

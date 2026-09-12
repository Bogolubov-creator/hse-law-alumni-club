/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import PodcastsV2 from '../PodcastsV2.js';
const state = vi.hoisted(() => ({ subscribed: false }));
vi.mock('../../lib/cart.js', () => ({ token: () => null }));
vi.mock('../../lib/title.js', () => ({ useHead: () => {} }));
vi.mock('../../lib/queries.js', () => ({
  usePodcasts: () => ({ data: { subscribed: state.subscribed, price: 499900, items: [
    { id: 'free', title: 'Пробный', is_free: true }, { id: 'paid', title: 'Закрытый', is_free: false },
  ] } }),
  useSubscribePodcasts: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../v2/Shell.js', () => ({ V2Shell: ({ children }: { children: ReactNode }) => children, ShowcaseHead: () => null, mono: {}, disp: {} }));
it.each([false, true])('доступ к выпускам при подписке %s', (subscribed) => {
  state.subscribed = subscribed;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    act(() => root.render(createElement(MemoryRouter, null, createElement(PodcastsV2))));
    const rows = host.querySelectorAll('article');
    expect(rows[0]!.textContent).toContain('Прослушать');
    expect(rows[0]!.classList.contains('podcast-row--locked')).toBe(false);
    expect(rows[1]!.textContent).toContain(subscribed ? 'Прослушать' : 'Оформить подписку');
    expect(rows[1]!.classList.contains('podcast-row--locked')).toBe(!subscribed);
    if (!subscribed) {
      expect(rows[1]!.querySelector('.podcast-subscribe-link')?.getAttribute('href')).toBe('#podcast-subscription');
      expect(host.querySelector('#podcast-subscription')).not.toBeNull();
    }
  } finally { act(() => root.unmount()); }
});

// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ThemeProvider, useTheme } from "../theme.js";
function Probe() {
  const { dark, toggle } = useTheme();
  return createElement('button', { onClick: toggle }, dark ? 'dark' : 'light');
}
afterEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });
it('сохраняет выбранную тему после повторного открытия приложения', () => {
  localStorage.setItem('club_theme', 'light');
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);
  const render = () => flushSync(() => root.render(createElement(ThemeProvider, null, createElement(Probe))));
  render();
  expect(document.documentElement.dataset.theme).toBe('light');
  flushSync(() => host.querySelector('button')!.click());
  expect(localStorage.getItem('club_theme')).toBe('dark');
  flushSync(() => root.unmount());
  root = createRoot(host);
  render();
  expect(host.textContent).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  flushSync(() => root.unmount());
  host.remove();
});

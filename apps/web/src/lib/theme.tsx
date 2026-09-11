import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";

type Theme = "auto" | "light" | "dark";
const ThemeContext = createContext({ dark: false, toggle: () => {} });
const media = () => window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (notify: () => void) => {
  const query = media();
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** Выбор темы общий для каталога, кабинета и мобильной оболочки. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem("club_theme"); return saved === "light" || saved === "dark" ? saved : "auto"; }
    catch { return "auto"; }
  });
  const systemDark = useSyncExternalStore(subscribe, () => media().matches, () => false);
  const dark = theme === "dark" || (theme === "auto" && systemDark);
  useLayoutEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("club_theme", next); } catch { /* Тема действует до закрытия вкладки. */ }
  };
  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);

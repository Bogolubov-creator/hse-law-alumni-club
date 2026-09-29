import { useSyncExternalStore } from "react";

/**
 * Версия для слабовидящих (ГОСТ Р 52872): размер шрифта, цветовая схема,
 * межбуквенный интервал, шрифт с засечками, показ/скрытие изображений.
 * Настройки применяются классами/переменными на <html> и сохраняются в localStorage.
 */
export type VisScheme = "bw" | "wb" | "bb"; // чёрным по белому / белым по чёрному / синим по бежевому
export interface VisionState {
  on: boolean;
  scheme: VisScheme;
  zoom: number; // 1 | 1.4 | 1.8
  spacing: boolean;
  images: boolean;
  serif: boolean;
}

const KEY = "club_vision";
const DEFAULT: VisionState = { on: false, scheme: "bw", zoom: 1.4, spacing: false, images: true, serif: false };

function load(): VisionState {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULT;
  }
}

let state: VisionState = typeof localStorage !== "undefined" ? load() : DEFAULT;
const listeners = new Set<() => void>();

function apply(): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("vis", state.on);
  el.classList.toggle("vis-noimg", state.on && !state.images);
  el.classList.toggle("vis-serif", state.on && state.serif);
  el.classList.toggle("vis-spacing", state.on && state.spacing);
  el.setAttribute("data-vis-scheme", state.on ? state.scheme : "");
  el.style.setProperty("--vis-zoom", String(state.on ? state.zoom : 1));
}

export function setVision(patch: Partial<VisionState>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* приватный режим – не критично */
  }
  apply();
  listeners.forEach((l) => l());
}

// Применяем сохранённые настройки сразу при загрузке (переживает перезагрузку).
apply();

export function useVision(): VisionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

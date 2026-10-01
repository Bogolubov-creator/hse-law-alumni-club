import { useSyncExternalStore } from "react";

export type VisScheme = "bw" | "wb" | "bb";
export interface VisionState {
  on: boolean;
  scheme: VisScheme;
  zoom: number;
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
  }
  apply();
  listeners.forEach((l) => l());
}

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

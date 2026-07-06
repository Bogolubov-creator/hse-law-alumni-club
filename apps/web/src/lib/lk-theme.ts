import { createContext, useCallback, useContext, useState, type CSSProperties } from "react";

export type LkThemeMode = "light" | "dark";

export interface LkTokens {
  bg: string;
  text: string;
  textSoft: string;
  muted: string;
  surfaceBg: string;
  surfaceBorder: string;
  divider: string;
  dividerSoft: string;
  headerBg: string;
  headerText: string;
  navMuted: string;
  navActiveBg: string;
  logoutBg: string;
  logoutBorder: string;
  ringTrack: string;
  ringInner: string;
  barEmpty: string;
  codeBg: string;
  codeBorder: string;
  chipBg: string;
  chipBorder: string;
  inputBg: string;
  inputBorder: string;
  progressTrack: string;
  pendingBg: string;
  levelChipBg: string;
  levelChipText: string;
  modalBtnBorder: string;
  ghostBtnBg: string;
  ghostBtnBorder: string;
  badgeLocked: string;
  shadow: string;
}

export const LK_LIGHT: LkTokens = {
  bg: "#FBF3E8",
  text: "#14181F",
  textSoft: "#3a3f49",
  muted: "#6B7280",
  surfaceBg: "#fff",
  surfaceBorder: "#E5E7EB",
  divider: "#E5E7EB",
  dividerSoft: "#f0ece2",
  headerBg: "#14181F",
  headerText: "#FBF3E8",
  navMuted: "#c8cdd6",
  navActiveBg: "rgba(236,90,19,.16)",
  logoutBg: "rgba(251,243,232,.08)",
  logoutBorder: "rgba(251,243,232,.14)",
  ringTrack: "#E5E7EB",
  ringInner: "#fff",
  barEmpty: "#E5E7EB",
  codeBg: "#FBF7EF",
  codeBorder: "#f0ece2",
  chipBg: "#fff",
  chipBorder: "#E5E7EB",
  inputBg: "#FBF3E8",
  inputBorder: "#E5E7EB",
  progressTrack: "#F2E3CF",
  pendingBg: "#F2E3CF",
  levelChipBg: "rgba(17,41,107,.1)",
  levelChipText: "#11296B",
  modalBtnBorder: "#E5E7EB",
  ghostBtnBg: "#fff",
  ghostBtnBorder: "#E5E7EB",
  badgeLocked: "#F2E3CF",
  shadow: "0 18px 40px -28px rgba(20,24,31,.35)",
};

export const LK_DARK: LkTokens = {
  bg: "#14181F",
  text: "#FBF3E8",
  textSoft: "#d4d9e3",
  muted: "#9aa3b2",
  surfaceBg: "#1c2230",
  surfaceBorder: "rgba(251,243,232,.1)",
  divider: "rgba(251,243,232,.12)",
  dividerSoft: "rgba(251,243,232,.08)",
  headerBg: "#11296B",
  headerText: "#FBF3E8",
  navMuted: "#9aa3b2",
  navActiveBg: "rgba(236,90,19,.28)",
  logoutBg: "rgba(251,243,232,.08)",
  logoutBorder: "rgba(251,243,232,.16)",
  ringTrack: "rgba(251,243,232,.14)",
  ringInner: "#1c2230",
  barEmpty: "rgba(251,243,232,.12)",
  codeBg: "#0f131a",
  codeBorder: "rgba(251,243,232,.12)",
  chipBg: "#1c2230",
  chipBorder: "rgba(251,243,232,.14)",
  inputBg: "#0f131a",
  inputBorder: "rgba(251,243,232,.14)",
  progressTrack: "rgba(251,243,232,.12)",
  pendingBg: "rgba(251,243,232,.1)",
  levelChipBg: "rgba(46,111,174,.22)",
  levelChipText: "#9ec5eb",
  modalBtnBorder: "rgba(251,243,232,.14)",
  ghostBtnBg: "#1c2230",
  ghostBtnBorder: "rgba(251,243,232,.14)",
  badgeLocked: "rgba(251,243,232,.14)",
  shadow: "0 18px 40px -28px rgba(0,0,0,.55)",
};

const STORAGE_KEY = "club_lk_theme";

function readInitialTheme(): LkThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* private mode */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function lkSurface(t: LkTokens): CSSProperties {
  return { background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: 22 };
}

export const LkTokensContext = createContext<LkTokens>(LK_LIGHT);

export function useLkTokens(): LkTokens {
  return useContext(LkTokensContext);
}

export function useLkTheme() {
  const [theme, setThemeState] = useState<LkThemeMode>(readInitialTheme);
  const tokens = theme === "dark" ? LK_DARK : LK_LIGHT;
  const setTheme = useCallback((mode: LkThemeMode) => {
    setThemeState(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);
  return { theme, setTheme, toggle, tokens };
}
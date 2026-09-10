import type { Config } from "tailwindcss";

// Канон палитры/шрифтов – прототип club-business-law.html (решение 3.4).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ohra: { DEFAULT: "#EC5A13", deep: "#C24009" },
        karmin: "#B5331B",
        kobalt: { DEFAULT: "#15375E", br: "#2E6FAE" },
        stal: "#2C6E80",
        latun: { DEFAULT: "#C49A45", br: "#E3C272" },
        grafit: { DEFAULT: "#14181F", soft: "#272C38" },
        kost: { DEFAULT: "#FBF3E8", 2: "#F2E3CF" },
        "hse-blue": "#11296B",
      },
      // Фирменные шрифты НИУ ВШЭ из брендбука университета. Моноширинного
      // у ВШЭ нет – цифры и коды набираются системным моно.
      fontFamily: {
        display: ['"HSE Sans"', "system-ui", "sans-serif"],
        body: ['"HSE Sans"', "system-ui", "sans-serif"],
        mono: ["ui-monospace", '"SF Mono"', '"Cascadia Mono"', "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { card: "18px", soft: "12px" },
    },
  },
  plugins: [],
} satisfies Config;

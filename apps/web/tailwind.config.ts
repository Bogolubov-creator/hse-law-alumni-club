import type { Config } from "tailwindcss";

// Канон палитры/шрифтов — прототип club-business-law.html (решение 3.4).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ohra: { DEFAULT: "#EC5A13", deep: "#C9450E" },
        karmin: "#B5331B",
        kobalt: { DEFAULT: "#15375E", br: "#2E6FAE" },
        stal: "#2C6E80",
        latun: { DEFAULT: "#C49A45", br: "#E3C272" },
        grafit: { DEFAULT: "#14181F", soft: "#272C38" },
        kost: { DEFAULT: "#FBF3E8", 2: "#F2E3CF" },
        "hse-blue": "#11296B",
      },
      fontFamily: {
        display: ['"Unbounded"', "system-ui", "sans-serif"],
        body: ['"Onest"', "system-ui", "sans-serif"],
        mono: ['"Martian Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { card: "18px", soft: "12px" },
    },
  },
  plugins: [],
} satisfies Config;

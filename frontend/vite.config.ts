import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SITE_URL = (process.env.VITE_SITE_URL || "http://localhost").replace(/\/$/, "");
const BASE = process.env.VITE_BASE || "/";
const IS_MIRROR = process.env.VITE_MIRROR === "true";
const DOM_TESTS = [
  "tests/unit/api/admin-mutations.test.ts",
  "tests/unit/api/http.test.ts",
  "tests/unit/api/me-query.test.ts",
  "tests/unit/components/pageview-beacon.test.ts",
  "tests/unit/features/podcasts/mirror-podcast-demo.test.ts",
  "tests/unit/features/privacy/cookie-consent.test.ts",
  "tests/unit/features/reading/reading-list.test.ts",
  "tests/unit/lib/mirror.test.ts",
  "tests/unit/pages/cart-confirmation.test.ts",
  "tests/unit/pages/cart-update.test.ts",
  "tests/unit/pages/home.test.ts",
  "tests/unit/pages/password-return.test.ts",
  "tests/unit/pages/podcast-access.test.ts",
];

export default defineConfig({
  base: BASE,
  test: {
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["tests/unit/**/*.test.ts"], exclude: DOM_TESTS },
      },
      {
        extends: true,
        test: { name: "dom", environment: "happy-dom", include: DOM_TESTS },
      },
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "html-site-url",
      transformIndexHtml: {
        order: "pre",
        handler: (html: string) => {
          let out = html.replace(/%SITE_URL%/g, SITE_URL);
          if (IS_MIRROR) {
            out = out.replace(
              /<meta name="robots" content="index, follow"\s*\/>/,
              '<meta name="robots" content="noindex, nofollow" />',
            );
          }
          return out;
        },
      },
    },
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/robots.txt": { target: process.env.API_PROXY_TARGET || "http://localhost:3000", changeOrigin: true },
      "/sitemap.xml": { target: process.env.API_PROXY_TARGET || "http://localhost:3000", changeOrigin: true },
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});

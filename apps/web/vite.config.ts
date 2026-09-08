import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Абсолютный домен для статических og/JSON-LD в index.html (их читают превью-скрейперы
// без JS). В проде задаётся VITE_SITE_URL=https://<домен>; по умолчанию – localhost.
const SITE_URL = (process.env.VITE_SITE_URL || "http://localhost").replace(/\/$/, "");

// В dev /api проксируется на локальный apps/api; в проде этим занимается Caddy.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "html-site-url",
      // order:'pre' – заменяем плейсхолдеры ДО того, как Vite парсит URL-атрибуты
      // (иначе decodeURI спотыкается о «%SITE_URL%»).
      transformIndexHtml: { order: "pre", handler: (html: string) => html.replace(/%SITE_URL%/g, SITE_URL) },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        // Разбиваем вендор в отдельные чанки: библиотеки кэшируются между релизами.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
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

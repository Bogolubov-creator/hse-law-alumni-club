import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev /api проксируется на локальный apps/api; в проде этим занимается Caddy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});

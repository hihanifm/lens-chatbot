import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local development the Express server runs on UI_API_PROXY_TARGET
// (default http://localhost:38001). All non-HTML requests are proxied to it so
// adding new endpoints never requires updating this file. SPA navigations
// (Accept: text/html GETs) fall through to Vite's index.html.
const API_PROXY_TARGET = process.env.UI_API_PROXY_TARGET ?? "http://localhost:38001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.UI_PORT ?? 38002),
    strictPort: true,
    proxy: {
      "/": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        ws: true,
        bypass: (req) => {
          const url = req.url || "";
          const method = (req.method || "GET").toUpperCase();
          // Never treat mutations as SPA navigations.
          if (method !== "GET" && method !== "HEAD") return undefined;
          // SPA navigation: serve index.html from Vite.
          if (req.headers.accept?.includes("text/html")) return "/index.html";
          // Vite internal modules.
          if (url.startsWith("/@") || url.startsWith("/src/") || url.startsWith("/node_modules/")) {
            return url;
          }
          return undefined;
        },
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});

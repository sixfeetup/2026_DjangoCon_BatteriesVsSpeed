import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  base: "/static/",
  build: {
    assetsDir: "vite",
    emptyOutDir: true,
    manifest: true,
    outDir: resolve(import.meta.dirname, "dist"),
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/main.js"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
});

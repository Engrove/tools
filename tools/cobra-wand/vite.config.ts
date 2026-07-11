/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./", // Hostas i en undermapp (Cloudflare Pages) — alla assets relativa
  optimizeDeps: {
    exclude: ["opencascade.js"], // 50 MB WASM — får inte pre-bundlas
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 8192,
    sourcemap: false,
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 200_000,
    pool: "forks",
  },
});

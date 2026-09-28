import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
      "@ui": resolve(__dirname, "src/ui"),
      "@data": resolve(__dirname, "src/data"),
      "@gameplay": resolve(__dirname, "src/gameplay"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});

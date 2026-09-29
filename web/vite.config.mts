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
    // "hidden" rather than true: the maps are still emitted, so a stack trace
    // from a deployed build can still be resolved by hand, but no
    // //# sourceMappingURL= comment ships in the bundle. With `true` anything
    // loading a deployed script can just follow that comment to the full
    // TypeScript source. The game is open source either way, so this is
    // tidiness rather than secrecy — the port is on GitHub.
    //
    // Note this does not reduce what a player downloads. Browsers only ever
    // fetch a map when devtools is open, which was true under `true` as well;
    // the .map files are still emitted into dist/ either way. They are also
    // still excluded from the service worker's cache hash, in
    // scripts/stamp-cache-version.mjs.
    sourcemap: "hidden",
  },
});

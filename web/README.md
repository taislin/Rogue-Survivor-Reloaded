# Rogue Survivor Reloaded — Web Port

TypeScript port of the original C# Windows Forms game, playable in a browser.

**See the [root README](../README.md) for setup, architecture, and project
overview.** This file only covers what is specific to running the port.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000, hot reload
```

## Production

```bash
npm run build:all   # browser bundle -> dist/, Express server -> dist-server/
npm run serve       # http://localhost:8080
```

| Variable | Default | Description            |
|----------|---------|------------------------|
| `PORT`   | `8080`  | Production server port |

## Verification

```bash
npm run verify   # type-check + 146 tests + build
npm run sim      # headless simulation: plays a full game in Node
```

Run the sim after any engine change — a green type-check does not mean the game
works. See the "Testing and the headless simulator" section of the root README.

## Notes specific to this directory

- `index.html` owns a **1366×768** canvas (the C# original was 1024×768). The game
  always draws in those logical coordinates; `CanvasUI.computeLayout` sizes the
  canvas to the largest **whole** multiple that fits the window (proportionally
  smaller below 1:1) and matches the backing store to the device pixel ratio, so
  the browser never resamples it — text is rasterised at its final resolution and
  `image-rendering: pixelated` keeps the 32px sprites pixel-exact. A window
  smaller than 1366×768 (or one whose size is not a multiple — which includes most
  1080p and 1440p displays) therefore gets 1:1 with black bars rather than a
  stretched fill. Layout constants live at the top of `src/engine/RogueGame.ts`.
- **Map zoom** (`+`/`-`, or `=`/`-`; rebindable, remembered in `localStorage`)
  doubles the tile size and halves the tiles in view — the map panel, HUD,
  messages and minimap keep their sizes. Browser-port addition; the C# original
  has no zoom. The engine keeps `MapToScreen` in 32px-tile coordinates and lets
  `RogueGame.withMapZoom` scale the drawing surface, since the renderer has no
  destination-size parameter.
- Path aliases `@engine`, `@ui`, `@data`, `@gameplay` are configured in
  `vite.config.ts`; `tsconfig.json` mirrors them for the type-checker.
- Append `?debug=1` to the URL for `[render]` / `[draw]` console logging.
- Sprites are lossless WebP under `public/assets/images/<set>/`, audio is `.ogg`
  under `public/assets/{music,sfx}/`.
- `public/sw.js` is a service worker for offline play; bump its `CACHE_VERSION`
  when releasing.

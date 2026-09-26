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

- `index.html` owns a **1366×768** canvas (the C# original was 1024×768), upscaled
  to fit the viewport. Layout constants live at the top of
  `src/engine/RogueGame.ts`.
- Path aliases `@engine`, `@ui`, `@data`, `@gameplay` are configured in
  `vite.config.ts`; `tsconfig.json` mirrors them for the type-checker.
- Append `?debug=1` to the URL for `[render]` / `[draw]` console logging.
- Sprites are lossless WebP under `public/assets/images/<set>/`, audio is `.ogg`
  under `public/assets/{music,sfx}/`.
- `public/sw.js` is a service worker for offline play; bump its `CACHE_VERSION`
  when releasing.

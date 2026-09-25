# Rogue Survivor Reloaded — Web Port

Browser-based TypeScript port of the original C# Windows Forms game.

## Quick start

```bash
cd web
npm install
npm run dev     # Opens http://localhost:3000 with hot reload
```

## Production build + serve

```bash
npm run build:all   # Compile browser bundle + Express server
npm run serve       # http://localhost:8080
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `8080`  | Production server port |

## Project structure

```
web/
├── index.html          Entry HTML (1024×768 canvas)
├── vite.config.ts      Vite bundler config (dev server :3000)
├── tsconfig.json       Browser TypeScript config
├── src/
│   ├── main.ts         Entry point + splash screen
│   ├── engine/         Core primitives (Color, Point, Rect, Direction, …)
│   └── ui/             Browser rendering (CanvasUI, InputHandler)
├── server/
│   ├── index.ts        Express production HTTP server
│   └── tsconfig.json   Server TypeScript config
└── public/
    └── assets/         Game images (to be extracted from C# resources)
```

## Asset extraction

Game sprites in the C# project are embedded as `.png` resources accessed by IDs
such as `"Tiles\\floor_asphalt"`.  Place them under `public/assets/` with
forward-slash paths and the `.png` extension:

```
public/assets/Tiles/floor_asphalt.png
public/assets/MapObjects/wooden_door_closed.png
…
```

## Migration phases

| Phase | Status | Scope |
|-------|--------|-------|
| 1 | ✅ Complete | Scaffold, primitives, Canvas UI, HTTP server |
| 2 | ✅ Complete | Data layer (Map, Actor, Item, Tile, World) |
| 3 | 🔄 In progress | Engine core — all but `ui/OptionsScreen.ts` |
| 4 | ⬜ Pending | RogueGame core loop |
| 5 | 🔄 In progress | AI controllers done; world generators pending |
| 6 | ⬜ Pending | Audio (Web Audio API) |
| 7 | ⬜ Pending | Save/load (IndexedDB) |

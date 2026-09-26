# Rogue Survivor Reloaded — TypeScript / Browser Port: Full Implementation Plan

> **Status:** Phase 1, 2 & 3 complete (Phase 3 includes `ui/OptionsScreen.ts`). Phase 5 complete — `BaseAI` (184/184 methods), all 11 AI controllers, and all 4 generator files done (`MapGenerator`, `BaseMapGenerator`, `BaseTownGenerator`, `StdTownGenerator`). Phase 6 & 7 complete.  
> **Phase 4 in progress:** `engine/RogueGame.ts` scaffold generated (constants, fields, properties, constructor, 492 method stubs, 38 camelCase call-site aliases) and filled slice by slice. **Slice 1 done** (character creation, `StartNewGame`, credits, redefine keys), **slices 4, 5 and 7 in progress** (one agent each), `main.ts` wired to `RogueGame.Run()`. Open slices: 2, 3, 6, 8, 9, 10. `npm run type-check` + `npm run build` clean; 75/75 smoke checks pass.  
> **Last updated:** 2026-09-26

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Source Inventory](#3-source-inventory)
4. [Migration Strategy](#4-migration-strategy)
5. [Phase 1 — Scaffold & Primitives](#phase-1--scaffold--primitives-complete)
6. [Phase 2 — Data Layer](#phase-2--data-layer-complete)
7. [Phase 3 — Engine Core (Rules & LOS)](#phase-3--engine-core)
8. [Phase 4 — Game Loop (RogueGame)](#phase-4--game-loop-roguegame)
9. [Phase 5 — World Generation & AI](#phase-5--world-generation--ai)
10. [Phase 6 — Audio](#phase-6--audio)
11. [Phase 7 — Save / Load](#phase-7--save--load)
12. [Phase 8 — Polish & Deployment](#phase-8--polish--deployment)
13. [Cross-Cutting Concerns](#cross-cutting-concerns)
14. [Testing Strategy](#testing-strategy)
15. [Asset Pipeline](#asset-pipeline)

---

## 1. Project Overview

**Rogue Survivor Reloaded** is a C# Windows Forms zombie-survival roguelike.

| Metric | Value |
|--------|-------|
| C# source files | 195 |
| Total C# source size | ~2.5 MB |
| Largest single file | `RogueGame.cs` — 955 KB / 23 233 lines |
| 2nd largest | `BaseAI.cs` — 245 KB |
| 3rd largest | `BaseTownGenerator.cs` — 243 KB |
| Platform dependencies | WinForms, GDI+, DirectX, SFML audio, .NET binary serialization |

The goal is to produce a **browser-playable TypeScript version** that is:
- Functionally equivalent to the C# alpha 10.1 release
- Served by an Express HTTP server (or any static host)
- Smaller and cleaner than the original where the original is bloated

---

## 2. Architecture

```
Browser (HTML5 Canvas 2D)
│
├── main.ts                     Bootstrap / game entry point
│
├── engine/                     Pure game logic (no DOM)
│   ├── IRogueUI.ts             Rendering + input contract (interface)
│   ├── RogueGame.ts            Main game loop (23 KLOC → Phase 4)
│   ├── Rules.ts                All game rules (Phase 3)
│   ├── LOS.ts                  Line-of-sight / FOV (Phase 3)
│   ├── Session.ts              Game session state (Phase 3)
│   ├── Scoring.ts              High score logic (Phase 3)
│   └── ...
│
├── data/                       Pure data models (no DOM, no UI)
│   ├── Actor.ts
│   ├── Map.ts
│   ├── World.ts
│   └── ...
│
├── gameplay/                   Definitions, generators, AI
│   ├── GameImages.ts           Image ID constants
│   ├── GameItems.ts            Item definitions
│   ├── GameActors.ts           Actor definitions
│   ├── ai/                     AI controllers
│   └── generators/             World generation
│
└── ui/                         Browser rendering layer
    ├── CanvasUI.ts             IRogueUI over HTML5 Canvas 2D
    └── InputHandler.ts         Keyboard / mouse event queue

server/
└── index.ts                    Express HTTP server (production)
```

### Key Architectural Differences from C#

| C# | TypeScript/Browser |
|----|-------------------|
| `Application.Run()` blocks on WinForms message pump | `async` game loop with `await UI_WaitKey()` |
| Background thread posts to UI thread via `Invoke()` | Single JS thread; async/await replaces cross-thread calls |
| `System.Drawing.Color/Point/Rectangle` | `Color`, `Point`, `Rect` classes in `engine/` |
| `System.Random` | Mulberry32 PRNG (`DiceRoller.ts`) |
| GDI+ / DirectX rendering | HTML5 Canvas 2D (`CanvasUI.ts`) |
| `BinaryFormatter` save files | JSON saved to `localStorage` / IndexedDB |
| SFML / DirectX audio | Web Audio API |
| Windows file paths `"Tiles\\floor"` | URL paths `/assets/Tiles/floor.png` |

---

## 3. Source Inventory

### Biggest files (most work)

| File | Size | Phase | Notes |
|------|------|-------|-------|
| `Engine/RogueGame.cs` | 955 KB | 4 | Split into sub-modules |
| `Gameplay/AI/BaseAI.cs` | 245 KB | 5 | Split into focused AI behaviours |
| `Gameplay/Generators/BaseTownGenerator.cs` | 243 KB | 5 | ✅ Ported as one 5 814-line class (see Phase 5 note) |
| `Engine/Rules.cs` | 147 KB | 3 | Pure logic, straightforward port |
| `Gameplay/GameItems.cs` | 76 KB | 2 | Data definitions only |
| `Gameplay/GameActors.cs` | 51 KB | 2 | Data definitions only |
| `Gameplay/GameImages.cs` | 47 KB | 2 | String constants — trivial |
| `Gameplay/Generators/BaseMapGenerator.cs` | 43 KB | 5 | |
| `Data/Map.cs` | 40 KB | 2 | Core data model |
| `Gameplay/GameOptions.cs` | 39 KB | 3 | Settings, some UI interaction |
| `Gameplay/AI/CivilianAI.cs` | 39 KB | 5 | |
| `Data/Actor.cs` | 30 KB | 2 | Core data model |

### Small files (easy wins)

Most `Data/` files are under 5 KB and have zero platform dependencies —
they port in minutes and form the stable foundation everything else builds on.

---

## 4. Migration Strategy

### Guiding principles

1. **Bottom-up by dependency**: port data models before engine, engine before AI, AI before generators.
2. **No platform leakage**: `engine/` and `data/` must never import from `ui/`. Only `main.ts` and `ui/` touch the DOM.
3. **Async-first**: every function that blocks in C# (waiting for input, sleeping) becomes `async` in TypeScript.
4. **Reduce where bloated**: `RogueGame.cs` is 955 KB because it mixes rendering, logic, and UI layout. Break it into focused modules during the port.
5. **One phase at a time**: each phase produces a runnable build before the next starts.
6. **Keep C# source intact**: `src/` is never touched. Diffs between the two versions serve as documentation.

### Bloat reduction targets

| C# file | Bloat reason | TypeScript approach |
|---------|-------------|-------------------|
| `RogueGame.cs` (955 KB) | Everything in one God class | Split into `GameLoop`, `GameRenderer`, `GameUI`, `GameEvents`, `GameActions` |
| `BaseAI.cs` (245 KB) | One class for all AI types | One file per AI behaviour (`ZombieAI`, `CivilianAI`, etc.) with shared `BaseAI` |
| `BaseTownGenerator.cs` (243 KB) | God generator | Split into `RoadGenerator`, `BuildingGenerator`, `ZoneGenerator` |
| `GameItems.cs` (76 KB) | All item definitions inline | JSON data file + typed loader |
| `GameActors.cs` (51 KB) | All actor definitions inline | JSON data file + typed loader |
| `GameOptions.cs` (39 KB) | Mixed options + UI code | Separate `GameOptions` (data) from `OptionsScreen` (UI) |

---

## Phase 1 — Scaffold & Primitives ✅ Complete

**Output:** Working dev server + production HTTP server. Splash screen proves the full stack.

### Files created

```
web/
├── package.json                  npm project (Vite + TypeScript + Express)
├── tsconfig.json                 Strict browser TS config
├── vite.config.ts                Dev server :3000 + production build
├── index.html                    1024×768 <canvas> + loading overlay
├── .gitignore
├── README.md
├── public/assets/                (images go here — see Asset Pipeline)
├── src/
│   ├── main.ts                   Entry point + splash screen + self-tests
│   ├── engine/
│   │   ├── Color.ts              System.Drawing.Color equivalent
│   │   ├── Point.ts              System.Drawing.Point equivalent
│   │   ├── Rect.ts               System.Drawing.Rectangle equivalent
│   │   ├── Direction.ts          Direction.cs port (8-compass)
│   │   ├── DiceRoller.ts         DiceRoller.cs port (Mulberry32 PRNG)
│   │   ├── WorldTime.ts          WorldTime.cs port (day/night clock)
│   │   └── IRogueUI.ts           IRogueUI.cs port (Promise-based interface)
│   └── ui/
│       ├── CanvasUI.ts           Canvas 2D implementation of IRogueUI
│       └── InputHandler.ts       Browser keyboard/mouse → game event queue
└── server/
    ├── index.ts                  Express production HTTP server (:8080)
    └── tsconfig.json             Node.js TS config
```

### Verification

```
npm run type-check  → 0 errors
npm run build       → 15.6 kB bundle (5.5 kB gzipped)
```

---

## Phase 2 — Data Layer ✅ Complete

**Goal:** All pure data models ported. `data/` and `gameplay/GameImages.ts` fully typed.  
**Platform deps:** None — these classes have zero WinForms/GDI/IO references.  
**Estimated effort:** Medium (many small files, two large ones: `Map.cs` 40 KB, `Actor.cs` 30 KB).

### Files to port

#### `data/` — core models

| C# file | TS output | Notes | Status |
|---------|-----------|-------|--------|
| `Skill.cs` | `data/Skill.ts` | Simple enum + record | ✅ Done |
| `Abilities.cs` | `data/Abilities.ts` | Bitflag struct | ✅ Done |
| `Verb.cs` | `data/Verb.ts` | Tiny | ✅ Done |
| `Weather.cs` | `data/Weather.ts` | Enum | ✅ Done |
| `Odor.cs` | `data/Odor.ts` | Enum | ✅ Done |
| `Activity.cs` | `data/Activity.ts` | Enum | ✅ Done |
| `TileModel.cs` | `data/TileModel.ts` | | ✅ Done |
| `Tile.cs` | `data/Tile.ts` | | ✅ Done |
| `ItemModel.cs` | `data/ItemModel.ts` | | ✅ Done |
| `Item.cs` | `data/Item.ts` | | ✅ Done |
| `ActorModel.cs` | `data/ActorModel.ts` | | ✅ Done |
| `ActorSheet.cs` | `data/ActorSheet.ts` | | ✅ Done |
| `Attack.cs` | `data/Attack.ts` | | ✅ Done |
| `BlastAttack.cs` | `data/BlastAttack.ts` | | ✅ Done |
| `Defence.cs` | `data/Defence.ts` | | ✅ Done |
| `Doll.cs` | `data/Doll.ts` | Equipment slots | ✅ Done |
| `Inventory.cs` | `data/Inventory.ts` | ~16 KB, slot logic | ✅ Done |
| `Corpse.cs` | `data/Corpse.ts` | | ✅ Done |
| `Message.cs` | `data/Message.ts` | | ✅ Done |
| `Faction.cs` | `data/Faction.ts` | | ✅ Done |
| `Zone.cs` | `data/Zone.ts` | | ✅ Done |
| `Location.cs` | `data/Location.ts` | | ✅ Done |
| `TimedTask.cs` | `data/TimedTask.ts` | | ✅ Done |
| `MapObject.cs` | `data/MapObject.ts` | | ✅ Done |
| `StateMapObject.cs` | `data/StateMapObject.ts` | | ✅ Done |
| `Actor.cs` | `data/Actor.ts` | **30 KB** — biggest data class | ✅ Done |
| `Map.cs` | `data/Map.ts` | **40 KB** — complex spatial index | ✅ Done |
| `District.cs` | `data/District.ts` | | ✅ Done |
| `World.cs` | `data/World.ts` | | ✅ Done |
| `Models.cs` | `data/Models.ts` | Model DB registries | ✅ Done |
| `ActorOrder.cs` | `data/ActorOrder.ts` | | ✅ Done |
| `ActorDirective.cs` | `data/ActorDirective.ts` | | ✅ Done |

#### `data/` — controllers

| C# file | TS output | Notes | Status |
|---------|-----------|-------|--------|
| `ActorController.cs` | `data/ActorController.ts` | Abstract base | ✅ Done |
| `AIController.cs` | `data/AIController.ts` | AI subclass | ✅ Done |
| `PlayerController.cs` | `data/PlayerController.ts` | Player subclass | ✅ Done |

#### `engine/Items/` — item type hierarchy
 
| C# file | TS output | Notes | Status |
|---------|-----------|-------|--------|
| `ItemWeapon.cs` / `ItemWeaponModel.cs` | `engine/items/ItemWeapon.ts` | | ✅ Done |
| `ItemMeleeWeapon.cs` / `Model` | `engine/items/ItemMeleeWeapon.ts` | | ✅ Done |
| `ItemRangedWeapon.cs` / `Model` | `engine/items/ItemRangedWeapon.ts` | | ✅ Done |
| `ItemAmmo.cs` / `Model` | `engine/items/ItemAmmo.ts` | | ✅ Done |
| `ItemFood.cs` / `Model` | `engine/items/ItemFood.ts` | | ✅ Done |
| `ItemMedicine.cs` / `Model` | `engine/items/ItemMedicine.ts` | | ✅ Done |
| `ItemBodyArmor.cs` / `Model` | `engine/items/ItemBodyArmor.ts` | | ✅ Done |
| `ItemLight.cs` / `Model` | `engine/items/ItemLight.ts` | | ✅ Done |
| `ItemExplosive.cs` / `Model` | `engine/items/ItemExplosive.ts` | | ✅ Done |
| `ItemGrenade.cs` / `Model` | `engine/items/ItemGrenade.ts` | | ✅ Done |
| `ItemGrenadePrimed.cs` / `Model` | `engine/items/ItemGrenadePrimed.ts` | | ✅ Done |
| `ItemTrap.cs` / `Model` | `engine/items/ItemTrap.ts` | ~5 KB | ✅ Done |
| `ItemTracker.cs` / `Model` | `engine/items/ItemTracker.ts` | | ✅ Done |
| `ItemEntertainment.cs` / `Model` | `engine/items/ItemEntertainment.ts` | | ✅ Done |
| `ItemBarricadeMaterial.cs` / `Model` | `engine/items/ItemBarricadeMaterial.ts` | | ✅ Done |
| `ItemSprayPaint.cs` / `Model` | `engine/items/ItemSprayPaint.ts` | | ✅ Done |
| `ItemSprayScent.cs` / `Model` | `engine/items/ItemSprayScent.ts` | | ✅ Done |
 
#### `engine/MapObjects/`
 
| C# file | TS output | Status |
|---------|-----------|--------|
| `Door.cs` | `engine/mapobjects/MapObjects.ts` | ✅ Done |
| `Fortification.cs` | `engine/mapobjects/MapObjects.ts` | ✅ Done |
| `PowerGenerator.cs` | `engine/mapobjects/MapObjects.ts` | ✅ Done |
| `Board.cs` | `engine/mapobjects/MapObjects.ts` | ✅ Done |
 
#### `gameplay/` — definition tables
 
| C# file | TS output | Simplification | Status |
|---------|-----------|----------------|--------|
| `GameImages.cs` | `gameplay/GameImages.ts` | String constants only — direct port | ✅ Done |
| `GameTiles.cs` | `gameplay/GameTiles.ts` | | ✅ Done |
| `GameSounds.cs` | `gameplay/GameSounds.ts` | | ✅ Done |
| `GameMusics.cs` | `gameplay/GameMusics.ts` | | ✅ Done |
| `Skills.cs` | `gameplay/Skills.ts` | | ✅ Done |
| `ZoneAttributes.cs` | `gameplay/ZoneAttributes.ts` | Tiny | ✅ Done |
| `GameFactions.cs` | `gameplay/GameFactions.ts` | | ✅ Done |
| `GameGangs.cs` | `gameplay/GameGangs.ts` | | ✅ Done |
| `GameTips.cs` | `gameplay/ZoneAttributes.ts` | Combined tips | ✅ Done |
| `GameActors.cs` | `gameplay/GameActors.ts` + `gameplay/data/actors.json` | **50 KB → move definitions to JSON** | ✅ Done |
| `GameItems.cs` | `gameplay/GameItems.ts` + `gameplay/data/items.json` | **76 KB → move definitions to JSON** | ✅ Done |

> **Bloat reduction:** `GameItems.cs` (76 KB) and `GameActors.cs` (51 KB) contain thousands of lines of repetitive inline object construction. These will be moved to typed JSON files, reducing the TS files to typed loaders of ~100 lines each.

### Verification

```
npm run type-check  → 0 errors
All data models instantiable in unit tests
Map.getActorAt / getExitAt / etc. return correct types
```

---

## Phase 3 — Engine Core

**Goal:** `Rules`, `LOS`, `Session`, `Scoring`, `MessageManager`, `HiScoreTable`, `GameOptions`, `GameHints` ported.  
**Platform deps:** `Session.cs` uses .NET XML serialization → replace with JSON. `GameOptions.cs` uses WinForms for some UI → split into data and UI parts.

### Files to port

| C# file | Size | TS output | Notes | Status |
|---------|------|-----------|-------|--------|
| `Engine/Rules.cs` | 147 KB | `engine/Rules.ts` | Pure logic, no deps — direct port | ✅ Done |
| `Engine/LOS.cs` | 14 KB | `engine/LOS.ts` | Bresenham line-trace, FOV — direct port | ✅ Done |
| `Engine/Session.cs` | 25 KB | `engine/Session.ts` | Drop XML serialization; use localStorage JSON (world graph deferred to Phase 4) | ✅ Done |
| `Engine/Scoring.cs` | 24 KB | `engine/Scoring.ts` | `Achievement`, `DifficultySide`, `Scoring` | ✅ Done |
| `Engine/HiScoreTable.cs` | 6 KB | `engine/HiScoreTable.ts` | Persist to localStorage JSON | ✅ Done |
| `Engine/MessageManager.cs` | 3 KB | `engine/MessageManager.ts` | | ✅ Done |
| `Engine/PlayerCommand.cs` | 1 KB | `engine/PlayerCommand.ts` | Enum | ✅ Done |
| `Engine/InputTranslator.cs` | 3 KB | `engine/Keybindings.ts` (`InputTranslator`) | Map browser keys → PlayerCommand; merged into Keybindings.ts | ✅ Done |
| `Engine/Keybindings.cs` | 8 KB | `engine/Keybindings.ts` | Persist to localStorage | ✅ Done |
| `Engine/GameHints.cs` | 3 KB | `engine/GameHints.ts` | | ✅ Done |
| `Engine/GameOptions.cs` | 39 KB | `engine/GameOptions.ts` (data) + `ui/OptionsScreen.ts` (UI) | Data + UI done. The C# project has no `OptionsScreen.cs`: the screen is `RogueGame.HandleOptions(bool)` (RogueGame.cs ≈2294), so that method was ported as `ui/OptionsScreen.ts` | ✅ Done |
| `Engine/AI/MemorizedSensor.cs` | 3 KB | `engine/ai/Sensors.ts` | Combined into Sensors.ts | ✅ Done |
| `Engine/AI/Percept.cs` | 1 KB | `engine/ai/Sensors.ts` | Combined into Sensors.ts | ✅ Done |
| `Engine/AI/Sensor.cs` | 0.3 KB | `engine/ai/Sensors.ts` | Abstract base | ✅ Done |
| `Engine/Actions/*.cs` | ~35 KB total | `engine/actions/Actions.ts` | 38 action classes | ✅ Done |
| `Engine/Tasks/TaskRemoveDecoration.cs` | 0.6 KB | `engine/tasks/TaskRemoveDecoration.ts` | | ✅ Done |
| `Engine/TextFile.cs` | 3 KB | `engine/TextFile.ts` | `fetch()` instead of `File.OpenText` | ✅ Done |
| `Engine/CSVParser.cs` | 6 KB | `web/scripts/convert-csv.js` | Converted to JSON build pipeline | ✅ Done |

### Key design change: `Rules.cs`

The C# `Rules` class is 4 440 lines but is **pure calculation logic** — no UI, no IO. It ports almost line-for-line into TypeScript. The main change is replacing `System.Drawing.Point` with our `Point` class and `System.Drawing.Color` with our `Color` class throughout.

TypeScript porting conventions (established while porting `Rules.cs`):

- C# `out string reason` overloads collapse into a single TS method returning `RuleResult { ok, reason }`; helpers `OK` (frozen) and `fail(reason)` are exported from `Rules.ts`.
- `IsBumpableFor` returns `BumpResult { action, reason }` with `NO_ACTION` / `noAction(reason)` helpers.
- `out`-returning results become `MoveLocationResult { ok, location }` and `DirectionResult { ok, direction }`.
- Because `game` is typed `any` in this layer, call sites must add `.ok` when testing a `RuleResult` as a boolean — TS will not catch mistakes there.

### Key design change: `InputTranslator.cs`

C# maps `System.Windows.Forms.Keys` enum values. In TypeScript we map browser `KeyboardEvent.key` strings to `PlayerCommand` enum values, using the same logical mapping.

---

## Phase 4 — Game Loop (RogueGame)

**Goal:** `RogueGame.cs` (955 KB, 23 233 lines) ported and running. The game is playable.  
**This is the largest single task in the whole project.**

### As implemented: one `engine/RogueGame.ts` class

The original decomposition table below was written before looking at how the
regions actually call each other. During porting (same argument that applied to
`BaseTownGenerator` and `BaseAI`), `RogueGame` is ported as a **single class**
in `web/src/engine/RogueGame.ts`, assembled from contiguous C# line-range slices:

* every `DoXXX` action, every `HandlePlayerXXX` command and every `Draw*` method
  reads/writes the same private fields (`m_Player`, `m_Session`, `m_Overlays`,
  `m_ViewRect`, …) — a split would make most of that state public and thread a
  `game` reference through ~500 call sites;
* player input → actions → rendering form a cycle (`DoTrade` waits for keys,
  `DoMeleeAttack` redraws), which would mean circular module imports.

**Tooling** (all gitignored, in `web/.porting/`): `roguegame-methods.txt` lists
all 516 top-level members with C# line numbers; `gen_stubs.py` turns the C# source into
`rg_consts.txt` / `rg_fields.txt` / `rg_stubs.txt` (signature-accurate TS stubs with
`out`-param returns, overload merges and the `game.doXxx()` aliases); `assemble_roguegame.py`
combines them with the hand-ported overlay types, constructor and getters into
`src/engine/RogueGame.ts`. Re-run both after regenerating, then `npm run type-check`.

| # | C# lines | Contents | Status |
|---|----------|----------|--------|
| scaffold | 1–1414 | Constants, fields, properties, init, messaging, `Run`/`GameLoop`, main menu | ✅ Ported (stubs for input/drawing helpers it calls) |
| 1 | 1415–2876 | Character creation, `StartNewGame`, credits, options, redefine keys | ✅ Ported |
| 2 | 2877–4154 | `AdvancePlay`, `NextMapTurn`, actor regen/counts, scents | ⬜ |
| 3 | 4156–5366 | Events (invasions, refugees, raids, drops) + spawning | ⬜ |
| 4 | 5367–10255 | FOV, `HandlePlayerActor` and all `HandlePlayerXXX` commands | ✅ Ported |
| 5 | 10256–12658 | AI actor handling, advisor, input helpers, describe-* | ✅ Ported |
| 6 | 12660–16790 | Action primitives `DoMoveActor` … `KillActor`, blood/corpses | ⬜ |
| 7 | 16791–17986 | Player death, new day/night, skills, infection/zombification | ✅ Ported |
| 8 | 17987–19723 | View, drawing, overlays, coordinates, visibility helpers | ⬜ |
| 9 | 19724–21381 | Save/load, paths, `GenerateWorld`, district maps, map switching | ⬜ |
| 10 | 21382–23233 | Sim thread, achievements, special events, reincarnation, dev/data | ⬜ |

The module table below is therefore **deferred to a post-Phase-4 refactor**
(Phase 8) — it stays as the target shape once the game runs and the real
cross-method dependencies are known.

### Decomposition plan

`RogueGame.cs` is a God class. During porting, split it into focused modules:

| New TS module | C# region(s) it covers | Approx lines |
|---------------|------------------------|--------------|
| `engine/GameLoop.ts` | Main game loop, turn scheduling, events | ~1 000 |
| `engine/GameRenderer.ts` | All `Draw*` methods (rendering the world, UI panels, messages) | ~3 500 |
| `engine/GameActions.ts` | Player + AI action execution (`DoMeleeAttack`, `DoMoveActor`, etc.) | ~6 000 |
| `engine/GameEvents.ts` | Spawning, death, infection, raids, refugees, NatGuard | ~3 000 |
| `engine/GameUI.ts` | All modal screens (main menu, inventory screen, skill screen, etc.) | ~4 000 |
| `engine/GameSave.ts` | Save / load (replaces .NET serialization) | ~500 |
| `engine/GameCheats.ts` | Cheat / debug commands | ~500 |
| `engine/GameScript.ts` | Scripted story events (uniques, CHAR HQ, etc.) | ~2 000 |

### Async game loop model

```typescript
// Replaces the C# blocking while loop on a background thread
async function gameLoop(ui: IRogueUI): Promise<void> {
  while (!session.isOver) {
    const actor = scheduler.nextActor();
    if (actor.isPlayer) {
      const key = await ui.UI_WaitKey();   // yields to browser
      handlePlayerInput(key, actor);
    } else {
      await aiTakeTurn(actor);
      await ui.UI_Wait(0);                 // yield every AI turn to avoid blocking
    }
    advanceTurn();
  }
}
```

### Verification

- New game starts, map generates, player can move with arrow keys
- At least one full day cycle runs without crash
- Zombie spawning and combat work

### Leftovers earlier phases parked for Phase 4

| Item | Where it stands today |
|------|-----------------------|
| `main.ts` | ✅ Wired to the real game: `new RogueGame(ui, new WebAudioMusicManager()).Run()`. Loading screens, main menu, character creation and rebind/hi-score/credits screens run in the browser; a `not yet ported:` throw is drawn on the canvas instead of dying in the console. |
| `OPTIONS_MODE` command | C# `case PlayerCommand.OPTIONS_MODE: HandleOptions(true); ApplyOptions(true);` (RogueGame.cs ≈5645). `RogueGame.HandleOptions()` owns the screen now; wiring the ingame command comes with slices 4–5 (`HandlePlayerXXX`). |
| `ApplyOptions` side update | C# re-derives `Scoring.Side` from the player (`m_Player.Model.Abilities.IsUndead`); `OptionsScreen.applyOptions()` refreshes the rating only, until a player exists. |
| `HandleRedefineKeys` | ✅ Ported (Phase 4 slice 1) — 51-entry rebind menu, `Keybindings.checkForConflict()`, C# `Set()` key stealing. |
| Music manager wiring | ✅ `main.ts` passes `WebAudioMusicManager` into the `RogueGame` constructor (defaults to `NullMusicManager` in tests/Node). |

---

## Phase 5 — World Generation & AI

**Goal:** All AI controllers and world generators ported.

### AI files

| C# file | Size | TS output | Notes | Status |
|---------|------|-----------|-------|--------|
| `Gameplay/AI/BaseAI.cs` | 245 KB | `gameplay/ai/BaseAI.ts` | Core AI behavior framework & algorithms | ✅ Done |
| `Gameplay/AI/ZombieAI.cs` | 11 KB | `gameplay/ai/ZombieAI.ts` | Complete zombie AI (scents, corpse-eating, chasing) | ✅ Done |
| `Gameplay/AI/SkeletonAI.cs` | 2 KB | `gameplay/ai/SkeletonAI.ts` | Skeleton AI (chasing, idle, wander) | ✅ Done |
| `Gameplay/AI/CivilianAI.cs` | 39 KB | `gameplay/ai/CivilianAI.ts` | | ✅ Done |
| `Gameplay/AI/OrderableAI.cs` | 20 KB | `gameplay/ai/OrderableAI.ts` | | ✅ Done |
| `Gameplay/AI/GangAI.cs` | 20 KB | `gameplay/ai/GangAI.ts` | | ✅ Done |
| `Gameplay/AI/SoldierAI.cs` | 14 KB | `gameplay/ai/SoldierAI.ts` | | ✅ Done |
| `Gameplay/AI/CHARGuardAI.cs` | 10 KB | `gameplay/ai/CHARGuardAI.ts` | | ✅ Done |
| `Gameplay/AI/InsaneHumanAI.cs` | 9 KB | `gameplay/ai/InsaneHumanAI.ts` | | ✅ Done |
| `Gameplay/AI/FeralDogAI.cs` | 7 KB | `gameplay/ai/FeralDogAI.ts` | | ✅ Done |
| `Gameplay/AI/RatAI.cs` | 6 KB | `gameplay/ai/RatAI.ts` | | ✅ Done |
| `Gameplay/AI/SewersThingAI.cs` | 5 KB | `gameplay/ai/SewersThingAI.ts` | | ✅ Done |
| `Gameplay/AI/LOSSensor.cs` | 2 KB | `gameplay/ai/GameplaySensors.ts` | Combined into GameplaySensors.ts | ✅ Done |
| `Gameplay/AI/SmellSensor.cs` | 2 KB | `gameplay/ai/GameplaySensors.ts` | Combined into GameplaySensors.ts | ✅ Done |
| `Gameplay/AI/ExplorationData.cs` | 5 KB | `gameplay/ai/ExplorationData.ts` | Visited location/zone tracking | ✅ Done |
| `Gameplay/AI/Sensors/LOSSensor.cs` | 4 KB | `gameplay/ai/GameplaySensors.ts` | Combined into GameplaySensors.ts | ✅ Done |
| `Gameplay/AI/Sensors/SmellSensor.cs` | 4 KB | `gameplay/ai/GameplaySensors.ts` | Combined into GameplaySensors.ts | ✅ Done |
| `Gameplay/AI/Tools/RouteFinder.cs` | 11 KB | `gameplay/ai/RouteFinder.ts` | A* reachability checker | ✅ Done |

#### BaseAI decomposition

**As implemented:** `BaseAI.cs` (6 422 lines / 245 KB) is ported as a **single**
`gameplay/ai/BaseAI.ts` (4 402 lines, all 184 methods), rather than being split into
`behaviours/` files. The subclass split (`ZombieAI`, `CivilianAI`, …) already gives the
useful separation; a further split would only add cross-file plumbing for the many
`protected` members and the `m_Taboo*` / `m_RouteFinder` state they share.

The port was produced in 13 contiguous slices (`web/.porting/baseAI_part*.ts`, gitignored)
and spliced in by `web/.porting/merge.ps1`, which also de-duplicates the imports.

#### Known gaps left by the BaseAI port

These are the only symbols `BaseAI.ts` could not resolve; everything else type-checks.

| Gap | Owner |
|-----|-------|
| `game.DoEmote` / `game.DoMakeAggression` / `game.DoSay` | Phase 4 — `RogueGame` |
| `game.GameItems.MEDIKIT` / `game.GameItems.EMPTY_CAN` | Phase 4 — needs a `GameItems` singleton on the game object |
| `isSoldier()` uses a `faction.id === FactionID.TheArmy` fallback | ✅ resolved — `SoldierAI.ts` now exists |
| `Map.isOnMapBorder` / `trimToBounds` / `countAdjacentInMap` | ✅ `Map.isOnMapBorder` added to `data/Map.ts`; the others stay inlined at their call sites |
| `Actor.isBoredOf` / `addBoringItem` / `getEquippedRangedWeapon` | ✅ added to `data/Actor.ts` |
| `Actions.SayFlags`, `Actions.FireMode` | ✅ corrected to match `RogueGame.Sayflags` / `Data/Attack.cs` |

### Generator files

| C# file | Size | TS output | Notes | Status |
|---------|------|-----------|-------|--------|
| `Engine/MapGenerator.cs` | 507 lines | `engine/MapGenerator.ts` | Shared `TileFill` / `MapObjectPlace` / `ActorPlace` helpers | ✅ Done |
| `Gameplay/Generators/BaseMapGenerator.cs` | 43 KB | `gameplay/generators/BaseMapGenerator.ts` | Dressing, skills, map objects, item factories | ✅ Done |
| `Gameplay/Generators/BaseTownGenerator.cs` | 243 KB | `gameplay/generators/BaseTownGenerator.ts` (5 814 lines) | Single class — see note below | ✅ Done |
| `Gameplay/Generators/StdTownGenerator.cs` | 4 KB | `gameplay/generators/StdTownGenerator.ts` | Surface/sewers population | ✅ Done |

#### BaseTownGenerator — as implemented

The suggested decomposition into `TownLayout` / `BuildingGenerator` / `ShopGenerator` /
`SubwayGenerator` / `SewersGenerator` / `PopulationGenerator` was **not** taken: the C#
file is one class whose methods freely call each other across regions (buildings → rooms →
items → actors → exits/zones) and share `m_DiceRoller` / `m_SurfaceBlocks` / `m_Params`
state, so a split would need every helper promoted to public plumbing.

It is instead ported as **one class**, exactly like `BaseAI.ts` (see the note above):
`gameplay/generators/BaseTownGenerator.ts` (5 814 lines, all 88 C# methods + 5 small
.NET-helper ports: `Rectangle.Intersect`/`IsEmpty`, `string.GetHashCode`, `Map.HasAnExitIn`).
`StdTownGenerator` subclasses it (`generate`, `generateSewersMap`, `generateSubwayMap`).

Built as 8 contiguous slices (`/tmp/opencode/parts/p0..p7*.ts`, transient) and spliced into
one file; 2 independent audits compared the C# regions against the port and found only
3 LOW findings (see commit message).

**Known leftovers (same class as the BaseAI gaps):** unported `RogueGame` members are
called as `this.m_Game.<PascalCase>` — `ApplyOnFire`, `SkillUpgrade`, `ZombifySkill`,
`NextUndeadEvolution` — and the `RogueGame.NAME_*` / day constants are inlined in the
generator file. They resolve when Phase 4 ports `RogueGame`.

---

## Phase 6 — Audio

**Goal:** Replace DirectX / SFML audio with the Web Audio API.

### Files to replace

| C# file | Replacement |
|---------|-------------|
| `Engine/IMusicManager.cs` | `engine/audio/IMusicManager.ts` (interface) |
| `Engine/ISoundManager.cs` | `engine/audio/ISoundManager.ts` (interface) |
| `Engine/NullSoundManager.cs` | `engine/audio/NullSoundManager.ts` (no-op, default) |
| `Engine/MDXSoundManager.cs` | ❌ Drop (DirectX — browser has no equivalent) |
| `Engine/SFMLSoundManager.cs` | ❌ Drop (SFML native — browser has no equivalent) |
| *(new)* | `engine/audio/WebAudioSoundManager.ts` (Web Audio API) |
| *(new)* | `engine/audio/WebAudioMusicManager.ts` (streaming MP3/OGG) |

### Audio asset format

Sound effects → `.ogg` (compressed, widely supported)  
Music → `.ogg` / `.mp3` (streaming via `<audio>` element)

---

## Phase 7 — Save / Load

**Goal:** Replace .NET `BinaryFormatter` / XML serialization with browser-native persistence.

### C# serialization used

| C# class | C# mechanism | Browser replacement |
|----------|-------------|-------------------|
| `Session` | `BinaryFormatter` | `JSON.stringify` + `localStorage` / IndexedDB |
| `GameOptions` | Custom text file | `localStorage` (JSON) |
| `Keybindings` | Custom text file | `localStorage` (JSON) |
| `HiScoreTable` | Custom text file | `localStorage` (JSON) |

### Save format

```typescript
interface SaveFile {
  version: string;         // "alpha10.1-ts-port"
  timestamp: number;
  session: SerializedSession;
  options: GameOptions;
}
```

Saved to `localStorage["rogueSurvivor_save_0"]` through `["_save_9"]` (10 slots, matching the C# slots).

Large saves (> 5 MB) overflow to **IndexedDB**.

---

## Phase 8 — Polish, Headless Simulation & Deployment

**Goal:** Feature-complete, tested, deployable, with a robust headless simulation harness for game balance and AI verification.

### Tasks

- [ ] Responsive canvas scaling (CSS `aspect-ratio` + `object-fit`)
- [ ] PWA manifest + service worker (offline play)
- [ ] Docker image for self-hosted server
- [ ] GitHub Actions CI: `npm run type-check` + `npm run build` on every push
- [ ] Extract + optimise all sprite PNGs from C# embedded resources
- [ ] Audio: normalise volume levels
- [ ] Performance pass: profile tile rendering (target 60fps on a 21×21 view)
- [ ] Mobile / touch support (optional — original was keyboard-only)

### Headless Simulation & Advanced Testing Plan

To ensure simulation fidelity and parity with the C# version without requiring a browser or DOM/Canvas context, Phase 8 includes a dedicated headless simulator and automated test harness:

1. **Headless Simulator (`web/src/sim/HeadlessRunner.ts`)**:
   - Runs game loops and AI ticks entirely in Node.js using a mock `IRogueUI` (`NullRogueUI`).
   - Supports automated stress runs (e.g., simulating 1,000+ world turns across generated town maps).
   - Metrics collection: actor survival rates, zombie infection spread, pathfinding efficiency, and combat balance.
   - Useful for regression testing AI behavior changes and balance tweaks.

2. **Expanded Testing Strategy (Vitest + Headless Integration)**:
   - **AI Behaviour Tests**: Verify zombie pursuit, line-of-sight tracking, scent aggregation, and civilian self-preservation in isolated map scenarios.
   - **Generator Integrity Tests**: Validate that town generators, building generators, and sewer networks consistently output fully reachable nav-graphs without deadlocks or out-of-bounds errors.
   - **Save/Load Roundtrip Tests**: Serialize a complex running game state to JSON, deserialize it, and assert deep-equality across actors, items, maps, and world clocks.

---

## Cross-Cutting Concerns

### No `System.Drawing` in engine

All `System.Drawing.Point`, `Rectangle`, and `Color` usages are replaced by our own classes in `engine/`. This is applied uniformly across every phase.

### Namespace mapping

| C# namespace | TS directory |
|-------------|-------------|
| `djack.RogueSurvivor.Data` | `data/` |
| `djack.RogueSurvivor.Engine` | `engine/` |
| `djack.RogueSurvivor.Engine.Actions` | `engine/actions/` |
| `djack.RogueSurvivor.Engine.Items` | `engine/items/` |
| `djack.RogueSurvivor.Engine.MapObjects` | `engine/mapobjects/` |
| `djack.RogueSurvivor.Engine.Tasks` | `engine/tasks/` |
| `djack.RogueSurvivor.Engine.AI` | `engine/ai/` |
| `djack.RogueSurvivor.Gameplay` | `gameplay/` |
| `djack.RogueSurvivor.Gameplay.AI` | `gameplay/ai/` |
| `djack.RogueSurvivor.Gameplay.Generators` | `gameplay/generators/` |
| `djack.RogueSurvivor.UI` | `ui/` |

### String formatting

C# `string.Format("{0} hits {1} for {2} damage", a, b, n)` → TS template literals `` `${a} hits ${b} for ${n} damage` ``.

### C# `enum` flags

C# `[Flags] enum` → TypeScript `const enum` + bitwise ops. E.g.:

```typescript
export const enum ActorFlags {
  None       = 0,
  IsUnique   = 1 << 0,
  IsProperName = 1 << 1,
  IsDead     = 1 << 3,
  IsRunning  = 1 << 4,
  IsSleeping = 1 << 5,
}
```

### C# `[Serializable]` attribute

Ignored. Instead, every class that needs persistence gets a `serialize(): SomeDTO` and static `deserialize(dto: SomeDTO): SomeClass` method pair.

### C# operator overloading

C# has `public static Point operator +(Point lhs, Direction rhs)`. TypeScript has no operator overloading — replaced with named methods: `direction.applyTo(point)`.

---

## Testing Strategy

### Phase 1–3: Unit tests (Vitest)

```bash
npm run test          # Vitest unit tests
npm run test:watch    # Watch mode
```

Target coverage:
- `DiceRoller` — distribution, seeding, reproducibility
- `WorldTime` — all 24 hours, strike of midnight/midday
- `Direction` — all 8 directions, opposite, left, right
- `LOS` — line tracing, FOV correctness vs known maps
- `Rules` — combat formulas, movement checks

### Phase 4+: Integration / smoke tests

- New game generates without crash
- 100 AI turns run without exception
- Save → reload → state unchanged
- All menu screens navigate without error

---

## Asset Pipeline

Game sprites are embedded as `.png` files in the C# `.csproj`. They need to be:

1. **Extracted** from the project resources
2. **Placed** under `web/public/assets/` with forward-slash paths
3. **Referenced** by the same ID strings as `GameImages.cs` constants

### Path mapping example

| C# constant | C# value | Browser URL |
|------------|---------|-------------|
| `TILE_FLOOR_ASPHALT` | `"Tiles\\floor_asphalt"` | `/assets/Tiles/floor_asphalt.png` |
| `OBJ_WOODEN_DOOR_CLOSED` | `"MapObjects\\wooden_door_closed"` | `/assets/MapObjects/wooden_door_closed.png` |
| `ICON_BLAST` | `"Icons\\blast"` | `/assets/Icons/blast.png` |

`CanvasUI.ts` normalises backslashes to forward-slashes automatically:
```typescript
const src = `/assets/${imageId.replace(/\\/g, "/")}.png`;
```

No image conversion is needed — all sprites are already PNG.

---

## Summary Timeline

| Phase | Scope | Key output | Status |
|-------|-------|-----------|--------|
| 1 | Scaffold + primitives | Dev server, `CanvasUI`, type-safe foundation | ✅ Complete |
| 2 | Data layer | All game objects typed, `Map`/`Actor` working | ✅ Complete |
| 3 | Engine core | Rules, LOS, Session, Scoring, GameOptions + `ui/OptionsScreen.ts` (from `RogueGame.HandleOptions`) | ✅ Complete |
| 4 | Game loop | **Playable game** (new game, move, attack, die) | ⏳ Planned |
| 5 | AI + generators | `BaseAI`, all 11 AI controllers, all 4 generator files (5 814-line `BaseTownGenerator`) | ✅ Complete |
| 6 | Audio | Sound effects and music | ✅ Complete |
| 7 | Save / load | Persistent saves via localStorage / IndexedDB | ✅ Complete |
| 8 | Polish | PWA, CI, headless simulator, test harness, deployment | ⏳ Planned |

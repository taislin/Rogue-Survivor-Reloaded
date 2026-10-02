import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { Map as GameMap } from "@data/Map";
import { District, DistrictKind } from "@data/District";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeLibraryBuilding } from "@gameplay/generators/buildings/makeLibraryBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.Library` — the C#'s `MakeLibraryBuilding`
 * (`BaseTownGenerator.cs:1908-2185`) and the pass in
 * `BaseTownGenerator.generate()` that reaches it.
 *
 * Six things worth pinning, and none of them is "the walls are the right colour":
 *
 * 1. **The dispatch reaches it.** A generator that compiles, is imported and is
 *    called from nowhere produces a district with no library in it and no diff a
 *    reader can see. So the first test counts the stage calls from a subclass and
 *    then looks for a `Library@` zone on a district.
 * 2. **The library spends no dispatch die, and a library's block is not also
 *    charged the business cascade's `roll(0, 4)`.** The library is the `if`
 *    *above* that `switch` in the C# (`:501` vs `:510`), not a case in it, which
 *    is the one place the bar and the bank could not help with — they share the
 *    roll. So this is asserted in the only two ways it can be: the block the
 *    library takes leaves the pool (the cascade is offered one block fewer), and
 *    a library the C# *declines* draws from the roller not at all.
 * 3. **The size precondition is the C#'s, exactly.** `InsideRect < 10` returns
 *    false with the block untouched, and `InsideRect == 10` builds. A block of
 *    `n` has an inside rect of `n - 4`, so the boundary block is 14x14 and a
 *    13x13 block is under it — the off-by-four the bank test has the same shape
 *    of assertion for.
 * 4. **The room is a room.** Walls on `buildingRect`, `countAdjDoors` non-zero
 *    just inside the door, and a flood fill at *object* level — a library whose
 *    shelf grid sealed the aisle it was built around passes every weaker check.
 * 5. **The one-per-district cap.** C# `:501`'s `!hasLibrary`. It is a `ref bool`
 *    the C# declares per district, so it is also the one place a port that keeps
 *    its state in a module-level variable can leak across districts, and a test
 *    that only ever generates one district cannot see that.
 * 6. **CLASSIC is byte-identical.** The half that matters. A gate that ran *after*
 *    a roll would leave every Classic world one die short of the Still Alive one,
 *    which invalidates every saved game for no visible reason. So the Classic
 *    fingerprint is a committed value, and what makes it non-vacuous is the Still
 *    Alive fingerprint for the same seed: it must differ, and differ for the
 *    reason the feature exists.
 */

const rules = new Rules(new DiceRoller(20250929));
// The model databases register themselves into `Models` statics on construction,
// and `generate()` reaches all four: a shop drops items, a house basement
// spawns a rat, and every actor factory needs a faction.
beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameItems();
  new GameFactions();
});

/**
 * A 60x60 district. Not 40x40 like the bank test: `makeBlocks` cuts a 40x40 into
 * six blocks whose tallest inside rect is 9, and the C#'s floor is 10, so a 40x40
 * district can *never* have a library and every district-level assertion here
 * would pass vacuously. A 60x60 cuts blocks with inside rects up to 11x19, so
 * the feature is reachable and the CLASSIC/Still Alive comparison has something
 * to compare.
 */
const MAP = 60;
const SEED = 1;

/**
 * A 60x60 Still Alive seed that builds a library, for the tests that assert on a
 * library's *contents* and so cannot sweep.
 *
 * `SEED` still drives the Classic digest pins and the Classic no-trace test, which
 * is why this is a second constant rather than a change to `SEED`.
 *
 * **It is swept, not chosen.** Since the business region is one loop again (C#
 * `:472-536`), the library at `:501` is offered only the blocks that entered on
 * `RollChance(CHARBuildingChance)` — about one in ten — instead of the whole pool
 * the old library *pass* was handed. At 60x60 only 5 of the first 60 seeds build
 * one at all, so a pinned seed here is a real pin: the sweep is
 * `library-building.test.ts` -> "offers the library a block, and a district gets
 * one library", which reports the seed it used.
 *
 * Seed 24 is chosen over the four others that work because it is the only one of
 * the five that also builds two cascade arms, so "a library's block is never also
 * a bar, a bank or a clinic" has something to be false about in the same district.
 */
const LIBRARY_SEED = 24;

function newParams(width = MAP, height = MAP): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = height;
  return params;
}

/** `m_Game` is `any` in the port; the generator calls `ApplyOnFire` on it. */
function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * Counts the *attempts*, which is what the library is now.
 *
 * **It used to count a stage.** `makeLibraryBuildings(map, emptyBlocks)` was a
 * pool pass of its own, between the CHAR loop and the cascade, and the spy
 * recorded how many blocks entered it and how many left. Both numbers are gone
 * with it: the business region is one loop again (C# `:472-536`), so the library
 * is a per-block attempt at `:501` rather than a stage, and there is no pool
 * boundary left to observe.
 *
 * `blocksAtEntry`/`blocksAfter` were standing in for "a library's block is not
 * also charged the cascade's `roll(0, 4)`", which the nested `if` now guarantees
 * structurally. That property is asserted directly, from the map, in
 * "a library's block is never also a bar, a bank or a clinic" below -- which is
 * the better test anyway, since it does not care how the control flow is spelled.
 */
class LibrarySpy extends BaseTownGenerator {
  attempts = 0;
  built = 0;

  protected override tryMakeLibrary(map: GameMap, b: Block): boolean {
    ++this.attempts;
    const placed = super.tryMakeLibrary(map, b);
    if (placed) ++this.built;
    return placed;
  }
}

function newSpy(params = newParams()): LibrarySpy {
  return new LibrarySpy({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * A generator with the feature *removed*, not merely gated off: the attempt is
 * overridden away, so no roll is taken and no building is built. A Classic
 * district from this must be byte-identical to a Classic district from the real
 * class, and the only way that can fail is something in the stage running anyway.
 */
class NoLibraries extends BaseTownGenerator {
  protected override tryMakeLibrary(): boolean {
    // no build, and no roll to throw away either
    return false;
  }
}

function newNoLibraries(params = newParams()): NoLibraries {
  return new NoLibraries({ rules, ApplyOnFire: () => undefined } as never, params);
}

/**
 * A `TownBuildingContext` with the generator's real placement primitives, rather
 * than a re-declaration of them: the delegates are private on
 * `BaseTownGenerator`, so a stub in `TOWN_BUILDING_PASSES` is the only way to get
 * the genuine article. Captured under CLASSIC so the capture costs the generator
 * no library.
 */
let borrowedContext: TownBuildingContext | null = null;
function contextFor(map: GameMap, block: Block, roller: DiceRoller): TownBuildingContext {
  if (!borrowedContext) throw new Error("captureContext() first");
  return { ...borrowedContext, map, block, roller };
}
function captureContext(): void {
  const saved = TOWN_BUILDING_PASSES.slice();
  let captured: TownBuildingContext | null = null;
  TOWN_BUILDING_PASSES.push({
    csharpName: "MakeBorrowContextBuilding",
    tryBuild: (ctx) => {
      captured ??= ctx;
      return false;
    },
  });
  try {
    Session.get().ruleset = Ruleset.CLASSIC;
    newGenerator().generate(SEED);
  } finally {
    TOWN_BUILDING_PASSES.length = 0;
    TOWN_BUILDING_PASSES.push(...saved);
  }
  expect(captured).not.toBeNull();
  borrowedContext = captured as unknown as TownBuildingContext;
}
beforeAll(captureContext);

/**
 * A roller that answers from a script and *records what it was asked*, which is
 * how "the C#'s roll order" and "a decline costs no die" are both asserted. An
 * unscripted `roll` returns `min` and an unscripted `rollChance` is `false`, so
 * the fallbacks are deterministic without inventing randomness.
 */
class ScriptedRoller {
  private readonly rolls: number[];
  private readonly chances: boolean[];
  /** Every call, in order, as `roll:min-max` or `chance:n`. */
  readonly log: string[] = [];

  constructor(rolls: readonly number[] = [], chances: readonly boolean[] = []) {
    this.rolls = [...rolls];
    this.chances = [...chances];
  }

  roll(min: number, max: number): number {
    this.log.push(`roll:${min}-${max}`);
    return this.rolls.length > 0 ? (this.rolls.shift() as number) : min;
  }

  rollChance(chance: number): boolean {
    this.log.push(`chance:${chance}`);
    return this.chances.length > 0 ? this.chances.shift() === true : false;
  }

  asRoller(): DiceRoller {
    return this as unknown as DiceRoller;
  }
}

/** A fresh map, grass all over, for one building to stand on. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  return map;
}

/**
 * The horizontal-alley block: 20x14 at (1,1), so
 * `buildingRect = (2, 2, 18, 12)` and `insideRect = (3, 3, 16, 10)` with its
 * right edge at 19 and its bottom edge at 13, and `midX`/`midY` are 11/8. Wide
 * enough for the C#'s 10x10 floor, and `20 >= 14` is what makes the aisles run
 * east-west, so the door is a west or east one.
 */
const WIDE = new Rect(1, 1, 20, 14);

/**
 * The vertical-alley twin: 15x21 at (1,1), so `buildingRect = (2, 2, 13, 19)` and
 * `insideRect = (3, 3, 11, 17)`, `midX`/`midY` are 8/11, and `15 < 21` is what
 * makes the aisles run north-south. Inside is 11 wide, so it is over the C#'s
 * 10x10 floor but under the 12 that buys a *third* door — which is the boundary
 * worth having on this side of the method.
 */
const TALL = new Rect(1, 1, 15, 21);

/** The smallest block the C# builds on: inside 10x10, so 14x14. */
const BOUNDARY = new Rect(1, 1, 14, 14);

function libraryZones(map: GameMap): string[] {
  return map.zones.map((z) => z.name).filter((n) => n.startsWith("Library@"));
}

/** The block a `Library@x-y` zone was cut from, as a fresh `Block`. */
function blockOf(zone: { bounds: Rect }): Block {
  const b = zone.bounds;
  return new Block(new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2));
}

/**
 * Everything a library can leave on a district, as one sorted list. Any of these
 * appearing under CLASSIC is the bug the feature gate exists to prevent, and
 * listing them rather than counting `Library@` zones means a library that somehow
 * lost its zone is still caught.
 */
function libraryTraces(map: GameMap): string[] {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj && /bookshelves|cash_register/.test(obj.imageId)) out.push(`object ${obj.imageId}@${x},${y}`);
      for (const deco of map.getTileAt(x, y)!.getDecorations ?? [])
        if (deco === GameImages.DECO_LIBRARY) out.push(`deco ${deco}@${x},${y}`);
    }
  }
  return out.sort();
}

/** Every tile's model, its map object, its decorations and its inside flag. */
function fingerprint(map: GameMap): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const tile = map.getTileAt(x, y)!;
      const obj = map.getMapObjectAt(x, y);
      const cell = `${tile.model.id}|${obj ? obj.imageId : "-"}|${(tile.getDecorations ?? []).join(",")}|${
        tile.isInside ? 1 : 0
      }`;
      for (let i = 0; i < cell.length; i++) {
        h1 = Math.imul(h1 ^ cell.charCodeAt(i), 16777619) >>> 0;
        h2 = (Math.imul(h2 + cell.charCodeAt(i) + i, 2654435761) ^ (h2 >>> 7)) >>> 0;
      }
    }
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Interior cells reachable from `from`, ignoring nothing.
 *
 * Unlike the bank test's tile-level fill, this one asks `map.isWalkable`, so a
 * bookcase blocks: a library whose shelf rows met each other would fill the hall
 * and still have a floor, a door and a zone.
 */
function reachable(map: GameMap, from: Point, rect: Rect): Point[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const seen = new Set<string>([key(from.x, from.y)]);
  const queue: Point[] = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const next of [new Point(p.x + 1, p.y), new Point(p.x - 1, p.y), new Point(p.x, p.y + 1), new Point(p.x, p.y - 1)]) {
      const k = key(next.x, next.y);
      if (seen.has(k) || !rect.contains(next) || !map.isWalkable(next.x, next.y)) continue;
      seen.add(k);
      queue.push(next);
    }
  }
  return [...seen].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return new Point(x, y);
  });
}

/** Interior cells with nothing standing on them, as `x,y`. */
function floorCells(map: GameMap, rect: Rect): string[] {
  const out: string[] = [];
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) if (!map.getMapObjectAt(x, y)) out.push(`${x},${y}`);
  }
  return out;
}

/** The cells of a rect holding something, as `imageId@x,y`. */
function objectsIn(map: GameMap, rect: Rect, imageId?: string): string[] {
  const out: string[] = [];
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj && (!imageId || obj.imageId === imageId)) out.push(`${obj.imageId}@${x},${y}`);
    }
  }
  return out.sort();
}

/** Every ground item in a rect, as its model's image id. */
function itemsIn(map: GameMap, rect: Rect): string[] {
  const out: string[] = [];
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) {
      const inv = map.getItemsAt(new Point(x, y));
      if (inv) for (const it of inv.items) out.push(it.model.imageId);
    }
  }
  return out;
}

const originalRuleset = Session.get().ruleset;
afterEach(() => {
  Session.get().ruleset = originalRuleset;
});

// ── Reached from the district generator ─────────────────────────────────────

describe("library building, from BaseTownGenerator.generate()", () => {
  it("offers the library a block, and a district gets one library", () => {
    // **The district is swept, not pinned.** The library is now reached only from
    // inside the business region (C# `:501`), so it is offered only the blocks that
    // entered on `RollChance(CHARBuildingChance)` -- about one in ten. A 60x60 cuts
    // a handful of blocks, so which *seed* yields a library is a property of the
    // dice and not of the feature, and pinning one turns "the pass is reached" into
    // a claim about a stream. The sweep reports the seed it used.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    let seed = 0;
    let map: GameMap | null = null;
    let spy: LibrarySpy | null = null;
    for (let s = 1; s <= 60; s++) {
      const attempt = newSpy();
      const candidate = attempt.generate(s);
      if (map === null || libraryZones(candidate).length > libraryZones(map).length) {
        seed = s;
        spy = attempt;
        map = candidate;
      }
      if (libraryZones(candidate).length) break;
    }
    expect(spy, "no district in the sweep offered the library a block it could take").not.toBeNull();
    expect(spy!.attempts, "generate() offered the library at least one block").toBeGreaterThan(0);

    // C# `:501`'s `hasLibrary` cap: one per district, however many eligible blocks
    // the district cuts.
    const names = libraryZones(map!);
    expect(names, `seed ${seed}`).toHaveLength(1);
    // Named `Library` by the C# at `:2035` and made unique by `makeUniqueZone`,
    // which appends the block's centre as `Library@x-y`.
    expect(names[0]).toMatch(/^Library@\d+-\d+$/);
  });

  it("a library's block is never also a bar, a bank or a clinic", () => {
    // C# `:499-509`. The library is the `if` *above* the cascade's `Roll(0, 4)`:
    // a block it takes is a block whose dispatch die is never spent, so it cannot
    // also become one of the switch's four arms.
    //
    // **This used to be asserted as pool arithmetic** — how many blocks entered the
    // library stage and how many left it — back when the library was a pass and the
    // cascade iterated whatever it left behind. It is now a nested `if`, so the
    // property is visible on the map: the library's rect carries a `Library@` zone
    // and none of the arms' zones. That holds however the control flow is spelled,
    // which the pool version did not.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const ARMS = ["Bar@", "Bank@", "Clinic@", "GeneralStore@", "Business@"];
    let checked = 0;
    for (let s = 1; s <= 60; s++) {
      const map = newGenerator().generate(s);
      for (const zone of map.zones.filter((z) => z.name.startsWith("Library@"))) {
        ++checked;
        for (const other of map.zones) {
          if (!ARMS.some((p) => other.name.startsWith(p))) continue;
          expect(
            other.bounds.equals(zone.bounds),
            `seed ${s}: ${zone.name} shares its rect with ${other.name}`
          ).toBe(false);
        }
      }
    }
    expect(checked, "no library was built in the sweep, so nothing was checked").toBeGreaterThan(0);
  });

  it("walls the building rect, carpets the inside, and leaves the room reachable from its door", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = newGenerator().generate(LIBRARY_SEED);
    expect(libraryZones(map), `seed ${LIBRARY_SEED} builds no library`).not.toEqual([]);
    const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
    const wall = Models.tiles.get(TileID.WALL_LIGHT_BROWN)!;
    const carpet = Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!;

    for (const zone of map.zones.filter((z) => z.name.startsWith("Library@"))) {
      const b = blockOf(zone);
      expect(zone.bounds.equals(b.buildingRect)).toBe(true);

      // The perimeter is wall, except at the doorways: `placeDoor` lays the floor
      // tile *under* the door, which is the whole reason it is ordered that way
      // (`TownBuilding.placeDoor`).
      const doorsOnWall: Point[] = [];
      for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
        for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
          const onEdge =
            x === b.buildingRect.left ||
            x === b.buildingRect.right - 1 ||
            y === b.buildingRect.top ||
            y === b.buildingRect.bottom - 1;
          if (!onEdge) continue;
          const tile = map.getTileAt(x, y)!;
          if (tile.model === wall) continue;
          // The C# lays blue carpet under its second "window" door at `:2056` and
          // walkway under the real ones, so both are doorways and neither is
          // wall.
          expect([walkway, carpet], `perimeter ${x},${y} is wall or a doorway`).toContain(tile.model);
          if (map.getMapObjectAt(x, y) instanceof DoorWindow) doorsOnWall.push(new Point(x, y));
        }
      }
      // C# `:1983-1988` puts one door on the chosen side, a second if the shop is
      // long enough, and a third past 12; `:2056` adds a fourth on a rolled side
      // if that side is still solid. On this district the first three stand and
      // the rolled side landed back on the entrance, so the C#'s `IsWalkable`
      // test refused it — see `skips the second glass door when the roll lands on
      // the entrance` for the same check in isolation.
      expect(doorsOnWall.length).toBeGreaterThanOrEqual(1);
      for (const door of doorsOnWall) {
        expect(map.getMapObjectAtPoint(door)!.imageId, "glass, C# :1983").toBe(GameImages.OBJ_GLASS_DOOR_CLOSED);
      }

      // The inside is blue carpet and flagged inside, so the darkness and the AI
      // both treat it as a room.
      for (let x = b.insideRect.left; x < b.insideRect.right; x++) {
        for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
          const tile = map.getTileAt(x, y)!;
          expect(tile.model, `inside ${x},${y}`).toBe(carpet);
          expect(tile.isInside, `inside ${x},${y} flagged`).toBe(true);
        }
      }

      // The room is not sealed: step in off a door, and the tile there is floor, it
      // can see a door, and the *object*-level flood fill gets across the whole
      // inside rect — shelves block, so this is the aisle-and-gaps claim rather
      // than "there is carpet".
      const door = doorsOnWall[0];
      let inward: Point;
      if (door.x === b.buildingRect.left) inward = new Point(door.x + 1, door.y);
      else if (door.x === b.buildingRect.right - 1) inward = new Point(door.x - 1, door.y);
      else if (door.y === b.buildingRect.top) inward = new Point(door.x, door.y + 1);
      else inward = new Point(door.x, door.y - 1);
      expect(map.isWalkable(inward.x, inward.y), `inside the door at ${inward}`).toBe(true);
      expect(borrowedContext!.countAdjDoors(map, inward.x, inward.y)).toBeGreaterThanOrEqual(1);

      // The room is not sealed. `reachable` asks `map.isWalkable`, so a bookcase
      // and the checkout block: the claim is that the *aisle network* is one
      // connected piece and reaches every cell of bare floor, not that the room is
      // empty. A library whose shelf rows met each other passes a tile-level fill
      // and fails this one.
      const floor = floorCells(map, b.insideRect);
      const walkable = new Set(reachable(map, inward, b.insideRect).map((p) => `${p.x},${p.y}`));
      const unreachable = floor.filter((k) => !walkable.has(k));
      expect(unreachable, "floor the door cannot reach").toEqual([]);
      expect(floor.length, "most of the inside rect is aisle, not bookcase").toBeGreaterThan(
        (b.insideRect.width * b.insideRect.height) / 2
      );
    }
  });

  it("names the zone with the C#'s MakeUniqueZone formula, and adds that block's four walkways", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (const map of [newGenerator().generate(LIBRARY_SEED), newGenerator().generate(7), newGenerator().generate(42)]) {
      for (const zone of map.zones.filter((z) => z.name.startsWith("Library@"))) {
        const b = zone.bounds;
        // C# `:2178`: `MakeUniqueZone("Library", b.BuildingRect)`, and
        // `makeUniqueZone` (BaseMapGenerator.ts:1592) is
        // `${basename}@${left + floor(width/2)}-${top + floor(height/2)}`.
        expect(zone.name).toBe(`Library@${b.left + Math.floor(b.width / 2)}-${b.top + Math.floor(b.height / 2)}`);
        // C# `:2180`, around this block and no other.
        const outer = new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2);
        const within = (r: Rect): boolean =>
          r.left >= outer.left && r.top >= outer.top && r.right <= outer.right && r.bottom <= outer.bottom;
        expect(map.zones.filter((z) => z.name.startsWith("walkway@") && within(z.bounds))).toHaveLength(4);
      }
    }
  });

  it("gives the library its bookcases, a book on each of them, its counter and its sign", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = newGenerator().generate(LIBRARY_SEED);
    const zone = map.zones.find((z) => z.name.startsWith("Library@"))!;
    const b = blockOf(zone);

    const shelves = objectsIn(map, b.insideRect, GameImages.OBJ_BOOK_SHELVES);
    expect(shelves.length, "a grid of bookcases").toBeGreaterThan(0);
    for (const at of shelves) expect(map.getMapObjectAt(...(at.split("@")[1].split(",").map(Number) as [number, number]))!.name).toBe("shelf");

    // C# `:2066-2074`: one book per bookcase, and the model is the C#'s three
    // coloured novels rather than the port's single vanilla book.
    const books = itemsIn(map, b.insideRect);
    expect(books.length, "a book on every bookcase, C# :2074").toBe(shelves.length);
    for (const book of books) expect([GameImages.ITEM_BOOK_BLUE, GameImages.ITEM_BOOK_GREEN, GameImages.ITEM_BOOK_RED]).toContain(book);

    // C# `:2169-2170`, and the sign from `DecorateOutsideWalls` at `:2036`.
    expect(objectsIn(map, b.insideRect, GameImages.OBJ_CASH_REGISTER)).toHaveLength(1);
    expect(libraryTraces(map).some((t) => t.includes(GameImages.DECO_LIBRARY))).toBe(true);
  });
});

// ── The generator itself ────────────────────────────────────────────────────

describe("makeLibraryBuilding", () => {
  it("returns false and touches nothing when the inside rect is under 10x10", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // A 13x13 block has a 9x9 inside rect, so the size check is what refuses.
    // There is no dispatch roll for the library to be scripted away from, so the
    // roller's log is the assertion: the C# returns at `:1914` before any of its
    // four kinds of roll, and a decline that spent a die would still move every
    // roll after it.
    const map = plot();
    const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
    const roller = new ScriptedRoller();
    expect(makeLibraryBuilding(contextFor(map, new Block(new Rect(2, 2, 13, 13)), roller.asRoller()))).toBe(false);
    expect(roller.log, "a declined library draws from nothing").toEqual([]);

    expect(map.zones).toHaveLength(0);
    expect(map.mapObjects).toHaveLength(0);
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) expect(map.getTileAt(x, y)!.model).toBe(grass);
  });

  it("accepts an inside rect of exactly 10x10, the C#'s boundary", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // `InsideRect.Width < 10` is a strict `<`, so 10 builds — and 10 means a 14x14
    // block, since a block of n has an inside rect of n - 4. A generator that
    // wrote `<=` would hand this block to the parks instead, and that off-by-one
    // is invisible anywhere else. Note the block is square, so `20 >= 14` does not
    // decide the aisles here: equality is horizontal.
    const map = plot();
    expect(makeLibraryBuilding(contextFor(map, new Block(BOUNDARY), new ScriptedRoller().asRoller()))).toBe(true);
    expect(libraryZones(map)).toHaveLength(1);
  });

  it("spends the C#'s rolls, in the C#'s order, and no others", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // Four kinds of roll reach this point, and their order is load-bearing: the
    // door side at `:1977` decides the side every later `switch` re-decides, the
    // window side at `:2040` is next, then one book roll per bookcase inside
    // `ItemsDrop` (`:2074`), then the corner roll at `:2103` — and only if both
    // corners are free. Consolidating any two of them is a behaviour change, so
    // the whole list is pinned.
    const map = plot();
    const roller = new ScriptedRoller([], [true, true]);
    expect(makeLibraryBuilding(contextFor(map, new Block(WIDE), roller.asRoller()))).toBe(true);

    // `WIDE`'s alley rect is `Rect(4, 3, 14, 10)`: 14 columns less the central
    // aisle is 13 of them, and 5 odd-offset rows of the 10.
    const shelfColumns = WIDE.width - 4 - 2 - 1;
    const shelfRows = Math.ceil((WIDE.height - 4) / 2);
    expect(roller.log).toEqual([
      "chance:50",
      "roll:0-4",
      ...Array<string>(shelfColumns * shelfRows).fill("roll:0-3"),
      "chance:50",
    ]);
  });

  it("builds all four door sides, with the C#'s second and third door thresholds", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:1975-2032` writes the same three `PlaceDoor` calls out four times with
    // the axes swapped, so the four arms are the claim worth pinning: the
    // entrance(s) on the rolled side, the second one tile along, and the third
    // only past 12. `WIDE` has an inside height of 10 and `TALL` an inside width
    // of 11, so both get two doors and neither gets a third — the third door's
    // threshold is asserted separately below.
    const arms = [
      { name: "west", block: WIDE, chance: true, door: [2, 8], second: [2, 7], wall: 2, column: true },
      { name: "east", block: WIDE, chance: false, door: [19, 8], second: [19, 7], wall: 19, column: true },
      { name: "north", block: TALL, chance: true, door: [8, 2], second: [7, 2], wall: 2, column: false },
      { name: "south", block: TALL, chance: false, door: [8, 20], second: [7, 20], wall: 20, column: false },
    ];

    for (const arm of arms) {
      const map = plot();
      const b = new Block(arm.block);
      expect(makeLibraryBuilding(contextFor(map, b, new ScriptedRoller([], [arm.chance]).asRoller())), `library, ${arm.name} side`).toBe(
        true
      );

      for (const [x, y] of [arm.door, arm.second]) {
        const door = map.getMapObjectAt(x, y);
        expect(door, `${arm.name} door at ${x},${y}`).toBeInstanceOf(DoorWindow);
        expect((door as DoorWindow).imageId, "glass, C# :1983").toBe(GameImages.OBJ_GLASS_DOOR_CLOSED);
        expect(map.getTileAt(x, y)!.model, "walkway under the door").toBe(Models.tiles.get(TileID.FLOOR_WALKWAY)!);
      }
      // No third door *on this wall*: the inside rect's long axis is 10 or 11 here
      // and the C#'s third threshold is 12 (`:1987`). Counted on the wall rather
      // than over the whole building rect, because the C#'s rolled "window" at
      // `:2056` is a fourth door somewhere else and is asserted in its own test.
      const onTheWall = objectsIn(map, b.buildingRect).filter((o) => {
        if (!o.includes("door")) return false;
        const [x, y] = o.split("@")[1].split(",").map(Number);
        return arm.column ? x === arm.wall : y === arm.wall;
      });
      expect(onTheWall, `exactly two doors on the ${arm.name} wall`).toHaveLength(2);
    }
  });

  it("buys a third door past 12, the C#'s :1987 threshold", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // 16x21 at (1,1): `insideRect = (3, 3, 12, 17)`, so the inside width is 12 —
    // one over the threshold — and `16 < 21` puts the door on a north/south side,
    // which is where the C# tests `InsideRect.Width`. `midX` is 9.
    const map = plot();
    const b = new Block(new Rect(1, 1, 16, 21));
    expect(makeLibraryBuilding(contextFor(map, b, new ScriptedRoller([], [true]).asRoller()))).toBe(true);
    // Only the three north doors: the unscripted `roll(0, 4)` returns its minimum,
    // which is C# `case 0` — the north wall again, where `placeDoor` has already
    // laid walkway, so `:2052` refuses the second door.
    const doorCells = objectsIn(map, b.buildingRect).filter((o) => o.includes("door"));
    expect(doorCells, "three doors north").toEqual([
      `${GameImages.OBJ_GLASS_DOOR_CLOSED}@10,2`,
      `${GameImages.OBJ_GLASS_DOOR_CLOSED}@8,2`,
      `${GameImages.OBJ_GLASS_DOOR_CLOSED}@9,2`,
    ]);
  });

  it("lays the bookcases on every other aisle line and never on the central aisle", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:1927-1962`. On `WIDE` the aisles run east-west: inset by a column at
    // each end (`x` 4..17), the central aisle is `inside.left + width/2` = 11,
    // and a bookcase goes on every *odd* row of the alley rect — rows 4, 6, 8, 10
    // and 12 — except in that column. 13 columns times 5 rows.
    const map = plot();
    const b = new Block(WIDE);
    expect(makeLibraryBuilding(contextFor(map, b, new ScriptedRoller().asRoller()))).toBe(true);

    const shelves = objectsIn(map, new Rect(4, 3, 14, 10), GameImages.OBJ_BOOK_SHELVES);
    expect(shelves.length, "13 columns of 5 rows").toBe(65);
    for (const at of shelves) {
      const [x, y] = at.split("@")[1].split(",").map(Number);
      expect(y, `shelf row ${y} is odd-offset from the alley top`).toBeGreaterThanOrEqual(4);
      expect((y - 3) % 2, `shelf row ${y}`).toBe(1);
      expect(x, "never on the central aisle").not.toBe(11);
    }
    // And the aisles themselves are clear, which is what the flood fill uses.
    for (let x = 4; x < 18; x++) {
      expect(map.getMapObjectAt(x, 3), `aisle row ${x},3`).toBeNull();
      expect(map.getMapObjectAt(11, 3), "the central aisle").toBeNull();
    }
  });

  it("puts the checkout in a corner of the door's side, in the corner's inside-rect edge", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2085-2170`. A west door searches the *top and bottom* of the inside
    // rect's left column (`:2089`), a north door searches the *left and right* of
    // its top row (`:2097`) — and when both are free the corner is rolled 50/50,
    // which is the only roll this step costs.
    // `WIDE`'s inside rect is (3, 3, 16, 10), so its corners are (3,3)/(3,12)
    // west and (18,3)/(18,12) east; `TALL`'s is (3, 3, 11, 17), so (3,3)/(13,3)
    // north and (3,19)/(13,19) south.
    const corners = [
      { name: "west", chance: true, block: WIDE, first: [3, 3], second: [3, 12] },
      { name: "east", chance: false, block: WIDE, first: [18, 3], second: [18, 12] },
      { name: "north", chance: true, block: TALL, first: [3, 3], second: [13, 3] },
      { name: "south", chance: false, block: TALL, first: [3, 19], second: [13, 19] },
    ];

    for (const corner of corners) {
      for (const [choice, want] of [
        [true, corner.first],
        [false, corner.second],
      ] as const) {
        const map = plot();
        const b = new Block(corner.block);
        // `chances[0]` is the door side, `chances[1]` the corner.
        expect(
          makeLibraryBuilding(contextFor(map, b, new ScriptedRoller([], [corner.chance, choice]).asRoller())),
          `library, ${corner.name} side`
        ).toBe(true);

        const checkout = map.getMapObjectAt(want[0], want[1]);
        expect(checkout, `checkout on the ${corner.name} side, corner ${want}`).not.toBeNull();
        expect(checkout!.imageId).toBe(GameImages.OBJ_CASH_REGISTER);
        expect(checkout!.name, "C# :969").toBe("checkout");
        expect(checkout!.isContainer, "C# :975, Release 5-3").toBe(true);
        // The other corner of the same side is empty: there is one register.
        expect(objectsIn(map, b.insideRect, GameImages.OBJ_CASH_REGISTER)).toHaveLength(1);
      }
    }
  });

  it("never has to evict a bookcase for the counter, and says so", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2163-2167` removes whatever is in the corner and says in its own
    // comment that "it should only ever be a shelf if anything". It is never a
    // shelf: the corner is always on an inside-rect edge, and the C# insets the
    // alley rect by a *column* on the two sides whose corner is a column, and by
    // a *row* on the two whose corner is a row — so the corner cell is outside
    // the alley rect on the axis the shelves step along, and every build here
    // puts the register on bare carpet. Transliterated rather than "fixed",
    // because dropping the removal would be a change to a save's layout if the
    // geometry ever moved.
    for (const block of [WIDE, TALL]) {
      for (const chance of [true, false]) {
        const map = plot();
        const b = new Block(block);
        expect(makeLibraryBuilding(contextFor(map, b, new ScriptedRoller([], [chance, chance]).asRoller()))).toBe(true);
        const register = objectsIn(map, b.insideRect, GameImages.OBJ_CASH_REGISTER)[0];
        const [x, y] = register.split("@")[1].split(",").map(Number);
        const onEdge =
          x === b.insideRect.left ||
          x === b.insideRect.right - 1 ||
          y === b.insideRect.top ||
          y === b.insideRect.bottom - 1;
        expect(onEdge, "the register is always on an inside-rect edge").toBe(true);
        // Nothing was standing there: the shelves' bounding box and the register's
        // cell do not overlap.
        const alleyX = block.width >= block.height;
        const alley = alleyX
          ? new Rect(b.insideRect.left + 1, b.insideRect.top, b.insideRect.width - 2, b.insideRect.height)
          : new Rect(b.insideRect.left, b.insideRect.top + 1, b.insideRect.width, b.insideRect.height - 2);
        expect(alley.contains(new Point(x, y)), "the corner is outside the alley rect").toBe(false);
      }
    }
  });

  it("skips the second glass door when the roll lands on the entrance", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2042-2057`. On a square-ish block the rolled side can be the side the
    // door is already on, and then `map.GetTileAt(wx, wy).Model.IsWalkable` is
    // true — `PlaceDoor` laid walkway there — so the C# puts no second door. On
    // `WIDE` with a west door that is `case 2`, whose cell is
    // `(buildingRect.Left, buildingRect.Top + height/2)` = `(2, 8)`: the entrance.
    // A port that forgot the test would stack a second door on the first.
    const map = plot();
    const b = new Block(WIDE);
    const roller = new ScriptedRoller([2], [true, true]);
    expect(makeLibraryBuilding(contextFor(map, b, roller.asRoller()))).toBe(true);
    expect(objectsIn(map, b.buildingRect).filter((o) => o.includes("door")).length, "still only the entrance pair").toBe(2);
    expect(map.getMapObjectAt(2, 8)!.imageId).toBe(GameImages.OBJ_GLASS_DOOR_CLOSED);
  });

  it("puts the second glass door on a solid wall when the roll finds one", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:2054-2057`, the other three cases. `case 0` is the north wall at
    // `(buildingRect.Left + width/2, buildingRect.Top)` = `(11, 2)`, which on
    // `WIDE` is solid, and the C# lays *blue carpet* under it — the C#'s own
    // floor argument at `:2056`, and the reason the perimeter assertion has to
    // allow carpet as well as walkway.
    const map = plot();
    const b = new Block(WIDE);
    expect(makeLibraryBuilding(contextFor(map, b, new ScriptedRoller([0], [true, true]).asRoller()))).toBe(true);
    const window = map.getMapObjectAt(11, 2);
    expect(window, "a second glass door north").toBeInstanceOf(DoorWindow);
    expect(window!.imageId).toBe(GameImages.OBJ_GLASS_DOOR_CLOSED);
    expect(map.getTileAt(11, 2)!.model, "C# :2056 lays the inside floor under it").toBe(Models.tiles.get(TileID.FLOOR_BLUE_CARPET)!);
    // And it opens onto the central aisle, which is why the room stays walkable.
    expect(map.getMapObjectAt(11, 3), "the aisle is clear behind it").toBeNull();
  });

  it("declines every block past the C#'s one-per-district cap", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:501`'s `!hasLibrary`, Release 5-3. Five eligible blocks, one district,
    // one library — and the four declines draw from nothing, because the cap is
    // checked before any of the method's rolls the same way the size check is.
    const map = plot();
    const blocks = [
      new Block(new Rect(1, 1, 14, 14)),
      new Block(new Rect(18, 1, 14, 14)),
      new Block(new Rect(35, 1, 14, 14)),
      new Block(new Rect(1, 18, 14, 14)),
      new Block(new Rect(18, 18, 14, 14)),
    ];
    // One roller for all five blocks, because that is what "one district" is: the
    // C#'s `hasLibrary` is a local of the per-block loop, and the port keys the
    // flag on the district's `DiceRoller`, which `generate()` builds once per map.
    // A fresh roller per block would be five districts and five libraries, and the
    // cap would never be exercised.
    const roller = new ScriptedRoller();
    let built = 0;
    const declined: number[] = [];
    blocks.forEach((b, i) => {
      const before = roller.log.length;
      if (makeLibraryBuilding(contextFor(map, b, roller.asRoller()))) {
        ++built;
        expect(roller.log.length - before, `block ${i} rolled`).toBeGreaterThan(0);
      } else {
        declined.push(roller.log.length - before);
      }
    });
    expect(built, "one library per district, C# :501").toBe(1);
    // The cap is checked before any of the method's rolls, the same way the size
    // check is, so the four declines draw from nothing.
    expect(declined, "a capped-out block draws from nothing").toEqual([0, 0, 0, 0]);

    // The cap has the C#'s lifetime and not the process's: a new district is a
    // new `DiceRoller`, which is where the C# re-declares `hasLibrary`, so a
    // second district on the same map builds its own.
    const second = plot();
    expect(makeLibraryBuilding(contextFor(second, new Block(new Rect(1, 1, 14, 14)), new DiceRoller(2)))).toBe(true);
  });

  it("is deterministic for a given block and roller", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // World generation is seeded, so `ctx.roller` is the only randomness allowed.
    const build = (seed: number): string => {
      const map = plot();
      expect(makeLibraryBuilding(contextFor(map, new Block(WIDE), new DiceRoller(seed)))).toBe(true);
      const out: string[] = [];
      for (let x = 0; x < MAP; x++)
        for (let y = 0; y < MAP; y++) {
          const obj = map.getMapObjectAt(x, y);
          out.push(`${map.getTileAt(x, y)!.model.id}/${obj ? obj.imageId : "-"}`);
        }
      return out.join(",");
    };
    expect(build(20250929)).toBe(build(20250929));
    expect(build(20250929)).not.toBe(build(4242));
  });
});

// ── CLASSIC ─────────────────────────────────────────────────────────────────

describe("library building under CLASSIC", () => {
  it("is never reached, on a block the C# would have built on", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    // A 14x14 block is exactly the C#'s boundary and the C# would have built on
    // it, so the `false` here is the feature gate and not luck. The roller's log
    // is empty, which is the half that matters: the gate is the first statement,
    // ahead of the door side at `:1977`.
    const map = plot();
    const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
    const roller = new ScriptedRoller();
    expect(makeLibraryBuilding(contextFor(map, new Block(BOUNDARY), roller.asRoller()))).toBe(false);
    expect(roller.log).toEqual([]);
    expect(map.zones).toHaveLength(0);
    expect(map.mapObjects).toHaveLength(0);
    expect(map.getTileAt(3, 3)!.model).toBe(grass);
  });

  it("leaves a CLASSIC district with no trace of a library", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = newGenerator().generate(SEED);

    expect(libraryZones(map)).toEqual([]);
    // Bookcases, the checkout counter, and the sign beside the doors: the C# has
    // no other use for any of them, so their absence is a stronger statement than
    // the absence of a zone.
    expect(libraryTraces(map)).toEqual([]);
  });

  it("spends no dice at all, which is the claim a committed fingerprint rests on", () => {
    // "No library zone" is also what a library that was never offered a block
    // would produce. The measurement that cannot be argued with is the roller:
    // `rollChance` delegates to `roll`, so this counts both, and the church test
    // makes the same point the same way. `NoLibraries` is the same generation with
    // the stage deleted rather than switched off.
    Session.get().ruleset = Ruleset.CLASSIC;
    const shipped = vi.spyOn(DiceRoller.prototype, "roll");
    const taken = (gen: () => GameMap): number => {
      shipped.mockClear();
      gen();
      return shipped.mock.calls.length;
    };
    try {
      expect(taken(() => newGenerator().generate(SEED))).toBe(taken(() => newNoLibraries().generate(SEED)));
    } finally {
      shipped.mockRestore();
    }
  });

  it("generates a CLASSIC district byte-identically, and the fingerprint sees the flag", () => {
    // Recorded from this seed with the pass in place and the feature off. The
    // library gate runs before the method's first roll, which is the only way a
    // Classic world can be unchanged.
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = fingerprint(newGenerator().generate(SEED));
    expect(classic).toBe("edfe94f97003996a");

    // The two assertions that give the committed value meaning. A fingerprint
    // that ignored the world would pass the first line for any value; one that
    // returned a per-seed constant would pass both.
    expect(fingerprint(newGenerator().generate(4242))).not.toBe(classic);
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(fingerprint(newGenerator().generate(SEED))).not.toBe(classic);
  });

  it("leaves the 40x40 CLASSIC world the bank test committed untouched", () => {
    // `9bb5e4907bc3f62c` is `tests/bank-building.test.ts`'s constant for a 40x40
    // district at seed 1. It is restated here because the library sits in the same
    // business stage as the bank: if this building's pass moved a die, or took one
    // a Classic district should not pay, that constant would change and the bank
    // test would fail for a reason that has nothing to do with the bank.
    Session.get().ruleset = Ruleset.CLASSIC;
    expect(fingerprint(newGenerator(newParams(40, 40)).generate(1))).toBe("9bb5e4907bc3f62c");
  });
});

// ── The sprite and item rows it needed ──────────────────────────────────────

describe("the sprites and item models Feature.Library needed", () => {
  it("names the three images the C# draws", () => {
    // Every id here is a path that has to resolve to a file; `sprite-assets.test.ts`
    // is the test that proves it, and it walks this same class.
    expect(GameImages.DECO_LIBRARY).toBe("Tiles/Decoration/shop_library");
    expect(GameImages.OBJ_BOOK_SHELVES).toBe("MapObjects/bookshelves");
    expect(GameImages.OBJ_CASH_REGISTER).toBe("MapObjects/cash_register");
  });

  it("uses the C#'s three novel models, not the port's single book", () => {
    // C# `:1701`: `MakeItemBook` draws a colour per roll, and Release 7-6 added
    // the green and red. The port's own `makeItemBook` (`BaseMapGenerator.ts:1115`)
    // returns `ENT_BOOK` and takes no roller, which is why the generator
    // re-declares the factory rather than calling the generator's.
    expect(Models.items.get(ItemID.ENT_BOOK_BLUE)!.imageId).toBe(GameImages.ITEM_BOOK_BLUE);
    expect(Models.items.get(ItemID.ENT_BOOK_GREEN)!.imageId).toBe(GameImages.ITEM_BOOK_GREEN);
    expect(Models.items.get(ItemID.ENT_BOOK_RED)!.imageId).toBe(GameImages.ITEM_BOOK_RED);

    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // All three are reachable, so the roll is a real three-way one.
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const map = plot();
      const block = new Block(WIDE);
      expect(makeLibraryBuilding(contextFor(map, block, new DiceRoller(seed)))).toBe(true);
      for (const book of itemsIn(map, block.insideRect)) seen.add(book);
    }
    expect([...seen].sort()).toEqual([GameImages.ITEM_BOOK_BLUE, GameImages.ITEM_BOOK_GREEN, GameImages.ITEM_BOOK_RED].sort());
  });

  it("makes the bookcase a container and the shelf burnable, the C#'s values", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const block = new Block(WIDE);
    expect(makeLibraryBuilding(contextFor(map, block, new DiceRoller(1)))).toBe(true);
    const shelf = map.getMapObjectAt(4, 4)!;
    expect(shelf.name, "C# :597").toBe("shelf");
    expect(shelf.isContainer, "C# :599").toBe(true);
    expect(shelf.givesWood).toBe(true);
    expect(shelf.isMovable).toBe(true);
    expect(shelf.weight, "C# :602").toBe(6);
    expect(shelf.isFlammable, "C# :597, BURNABLE -- the port's own factory is UNINFLAMMABLE").toBe(true);
  });
});

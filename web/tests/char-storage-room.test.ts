/**
 * `BaseTownGenerator.makeCHARStorageRoom` -- C# `MakeCHARStorageRoom`,
 * `BaseTownGenerator.cs:8508-8550`. Still Alive, Release 7-4 and Release 7-6.
 *
 * The method was transcribed at vanilla fidelity and carried no marker saying so.
 * Three of its four divergences from the fork are Now Alive content -- a fire
 * barrel arm, canned food on the tiles the barrels miss, and the Resources
 * Availability gate on the construction-item loop -- so this file exists to hold
 * them at the reference's values.
 *
 * ## What this file deliberately does **not** assert
 *
 * **It does not assert that a CHAR document is placed here, because none is.**
 * `ItemID.UNIQUE_CHAR_DOCUMENT1..6` are registered with their six flavour texts
 * (`GameItems.ts:1527-1539`) and nothing drops them, and this room is not where
 * they belong. The reference's only `placedCHARdocument` latch is in
 * `MakeCHARLabRoom` (`BaseTownGenerator.cs:8552-8659`: latch at `:8554`, tested at
 * `:8606`, set at `:8634`, `Roll(0, 5)` at `:8609`, the six `new Item(...)` at
 * `:8612-8629`), and `MakeCHARLabRoom` replaces the **living** room -- the C#'s
 * room-role 2 branch comments `MakeCHARLivingRoom` out at `:8356-8357` and calls the
 * lab at `:8359`. The port has no `makeCHARLabRoom` and still calls
 * `makeCHARLivingRoom` (`BaseTownGenerator.ts:5080`), the method the C# marks
 * `//@@MP - no longer used (Release 3)` at `:8661`.
 *
 * So "at most one document group per room" is not a property this room has or lacks
 * -- the count is zero for every seed, and the test below says so. Writing the
 * assertion as "at most one" would pass for the wrong reason and would keep passing
 * if a future port put all six in the storage room, which is the mistake worth
 * guarding against.
 *
 * ## Why the Classic fingerprint cannot be reached from here
 *
 * `e097b9d976ffac15` digests one surface district entry map
 * (`bank-building.test.ts:89-113`, `:599-614`). This method is reached only from
 * `generateUniqueMap_CHARUnderground`, which builds a separate secret map from
 * `GenerateWorld` (`RogueGame.ts:30903-30912`) *after* the district loop that ends
 * at `:30888`. The test below does not take that on trust: it measures the roll
 * count of this method under both rulesets and holds Classic's to the exact count
 * the vanilla transcription spent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Item } from "@data/Item";
import { District, DistrictKind } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { MapObject } from "@data/MapObject";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Ruleset, Session } from "@engine/Session";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Options, Resources } from "@engine/GameOptions";
import { Barrel } from "@engine/mapobjects/MapObjects";
import {
  BaseTownGenerator,
  Parameters,
} from "@gameplay/generators/BaseTownGenerator";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameImages } from "@gameplay/GameImages";
import { GameTiles, TileID } from "@gameplay/GameTiles";

// The model databases register themselves into `Models` on construction, and a
// room read needs tiles and items.
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

const MAP = 40;

/**
 * A room deep inside an all-walkable plot, so that every one of its 1024 cells has
 * `CountAdjWalls == 0` and is therefore eligible for the `MapObjectFill` at `:8515`
 * and for the construction loop at `:8539`.
 *
 * All-walkable rather than walled deliberately: `countAdjWalls`
 * (`MapGenerator.ts:540-547`) counts *non-walkable* neighbours, so a plot with a
 * ring of wall would silently shrink the eligible set and make every rate below a
 * rate per eligible cell instead of a rate per cell.
 */
const ROOM = new Rect(4, 4, 32, 32);

/** A generator whose roller is seeded, and whose `Rules` has a roller of its own. */
function newGenerator(seed = 20250929): BaseTownGenerator {
  const rules = new Rules(new DiceRoller(seed ^ 0x5f3759df));
  const gen = new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, new Parameters());
  (gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller = new DiceRoller(seed);
  return gen;
}

/** The generator's room methods, reached the way `generateUniqueMap_CHARUnderground` reaches them. */
interface Rooms {
  makeCHARStorageRoom(map: GameMap, roomRect: Rect): void;
}

function rooms(gen: BaseTownGenerator): Rooms {
  return gen as unknown as Rooms;
}

/** A blank walkable plot. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const floor = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, floor);
  return map;
}

/** Every cell of `ROOM`, column-major, the order both the C# and the port walk. */
function cells(rect = ROOM): Point[] {
  const out: Point[] = [];
  for (let x = rect.left; x < rect.right; x++) for (let y = rect.top; y < rect.bottom; y++) out.push(new Point(x, y));
  return out;
}

/** Runs the real method on a fresh plot and hands back both. */
function build(seed = 20250929): { map: GameMap; gen: BaseTownGenerator } {
  const map = plot();
  const gen = newGenerator(seed);
  rooms(gen).makeCHARStorageRoom(map, ROOM);
  return { map, gen };
}

/** Fire barrels specifically: `makeObjFireBarrel` is the only `Barrel` in this room. */
function fireBarrelsIn(map: GameMap): number {
  return cells().filter((pt) => map.getMapObjectAt(pt.x, pt.y) instanceof Barrel).length;
}

/** Every item on the floor of `ROOM`, one entry per stack. */
function itemsIn(map: GameMap): Item[] {
  const out: Item[] = [];
  for (const pt of cells()) for (const it of map.getItemsAt(pt)?.items ?? []) out.push(it);
  return out;
}

function itemsWithId(map: GameMap, id: ItemID): number {
  return itemsIn(map).filter((it) => it.model.id === id).length;
}

/**
 * The ten models `makeShopConstructionItem` (`BaseTownGenerator.ts:4382-4420`) can
 * return, and nothing else.
 *
 * Needed because under Still Alive the room's floor carries two kinds of item --
 * construction items from the loop at `:8539` and canned food from `:8531` -- so
 * "items on the floor" cannot measure the gate the loop carries. The list is spelled
 * out rather than derived because the C#'s own `roll(0, 24)` ladder is the
 * definition, and a test that recomputed it from the generator would be testing the
 * generator against itself.
 */
const CONSTRUCTION_ITEM_IDS: readonly ItemID[] = [
  ItemID.MELEE_SHOVEL,
  ItemID.MELEE_SHORT_SHOVEL,
  ItemID.MELEE_CROWBAR,
  ItemID.MELEE_HUGE_HAMMER,
  ItemID.MELEE_SMALL_HAMMER,
  ItemID.BAR_WOODEN_PLANK,
  ItemID.LIGHT_FLASHLIGHT,
  ItemID.LIGHT_BIG_FLASHLIGHT,
  ItemID.TRAP_SPIKES,
  ItemID.TRAP_BARBED_WIRE,
];

function constructionItemsIn(map: GameMap): number {
  const wanted = new Set(CONSTRUCTION_ITEM_IDS);
  return itemsIn(map).filter((it) => wanted.has(it.model.id)).length;
}

/** The construction-item loop's denominator: eligible, and not already furnished. */
function bareTilesIn(map: GameMap): number {
  return cells().filter((pt) => map.getMapObjectAt(pt.x, pt.y) === null).length;
}

const originalRuleset = Session.get().ruleset;
const originalResources = Options.resourcesAvailability;

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  // MED -> 54, `GameOptions.resourcesAvailabilityToInt` (`GameOptions.ts:1524`).
  Options.resourcesAvailability = Resources.MED;
});

// ── The Release 7-6 fire barrel ────────────────────────────────────────────

describe("the CHAR storage room's fire barrel, C# `:8527-8528`", () => {
  it("places them under Still Alive, which the port did not do at all", () => {
    // 3% of the tiles that failed the 47% junk roll, so a 1024-cell room produces
    // roughly thirty. The assertion is `> 0` over a handful of seeds rather than an
    // exact figure because the arm is three rolls deep in C#'s order and pinning a
    // count would pin the whole stream rather than the arm.
    let total = 0;
    for (const seed of [1, 2, 3, 4242, 20250929]) total += fireBarrelsIn(build(seed).map);
    expect(total, "fire barrels across five seeds").toBeGreaterThan(0);
  });

  it("places none under Classic, and spends no die finding that out", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const seed of [1, 2, 3, 4242, 20250929]) {
      expect(fireBarrelsIn(build(seed).map), `seed ${seed} has no fire barrels`).toBe(0);
    }
  });

  it("is the unlit walkable `Barrel`, not the unbreakable `barrels` stack", () => {
    // `makeObjFireBarrel` (`BaseMapGenerator.ts:794-801`) and `makeObjBarrels`
    // (`:986`) share no image and no class, so this distinguishes the Release 7-6
    // arm from the arm it was added next to rather than trusting the sprite.
    const { map } = build(4242);
    expect(fireBarrelsIn(map)).toBeGreaterThan(0);
    for (const pt of cells()) {
      const obj = map.getMapObjectAt(pt.x, pt.y);
      if (obj instanceof Barrel) {
        expect(obj.imageId).toBe(GameImages.OBJ_EMPTY_BARREL);
        expect(obj.isWalkable, "a fire barrel is a cooking spot, not an obstacle").toBe(true);
      }
    }
  });
});

// ── The Release 7-4 canned food ────────────────────────────────────────────

describe("the CHAR storage room's canned food, C# `:8531-8534`", () => {
  it("drops it on the tiles the barrels missed, under Still Alive", () => {
    // The old arm was `else return null`: a room that had run out of ideas. The C#'s
    // `else` puts canned food on the floor of the same tiles the barrels would have
    // gone on, which is the only food in the base outside the pharmacy.
    let total = 0;
    for (const seed of [1, 2, 3, 4242, 20250929]) total += itemsWithId(build(seed).map, ItemID.FOOD_CANNED_FOOD);
    expect(total, "canned food across five seeds").toBeGreaterThan(0);
  });

  it("drops none under Classic", () => {
    // The arm is Release 7-4 and has no Classic counterpart in the reference either
    // -- vanilla had no Resources Availability option, so there was nothing to gate.
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const seed of [1, 2, 3, 4242, 20250929]) {
      expect(itemsWithId(build(seed).map, ItemID.FOOD_CANNED_FOOD), `seed ${seed}`).toBe(0);
    }
  });

  it("only ever shares a tile with nothing else, because the C# returns after it", () => {
    // `:8531-8534` drops and then returns null, so a canned-food tile carries no
    // map object -- the fire barrel and the canned food are mutually exclusive on a
    // tile, which is what makes the 3% arm an `else if` rather than a fourth case.
    const { map } = build(4242);
    let checked = 0;
    for (const pt of cells()) {
      if (itemsWithIdAt(map, pt, ItemID.FOOD_CANNED_FOOD) === 0) continue;
      checked++;
      expect(map.getMapObjectAt(pt.x, pt.y), `(${pt.x},${pt.y}) has food and nothing else`).toBeNull();
    }
    expect(checked, "there were canned-food tiles to check").toBeGreaterThan(0);
  });
});

function itemsWithIdAt(map: GameMap, pt: Point, id: ItemID): number {
  return (map.getItemsAt(pt)?.items ?? []).filter((it) => it.model.id === id).length;
}

// ── The construction-item gate, C# `:8547-8548` ────────────────────────────

describe("the CHAR storage room's construction items, C# `:8539-8549`", () => {
  it("covers some but not all bare tiles under Still Alive -- the gate took effect", () => {
    // The C# rolls Resources Availability per tile and drops on a pass, so with the
    // default MED a strict subset is the whole claim: `0` would mean the gate is off
    // and `all` would mean the port still drops unconditionally.
    let covered = 0;
    let bare = 0;
    for (const seed of [1, 2, 3, 4242, 20250929]) {
      const { map } = build(seed);
      covered += constructionItemsIn(map);
      bare += bareTilesIn(map);
    }
    expect(covered, "some construction items").toBeGreaterThan(0);
    expect(covered, "but not on every bare tile").toBeLessThan(bare);
  });

  it("covers every bare tile under Classic, because vanilla's loop was ungated", () => {
    // This is the one place in the method where "add the missing roll" is the wrong
    // fix. Gating the roll alone would leave a Classic room dropping *nothing*, and
    // that is a bigger change than the fork ever made. See the loop's own comment.
    Session.get().ruleset = Ruleset.CLASSIC;
    const { map } = build(4242);
    const bare = bareTilesIn(map);
    expect(bare, "the room has bare tiles to fill").toBeGreaterThan(0);
    expect(constructionItemsIn(map), "one per bare tile").toBe(bare);
  });

  it("follows the option, so LOW is thinner than HIGH", () => {
    const density = (resources: Resources): number => {
      Options.resourcesAvailability = resources;
      let covered = 0;
      let bare = 0;
      for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
        const { map } = build(seed);
        covered += constructionItemsIn(map);
        bare += bareTilesIn(map);
      }
      return covered / bare;
    };

    // 33 against 75 (`GameOptions.ts:1524-1535`), over eight seeds on the same room,
    // so the ordering is a measurement rather than an assumption about the roll.
    const low = density(Resources.LOW);
    const high = density(Resources.HIGH);
    expect(low).toBeLessThan(high);
  });
});

// ── The Classic roll count ─────────────────────────────────────────────────

/** The protected members the vanilla transcription below needs, and nothing else. */
interface VanillaRoom {
  m_DiceRoller: DiceRoller;
  mapObjectFill(map: GameMap, rect: Rect, createFn: (p: Point) => MapObject | null): void;
  countAdjWalls(map: GameMap, x: number, y: number): number;
  makeObjJunk(imageId: string): MapObject;
  makeObjBarrels(imageId: string): MapObject;
  makeShopConstructionItem(): Item;
}

/**
 * The port's pre-change transcription of `MakeCHARStorageRoom`, kept here as a
 * measuring stick rather than described in a comment.
 *
 * `junkChance` is the only argument because it is the only line that differs between
 * the transcription and what the generator now does. `50` is vanilla's value, which is
 * what the port had; `47` is the reference's (`BaseTownGenerator.cs:8525`) and is what
 * the port now uses in both rulesets. Passing the same value as the generator under
 * test is what isolates the *gating* from the *threshold* -- see the test that uses 47.
 *
 * A closed form for the roll count is not available and pretending otherwise is what
 * the first version of this test did: `makeShopConstructionItem` (`:4382`) spends its
 * own `roll(0, 24)` and a second `rollChance(50)` on three of its twenty-four arms,
 * so the loop's cost is one *or two* rolls per tile and is not derivable from the
 * finished map. Comparing against code answers the question the fingerprint actually
 * cares about without a formula to get wrong.
 */
function storageRoomTranscription(gen: BaseTownGenerator, map: GameMap, roomRect: Rect, junkChance: number): void {
  const self = gen as unknown as VanillaRoom;
  self.mapObjectFill(map, roomRect, (pt) => {
    if (self.countAdjWalls(map, pt.x, pt.y) > 0) return null;
    if (map.getExitAt(pt) !== null) return null;

    if (self.m_DiceRoller.rollChance(junkChance))
      return self.m_DiceRoller.rollChance(50)
        ? self.makeObjJunk(GameImages.OBJ_JUNK)
        : self.makeObjBarrels(GameImages.OBJ_BARRELS);
    else return null;
  });

  for (let x = roomRect.left; x < roomRect.right; x++)
    for (let y = roomRect.top; y < roomRect.bottom; y++) {
      if (self.countAdjWalls(map, x, y) > 0) continue;
      if (map.getMapObjectAt(x, y) !== null) continue;

      map.dropItemAt(self.makeShopConstructionItem(), new Point(x, y));
    }
}

/**
 * Rolls spent by the district roller only. `makeItemCannedFood`
 * (`BaseMapGenerator.ts:1075`) spends `m_Rules` rather than `m_DiceRoller`, so a
 * prototype-wide spy would count a roll this method is not responsible for -- which is
 * why `newGenerator` gives `Rules` a roller of its own and this spies on one instance.
 */
function rollsSpentBy(build: (gen: BaseTownGenerator, map: GameMap) => void, seed: number): number {
  const map = plot();
  const gen = newGenerator(seed);
  const spy = vi.spyOn((gen as unknown as VanillaRoom).m_DiceRoller, "roll");
  try {
    build(gen, map);
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describe("the CHAR storage room's dice, which is what a shared roller would shift", () => {
  it("spends exactly what a 47% transcription spends when both Still Alive arms are off", () => {
    // This is the claim that keeps the district stream still, measured rather than
    // argued, and it is deliberately run against the *reference's* 47 rather than
    // vanilla's 50 so that it measures the gating and nothing else. If either new arm
    // were rolled before its flag was consulted -- or gated after the roll -- this
    // number would be larger and the test would say so.
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const seed of [1, 2, 3, 4242, 20250929, 31337]) {
      const before = rollsSpentBy((gen, map) => storageRoomTranscription(gen, map, ROOM, 47), seed);
      const after = rollsSpentBy((gen, map) => rooms(gen).makeCHARStorageRoom(map, ROOM), seed);
      expect(after, `seed ${seed}: no die is spent on a gated-off arm`).toBe(before);
    }
  });

  it("spends more than the pre-change transcription did, because 47 is not 50", () => {
    // **Recorded, not hidden.** This is the one Classic-visible consequence of taking
    // the reference's threshold, and it is a *cascade* rather than a single room
    // differing: 47 places fewer junk-and-barrels objects than 50 does, so more tiles
    // are left bare, so the construction loop at `:8539` walks more tiles and spends
    // more dice there. A reader who assumed "same rolls, different values" was wrong,
    // and this is the measurement that says so.
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const seed of [1, 2, 3, 4242, 20250929]) {
      const before = rollsSpentBy((gen, map) => storageRoomTranscription(gen, map, ROOM, 50), seed);
      const after = rollsSpentBy((gen, map) => rooms(gen).makeCHARStorageRoom(map, ROOM), seed);
      expect(after, `seed ${seed}: the room spends more, and that is deliberate`).toBeGreaterThan(before);
    }
  });

  it("leaves no trace of a storage room on a real Classic district", () => {
    // The structural half of the fingerprint argument, and the half that carries it.
    // A district is built by `BaseTownGenerator.generate` alone; the CHAR underground
    // is built afterwards from `GenerateWorld` (`RogueGame.ts:30903-30912`), after the
    // district loop that ends at `:30888`. So no district can contain a storage room,
    // which is why `e097b9d976ffac15` is not reachable from this method -- proved here
    // by generating one and looking for this room's floor, its objects and its zone.
    //
    // It also matters that this is a *district* and not a world: the underground map
    // is a separate `GameMap` stored as `uniqueMaps.charUndergroundFacility`
    // (`RogueGame.ts:31869-31871`) and added to the district as a unique map, so it is
    // not in the entry map that the fingerprint walks.
    Session.get().ruleset = Ruleset.CLASSIC;
    const params = new Parameters();
    params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
    params.mapWidth = 40;
    params.mapHeight = 40;
    const district = new BaseTownGenerator(
      { rules: new Rules(new DiceRoller(1)), ApplyOnFire: () => undefined } as never,
      params
    ).generate(1);

    const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;
    let storageFloor = 0;
    for (let x = 0; x < district.width; x++)
      for (let y = 0; y < district.height; y++) if (district.getTileAt(x, y)!.model === concrete) storageFloor++;

    // A surface district has no `Storage@` zone -- the name belongs to the CHAR
    // underground, whose zones are made by `generateUniqueMap_CHARUnderground`.
    const zones = district.zones.map((z) => z.name);
    expect(zones.filter((n) => n.startsWith("Storage@")), "no storage room zone").toEqual([]);
    // And no fire barrel, canned food pile or construction item laid on concrete. The
    // fire barrel is the sharpest of the three because it is new in this change, so a
    // regression that made this room reachable from a district would show up here and
    // nowhere else.
    expect(storageFloor, "a surface district has no CHAR storage floor").toBe(0);
    let fireBarrels = 0;
    for (let x = 0; x < district.width; x++)
      for (let y = 0; y < district.height; y++) if (district.getMapObjectAt(x, y) instanceof Barrel) fireBarrels++;
    expect(fireBarrels, "and none of the Release 7-6 barrels").toBe(0);
  });

  it("spends strictly more under Still Alive, which is the price of the two arms", () => {
    // The direction matters more than the amount: the point is that the new rolls are
    // *real* and are taken from the district's stream in the C#'s order, not skipped.
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = rollsSpentBy((gen, map) => rooms(gen).makeCHARStorageRoom(map, ROOM), 4242);
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(rollsSpentBy((gen, map) => rooms(gen).makeCHARStorageRoom(map, ROOM), 4242)).toBeGreaterThan(classic);
  });
});

// ── The six CHAR documents: still unplaced, and not here ───────────────────

describe("the six CHAR documents", () => {
  it("drops none in this room, on any seed, in either ruleset", () => {
    const documentIds = [
      ItemID.UNIQUE_CHAR_DOCUMENT1,
      ItemID.UNIQUE_CHAR_DOCUMENT2,
      ItemID.UNIQUE_CHAR_DOCUMENT3,
      ItemID.UNIQUE_CHAR_DOCUMENT4,
      ItemID.UNIQUE_CHAR_DOCUMENT5,
      ItemID.UNIQUE_CHAR_DOCUMENT6,
    ];
    for (const ruleset of [Ruleset.CLASSIC, Ruleset.STILL_ALIVE]) {
      Session.get().ruleset = ruleset;
      for (const seed of [1, 2, 3, 4242, 20250929, 777, 31337]) {
        for (const id of documentIds) {
          expect(itemsWithId(build(seed).map, id), `seed ${seed} drops no ${ItemID[id]}`).toBe(0);
        }
      }
    }
  });

  it("are all six registered, with six distinct flavour texts", () => {
    const flavours = [
      ItemID.UNIQUE_CHAR_DOCUMENT1,
      ItemID.UNIQUE_CHAR_DOCUMENT2,
      ItemID.UNIQUE_CHAR_DOCUMENT3,
      ItemID.UNIQUE_CHAR_DOCUMENT4,
      ItemID.UNIQUE_CHAR_DOCUMENT5,
      ItemID.UNIQUE_CHAR_DOCUMENT6,
    ].map((id) => Models.items.get(id));
    for (const model of flavours) expect(model, "the model exists").toBeTruthy();
    expect(new Set(flavours.map((m) => m.flavorDescription)).size, "six distinct texts").toBe(6);
    // `GameItems.ts:1536` gives all six one sprite, so the image is *not* what tells
    // them apart -- which is why the six distinct texts are the stronger assertion.
    expect(new Set(flavours.map((m) => m.imageId)).size).toBe(1);
  });

  it("are not marked `IsUnique`/`IsForbiddenToAI` on the model, because the C# sets both per drop", () => {
    // `GameItems.ts:1521-1523` says so, and `BaseTownGenerator.cs:8612-8629` is the
    // only place that sets them -- in the lab room this port does not have. So the
    // flags are a property of a *drop site*, and a test that read them off a model
    // would be reading a field the reference never puts there.
    const model = Models.items.get(ItemID.UNIQUE_CHAR_DOCUMENT1);
    const item = new Item(model);
    expect(item.isUnique, "set by the drop, not the model").toBe(false);
    expect(item.isForbiddenToAI, "set by the drop, not the model").toBe(false);
  });
});

// ── Determinism and the floor ──────────────────────────────────────────────

describe("the CHAR storage room", () => {
  it("replaces the floor with concrete", () => {
    // The control: if this fails, nothing below it measured a room at all.
    const { map } = build(4242);
    const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE);
    for (const pt of cells()) expect(map.getTileAt(pt.x, pt.y)!.model).toBe(concrete);
  });

  it("builds the same room twice from one seed, and a different one from another", () => {
    const build3 = (seed: number): string => {
      const map = plot();
      rooms(newGenerator(seed)).makeCHARStorageRoom(map, ROOM);
      const out: string[] = [];
      for (const pt of cells()) {
        const obj = map.getMapObjectAt(pt.x, pt.y);
        const items = (map.getItemsAt(pt)?.items ?? []).map((it) => it.model.id).sort().join("+");
        out.push(`${pt.x},${pt.y}=${obj ? obj.imageId : "-"}|${items}`);
      }
      return out.join(";");
    };

    // Every arm of the room spends dice and two of them are new, so a drift in roll
    // order shows up here as a different room rather than as a different count.
    expect(build3(4242)).toBe(build3(4242));
    expect(build3(4242)).not.toBe(build3(31337));
  });

  it("is registered behind neither `Feature.ArmyBase` nor `Feature.CHARResearchRaid`", () => {
    // Neither flag governs the CHAR underground: the reference calls
    // `CreateUniqueMap_CHARUndegroundFacility` unconditionally at
    // `RogueGame.cs:4292`, and the flags gate the surface army-office pass and the
    // day-21 raid event respectively. `Feature.FireBarrels` and
    // `Feature.ResourcesAvailability` are the two that belong to the lines changed.
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.ArmyBase)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.ArmyBase)).toBe(false);
    expect(hasFeature(Ruleset.CLASSIC, Feature.CHARResearchRaid)).toBe(false);
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.FireBarrels)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.FireBarrels)).toBe(false);
    expect(hasFeature(Ruleset.CLASSIC, Feature.ResourcesAvailability)).toBe(false);
  });
});

afterEach(() => {
  Session.get().ruleset = originalRuleset;
  Options.resourcesAvailability = originalResources;
});
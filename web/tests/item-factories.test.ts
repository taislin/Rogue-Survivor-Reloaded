import { describe, it, expect } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { Item } from "@data/Item";
import { ItemID } from "@gameplay/GameItems";
import { ItemLight } from "@engine/items/ItemLight";
import { Models } from "@data/Models";
import { imagePath } from "@engine/AssetPaths";
import { publicFilePath } from "./helpers/assetPath";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every `makeItem*` factory produces a usable item.
 *
 * The 67 factories ported from the fork's `MakeItem*` are called by nothing --
 * the town generators still place only the vanilla set -- so nothing else in the
 * suite executes them. That leaves the exact failure this file closes: a factory
 * naming an `ItemID` with no model behind it, or an item class that does not
 * exist, would sit in the file passing `tsc` (the enum member is real, the class
 * is imported) and throw the first time a spawner reached for it.
 *
 * It is also the only place the generated code is checked against the *runtime*
 * rather than the text. `port-item-factories.py` reads the C#; this reads what
 * the port actually builds.
 *
 * The game and the factory list are built at module scope, not in `beforeAll`:
 * `it.each` is evaluated during collection, which happens before any hook runs,
 * so a list assembled in `beforeAll` arrives here as `undefined`.
 *
 * One game per file, for the reason every other suite says it: `Session.get()`
 * is a process-wide singleton and the model databases self-register into `Models`.
 */
// Mirrors RogueGame's own construction: the generator needs a Game and a
// `Parameters`, which the C# passes by struct copy and TS cannot.
const runner = new HeadlessRunner(4242);
const gen = new StdTownGenerator(runner.rogueGame, new TownParameters());

/**
 * Every no-argument `makeItem*` on the generator's prototype chain, bound to one
 * instance.
 *
 * Parameterised factories are collected separately rather than called with
 * nothing: `makeItemBikerGangJacket(gangId)` takes a `GangID` and reading
 * `undefined` off it fails, which would look like a broken factory rather than a
 * skipped one.
 */
const FACTORIES: Array<[string, () => Item]> = [];
const PARAMETERISED: string[] = [];
(() => {
  const seen = new Set<string>();
  for (let p = Object.getPrototypeOf(gen); p && p !== Object.prototype;
       p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) {
      if (!/^makeItem[A-Za-z0-9]*$/.test(name) || seen.has(name)) continue;
      seen.add(name);
      const fn = (p as Record<string, unknown>)[name];
      if (typeof fn !== "function") continue;
      if ((fn as () => unknown).length > 0) {
        PARAMETERISED.push(name);
        continue;
      }
      FACTORIES.push([name, () => (fn as () => Item).call(gen)]);
    }
  }
})();

const NAMES = FACTORIES.map(([name]) => name);
const factoryFor = (name: string) => FACTORIES.find(([n]) => n === name)![1];

describe("makeItem factories", () => {
  it("finds the factories to test", () => {
    // Guards everything below from passing on an empty list, which a rename or a
    // prototype change would otherwise produce silently.
    expect(FACTORIES.length).toBeGreaterThan(100);
  });

  it("builds the three backpack factories ungated, as the C# has them", () => {
    // `MakeItemHikingPack`, `MakeItemSatchel` and `MakeItemWaistPouch` are bare
    // `new ItemBackpack(...) { IsForbiddenToAI = true }` in the C#
    // (`BaseMapGenerator.cs:2394-2405`) with no `Feature` check, and the port follows
    // that: the `Feature.ShelterBackpacks` gate lives on the eight *roll sites*, not on
    // the factories.
    //
    // Which means "returns null under CLASSIC" is the *wrong* answer here, and the
    // per-factory tests above — which run under whatever ruleset the harness leaves
    // behind — are what said so. This asserts the boundary directly rather than
    // inferring it: a factory that returned null would fail on `model.id`.
    for (const name of ["makeItemHikingPack", "makeItemSatchel", "makeItemWaistPouch"]) {
      const item = factoryFor(name)();
      expect(item, `${name} returned nothing`).not.toBeNull();
      expect(item.model, `${name} has no model`).toBeDefined();
      expect(item.isForbiddenToAI, `${name} must be forbidden to the AI`).toBe(true);
    }
  });

  it("builds a candles box as a plain item, not a light", () => {
    // `makeItemCandlesBox` is needed by the C#'s bedroom table (`case 2`). Its model
    // is a plain `ItemModel` — the light comes from a `DECO_LIT_CANDLE` decoration
    // placed on drop (`RogueGame.cs:21203`), a path not yet ported — so
    // `new ItemLight(...)` throws on it. Asserted because that throw is the whole
    // reason this factory looks the way it does.
    const item = factoryFor("makeItemCandlesBox")();
    expect(item.model.id).toBe(ItemID.CANDLES_BOX);
    expect(item).not.toBeInstanceOf(ItemLight);
  });

  it("collects the parameterised factories instead of calling them wrongly", () => {
    // Named so a new one shows up here rather than as a confusing failure in the
    // per-factory tests.
    expect(PARAMETERISED).toEqual(["makeItemBikerGangJacket"]);
  });

  it.each(NAMES)("%s returns an item with a real model", (name) => {
    const item = factoryFor(name)();
    expect(item, `${name} returned nothing`).toBeInstanceOf(Item);
    expect(item.model, `${name} produced an item with no model`).toBeTruthy();
    expect(item.model.id, `${name} got an unregistered model`).toBeGreaterThanOrEqual(0);
    expect(item.model.id, `${name} got an unregistered model`).toBeLessThan(ItemID._COUNT);
  });

  it.each(NAMES)("%s uses a sprite that exists on disk", (name) => {
    const item = factoryFor(name)();
    const img = item.model.imageId;
    expect(img, `${name} has no image id`).toBeTruthy();
    const onDisk = existsSync(
      resolve(__dirname, "..", "public", publicFilePath(imagePath(img))));
    expect(onDisk, `${name} -> ${img} has no file`).toBe(true);
  });

  it("no factory throws or returns an item without a model", () => {
    const bad: string[] = [];
    for (const [name, factory] of FACTORIES) {
      try {
        if (!factory().model) bad.push(`${name} (no model)`);
      } catch (e) {
        bad.push(`${name} (threw: ${String(e).slice(0, 100)})`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("the primed explosives resolve to their own sprites", () => {
  const PAIRS: Array<[string, ItemID, ItemID]> = [
    ["EXPLOSIVE_GRENADE", ItemID.EXPLOSIVE_GRENADE, ItemID.EXPLOSIVE_GRENADE_PRIMED],
    ["EXPLOSIVE_MOLOTOV", ItemID.EXPLOSIVE_MOLOTOV, ItemID.EXPLOSIVE_MOLOTOV_PRIMED],
    ["EXPLOSIVE_DYNAMITE", ItemID.EXPLOSIVE_DYNAMITE, ItemID.EXPLOSIVE_DYNAMITE_PRIMED],
    ["EXPLOSIVE_C4", ItemID.EXPLOSIVE_C4, ItemID.EXPLOSIVE_C4_PRIMED],
    ["EXPLOSIVE_SMOKE_GRENADE", ItemID.EXPLOSIVE_SMOKE_GRENADE, ItemID.EXPLOSIVE_SMOKE_GRENADE_PRIMED],
    ["EXPLOSIVE_FLASHBANG", ItemID.EXPLOSIVE_FLASHBANG, ItemID.EXPLOSIVE_FLASHBANG_PRIMED],
    ["EXPLOSIVE_HOLY_HAND_GRENADE", ItemID.EXPLOSIVE_HOLY_HAND_GRENADE, ItemID.EXPLOSIVE_HOLY_HAND_GRENADE_PRIMED],
  ];

  it.each(PAIRS)("%s points at its own primed model", (_name, live, primed) => {
    // `ItemGrenade` stores `primedModelId` and the throw path looks the model up
    // by it, so a primed model registered under the *grenade's* id means a thrown
    // molotov becomes a grenade. Vanilla got this right only because it had one
    // explosive; the fork has ten, seven with distinct sprites.
    const liveModel = Models.items.get(live) as { primedModelId?: number };
    expect(liveModel, `${live} has no model`).toBeTruthy();
    const primedModel = Models.items.get(primed);
    expect(primedModel, `${primed} is not registered`).toBeTruthy();
    if (liveModel.primedModelId !== undefined) {
      expect(liveModel.primedModelId, `${live} points at the wrong primed model`)
        .toBe(primedModel.id);
    }
  });
});

/**
 * Each factory builds the item the C# names.
 *
 * The per-factory tests above prove a factory *works* — a model behind it, a
 * sprite on disk. They cannot prove it builds the *right* one, and that is the
 * mistake this port actually made: `KATANA` was resolved by suffix match to
 * `UNIQUE_FAMU_FATARU_KATANA`, so a factory meant to hand out a shop katana was
 * spawning the sword you win from a unique NPC. Every field was a valid item,
 * the sprite existed, `tsc` agreed, and the bug was invisible to all of it —
 * mutation-checked below.
 *
 * `tests/fixtures/still-alive-item-factories.json` is the C#'s own mapping, via
 * the generator's five explicit `OVERRIDES`. It is committed rather than read
 * from `_refs/` because that directory is gitignored, so a test that opened
 * `BaseMapGenerator.cs` would pass locally and fail in CI.
 */
// The fixture stores the id *name* the C# resolves to, not the number, so a
// renumbering of the enum does not churn it and a reader can see the pair.
const C_SHARP_ITEMS: Record<string, string> = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/still-alive-item-factories.json"), "utf-8"),
);

/** The numeric id behind an `ItemID` name, or undefined if there is no such member. */
const numericId = (name: string): number | undefined =>
  (ItemID as unknown as Record<string, number>)[name];

describe("factories build the item the C# names", () => {
  it("has a fixture large enough to be a real contract", () => {
    expect(Object.keys(C_SHARP_ITEMS).length).toBeGreaterThan(100);
  });

  it.each(Object.keys(C_SHARP_ITEMS))("%s builds its C# item", (name) => {
    const factory = FACTORIES.find(([n]) => n === name);
    // A fixture entry with no factory is a rename or a deletion; either way the
    // pair has drifted and the entry is now asserting nothing.
    expect(factory, `${name} is in the fixture but not on the generator`).toBeTruthy();
    const want = C_SHARP_ITEMS[name];
    const model = factory![1]().model;
    const wantId = numericId(want);
    expect(wantId, `${want} is not an ItemID any more`).toBeTypeOf("number");
    const expected = Models.items.get(wantId!);
    expect(expected, `${want} has no model`).toBeTruthy();
    expect(model.id, `${name} builds the wrong item`).toBe(expected.id);
    expect(model.imageId, `${name} builds the wrong sprite`).toBe(expected.imageId);
  });
});

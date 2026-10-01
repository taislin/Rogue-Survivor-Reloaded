/**
 * The nine Still Alive items that were the last Tier 1 gap in `GameItems`:
 * `VEGETABLE_SEEDS`, `LIQUOR_AMBER`, `LIQUOR_CLEAR` and `UNIQUE_CHAR_DOCUMENT1..6`.
 *
 * Four things are pinned here, and they are the four ways this change could have
 * gone quietly wrong:
 *
 * 1. **`ItemID` is append-only.** A save stores an `ItemID` as a bare number, so
 *    inserting the nine at the C#'s enum positions (`GameItems.cs:147`, `:152-153`,
 *    `:223-228`) would silently resolve an old save to a *different item* rather
 *    than a renamed one. The bijection over `0.._COUNT-1` plus the pinned boundary at
 *    `MATCHES = 178` is what makes that failure impossible to merge by accident:
 *    a duplicate value or a shifted one shows up here, not in somebody's save.
 * 2. **Every model field is the C#'s, including the ones that look wrong.** The
 *    `"vegie"` typo, the `#241` document's `"stength"`, the three quoted flavours
 *    against three unquoted, and the two liquors whose `Quantity = 6` factory hands
 *    back a `StackingLimit = 3` item. Each is asserted verbatim, because a port that
 *    "fixes" one of them is indistinguishable from a correct one until somebody
 *    diffs against the reference.
 * 3. **The six documents are six models.** One sprite, six ids, six flavours. The
 *    failure mode is a shared model with the flavour picked at drop time, which
 *    makes `MakeCHARStorageRoom`'s `Roll(0, 5)` choose between six identical items.
 * 4. **Both consumers now build, and neither of them moves the district's dice.**
 *    The farm shed's six seed arms (`BaseTownGenerator.cs:7877-7887`) used to return
 *    `null` while still spending their die, and the bar's shelves and counters used to
 *    be empty because `MakeItemAlcohol` was not ported. The bar's rolls come off
 *    `m_Game.Rules` rather than the district roller *in the reference too*, and that
 *    is the property worth pinning: two builds with different `Rules` seeds and the
 *    same district seed must record the same district dice and different bottles.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { District, DistrictKind } from "@data/District";
import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { imagePath } from "@engine/AssetPaths";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { makeBarBuilding } from "@gameplay/generators/BarBuilding";
import { makeFarmBuilding } from "@gameplay/generators/buildings/makeFarmBuilding";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { publicFilePath } from "./helpers/assetPath";

beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameFactions();
  new GameItems();
});

/**
 * The nine ids, in the order they were appended and with the values they were given.
 *
 * Written out rather than derived so that *appending* a tenth is a visible edit to
 * this array: a test that computed the expectation from the enum would agree with
 * every mistake the enum could make.
 */
const APPENDED: [ItemID, string, number][] = [
  [ItemID.VEGETABLE_SEEDS, "VEGETABLE_SEEDS", 179],
  [ItemID.LIQUOR_AMBER, "LIQUOR_AMBER", 180],
  [ItemID.LIQUOR_CLEAR, "LIQUOR_CLEAR", 181],
  [ItemID.UNIQUE_CHAR_DOCUMENT1, "UNIQUE_CHAR_DOCUMENT1", 182],
  [ItemID.UNIQUE_CHAR_DOCUMENT2, "UNIQUE_CHAR_DOCUMENT2", 183],
  [ItemID.UNIQUE_CHAR_DOCUMENT3, "UNIQUE_CHAR_DOCUMENT3", 184],
  [ItemID.UNIQUE_CHAR_DOCUMENT4, "UNIQUE_CHAR_DOCUMENT4", 185],
  [ItemID.UNIQUE_CHAR_DOCUMENT5, "UNIQUE_CHAR_DOCUMENT5", 186],
  [ItemID.UNIQUE_CHAR_DOCUMENT6, "UNIQUE_CHAR_DOCUMENT6", 187],
];

/** The six documents, whose only distinguishing field is the flavour text. */
const DOCUMENTS: [ItemID, string][] = [
  [ItemID.UNIQUE_CHAR_DOCUMENT1, "Notes that suggest CHAR were trying mutation experiments on rats."],
  [
    ItemID.UNIQUE_CHAR_DOCUMENT2,
    '"TEST #240 subjects showing violent tendencies yet decreased vital signs."',
  ],
  [ItemID.UNIQUE_CHAR_DOCUMENT3, '"Skin decay greatly accelerated in many but not all cases."'],
  [
    ItemID.UNIQUE_CHAR_DOCUMENT4,
    '"Effects vary by subject; speculate genetic differences manifest in patterns."',
  ],
  [ItemID.UNIQUE_CHAR_DOCUMENT5, '"TEST #241 should alter marker 17 for enhanced stength and smell."'],
  [
    ItemID.UNIQUE_CHAR_DOCUMENT6,
    "A memo regarding using generators to power to the facility in an emergency.",
  ],
];

describe("ItemID stayed append-only", () => {
  it("the last pre-existing id is still 178 and the count is 188", () => {
    expect(ItemID.MATCHES).toBe(178);
    expect(ItemID._COUNT).toBe(188);
  });

  it("the nine were appended at 179..187, in the order above", () => {
    for (const [id, name, value] of APPENDED) {
      expect(id, name).toBe(value);
      expect(ItemID[name as keyof typeof ItemID], name).toBe(value);    }
  });

  it("every number in 0.._COUNT-1 is claimed by exactly one name", () => {
    // The append-only guard proper. A duplicate value means two names share a saved
    // id; a gap means some id resolves to `undefined`, which
    // `model-data-binding.test.ts` would catch as a hole but not as *whose* fault.
    const names = Object.entries(ItemID).filter(
      ([k, v]) => typeof v === "number" && k !== "_COUNT",
    );
    expect(names).toHaveLength(ItemID._COUNT);
    expect(new Set(names.map(([, v]) => v)).size).toBe(ItemID._COUNT);
  });
});

describe("the models are the C#'s, field for field", () => {
  it("the vegetable seeds keep the reference's spelling", () => {
    const m = Models.items.get(ItemID.VEGETABLE_SEEDS);
    // `vegie`, not `veg` or `veggie`. `GameItems.cs:2980` says so twice, in the
    // singular *and* the plural, which is what makes it a typo rather than a
    // deliberate word.
    expect(m.singleName).toBe("bunch of vegie seeds");
    expect(m.pluralName).toBe("bunch of vegie seeds");
    expect(m.flavorDescription).toBe(
      "Use a shovel or pickaxe to plant seeds. Return later to harvest.",
    );
    expect(m.isStackable).toBe(true);
    expect(m.stackingLimit).toBe(9);
    expect(m.canGoInBackpacks).toBe(true);
    expect(m.imageId).toBe(GameImages.ITEM_VEGETABLE_SEEDS);
  });

  it("both liquors are named liquor, stack three deep, and say so", () => {
    for (const id of [ItemID.LIQUOR_AMBER, ItemID.LIQUOR_CLEAR]) {
      const m = Models.items.get(id);
      expect(m.singleName, ItemID[id]).toBe("liquor");
      expect(m.pluralName, ItemID[id]).toBe("liquor");
      expect(m.flavorDescription, ItemID[id]).toBe("Use them to make molotovs.");
      expect(m.isStackable, ItemID[id]).toBe(true);
      expect(m.stackingLimit, ItemID[id]).toBe(3);
      expect(m.canGoInBackpacks, ItemID[id]).toBe(true);
    }
    // Two ids, two sprites. One model with two names would make the C#'s
    // `Roll(0, 2)` in `MakeItemLiquorForMolotov` choose between two of one thing.
    expect(Models.items.get(ItemID.LIQUOR_AMBER).imageId)
      .not.toBe(Models.items.get(ItemID.LIQUOR_CLEAR).imageId);
  });

  it("the six documents share one sprite and carry six distinct flavours", () => {
    const flavours = DOCUMENTS.map(([id, flavour]) => {
      const m = Models.items.get(id);
      expect(m.singleName, ItemID[id]).toBe("CHAR document");
      expect(m.pluralName, ItemID[id]).toBe("CHAR documents");
      expect(m.imageId, ItemID[id]).toBe(GameImages.ITEM_CHAR_DOCUMENT);
      expect(m.flavorDescription, ItemID[id]).toBe(flavour);
      return m.flavorDescription;
    });
    expect(new Set(flavours).size).toBe(6);
  });

  it("no document is stackable, equipable or plural, because the C# sets nothing", () => {
    for (const [id] of DOCUMENTS) {
      const m = Models.items.get(id);
      expect(m.stackingLimit, ItemID[id]).toBe(1);
      expect(m.isStackable, ItemID[id]).toBe(false);
      expect(m.isPlural, ItemID[id]).toBe(false);
      expect(m.isEquipable, ItemID[id]).toBe(false);
      // The C#'s one flag, Release 8-2.
      expect(m.canGoInBackpacks, ItemID[id]).toBe(true);
    }
  });

  it("four of the six flavours keep the C#'s quotation marks and two do not", () => {
    // `@"""TEST #240 …"""` in C# is a verbatim string whose first and last character
    // are literal quotes. Preserved rather than regularised, and asserted on both
    // sides so a future "tidy the strings" pass is a red test. Two of the six are
    // bare in the reference -- document 1 and document 6 -- and stay bare here.
    const quoted = DOCUMENTS.filter(([, flavour]) => flavour.startsWith('"')).map(([id]) => id);
    expect(quoted).toEqual([
      ItemID.UNIQUE_CHAR_DOCUMENT2,
      ItemID.UNIQUE_CHAR_DOCUMENT3,
      ItemID.UNIQUE_CHAR_DOCUMENT4,
      ItemID.UNIQUE_CHAR_DOCUMENT5,
    ]);
    expect(DOCUMENTS[4][1]).toContain("stength"); // the reference's typo, kept
  });
});

describe("every one of the nine resolves to a sprite that exists", () => {
  const ids = [
    ItemID.VEGETABLE_SEEDS,
    ItemID.LIQUOR_AMBER,
    ItemID.LIQUOR_CLEAR,
    ...DOCUMENTS.map(([id]) => id),
  ];

  it("there are nine of them and four distinct sprites", () => {
    expect(ids).toHaveLength(9);
    expect(new Set(ids.map((id) => Models.items.get(id).imageId)).size).toBe(4);
  });

  it.each(APPENDED.map(([id, name]) => [name, id] as const))(
    "%s resolves to a sprite file that exists",
    (_name, id) => {
      const url = imagePath(Models.items.get(id).imageId);
      expect(url, ItemID[id]).toMatch(/\.webp$/);
      expect(existsSync(resolve(__dirname, "..", publicFilePath(url))), url).toBe(true);
    }
  );
});

// ── Consumers ────────────────────────────────────────────────────────────────
//
// Both harnesses drive the generator through a context captured from the dispatch,
// for the reason `tests/farm-building.test.ts` gives: the placement primitives are
// private on the generator, so a stub pushed into `TOWN_BUILDING_PASSES` is the only
// way at the genuine article from outside the class.

let borrowed: TownBuildingContext | null = null;

function borrowContext(): TownBuildingContext {
  if (borrowed) return borrowed;
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
    newGenerator().generate(1);
  } finally {
    TOWN_BUILDING_PASSES.length = 0;
    TOWN_BUILDING_PASSES.push(...saved);
    // **Still Alive from here on.** `Feature.Bar` and `Feature.Farm` are both gated,
    // and both gates are the first statement in the generator, so a CLASSIC session
    // builds neither and every assertion below would pass on an empty map.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
  }
  expect(captured).not.toBeNull();
  borrowed = captured as unknown as TownBuildingContext;
  return borrowed as unknown as TownBuildingContext;
}

function newParams(width = 40, height = 40): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = height;
  return params;
}

function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator(
    { rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never,
    params,
  );
}

/** A roller that remembers every range it was asked for, and in what order. */
class RecordingRoller extends DiceRoller {
  readonly calls: string[] = [];
  private readonly pinned: Map<string, number>;

  constructor(seed: number, pinned: [number, number, number][] = []) {
    super(seed);
    this.pinned = new Map(pinned.map(([min, max, value]) => [`${min},${max}`, value]));
    const real = this.roll.bind(this);
    this.roll = (min: number, max: number): number => {
      const value = this.pinned.get(`${min},${max}`) ?? real(min, max);
      this.calls.push(`${min},${max}`);
      return value;
    };
  }
}

/** A blank grass plot, so a farm is not measured against leftover furniture. */
function plot(width = 40, height = 40): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  }
  return map;
}

/** A block whose inside rect is exactly `inside` square; `Block` insets twice. */
function blockWithInside(inside: number, left = 6, top = 6): Block {
  return new Block(new Rect(left, top, inside + 4, inside + 4));
}

/** Every ground item on the map, flattened out of the per-tile inventories. */
function groundItems(map: GameMap): Item[] {
  const out: Item[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const inv = map.getItemsAt(new Point(x, y));
      if (inv) out.push(...inv.items);
    }
  }
  return out;
}

describe("the farm shed builds the six arms it used to skip", () => {
  it("roll(0, 12) == 5 is a seed, and the die is the only thing that moved", () => {
    // `MakeFarmShedItem`'s `case 5` is one of six (`case 5..9`, plus `case 11`'s
    // else). Every one of them used to return `null` and leave the tile bare.
    const roller = new RecordingRoller(3, [[0, 12, 5]]);
    const map = plot();
      makeFarmBuilding({ ...borrowContext(), map, block: blockWithInside(12), roller });

    const seeds = groundItems(map).filter((i) => i.model.id === ItemID.VEGETABLE_SEEDS);
    expect(seeds.length, "the shed tile that rolled seeds got seeds").toBeGreaterThan(0);
    for (const seed of seeds) {
      // `MakeItemVegetableSeeds` is `new Item(GameItems.VEGETABLE_SEEDS)
      // { IsForbiddenToAI = true }` and nothing else.
      expect(seed.isForbiddenToAI).toBe(true);
      // `if (it.Model.IsStackable) it.Quantity = it.Model.StackingLimit`, so a shed
      // hands out a full stack rather than a single seed.
      expect(seed.quantity).toBe(9);
    }
  });

  it("all six seed arms build, and only the shed's own roll is spent", () => {
    // `roll(0, 12)` is still spent exactly once per eligible shed tile whatever it
    // came up as -- that is the property the skip was written to preserve, and it is
    // the reason restoring the drop cannot move the district.
    for (const arm of [5, 6, 7, 8, 9]) {
      const roller = new RecordingRoller(3, [[0, 12, arm]]);
      const map = plot();
    makeFarmBuilding({ ...borrowContext(), map, block: blockWithInside(12), roller });
      expect(
        groundItems(map).some((i) => i.model.id === ItemID.VEGETABLE_SEEDS),
        `arm ${arm} drops seeds`,
      ).toBe(true);
    }
  });
});

describe("the bar's shelves hold the C#'s alcohol", () => {
  /** A 13x13 block, so `insideRect` is 9x9 -- over the C#'s 5x5 minimum. */
  const BAR_BLOCK = new Rect(0, 0, 13, 13);
  /** 24 wide: `round(floor(24 / 10) / 2.5) == 1`, so a map that fits exactly one bar. */
  const ONE_BAR_MAP_WIDTH = 24;

  function buildBar(
    districtSeed: number,
    rulesSeed: number,
  ): { map: GameMap; roller: RecordingRoller } {
    const map = new GameMap(districtSeed, "bar", ONE_BAR_MAP_WIDTH, ONE_BAR_MAP_WIDTH);
    const roller = new RecordingRoller(districtSeed);
    makeBarBuilding(
      {
        ...borrowContext(),
        map,
        block: new Block(BAR_BLOCK),
        roller,
        game: { rules: new Rules(new DiceRoller(rulesSeed)) },
      },
      0,
    );
    return { map, roller };
  }

  it("a bar puts bottles on its shelves and none on its counters", () => {
    // The C# drops the *counter's* bottle on `shelfpt` in all four arms
    // (`:2462`, `:2502`, `:2542`, `:2582`), so every bottle in a bar is on the shelf
    // line and a counter is an empty container. Getting this right matters because the
    // opposite reading -- "drop it where the counter is" -- looks obviously correct.
    const { map } = buildBar(3, 99);
    const shelves = map.mapObjects.filter((o) => o.name === "shelf");
    const counters = map.mapObjects.filter((o) => o.name === "counter");
    expect(shelves.length).toBeGreaterThan(0);
    expect(counters.length).toBeGreaterThan(0);

    const onShelves = shelves.filter((s) => (map.getItemsAt(s.location.position)?.countItems ?? 0) > 0);
    const onCounters = counters.filter((c) => (map.getItemsAt(c.location.position)?.countItems ?? 0) > 0);
    expect(onShelves.length, "the shelf line carries the bottles").toBeGreaterThan(0);
    expect(onCounters.length, "no counter carries one").toBe(0);
  });

  it("two thirds of them are beer and one third is liquor, as the C#'s RollChance(66) says", () => {
    const beers = new Set([
      ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_BROWN,
      ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN,
      ItemID.MEDICINE_ALCOHOL_BEER_CAN_BLUE,
      ItemID.MEDICINE_ALCOHOL_BEER_CAN_RED,
    ]);
    const liquors = new Set([ItemID.LIQUOR_AMBER, ItemID.LIQUOR_CLEAR]);

    const tally = { beer: 0, liquor: 0, other: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      for (const item of groundItems(buildBar(seed, seed * 7 + 1).map)) {
        if (beers.has(item.model.id)) tally.beer++;
        else if (liquors.has(item.model.id)) tally.liquor++;
        else tally.other++;
      }
    }
    expect(tally.other, "a bar holds nothing but alcohol").toBe(0);
    expect(tally.beer).toBeGreaterThan(0);
    expect(tally.liquor).toBeGreaterThan(0);
    // 66/34 with two thousand draws: the exact ratio is not the claim, a bar that only
    // ever stocked one of the two is.
    expect(tally.beer / (tally.beer + tally.liquor)).toBeGreaterThan(0.5);
    expect(tally.beer / (tally.beer + tally.liquor)).toBeLessThan(0.8);
  });

  it("a beer is an ItemMedicine and a liquor is a plain Item", () => {
    // The C#'s `MakeItemAlcohol` unwraps its child's return and rebuilds it, so the
    // two thirds that are beer really are a different *class*. Collapsing them into
    // one factory would drop the distinction `Item.ts` and the inventory both ask
    // about, and `ItemMedicine`'s constructor would reject the liquor's model anyway.
    const classes = { medicine: 0, plain: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      for (const item of groundItems(buildBar(seed, seed * 13 + 5).map)) {
        if (item instanceof ItemMedicine) classes.medicine++;
        else classes.plain++;
      }
    }
    expect(classes.medicine).toBeGreaterThan(0);
    expect(classes.plain).toBeGreaterThan(0);
  });

  it("a liquor is a stack of six over a limit of three, because the C# says so", () => {
    // `GameItems.cs:3024` sets `StackingLimit = 3`; `BaseMapGenerator.cs:1953-1954`
    // sets `quantity = 6`. Both are transcribed and neither is reconciled.
    let sawLiquor = false;
    for (let seed = 1; seed <= 60 && !sawLiquor; seed++) {
      for (const item of groundItems(buildBar(seed, seed * 3 + 11).map)) {
        if (item.model.id === ItemID.LIQUOR_AMBER || item.model.id === ItemID.LIQUOR_CLEAR) {
          expect(item.quantity).toBe(6);
          expect(item.model.stackingLimit).toBe(3);
          sawLiquor = true;
          break;
        }
      }
    }
    expect(sawLiquor, "a liquor turned up, so the pair above was asserted").toBe(true);
  });

  it("the alcohol costs the district no dice at all", () => {
    // **The load-bearing claim about `MakeItemAlcohol`.** It rolls
    // `m_Game.Rules.RollChance(66)` and then the child's own `Roll(0, 4)` / `Roll(0, 2)`
    // -- the *session's* roller, not the district's `m_DiceRoller` the bar pass owns.
    // Two builds of the same bar that differ only in their `Rules` seed must therefore
    // record an identical district dice sequence and disagree about their bottles.
    // It is the opposite of what `makeChurchBuilding` and `makeJunkyard` are forced to
    // do with their own `m_Game.Rules` rolls, and it is deliberate.
    const a = buildBar(3, 1);
    const b = buildBar(3, 9999);
    expect(b.roller.calls).toEqual(a.roller.calls);

    const bottleIds = (map: GameMap) => groundItems(map).map((i) => `${i.model.id}x${i.quantity}`).sort();
    expect(bottleIds(b.map)).not.toEqual(bottleIds(a.map));
  });
});

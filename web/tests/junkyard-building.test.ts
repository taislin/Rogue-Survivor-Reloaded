import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { Map as GameMap } from "@data/Map";
import { MapObject, MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { District, DistrictKind } from "@data/District";
import { Models } from "@data/Models";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Barrel, Car, DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { BaseTownGenerator, Block, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { JUNKYARD_ROLL_MAX, makeJunkyard } from "@gameplay/generators/buildings/makeJunkyard";
import { TOWN_BUILDING_PASSES } from "@gameplay/generators/TownBuilding";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

/**
 * `Feature.Junkyard` — the C#'s `MakeJunkyard` (`BaseTownGenerator.cs:3537`),
 * and the one call site that reaches it from `BaseTownGenerator.generate()`.
 *
 * Five things are worth pinning, and only the last of them is "the fence is the
 * right sprite":
 *
 * 1. **The dispatch is live, and it is a shared die.** The junkyard is not a
 *    `case` like the bar and the bank but the trailing `else` of the parks
 *    region's `Roll(0, 99)` (`:570-581`), so its band is `rolled < 10` and the
 *    roll is spent by the pass, not by the generator. A generator wired to
 *    nothing, and a generator that rolls for itself, both look right in review.
 * 2. **Two of the things the C# writes never happen.** Its three roller doors are
 *    refused, because the fence fill at `:3551` has already put a chain wire
 *    fence on every tile of the perimeter the doors want; and its `DECO_JUNKYARD`
 *    sign is unreachable, because `DecorateOutsideWalls` skips walkable tiles and
 *    `:3557` made the whole perimeter walkable dirt. Both are transliterated, and
 *    a test that asserted "there is a door" would be asserting a fix while one
 *    that asserted "there is a sign" would be asserting a lie.
 * 3. **The size precondition is the C#'s, exactly.** `InsideRect < 5` returns
 *    false with the block untouched and `InsideRect == 5` builds — and a block of
 *    `n` has an inside rect of `n - 4`, so the boundary block is 9x9.
 * 4. **The junk fill and the salvage table are the C#'s**, roll for roll,
 *    including the `roll(0, 99)` band whose two comments both say 40% and
 *    neither of which is.
 * 5. **CLASSIC is byte-identical.** The half that matters. A gate that ran after
 *    the dispatch rolls would leave every Classic world a die or two short of the
 *    Still Alive one, and every stage after this one comes off the moved stream.
 *    So the Classic fingerprint is a committed value — the *same* one
 *    `bank-building.test.ts` holds, which is the proof that this building cost a
 *    classic world nothing — and what makes it non-vacuous is that the Still
 *    Alive fingerprint for the same seed differs.
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

/** A 40x40 district: nine blocks, the size the committed fingerprints use. */
const MAP = 40;
const SEED = 1;
/**
 * A 100x100 district, for the tests that need a junkyard to turn up in ordinary
 * play. The C#'s rate is 10% of the blocks the parks region rolls for, and the
 * port's parks stage has already claimed most of a small map's blocks, so a 40x40
 * district offers about one block and a junkyard lands roughly one district in a
 * hundred. A full-size district offers a dozen or more, which makes a sweep of
 * fifty seeds a fixture rather than a coin toss.
 */
const BIG = 100;

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
 * Counts the dispatch calls, so "the seam is live" is measured rather than assumed.
 *
 * **It counts blocks now, not a stage.** `makeJunkyards(map, emptyBlocks)` was a
 * second pass over the pool with its own `rollChance(parkBuildingChance)`; the green
 * cascade is now `makeGreenBuilding(map, b, rolled)`, one call per block that reached
 * the parks region's gate, so "the cascade ran" is a block count and not a stage
 * count. See `BaseTownGenerator.generate`.
 */
class JunkyardSpy extends BaseTownGenerator {
  greenBlocks = 0;

  protected override makeGreenBuilding(map: GameMap, b: Block, rolled: number): boolean {
    ++this.greenBlocks;
    return super.makeGreenBuilding(map, b, rolled);
  }
}

/**
 * A generator with the feature *removed*, not merely gated off: the stage is
 * overridden away, so no roll is taken and no building is built. A Classic
 * district from this must be byte-identical to a Classic district from the real
 * class, and the only way that can fail is something in the stage running anyway.
 */
class NoJunkyards extends BaseTownGenerator {
  protected override makeGreenBuilding(): boolean {
    // no build, and no roll either: the `roll(0, 99)` is the parks region's and is
    // spent by the caller, not by an arm.
    return false;
  }
}

function newSpy(params = newParams()): JunkyardSpy {
  return new JunkyardSpy({ rules, ApplyOnFire: () => undefined } as never, params);
}

function newNoJunkyards(params = newParams()): NoJunkyards {
  return new NoJunkyards({ rules, ApplyOnFire: () => undefined } as never, params);
}

function junkyardZones(map: GameMap): string[] {
  return map.zones.map((z) => z.name).filter((n) => n.startsWith("Junkyard@"));
}

/**
 * A whole-district fingerprint: every tile's model, its map object, its
 * decorations and its inside flag, through two independent accumulators.
 *
 * Deliberately the same two accumulators, in the same order, as
 * `bank-building.test.ts`'s — the committed values are only comparable between
 * the two files because the function is, and a classic district that changed
 * under this building would have to change that committed constant.
 */
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
 * Everything a junkyard can leave on a district, as one sorted list. Any of these
 * appearing under CLASSIC is the bug the feature gate exists to prevent, and
 * listing them rather than counting `Junkyard@` zones means a junkyard that
 * somehow lost its zone is still caught.
 *
 * The phase-0 cars are the giveaway that this is *not* `addWreckedCarsOutside`:
 * the port's own `makeObjWreckedCar` draws from vanilla's `car1..car4`, and only
 * `makeJunkyard` reaches the C#'s five coloured models.
 */
function junkyardTraces(map: GameMap): string[] {
  const out: string[] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj && /chainwire_fence|empty_barrel|MapObjects\/junk$|car_.*_phase0|police_car_phase0/.test(obj.imageId)) {
        out.push(`object ${obj.imageId}@${x},${y}`);
      }
      for (const deco of map.getTileAt(x, y)!.getDecorations ?? [])
        if (deco === GameImages.DECO_JUNKYARD) out.push(`deco ${deco}@${x},${y}`);
    }
  }
  return out.sort();
}

/**
 * A `TownBuildingContext` with the generator's real placement primitives, rather
 * than a re-declaration of them: the delegates are private on
 * `BaseTownGenerator`, so a stub in `TOWN_BUILDING_PASSES` is the only way to get
 * the genuine article. The map, the block and the roller are then swapped per
 * test, which is exactly what `buildingContext()` does per block.
 */
let borrowedContext: TownBuildingContext | null = null;
function contextFor(map: GameMap, block: Block, roller: DiceRoller): TownBuildingContext {
  if (!borrowedContext) throw new Error("captureContext() first");
  return { ...borrowedContext, map, block, roller };
}
const originalRuleset = Session.get().ruleset;
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
    // The ruleset is global mutable state and every test in this file sets it
    // itself, so the capture must not be the thing that decides it.
    Session.get().ruleset = originalRuleset;
  }
  expect(captured).not.toBeNull();
  borrowedContext = captured as unknown as TownBuildingContext;
}
beforeAll(captureContext);

/**
 * A roller that answers from a script, so a test can say which arm of the method
 * it wants — which of the five junk bands, which of the ten salvage models —
 * without depending on a seed.
 *
 * Two ways to answer, and the difference matters:
 *
 * - `defaults` is keyed on `max` and is consulted **first**, so a range the test
 *   pins down is answered the same way however many times it comes up, and
 *   without eating the script. `{4: 0}` is what keeps the door side (`:3574`) and
 *   the spray paint's colour roll (`:1551`) — both `Roll(0, 4)` — out of a script
 *   that is counting something else. A range the test does not name falls back to
 *   `min`, which is the C#'s own degenerate `Roll(n, n)` and is a valid answer for
 *   a stack size.
 * - `rolls` is an **ordered** script, one entry per remaining `roll`. It is the
 *   only way to tell two `Roll(0, 99)` apart — the junk pick and the salvage roll
 *   — because the C# spends two of them back to back and the method has no other
 *   handle on either.
 *
 * `rollChance` is overridden rather than left to delegate to `roll(0, 100)`, so
 * it never consumes the script and a test reads the way the C# does: one
 * `RollChance`, one `Roll`, in the C#'s order.
 */
class ScriptedRoller {
  private readonly rolls: number[];
  private readonly chances: boolean[];
  private readonly defaults: Record<number, number>;
  private readonly defaultChance: boolean;

  constructor(
    rolls: readonly number[] = [],
    chances: readonly boolean[] = [],
    opts: { defaults?: Record<number, number>; defaultChance?: boolean } = {}
  ) {
    this.rolls = [...rolls];
    this.chances = [...chances];
    this.defaults = opts.defaults ?? {};
    this.defaultChance = opts.defaultChance ?? false;
  }

  roll(min: number, max: number): number {
    const pinned = this.defaults[max];
    if (pinned !== undefined) return pinned;
    return this.rolls.length > 0 ? (this.rolls.shift() as number) : min;
  }

  rollChance(_chance: number): boolean {
    return this.chances.length > 0 ? this.chances.shift() === true : this.defaultChance;
  }

  asRoller(): DiceRoller {
    return this as unknown as DiceRoller;
  }
}

/** A real roller with only the `roll(0, 4)` door side scripted, as the bank does. */
function junkyardRoller(opts: { doorSides?: number[]; seed?: number } = {}): DiceRoller {
  const { doorSides = [0], seed = 1 } = opts;
  const roller = new DiceRoller(seed);
  const real = roller.roll.bind(roller);
  const pick = (script: number[], i: number) => (script.length ? script[i % script.length] : 0);
  let doorSideRolls = 0;
  roller.roll = (min: number, max: number) => {
    if (min !== 0 || max !== 4) return real(min, max);
    return pick(doorSides, doorSideRolls++);
  };
  return roller;
}

/** A fresh map, grass all over, for one building to stand on. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  return map;
}

/**
 * The block used for the arm-by-arm tests: 20x14 at (1,1), so
 * `buildingRect = (2,2,18,12)` — left 2, right 20, top 2, bottom 14 — and
 * `insideRect = (3,3,16,10)`, and `midX = 11`, `midY = 8`. Big enough for the
 * C#'s 5x5 floor on every side and for a driveway a tile outside the fence.
 */
const ARM = new Rect(1, 1, 20, 14);

/** Every object on the map inside `rect`, as `imageId@x,y`. */
function objectsIn(map: GameMap, rect: Rect): string[] {
  const out: string[] = [];
  for (let x = rect.left; x < rect.right; x++)
    for (let y = rect.top; y < rect.bottom; y++) {
      const obj = map.getMapObjectAt(x, y);
      if (obj) out.push(`${obj.imageId}@${x},${y}`);
    }
  return out;
}

/** A tile's decorations; `null` and `[]` both mean none. */
function decorationsAt(map: GameMap, x: number, y: number): string[] {
  return [...(map.getTileAt(x, y)?.getDecorations ?? [])];
}

/**
 * The ordered `roll` script for filling a whole yard with junk piles (the C#'s
 * 40..78 band) whose every tile rolls `salvageRoll` for the salvage drop and,
 * when that drop happens, `pick` for the model.
 *
 * The C# spends two `Roll(0, 99)` per junk tile and they are indistinguishable by
 * range — the junk pick (`:3644`) and the salvage roll (`:3650`) — so the script
 * is the only way to say which is which, and the third entry exists only for the
 * tiles that actually drop: `MakeJunkyardItem`'s `Roll(0, 15)` (`:7844`) is
 * *after* the salvage roll's `if`, so a yard that drops nothing spends two rolls
 * per tile and a yard that drops on every tile spends three, and a script written
 * for one is misaligned for the other from the second tile on.
 */
function junkPerTileScript(tiles: number, salvageRoll: number, pick: number): number[] {
  const script: number[] = [];
  for (let i = 0; i < tiles; i++) {
    script.push(50, salvageRoll); // the junk pick, then the salvage roll
    if (salvageRoll <= 60) script.push(pick); // the salvage model's own pick
  }
  return script;
}

/** The item ids dropped anywhere in `rect`, as a set. */
function itemsIn(map: GameMap, rect: Rect): Set<number> {
  const found = new Set<number>();
  for (let x = rect.left; x < rect.right; x++)
    for (let y = rect.top; y < rect.bottom; y++)
      for (const it of map.getItemsAt(new Point(x, y))?.items ?? []) found.add(it.model.id);
  return found;
}

afterEach(() => {
  Session.get().ruleset = originalRuleset;
});

/**
 * Every junkyard a sweep of full-size districts turned up, as `{ map, zone }`, and
 * the seeds they came from.
 *
 * Swept once and memoised because the four tests that want it are the same
 * question asked four ways, and a sweep of full-size generations is not cheap.
 * It collects *several* rather than the first, because the C# fills a yard with
 * three junk bands and a single yard is a coin toss as to whether it got any
 * wrecked cars at all — the car band is a fifth of the fill, so the smallest
 * legal yard gets fifteen objects and about three of them are cars, and "there is
 * a car somewhere" off one of them would be a claim about luck rather than about
 * the code.
 */
const junkyardSweepLimit = 60;
const junkyardSweepWant = 6;
let swept: Array<{ map: GameMap; zone: GameMap["zones"][number] }> = [];
let sweptSeedsList: number[] = [];
beforeAll(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  try {
    for (let seed = 1; seed <= junkyardSweepLimit && swept.length < junkyardSweepWant; seed++) {
      const map = newGenerator(newParams(BIG, BIG)).generate(seed);
      const zones = map.zones.filter((z) => z.name.startsWith("Junkyard@"));
      if (zones.length === 0) continue;
      sweptSeedsList.push(seed);
      for (const zone of zones) swept.push({ map, zone });
    }
  } finally {
    Session.get().ruleset = originalRuleset;
  }
});

/**
 * The swept junkyards, or a failure that says how far the sweep got — the point
 * of naming the seeds is that "no junkyard in sixty districts" is a claim about
 * the port's rate and not about this one seed.
 */
function sweptJunkyards(): Array<{ map: GameMap; zone: GameMap["zones"][number] }> {
  expect(
    swept.length,
    `only ${swept.length} junkyard(s) in ${junkyardSweepLimit} ${BIG}x${BIG} districts ` +
      `(seeds ${sweptSeedsList.join(",") || "none"}); the C#'s rate is ~1% of a block`
  ).toBeGreaterThan(0);
  return swept;
}
/**
 * The first seed the sweep found a junkyard on.
 *
 * For the two tests that assert the *cascade* was reached rather than that a
 * junkyard was built. The cascade used to be a pass, so it ran once per district
 * whatever the dice; it is now `makeGreenBuilding`, one call per block that survives
 * `RollChance(ParkBuildingChance)`, and a 40x40 district can offer it nothing at all
 * -- `SEED` is one of those. Rather than pin a second seed, this reuses the sweep the
 * suite already does at `BIG`.
 */
function firstSweptSeed(): number {
  sweptJunkyards();
  return sweptSeedsList[0];
}

/** The first swept junkyard, for the tests that only need one. */
function aJunkyard(): { map: GameMap; zone: GameMap["zones"][number] } {
  return sweptJunkyards()[0];
}

/** The block a `Junkyard@x-y` zone was cut from, as a fresh `Block`. */
function blockOf(zone: { bounds: Rect }): Block {
  const b = zone.bounds;
  return new Block(new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2));
}

/**
 * A generator whose junkyard pass runs with the two rolls *that pass* spends
 * forced to one answer, and every other roll left to the seed.
 *
 * The C#'s rate for a junkyard is about 1% of a block, and the port's parks stage
 * has already claimed most of a 40x40 district's blocks, so "the dispatch reaches
 * it" is otherwise a question of waiting for a seed. The force is installed for
 * the whole pass rather than the whole generation — forcing `roll(0, 100)` for
 * everything would make every park roll succeed and leave the pass no blocks at
 * all, which is the opposite of the point.
 *
 * The two rolls are told apart by range, which is what they are: the pass's
 * `RollChance(ParkBuildingChance)` is a `roll(0, 100)` and the parks cascade is a
 * `roll(0, 99)`, so the band is forced by overriding the arm and handing it a
 * different value than the one it was given.
 *
 * **It used to patch `DiceRoller.prototype.roll` instead**, which worked while the
 * cascade was a pass and spent its own two rolls. It does not any more, and the
 * failure was silent: the `roll(0, 99)` is drawn by `generate()` -- the parks region
 * owns that die and the arm only spends its own -- so a flag set inside the arm was
 * never set at the moment the draw happened, every "forced" band produced the *same*
 * natural district, and the test asserted a property of that one district six times.
 * Substituting the argument is both simpler and actually forcing something.
 */
class ForcedJunkyards extends JunkyardSpy {
  constructor(game: never, params: Parameters, private readonly band: number) {
    super(game, params);
  }

  protected override makeGreenBuilding(map: GameMap, b: Block, _rolled: number): boolean {
    return super.makeGreenBuilding(map, b, this.band);
  }
}

// ── Reached from the district generator ─────────────────────────────────────

describe("junkyard building, from BaseTownGenerator.generate()", () => {
  it("offers the cascade the blocks that passed the parks gate", () => {
    // Counted rather than assumed: a junkyard generator wired to nothing compiles,
    // looks right, and does nothing.
    //
    // **Blocks now, not stages.** The cascade used to be a pass of its own and was
    // called once per district; it is now `makeGreenBuilding`, one call per block
    // that survived `RollChance(ParkBuildingChance)`, which is what the C#'s single
    // gate implies. So the assertion is that it was reached *more than once* — a
    // district that offers it exactly one block could not tell a per-block hook from
    // a pass that ran once.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // At `BIG`, because `firstSweptSeed()` is a seed swept at `BIG` -- asking a 40x40
    // district to reproduce a 100x100 district's dice is asking for a different
    // world, and at that size the cascade can be offered nothing at all.
    const spy = newSpy(newParams(BIG, BIG));
    spy.generate(firstSweptSeed());
    expect(spy.greenBlocks, "generate() offered the green cascade some blocks").toBeGreaterThan(0);
  });

  it("reaches the generator on a roll in the junkyard's own band, and on no other", () => {
    // The C#'s parks cascade (`:570-581`) spends ONE `Roll(0, 99)` over five arms
    // and the junkyard is the trailing `else`, so its band is 0..9 **and 64** — the
    // farm's `< 64` against the park's `>= 65` leaves that one value matching no arm
    // above. Rather than wait for a seed, the cascade's roll is forced while the arm
    // runs (see `ForcedJunkyards`) and left real everywhere else.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (const [band, builds] of [
      [0, true],
      [9, true],
      [10, false],
      [63, false],
      [64, true],
      [99, false]
    ] as const) {
      const gen = new ForcedJunkyards(
        { rules, ApplyOnFire: () => undefined } as never,
        newParams(BIG, BIG),
        band
      );
      const map = gen.generate(firstSweptSeed());
      expect(gen.greenBlocks, `band ${band}: the cascade ran`).toBeGreaterThan(0);
      expect(junkyardZones(map).length > 0, `band ${band} builds`).toBe(builds);
    }
  });

  it("names the zone `Junkyard@x-y` off the C#'s MakeUniqueZone formula", () => {
    // C# `:3677`: `MakeUniqueZone("Junkyard", b.BuildingRect)`, and
    // `makeUniqueZone` (`BaseMapGenerator.ts:1592`) is
    // `${basename}@${left + floor(width/2)}-${top + floor(height/2)}`.
    for (const { map, zone } of sweptJunkyards()) {
      const name = zone.name;
      expect(name).toMatch(/^Junkyard@\d+-\d+$/);
      const b = zone.bounds;
      expect(name).toBe(`Junkyard@${b.left + Math.floor(b.width / 2)}-${b.top + Math.floor(b.height / 2)}`);
      // Demarked on the building rect, so the four walkway strips the C# adds at
      // `:3679` are the ones around *that* rect and no other.
      const outer = new Rect(b.left - 1, b.top - 1, b.width + 2, b.height + 2);
      const within = (r: Rect): boolean =>
        r.left >= outer.left && r.top >= outer.top && r.right <= outer.right && r.bottom <= outer.bottom;
      expect(map.zones.filter((z) => z.name.startsWith("walkway@") && within(z.bounds))).toHaveLength(4);
    }
  });

  it("fences the whole building rect on dirt, and paves exactly one driveway", () => {
    const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY)!;
    const dirt = Models.tiles.get(TileID.FLOOR_DIRT)!;
    const asphalt = Models.tiles.get(TileID.FLOOR_ASPHALT)!;

    for (const { map, zone } of sweptJunkyards()) {
      const b = blockOf(zone);
      expect(zone.bounds.equals(b.buildingRect)).toBe(true);

      // The C# lays dirt on the inside rect (`:3549`) and then dirt again under
      // every fence post (`:3557`), so the whole yard including the fence line is
      // walkable -- and the outer ring of the block is walkway (`:3548`).
      for (let x = b.insideRect.left; x < b.insideRect.right; x++)
        for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
          const tile = map.getTileAt(x, y)!;
          expect(tile.model, `inside ${x},${y} is dirt`).toBe(dirt);
          // `:3549`, with the `IsInside` decorator commented out at `:3550`: a
          // junkyard is lit like the street outside it.
          expect(tile.isInside, `inside ${x},${y} is not indoors`).toBe(false);
        }
      // The fence is every tile of the building rect's perimeter, and a chain
      // wire fence rather than the vanilla wooden one.
      for (let x = b.buildingRect.left; x < b.buildingRect.right; x++)
        for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
          const onEdge =
            x === b.buildingRect.left ||
            x === b.buildingRect.right - 1 ||
            y === b.buildingRect.top ||
            y === b.buildingRect.bottom - 1;
          if (!onEdge) continue;
          expect(map.getMapObjectAt(x, y)?.imageId, `perimeter ${x},${y} is fenced`).toBe(
            GameImages.OBJ_CHAINWIRE_FENCE
          );
          expect(map.getTileAt(x, y)!.model, `under the fence at ${x},${y}`).toBe(dirt);
        }
      expect(map.getTileAt(b.rectangle.left, b.rectangle.top)!.model, "the block's outer ring").toBe(walkway);

      // Exactly one driveway, one tile outside the fence, and it is the C#'s
      // asphalt (`:3586` and its three twins). The fence is `insideRect` plus one
      // tile all round, so the driveway is on the block's outer walkway ring.
      const paved: string[] = [];
      for (let x = b.rectangle.left; x < b.rectangle.right; x++)
        for (let y = b.rectangle.top; y < b.rectangle.bottom; y++)
          if (map.getTileAt(x, y)!.model === asphalt) paved.push(`${x},${y}`);
      expect(paved, "one driveway tile").toHaveLength(1);
      const [dx, dy] = paved[0].split(",").map(Number);
      const outsideTheFence =
        dx < b.buildingRect.left ||
        dx >= b.buildingRect.right ||
        dy < b.buildingRect.top ||
        dy >= b.buildingRect.bottom;
      expect(outsideTheFence, `the driveway at ${dx},${dy} is outside the fence`).toBe(true);
    }
  });

  it("puts junk, cars and barrels in the yard", () => {
    // The C#'s three junk bands (`:3645-3664`) and its fence, over every yard the
    // sweep found rather than one of them: the bands are 20% / 39% / 41% of a fill
    // that is itself 60% per tile, so a single small yard is not evidence that any
    // of them is reachable and a district with none of the three would still look
    // like a plausible junkyard.
    const traces = sweptJunkyards().flatMap(({ map }) => junkyardTraces(map));

    expect(traces.filter((t) => t.includes(GameImages.OBJ_JUNK)).length, "junk piles").toBeGreaterThan(0);
    expect(traces.filter((t) => /MapObjects\/barrels|empty_barrel/.test(t)).length, "barrels").toBeGreaterThan(0);
    // The trace is `imageId@x,y`, so the anchor is on the `@` and not on the id.
    expect(traces.filter((t) => /_phase0@/.test(t)).length, "wrecked cars").toBeGreaterThan(0);
    expect(traces.filter((t) => t.includes(GameImages.OBJ_CHAINWIRE_FENCE)).length, "fence").toBeGreaterThan(0);
  });
});

// ── The generator itself ────────────────────────────────────────────────────

describe("makeJunkyard", () => {
  it("returns false and touches nothing when the inside rect is under 5x5", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // A 6x6 block has a 2x2 inside rect, so the size check is what refuses.
    // `dispatchRoll` is 0 — the junkyard's own band — so the `false` here is the
    // size check and nothing else.
    const map = plot();
    const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
    const block = new Block(new Rect(2, 2, 6, 6));
    expect(makeJunkyard(contextFor(map, block, junkyardRoller()), 0)).toBe(false);

    expect(map.zones).toHaveLength(0);
    expect(map.mapObjects).toHaveLength(0);
    for (let x = 0; x < MAP; x++) for (let y = 0; y < MAP; y++) expect(map.getTileAt(x, y)!.model).toBe(grass);
  });

  it("accepts an inside rect of exactly 5x5, the C#'s boundary", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // `InsideRect.Width < 5` is a strict `<`, so 5 builds — and 5 means a 9x9
    // block, since a block of n has an inside rect of n - 4. A generator that
    // wrote `<=` would hand this block to the housing pass instead, and that
    // off-by-four is invisible anywhere else.
    const map = plot();
    const block = new Block(new Rect(2, 2, 9, 9));
    expect(block.insideRect.width).toBe(5);
    expect(block.insideRect.height).toBe(5);
    expect(makeJunkyard(contextFor(map, block, junkyardRoller()), 0)).toBe(true);
    expect(junkyardZones(map)).toHaveLength(1);
  });

  it("declines every roll that is not its own band of the parks cascade", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:570-581`: one `Roll(0, 99)` over five arms, and the junkyard is the
    // trailing `else`, so 0..9 is all of it. The four arms above it are an
    // ordinary park (>= 65), a farm (30..64), a dog pound (20..29) and a graveyard
    // (10..19) — three of them `Feature.*` and none of them ported.
    expect(JUNKYARD_ROLL_MAX).toBe(10);
    const map = plot();
    for (const otherArm of [10, 19, 20, 29, 30, 63, 65, 99]) {
      const zonesBefore = map.zones.length;
      expect(makeJunkyard(contextFor(map, new Block(ARM), junkyardRoller()), otherArm), `roll ${otherArm}`).toBe(false);
      expect(map.zones, `roll ${otherArm} added no zone`).toHaveLength(zonesBefore);
    }
    // The whole band builds, so the `false`s above are the band and not a fixture
    // that never builds. A fresh map each time, because a built block changes the
    // map the next call would write to.
    for (let roll = 0; roll < JUNKYARD_ROLL_MAX; roll++) {
      const fresh = plot();
      expect(makeJunkyard(contextFor(fresh, new Block(ARM), junkyardRoller()), roll), `roll ${roll}`).toBe(true);
      expect(junkyardZones(fresh), `roll ${roll}`).toHaveLength(1);
    }
  });

  it("has no door and no sign, because the C#'s has neither", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // Two dead lines in the reference, both transliterated rather than fixed. See
    // the module header in `makeJunkyard.ts`.
    //
    // The doors: `:3551` fills the whole `BuildingRect` with chain wire fence, and
    // `:3579` then places three roller doors on three tiles of that same
    // perimeter. `PlaceDoor` hands the door to `MapObjectPlace`, which declines a
    // tile that already has an object. So the fence is where the gate is, and the
    // sign — which `:3628` only paints on a wall tile *next to* a door — has
    // nothing to paint next to.
    for (let side = 0; side < 4; side++) {
      const map = plot();
      const b = new Block(ARM);
      expect(makeJunkyard(contextFor(map, b, junkyardRoller({ doorSides: [side] })), 0), `side ${side}`).toBe(true);

      let doors = 0;
      for (let x = b.buildingRect.left; x < b.buildingRect.right; x++)
        for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
          if (map.getMapObjectAt(x, y) instanceof DoorWindow) ++doors;
          expect(decorationsAt(map, x, y), `no sign at ${x},${y}`).not.toContain(GameImages.DECO_JUNKYARD);
        }
      expect(doors, `side ${side}: the C#'s three roller doors are refused by its own fence`).toBe(0);
      // And `CountAdjDoors`, which is what `DecorateOutsideWalls` keys on, sees
      // nothing: checked on the tile the door would have gone on for each side.
      const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);
      const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
      const doorTiles = [
        new Point(b.buildingRect.left, midY),
        new Point(b.buildingRect.right - 1, midY),
        new Point(midX, b.buildingRect.top),
        new Point(midX, b.buildingRect.bottom - 1)
      ];
      expect(borrowedContext!.countAdjDoors(map, doorTiles[side].x, doorTiles[side].y), `side ${side}`).toBe(0);
    }
  });

  it("paves the driveway one tile outside the fence, on each of the four door sides", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3583-3622`, and the driveway coordinates are the C#'s own: one tile
    // beyond `BuildingRect` on the side the roll picked, which on `ARM` is
    // `(left - 1, midY)`, `(right, midY)`, `(midX, top - 1)`, `(midX, bottom)`.
    const asphalt = Models.tiles.get(TileID.FLOOR_ASPHALT)!;
    const b = new Block(ARM);
    const midX = b.rectangle.left + Math.trunc(b.rectangle.width / 2);
    const midY = b.rectangle.top + Math.trunc(b.rectangle.height / 2);
    const arms: Array<[string, number, number, number]> = [
      ["west", 0, b.buildingRect.left - 1, midY],
      ["east", 1, b.buildingRect.right, midY],
      ["north", 2, midX, b.buildingRect.top - 1],
      ["south", 3, midX, b.buildingRect.bottom]
    ];
    for (const [name, side, dx, dy] of arms) {
      const map = plot();
      expect(makeJunkyard(contextFor(map, b, junkyardRoller({ doorSides: [side] })), 0), name).toBe(true);
      expect(map.getTileAt(dx, dy)!.model, `${name} driveway at ${dx},${dy}`).toBe(asphalt);
      // And the C# clears whatever was parked there first (`:3585`), so the
      // driveway is never under a car.
      expect(map.getMapObjectAt(dx, dy), `${name} driveway is clear`).toBeNull();
    }
  });

  it("fills the yard with the C#'s three junk bands, roll for roll", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // `:3635-3670`. One `RollChance(60)` per inside-rect tile, then a `Roll(0,99)`
    // that says what: 80..99 a wrecked car, 40..78 a junk pile, everything else
    // barrels. `ScriptedRoller.defaults` is keyed on `max`, so "every Roll(0,99)
    // in this yard is 95" is one line and the whole yard is one band.
    const b = new Block(ARM);
    const bands: Array<{ name: string; pick: number; is: (obj: MapObject) => boolean }> = [
      { name: "a wrecked car", pick: 95, is: (o) => o instanceof Car && o.name === "wrecked car" },
      { name: "a junk pile", pick: 50, is: (o) => o.imageId === GameImages.OBJ_JUNK },
      {
        name: "barrels",
        pick: 0,
        is: (o) => o.imageId === GameImages.OBJ_BARRELS || o instanceof Barrel
      }
    ];
    for (const band of bands) {
      const map = plot();
      // `{4: 0}` is the door side (`:3574`) and would otherwise be the paint
      // colour; the default chance of `true` makes every tile be filled.
      const roller = new ScriptedRoller([], [], { defaults: { 99: band.pick, 4: 0 }, defaultChance: true }).asRoller();
      expect(makeJunkyard(contextFor(map, b, roller), 0), band.name).toBe(true);

      let placed = 0;
      for (let x = b.insideRect.left; x < b.insideRect.right; x++)
        for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
          const obj = map.getMapObjectAt(x, y);
          if (obj === null) continue;
          ++placed;
          expect(band.is(obj), `${band.name} at ${x},${y} is ${obj.imageId}`).toBe(true);
        }
      expect(placed, `the whole inside rect is ${band.name}`).toBe(b.insideRect.width * b.insideRect.height);
    }
  });

  it("picks the wrecked car off the C#'s five models, and rolls its fuel after the model", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `BaseMapGenerator.cs:557`: `MakeObjCar(CARS[roller.Roll(0, 5)], …,
    // roller.Roll(0, 30))`. C# evaluates the arguments left to right, so the model
    // comes off the roller *first*. The port's own protected `makeObjWreckedCar`
    // rolls the fuel first and draws from vanilla's `car1..car4`; this is the
    // C#'s order and the C#'s list, which is the argument for promoting the factory
    // to the context rather than for keeping two copies.
    const b = new Block(ARM);
    const map = plot();
    // `{5: 4, 30: 29}`: the police car, the last of the five, and a tank of 29.
    const roller = new ScriptedRoller([], [], { defaults: { 99: 95, 5: 4, 30: 29, 4: 0 }, defaultChance: true }).asRoller();
    expect(makeJunkyard(contextFor(map, b, roller), 0)).toBe(true);

    const cars: Car[] = [];
    for (let x = b.insideRect.left; x < b.insideRect.right; x++)
      for (let y = b.insideRect.top; y < b.insideRect.bottom; y++) {
        const obj = map.getMapObjectAt(x, y);
        if (obj instanceof Car) cars.push(obj);
      }
    expect(cars.length).toBeGreaterThan(0);
    for (const car of cars) {
      expect(car.imageId, "the police car, the last of the C#'s five models").toBe(GameImages.OBJ_POLICE_CAR_PHASE0);
      expect(car.fuelUnits, "a tank of 29, the second roll").toBe(29);
      // `Car` is UNINFLAMMABLE with no hit points: a car is a fuel source, not a
      // fire (`MapObjects.ts`).
      expect(car.fireState).toBe(MapObjectFire.UNINFLAMMABLE);
    }
  });

  it("splits the barrel band 60/40 into drums and a lit-able barrel", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3656-3659`. Both arms are containers, and the fire barrel is the one a
    // survivor can light, so getting the split wrong is a balance bug rather than
    // a cosmetic one. `chances` is the ordered `RollChance` script: the first is
    // the per-tile 60% at `:3638` and the second is this one at `:3656`.
    const b = new Block(ARM);
    const build = (chances: boolean[]): GameMap => {
      const map = plot();
      const roller = new ScriptedRoller([], chances, { defaults: { 99: 0, 4: 0 }, defaultChance: true }).asRoller();
      expect(makeJunkyard(contextFor(map, b, roller), 0)).toBe(true);
      return map;
    };
    const drums = build([true, true]);
    const lit = build([true, false]);

    // The first inside-rect tile is where the scripted second chance applies, so
    // the two maps differ there and agree everywhere after the script runs out.
    const first = new Point(b.insideRect.left, b.insideRect.top);
    expect(drums.getMapObjectAtPoint(first)!.imageId).toBe(GameImages.OBJ_BARRELS);
    expect(lit.getMapObjectAtPoint(first)).toBeInstanceOf(Barrel);
    // A drum stack is unbreakable and immovable (Release 6-2 / 7-6), which is a
    // flag the port's own vanilla `makeObjBarrels` does not carry.
    const stack = drums.getMapObjectAtPoint(first) as MapObject;
    expect(stack.breakState).toBe(MapObjectBreak.UNBREAKABLE);
    expect(stack.isMovable).toBe(false);
    expect(stack.isContainer).toBe(true);
    // And the fire barrel is a `Barrel` with a tank, so it can be lit at all.
    const barrel = lit.getMapObjectAtPoint(first) as Barrel;
    expect(barrel.isWalkable, "a cooking spot, not an obstacle").toBe(true);
    expect(barrel.fuelUnits).toBe(0);
  });

  it("drops a junkyard item under the pile, 61 times in 100", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3650-3652` and `:3661-3663`: the *same* three lines in both junk arms,
    // and the `<= 60` is an off-by-one on a `Roll(0, 99)` — 61 of 100 values, not
    // 60. Asserted on both sides of the boundary, because that is where an
    // off-by-one hides.
    //
    // The junk pick and the salvage roll are both `Roll(0, 99)` and the C# spends
    // them back to back, so they are told apart by position in the ordered script
    // rather than by range: pick 50 (a junk pile), then the salvage roll.
    const b = new Block(ARM);
    const tiles = b.insideRect.width * b.insideRect.height;
    for (const [salvageRoll, drops] of [
      [60, true],
      [61, false]
    ] as const) {
      const map = plot();
      const roller = new ScriptedRoller(
        junkPerTileScript(tiles, salvageRoll, 0),
        [],
        { defaults: { 4: 0 }, defaultChance: true }
      ).asRoller();
      expect(makeJunkyard(contextFor(map, b, roller), 0), `salvage roll ${salvageRoll}`).toBe(true);
      const found = itemsIn(map, b.insideRect);
      if (drops) {
        expect(found.size, `salvage roll ${salvageRoll} drops on every tile`).toBe(1);
        // And the C#'s case 0 of `MakeJunkyardItem` is a pipe wrench.
        expect([...found], "case 0 is a pipe wrench").toEqual([ItemID.MELEE_PIPE_WRENCH]);
      } else {
        expect([...found], `salvage roll ${salvageRoll} drops nothing`).toEqual([]);
      }
    }
  });

  it("maps the C#'s sixteen junkyard-item rolls to its ten models", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:7842` `MakeJunkyardItem`: one `Roll(0, 15)`, ten models, and six draws
    // of barbed wire. The whole yard is filled with the same model, so the table
    // is checked by exhaustion rather than by position.
    const b = new Block(ARM);
    const table: Array<[number, number]> = [
      [0, ItemID.MELEE_PIPE_WRENCH],
      [1, ItemID.MELEE_CROWBAR],
      [2, ItemID.MELEE_HUGE_HAMMER],
      [3, ItemID.SPRAY_PAINT1],
      [4, ItemID.LIGHT_BIG_FLASHLIGHT],
      [5, ItemID.TRAP_SPIKES],
      [6, ItemID.RANGED_SHOTGUN],
      [7, ItemID.SIPHON_KIT],
      [8, ItemID.PAINT_THINNER],
      // Six of the fifteen rolls are barbed wire: 9, 10, 11, 12, 13 and 14.
      [9, ItemID.TRAP_BARBED_WIRE],
      [14, ItemID.TRAP_BARBED_WIRE]
    ];
    for (const [pick, itemId] of table) {
      const map = plot();
      // Everything is answered by range, which is what this method's rolls are:
      // `roll(0, 99)` is the junk pick *and* the salvage roll, so both are pinned
      // to 0 — the barrels arm, and a salvage drop on every tile — and `roll(0,
      // 15)` is the salvage model. `roll(0, 4)` is pinned to 0 for both the door
      // side (`:3574`) and the spray paint's colour (`:1551`), and the three
      // factories that roll a stack size get `min`, i.e. a quantity of 1, because
      // the C# reads that off `Rules` and the seam has one roller.
      const roller = new ScriptedRoller([], [], {
        defaults: { 99: 0, 15: pick, 4: 0 },
        defaultChance: true
      }).asRoller();
      expect(makeJunkyard(contextFor(map, b, roller), 0), `pick ${pick}`).toBe(true);
      expect([...itemsIn(map, b.insideRect)], `pick ${pick}`).toEqual([itemId]);
    }
  });

  it("drops the salvage *under* the pile, which is a container", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // C# `:3652` calls `DropItemAt` from inside the `MapObjectFill` callback, and
    // `MapObjectFill` places the returned object afterwards — so the item lands on
    // the same tile as the junk. That is only reachable if the pile is a container,
    // which is the fork's Release 5-3 change and not the port's vanilla
    // `makeObjJunk`.
    const map = plot();
    const b = new Block(ARM);
    const roller = new ScriptedRoller([50, 0, 0], [], { defaults: { 4: 0 }, defaultChance: true }).asRoller();
    expect(makeJunkyard(contextFor(map, b, roller), 0)).toBe(true);

    const first = new Point(b.insideRect.left, b.insideRect.top);
    const pile = map.getMapObjectAtPoint(first) as MapObject;
    expect(pile.imageId).toBe(GameImages.OBJ_JUNK);
    expect(pile.isContainer, "the salvage is reachable").toBe(true);
    expect(pile.givesWood, "and the pile is wood").toBe(true);
    expect(pile.isPlural, "so it reads as 'some junk'").toBe(true);
    expect(pile.jumpLevel, "and the fork made it jumpable").toBe(1);
    expect((map.getItemsAt(first)?.items ?? []).length, "one item on the pile's own tile").toBe(1);
  });

  it("names the zone off the C#'s MakeUniqueZone formula, on the building rect", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const map = plot();
    const b = new Block(ARM);
    expect(makeJunkyard(contextFor(map, b, junkyardRoller()), 0)).toBe(true);

    // C# `:3677`: `MakeUniqueZone("Junkyard", b.BuildingRect)`, and
    // `makeUniqueZone` (`BaseMapGenerator.ts:1592`) is
    // `${basename}@${left + floor(width/2)}-${top + floor(height/2)}`.
    const zones = map.zones.filter((z) => z.name.startsWith("Junkyard@"));
    expect(zones).toHaveLength(1);
    expect(zones[0].name).toBe(
      `Junkyard@${b.buildingRect.left + Math.floor(b.buildingRect.width / 2)}-${
        b.buildingRect.top + Math.floor(b.buildingRect.height / 2)
      }`
    );
    expect(zones[0].bounds.equals(b.buildingRect), "demarked on the building rect, not the inside rect").toBe(true);
    // And the four walkway strips around the block and no other, C# `:3679`.
    const outer = b.rectangle;
    const within = (r: Rect): boolean =>
      r.left >= outer.left && r.top >= outer.top && r.right <= outer.right && r.bottom <= outer.bottom;
    expect(map.zones.filter((w) => w.name.startsWith("walkway@") && within(w.bounds))).toHaveLength(4);
  });

  it("is deterministic for a given block and roller", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // World generation is seeded, so `ctx.roller` is the only randomness allowed.
    // Same roller and same block, same map; a different roller has to give a
    // different answer, or the first assertion is vacuous.
    const build = (seed: number): string => {
      const map = plot();
      expect(makeJunkyard(contextFor(map, new Block(ARM), junkyardRoller({ doorSides: [1], seed })), 0)).toBe(true);
      return objectsIn(map, new Rect(0, 0, MAP, MAP)).join(",");
    };
    expect(build(20250929)).toBe(build(20250929));
    expect(build(20250929)).not.toBe(build(4242));
  });
});

// ── CLASSIC ─────────────────────────────────────────────────────────────────

describe("junkyard building under CLASSIC", () => {
  it("is never reached, even on a roll in its own band", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    // The dispatch roll is 0 — the junkyard's own band, and the C# would have
    // built on it — so the `false` here is the feature gate and not luck.
    const map = plot();
    expect(makeJunkyard(contextFor(map, new Block(ARM), junkyardRoller()), 0)).toBe(false);
    expect(map.zones).toHaveLength(0);
    expect(map.mapObjects).toHaveLength(0);
    expect(map.getTileAt(3, 3)!.model).toBe(Models.tiles.get(TileID.FLOOR_GRASS)!);
  });

  it("leaves a CLASSIC district with no trace of a junkyard", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = newGenerator().generate(SEED);

    expect(junkyardZones(map)).toEqual([]);
    // Fence, junk, drums, wrecked cars and the sign: nothing else in the game
    // draws any of them, and the phase-0 cars are only reachable from
    // `makeJunkyard`, so their absence is a stronger statement than the absence of
    // a zone.
    expect(junkyardTraces(map)).toEqual([]);
  });

  it("spends no dice under CLASSIC: the stage is byte-identical to a deleted one", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    // `NoJunkyards` overrides the stage away, so this is the same generation with
    // the feature deleted rather than switched off. Equal roll counts mean the
    // stage took nothing off the district's stream — *including* the
    // `RollChance(ParkBuildingChance)` the pass re-rolls and the `Roll(0, 99)`
    // cascade, both of which a gate placed after them would still have spent.
    // Every stage after this one — the registry, the churches, the housings, the
    // wrecked cars, the posters — comes off the moved stream, so a leaked die is
    // not one wrong tile but a different district.
    const rolls = (generate: () => GameMap): number => {
      const spy = vi.spyOn(DiceRoller.prototype, "roll");
      try {
        generate();
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };
    expect(rolls(() => newGenerator().generate(SEED))).toBe(rolls(() => newNoJunkyards().generate(SEED)));

    // And the layout, which is what the roll count is a proxy for.
    for (const seed of [1, 7, 42]) {
      expect(
        objectsIn(newGenerator().generate(seed), new Rect(0, 0, MAP, MAP)).join(","),
        `seed ${seed}`
      ).toBe(objectsIn(newNoJunkyards().generate(seed), new Rect(0, 0, MAP, MAP)).join(","));
    }
  });

  it("generates a CLASSIC district byte-identically, and the fingerprint sees the flag", () => {
    // Recorded from this seed with the dispatch present and the feature off, and
    // the *same value* `bank-building.test.ts` holds: a CLASSIC world pays
    // nothing for the junkyard, not even a die. Both gates run before
    // `rollChance(parkBuildingChance)` and the `roll(0, 99)`, which is the only
    // way that is true.
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = fingerprint(newGenerator().generate(SEED));
    expect(classic).toBe("9bb5e4907bc3f62c");

    // The two assertions that give the committed value meaning. A fingerprint
    // that ignored the world would pass the first line for any value; one that
    // returned a per-seed constant would pass both.
    expect(fingerprint(newGenerator().generate(4242))).not.toBe(classic);
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(fingerprint(newGenerator().generate(SEED))).not.toBe(classic);
  });

  it("does change the district when the flag is on, so the test above is not vacuous", () => {
    // Without this, "the fingerprints are equal" would also be true of a junkyard
    // stage that never built anything under either ruleset.
    const withJunkyard = fingerprint(aJunkyard().map);
    expect(withJunkyard, `seed ${sweptSeedsList.join(",")} really has a junkyard`).not.toBe(
      fingerprint(newGenerator().generate(SEED))
    );
  });
});

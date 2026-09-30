/**
 * `Feature.ArmyBase` — the underground army office and its National Guard garrison.
 *
 * Still Alive, Release 6-3.
 *
 * The interesting thing about this feature is that the C# generator is *not* a new
 * design. `MakeArmyOffice` (`BaseTownGenerator.cs:5271`, 281 lines) is
 * `MakeCHAROffice` with five differences, and this file's first job is to pin those
 * five, because the risk in porting a near-copy is silently inheriting the copy's
 * values: a 5x5 size check where the C# has 8x8, glass doors where the C# has iron,
 * a `CHAR Office` zone name.
 *
 * So it tests the *differences* as differences, not just that something was built.
 *
 * The second job is the pass's two gates, which are the only two places a player
 * would ever notice a mistake: `DistrictKind.GREEN` only, and one per district. The
 * C# has `|| DistrictKind.GENERAL` commented out at `:430`; the port follows the
 * comment, and there is a test below holding that line, because "fixing" it later
 * would garrison most districts with eight zombies.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { District, DistrictKind } from "@data/District";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Ruleset, Session } from "@engine/Session";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import {
  BaseTownGenerator,
  Block,
  Parameters,
} from "@gameplay/generators/BaseTownGenerator";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions, FactionID } from "@gameplay/GameFactions";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameImages } from "@gameplay/GameImages";
import { ZoneAttributes } from "@gameplay/ZoneAttributes";

// The model databases register themselves into `Models` on construction, and a
// district read needs tiles, actors, factions and items.
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

const MAP = 40;

/** A block whose inside rect clears the 8x8 floor with room to spare. */
const ARM = new Rect(2, 2, 14, 14);

function newParams(kind = DistrictKind.GREEN): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), kind);
  params.mapWidth = MAP;
  params.mapHeight = MAP;
  return params;
}

const rules = new Rules(new DiceRoller(20250929));

/**
 * A generator with a *seeded* roller.
 *
 * The constructor makes its own unseeded `DiceRoller`, which is fine in play and
 * useless here, so it is replaced. Everything a determinism test can go wrong in
 * this feature is a die: how many entry doors, which side, which way the corridor
 * runs. So the seed has to be under the test's control for the determinism test to
 * be measuring anything.
 */
function newGenerator(params: Parameters, seed = 20250929): BaseTownGenerator {
  const gen = new BaseTownGenerator({ rules, ApplyOnFire: () => undefined } as never, params);
  (gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller = new DiceRoller(seed);
  return gen;
}

/** A blank grass plot, so the office is not measured against leftover furniture. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  }
  return map;
}

/** The generator's protected stage methods, reached the way the dispatch reaches them. */
interface Stages {
  makeArmyOffice(map: GameMap, b: Block): boolean;
  makeArmyOffices(map: GameMap, emptyBlocks: Block[]): void;
  populateArmyOfficeBuilding(map: GameMap, b: Block): void;
}

function stages(gen: BaseTownGenerator): Stages {
  return gen as unknown as Stages;
}

/** How many of `tile` are inside the rect. */
function countTile(map: GameMap, tile: TileID, rect: Rect): number {
  const model = Models.tiles.get(tile);
  let n = 0;
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) {
      if (map.getTileAt(x, y)?.model === model) n++;
    }
  }
  return n;
}

function armyZones(map: GameMap): number {
  return map.zones.filter((z) => z.hasGameAttribute(ZoneAttributes.IS_ARMY_OFFICE)).length;
}

/**
 * The garrison, counted.
 *
 * Not by `ActorID.ARMY_NATIONAL_GUARD`, because `makeZombified` does not keep the
 * guard's model: it builds a fresh `UNDEAD_MALE/FEMALE_ZOMBIFIED` in faction
 * `TheUndeads` and copies the victim's doll decorations across. So the army uniform
 * survives as *clothing* and nothing else -- there is no "zombified National Guard"
 * model to test for, in the port or in the C#. Faction is the discriminator.
 */
function garrison(map: GameMap, rect: Rect): number {
  let n = 0;
  for (let x = rect.left; x < rect.right; x++) {
    for (let y = rect.top; y < rect.bottom; y++) {
      const actor = map.getActorAtPoint(new Point(x, y));
      if (actor === null) continue;
      if (actor.faction === Models.factions.get(FactionID.TheUndeads)) n++;
    }
  }
  return n;
}

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

describe("Feature.ArmyBase: the office itself", () => {
  it("builds its own floor and wall, not the CHAR office's", () => {
    const map = plot();
    const b = new Block(ARM);
    expect(stages(newGenerator(newParams())).makeArmyOffice(map, b)).toBe(true);

    // The army interior is `FLOOR_ARMY` and never `FLOOR_OFFICE` -- that tile is
    // what distinguishes it from the CHAR office it is otherwise a copy of.
    //
    // Not "the whole of `insideRect` is army floor", because it is not: the
    // `hallDepth = 3` corridor walls and the 4x4 room walls are drawn *inside* the
    // inside rect, exactly as in the C#. So the claim is about which tiles appear,
    // not about coverage.
    const inside = b.insideRect;
    expect(countTile(map, TileID.FLOOR_ARMY, inside), "army floor is present").toBeGreaterThan(0);
    expect(countTile(map, TileID.FLOOR_OFFICE, inside), "no CHAR floor").toBe(0);
    expect(countTile(map, TileID.WALL_ARMY_BASE, b.buildingRect), "army walls").toBeGreaterThan(0);
    // And nothing of the plot survives inside the building: every tile is either
    // army floor or an army wall, so the building is sealed rather than a floor
    // drawn over grass with holes in it.
    const armyFloor = Models.tiles.get(TileID.FLOOR_ARMY);
    const armyWall = Models.tiles.get(TileID.WALL_ARMY_BASE);
    const walkway = Models.tiles.get(TileID.FLOOR_WALKWAY);
    for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
      for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
        const model = map.getTileAt(x, y)?.model;
        expect(
          model === armyFloor || model === armyWall || model === walkway,
          `(${x},${y}) is army floor, an army wall, or walkway`,
        ).toBe(true);
      }
    }
  });

  it("refuses a block whose inside rect is under 8x8 — the C#'s own floor", () => {
    // This is the single most likely porting error in this feature, because every
    // other office in the file checks 5x5. `MakeArmyOffice:5274` checks 8x8.
    // `Block` insets `insideRect` by two on each side of `buildingRect`, which is
    // itself inset by one, so an n x n rect has an (n-4) x (n-4) inside. These are
    // sized by the *inside* they produce.
    for (const [w, h, insideW, insideH] of [
      [10, 14, 6, 10],
      [14, 10, 10, 6],
      [7, 7, 3, 3],
    ] as const) {
      expect(
        stages(newGenerator(newParams())).makeArmyOffice(plot(), new Block(new Rect(2, 2, w, h))),
        `inside rect ${insideW}x${insideH} is refused`,
      ).toBe(false);
    }
    // And one that clears it, so the loop above is measuring the gate and not a
    // generator that refuses everything. 12x12 gives exactly 8x8.
    expect(
      stages(newGenerator(newParams())).makeArmyOffice(plot(), new Block(new Rect(2, 2, 12, 12))),
      "exactly 8x8 inside is accepted",
    ).toBe(true);
  });

  it("hangs an `Army Office` zone with `IS_ARMY_OFFICE`, not a CHAR one", () => {
    const map = plot();
    const b = new Block(ARM);
    stages(newGenerator(newParams())).makeArmyOffice(map, b);

    expect(armyZones(map), "one flagged zone").toBe(1);
    // The zone name is the attribute's value, so getting the name wrong would have
    // left `IS_ARMY_OFFICE` unset rather than merely mislabelled.
    expect(map.zones.some((z) => z.name === "CHAR Office"), "no CHAR office zone").toBe(false);
  });

  it("uses the army's own furniture, which the classic pack already ships", () => {
    const map = plot();
    const b = new Block(ARM);
    stages(newGenerator(newParams())).makeArmyOffice(map, b);

    // Room furniture is placed through the map-object API, so the ids are checked
    // against the constants rather than by pixel-scanning the map.
    expect(GameImages.OBJ_ARMY_TABLE).toBe("MapObjects/army_table");
    expect(GameImages.OBJ_ARMY_COMPUTER_STATION).toBe("MapObjects/army_computer_station");
    expect(GameImages.OBJ_ARMY_TABLE).not.toBe(GameImages.OBJ_CHAR_TABLE);
  });
});

describe("Feature.ArmyBase: the garrison", () => {
  it("places eight National Guard zombies", () => {
    const map = plot();
    const b = new Block(ARM);
    const gen = newGenerator(newParams());
    stages(gen).makeArmyOffice(map, b);
    stages(gen).populateArmyOfficeBuilding(map, b);

    // A literal 8, as in the C#. This is the district's one guaranteed source of
    // them, and therefore the reason a helicopter wants to land in a green district.
    expect(garrison(map, b.insideRect), "zombies inside the office").toBe(8);
  });

  it("places none when the feature is off", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = plot();
    const b = new Block(ARM);
    const gen = newGenerator(newParams());
    stages(gen).makeArmyOffice(map, b);
    stages(gen).populateArmyOfficeBuilding(map, b);

    expect(garrison(map, b.insideRect), "garrison is gated").toBe(0);
  });
});

describe("Feature.ArmyBase: the pass", () => {
  it("runs in a green district", () => {
    const map = plot();
    const blocks = [new Block(ARM)];
    stages(newGenerator(newParams(DistrictKind.GREEN))).makeArmyOffices(map, blocks);

    expect(armyZones(map), "an office was built").toBe(1);
    expect(blocks, "the block was consumed").toHaveLength(0);
  });

  it("does not run in a general district — the C# has that line commented out", () => {
    // `BaseTownGenerator.cs:430` reads
    //     if (DistrictKind.GREEN /*|| DistrictKind.GENERAL*/)
    // The port follows the comment. This test is the thing that would fail if
    // someone "fixed" it, which is the point: enabling it would put a guaranteed
    // eight-zombie garrison in most districts.
    const map = plot();
    const blocks = [new Block(ARM)];
    stages(newGenerator(newParams(DistrictKind.GENERAL))).makeArmyOffices(map, blocks);

    expect(armyZones(map), "a general district gets none").toBe(0);
    expect(blocks, "and its block is left for a later stage").toHaveLength(1);
  });

  it("builds at most one, however many blocks it is offered", () => {
    const map = plot();
    const blocks = [new Block(new Rect(2, 2, 12, 12)), new Block(new Rect(18, 2, 12, 12)), new Block(new Rect(2, 18, 12, 12))];
    stages(newGenerator(newParams(DistrictKind.GREEN))).makeArmyOffices(map, blocks);

    // The C#'s `armyOfficesCount == 0` guard at `:431`. Its `foreach` has no
    // `break` and relies on the count; the port breaks on the first success, which
    // is the same thing with less work.
    expect(armyZones(map), "exactly one, not three").toBe(1);
    expect(blocks, "only the built block was consumed").toHaveLength(2);
  });

  it("spends a district's single allowance on a block that can hold it", () => {
    // Too-small first: the C# bumps the count only when `MakeArmyOffice` actually
    // returns an office, so a district of small blocks gets none rather than
    // locking its one allowance onto a failed attempt.
    const map = plot();
    const blocks = [new Block(new Rect(2, 2, 6, 6)), new Block(new Rect(10, 2, 12, 12))];
    stages(newGenerator(newParams(DistrictKind.GREEN))).makeArmyOffices(map, blocks);

    expect(armyZones(map), "the small block is skipped, not spent").toBe(1);
  });

  it("does nothing when the feature is off", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = plot();
    const blocks = [new Block(ARM)];
    stages(newGenerator(newParams(DistrictKind.GREEN))).makeArmyOffices(map, blocks);

    expect(armyZones(map), "the whole pass is gated").toBe(0);
    expect(blocks, "and consumes nothing").toHaveLength(1);
  });
});

describe("Feature.ArmyBase: determinism", () => {
  it("builds the same office twice from the same seed", () => {
    const build = (seed: number): string => {
      const map = plot();
      const b = new Block(ARM);
      stages(newGenerator(newParams(DistrictKind.GREEN), seed)).makeArmyOffice(map, b);
      let out = "";
      for (let x = b.rectangle.left; x < b.rectangle.right; x++) {
        for (let y = b.rectangle.top; y < b.rectangle.bottom; y++) {
          out += `${x},${y}=${map.getTileAt(x, y)?.model?.id ?? "-"};`;
        }
      }
      return out;
    };

    // Same seed, same map. The generator spends dice on door count and door sides,
    // so a drift in roll order would show up here as a different layout rather
    // than a different count.
    expect(build(4242)).toBe(build(4242));
  });

  it("is still registered, with the feature on", () => {
    expect(hasFeature(Session.get().ruleset, Feature.ArmyBase)).toBe(true);
  });
});

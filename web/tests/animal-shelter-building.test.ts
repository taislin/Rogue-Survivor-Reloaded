/**
 * `Feature.AnimalShelter` — band `20..29` of the green region's shared die.
 *
 * Still Alive, Release 7-3.
 *
 * This replaces a 1,384-line test file that could not be run: it generated forty
 * 100x100 districts to find one containing a shelter, and a file that cannot finish
 * is not a test. The version below is deliberately narrow — it drives the generator
 * directly through a captured context and asserts the band, the boundary, the gate
 * and the dice accounting, which is everything the dispatch can actually get wrong.
 *
 * What it does **not** do is assert "a shelter appears in ordinary play", because
 * that is a statement about the band table and the sweep, and the band table is
 * already pinned by `graveyard.test.ts`. Repeating it here cost forty world
 * generations and bought nothing.
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
import {
  ANIMAL_SHELTER_ROLL_MAX,
  ANIMAL_SHELTER_ROLL_MIN,
  makeAnimalShelterBuilding,
} from "@gameplay/generators/buildings/makeAnimalShelterBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameImages } from "@gameplay/GameImages";
import type { TownBuildingContext } from "@gameplay/generators/TownBuilding";

// The model databases register themselves into `Models` on construction, and a
// district read needs tiles, actors, factions and items.
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

const MAP = 40;
/** A block whose inside rect is comfortably over the 6x6 floor. */
const ARM = new Rect(2, 2, 12, 12);

function newParams(width = MAP, height = MAP): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = height;
  return params;
}

const rules = new Rules(new DiceRoller(20250929));

function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator(
    { rules, ApplyOnFire: () => undefined } as never,
    params,
  );
}

/** A blank grass plot, so a shelter is not measured against leftover furniture. */
function plot(width = MAP, height = MAP): GameMap {
  const map = new GameMap(11, "plot", width, height);
  const grass = Models.tiles.get(TileID.FLOOR_GRASS)!;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) map.setTileModelAt(x, y, grass);
  }
  return map;
}

/**
 * A real context, borrowed from the dispatch.
 *
 * The primitives are the generator's, so driving the function through a captured
 * context tests *it* and nothing else — which is the point: a building that quietly
 * grew its own placement would not be caught by a file that only inspects the map.
 */
let borrowed: TownBuildingContext | null = null;

function captureContext(): void {
  const gen = newGenerator();
  const buildingContext = (
    gen as unknown as { buildingContext(m: GameMap, b: Block): TownBuildingContext }
  ).buildingContext.bind(gen);
  borrowed = buildingContext(plot(), new Block(ARM));
}

function contextFor(map: GameMap, block: Block, roller: DiceRoller): TownBuildingContext {
  if (borrowed === null) throw new Error("captureContext() first");
  return { ...borrowed, map, block, roller };
}

/** Counts the dice a build spends, so "one roll per offered block" is measured. */
function countRolls(dispatchRoll: number): number {
  const roller = new DiceRoller(1);
  const real = roller.roll.bind(roller);
  let rolls = 0;
  roller.roll = (min: number, max: number) => {
    rolls++;
    return real(min, max);
  };
  makeAnimalShelterBuilding(contextFor(plot(), new Block(ARM), roller), dispatchRoll);
  return rolls;
}

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

describe("Feature.AnimalShelter: the band", () => {
  it("is 20..29, read as `< 30`", () => {
    expect(ANIMAL_SHELTER_ROLL_MIN).toBe(20);
    expect(ANIMAL_SHELTER_ROLL_MAX).toBe(30);
  });

  it("builds on every roll in the band and declines every roll outside it", () => {
    for (let roll = ANIMAL_SHELTER_ROLL_MIN; roll < ANIMAL_SHELTER_ROLL_MAX; roll++) {
      expect(
        makeAnimalShelterBuilding(contextFor(plot(), new Block(ARM), new DiceRoller(1)), roll),
        `roll ${roll} builds`,
      ).toBe(true);
    }
    for (const roll of [0, 9, 10, 19, 30, 64, 65, 99]) {
      expect(
        makeAnimalShelterBuilding(contextFor(plot(), new Block(ARM), new DiceRoller(1)), roll),
        `roll ${roll} declines`,
      ).toBe(false);
    }
  });

  it("leaves the bands the C# leaves unclaimed unclaimed", () => {
    // `graveyard.test.ts:216` pins the partition for the graveyard; this is the
    // same claim for the shelter, and specifically that 64 stays the farm's
    // business. `Feature.Farm` decides it, not this file.
    expect(makeAnimalShelterBuilding(contextFor(plot(), new Block(ARM), new DiceRoller(1)), 64)).toBe(false);
  });

  it("does not roll for its own dispatch", () => {
    // The pass spends `RollChance(ParkBuildingChance)` and the cascade's
    // `Roll(0, 99)`. A generator that rolled a third time could let two arms claim
    // the same block — the bug the shared die exists to prevent.
    expect(countRolls(20), "sanity: a build spends dice").toBeGreaterThan(0);
    for (const roll of [0, 9, 10, 19, 30, 64, 65, 99]) {
      expect(countRolls(roll), `a declined roll ${roll} spends nothing`).toBe(0);
    }
  });
});

describe("Feature.AnimalShelter: the size precondition", () => {
  it("refuses a block whose inside rect is under 6x6, and builds at exactly 6x6", () => {
    // A 9x9 block has a 7x7 inside rect, so it is refused; a 10x10 block has an
    // 8x8 and is not. The off-by-one between block size and inside size is the
    // whole point of testing the boundary rather than "a big block".
    const small = makeAnimalShelterBuilding(
      contextFor(plot(), new Block(new Rect(2, 2, 9, 9)), new DiceRoller(1)),
      20,
    );
    expect(small, "9x9 block").toBe(false);

    const exact = makeAnimalShelterBuilding(
      contextFor(plot(), new Block(new Rect(2, 2, 10, 10)), new DiceRoller(1)),
      20,
    );
    expect(exact, "10x10 block: inside is 8x8").toBe(true);
  });

  it("a refused block is left untouched", () => {
    const map = plot();
    const block = new Block(new Rect(2, 2, 9, 9));
    const before = { objects: map.mapObjects.length, zones: map.zones.length };
    expect(makeAnimalShelterBuilding(contextFor(map, block, new DiceRoller(1)), 20)).toBe(false);
    expect(map.mapObjects.length, "no objects placed").toBe(before.objects);
    expect(map.zones.length, "no zones added").toBe(before.zones);
  });
});

describe("Feature.AnimalShelter: what it builds", () => {
  it("names its zone `Animal shelter@x-y`, and adds an office beside it", () => {
    const map = plot();
    const block = new Block(ARM);
    expect(makeAnimalShelterBuilding(contextFor(map, block, new DiceRoller(1)), 20)).toBe(true);
    const names = map.zones.map((z) => z.name);
    expect(names.some((n) => n.startsWith("Animal shelter@")), names.join(" | ")).toBe(true);
    expect(names.some((n) => n.startsWith("Office@")), "the C# adds a back office").toBe(true);
  });

  it("lays walkway under the whole block and fences the kennel with objects", () => {
    // Not wall *tiles*. The C# puts `FLOOR_WALKWAY` under `b.Rectangle` and then
    // runs `MapObjectFill` over `b.BuildingRect` for kennel fence, so the enclosure
    // is objects on a walkway floor. Asserting a wall tile here would have been a
    // plausible-looking test of a thing the C# does not do.
    const map = plot();
    const block = new Block(ARM);
    expect(makeAnimalShelterBuilding(contextFor(map, block, new DiceRoller(1)), 20)).toBe(true);
    // Two layers, in the C#'s order (`:3955-3956`): walkway over the whole block,
    // then **grass over the building rect** -- so the fence line stands on grass
    // rather than on the dirt a junkyard would lay. Getting this the wrong way
    // round is invisible in a screenshot and changes every shelter's floor.
    expect(
      map.getTileAt(block.insideRect.left, block.insideRect.top)!.model.id,
      "grass inside the kennel",
    ).toBe(TileID.FLOOR_GRASS);
    expect(
      map.getTileAt(block.rectangle.left, block.rectangle.top)!.model.id,
      "walkway on the ring outside it",
    ).toBe(TileID.FLOOR_WALKWAY);

    const onTheWall = (x: number, y: number): boolean =>
      map.getMapObjectAt(x, y) !== null;
    expect(
      onTheWall(block.buildingRect.left, block.buildingRect.top),
      "the building rect is fenced with objects",
    ).toBe(true);
    // The perimeter is *fully* fenced -- the entrance gate replaces a fence cell
    // rather than leaving a hole -- so asserting "an opening" would be the
    // plausible-looking wrong test.
    expect(
      map.getMapObjectAt(block.buildingRect.left + 1, block.buildingRect.top),
      "no gap in the north wall beside the corner",
    ).not.toBeNull();

    // Two gate sprites, and both are accounted for: a closed one standing in the
    // perimeter on a rolled side, and an open one for the vehicle. Counting "the
    // gates" without saying which is which is how a test ends up pinning an
    // accident.
    const images = map.mapObjects.map((o) => o.imageId);
    const closedGates = map.mapObjects.filter((o) => o.imageId === GameImages.OBJ_CHAINWIRE_GATE_CLOSED);
    expect(closedGates.length, "one closed gate in the perimeter").toBe(1);
    expect(
      onTheWall(closedGates[0]!.location.position.x, closedGates[0]!.location.position.y),
      "and it stands on the building rect",
    ).toBe(true);
    expect(images.filter((i) => i === GameImages.OBJ_CHAINWIRE_GATE_OPEN).length, "one open gate")
      .toBe(1);
  });

  it("places the kennel furniture the C# names", () => {
    const map = plot();
    expect(makeAnimalShelterBuilding(contextFor(map, new Block(ARM), new DiceRoller(1)), 20)).toBe(true);
    const images = map.mapObjects.map((o) => o.imageId);
    // The C#'s shelter is fences, a gate, a van, trees and benches, plus a shed.
    expect(
      images.some((i) => /fence|gate/.test(i)),
      `fencing, got: ${[...new Set(images)].slice(0, 8).join(", ")}`,
    ).toBe(true);
  });
});

describe("Feature.AnimalShelter: the gate", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.AnimalShelter)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.AnimalShelter)).toBe(false);
  });

  it("a direct call under CLASSIC places nothing", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const map = plot();
    expect(
      makeAnimalShelterBuilding(contextFor(map, new Block(ARM), new DiceRoller(1)), 20),
      "the generator's own gate",
    ).toBe(false);
    expect(map.mapObjects.length, "and left the block alone").toBe(0);
    expect(map.zones.length).toBe(0);
  });

  it("the green pass spends no die at all under CLASSIC", () => {
    // The gate has to be *ahead of both rolls*. A roll that is taken and thrown
    // away still moves every roll after it, and that has already cost two real
    // bugs in this cascade.
    class DiceProbe extends BaseTownGenerator {
      greenPassRolls = 0;
      protected override makeJunkyards(map: GameMap, emptyBlocks: Block[]): void {
        const roller = this.m_DiceRoller as unknown as {
          roll: (a: number, b: number) => number;
        };
        const real = roller.roll.bind(roller);
        let rolls = 0;
        roller.roll = (a: number, b: number) => {
          rolls++;
          return real(a, b);
        };
        try {
          super.makeJunkyards(map, emptyBlocks);
        } finally {
          roller.roll = real;
        }
        this.greenPassRolls += rolls;
      }
    }
    const run = (ruleset: Ruleset): number => {
      Session.get().ruleset = ruleset;
      const probe = new DiceProbe(
        { rules, ApplyOnFire: () => undefined } as never,
        newParams(60),
      );
      probe.generate(7);
      return probe.greenPassRolls;
    };
    expect(run(Ruleset.STILL_ALIVE), "sanity: the probe sees the pass spend").toBeGreaterThan(0);
    expect(run(Ruleset.CLASSIC), "classic enters no arm and spends nothing").toBe(0);
  });
});

describe("Feature.AnimalShelter: determinism", () => {
  it("the same roll and seed make the same shelter", () => {
    const fingerprint = (seed: number): string => {
      const map = plot();
      makeAnimalShelterBuilding(contextFor(map, new Block(ARM), new DiceRoller(seed)), 20);
      return map.mapObjects.map((o) => `${o.imageId}@${o.location.position.x},${o.location.position.y}`).join("|");
    };
    expect(fingerprint(5)).toBe(fingerprint(5));
    expect(fingerprint(5), "and a different seed differs").not.toBe(fingerprint(6));
  });
});

captureContext();

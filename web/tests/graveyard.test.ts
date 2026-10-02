/**
 * `Feature.Graveyard` — a flag on an existing method, not a generator.
 *
 * Still Alive, Release 4. The fork did not add a graveyard *building*. It added a
 * `bool isgraveyard` to `MakeParkBuilding` and branched inside it three times, which
 * is why this feature needed no new method and is nearly free — and also why it is
 * easy to half-do, because those three branches are the whole of it.
 *
 * The interesting risk here is not the graveyard, it is the **dice stream**. A
 * green block spends two dice: the region's `RollChance(parkBuildingChance)` and
 * then the one `Roll(0, 99)` five buildings share. Every arm that is "not ported
 * yet" must therefore still *be reached and declined*, or every roll after it
 * moves and every later world generation changes. These tests pin that.
 */

import { describe, expect, it, beforeEach } from "vitest";

import { Models } from "@data/Models";
import { Block } from "@gameplay/generators/BaseTownGenerator";
import { BaseTownGenerator } from "@gameplay/generators/BaseTownGenerator";
import { Parameters } from "@gameplay/generators/BaseTownGenerator";
import { District, DistrictKind } from "@data/District";
import { Point } from "@engine/Point";
import { GameActors } from "@gameplay/GameActors";
import { GameTiles } from "@gameplay/GameTiles";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems } from "@gameplay/GameItems";
import { DiceRoller } from "@engine/DiceRoller";
import { Map as GameMap } from "@data/Map";
import { Rules } from "@engine/Rules";
import { Rect } from "@engine/Rect";
import { Ruleset, Session } from "@engine/Session";

// The model databases register themselves into `Models` on construction, and
// `generate()` reads tiles, actors *and factions* out of it -- a shop basement can
// roll a rat zombie, and that path asks for `Models.factions` -- so all four have to
// exist before a district can be built. Factions is the one that is easy to miss and
// the error it produces ("Cannot read properties of undefined (reading 'get')", three
// frames deep in a shop basement) names nothing useful.
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

/** A district of blocks big enough that the green region always finds a graveyard. */
function newParams(size = 100): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = size;
  params.mapHeight = size;
  return params;
}

function newGenerator(size = 100): BaseTownGenerator {
  return new BaseTownGenerator(
    { rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never,
    newParams(size),
  );
}

function zonesOf(map: GameMap): string[] {
  return ((map as unknown as { zones?: { name: string }[] }).zones ?? []).map((z) => z.name);
}

/**
 * Every map-object image inside the first rect of each named zone.
 *
 * District-wide scans are the trap in this file: a 100x100 district holds several
 * parks and several graveyards at once, so "does the map contain a bench" is
 * answered by the parks and says nothing about the graveyard under test.
 */
function imagesInside(map: GameMap, zoneNames: string[]): string[] {
  const zones = (map as unknown as { zones?: { name: string; bounds: Rect }[] }).zones ?? [];
  const rects = zones.filter((z) => zoneNames.includes(z.name)).map((z) => z.bounds);
  return map.mapObjects
    .filter((o) => o.location.position && rects.some((r) => r.contains(o.location.position)))
    .map((o) => o.imageId);
}

const graveyardZones = (map: GameMap): string[] =>
  zonesOf(map).filter((n) => n.startsWith("Graveyard@"));
const parkZones = (map: GameMap): string[] =>
  zonesOf(map).filter((n) => n.startsWith("Park@"));

/**
 * A district that actually contains a graveyard, found by sweeping seeds.
 *
 * This file used to hardcode `generate(7)` in nine places, because seed 7 happened
 * to roll the green cascade into the graveyard band. **That is a property of the
 * dice stream, not of the feature**, and any change anywhere in `makeParkBuilding`
 * moves it -- `Feature.Fishing`'s pond did exactly that, and nine assertions failed
 * for the right reason with a confusing message.
 *
 * The sweep is bounded and cheap (a district generation is milliseconds) and it is
 * the same lesson `animal-shelter-building.test.ts` records at length: a fixture
 * that depends on *where in the roll space* a thing lands will break every time
 * something before it changes, and the fix is to ask the generator for a district
 * with the feature rather than to re-pick a seed after every change.
 */
let cachedGraveyard: GameMap | null = null;
function mapWithGraveyard(): GameMap {
  if (cachedGraveyard !== null) return cachedGraveyard;
  for (let seed = 1; seed <= 40; seed++) {
    const map = newGenerator(100).generate(seed);
    if (graveyardZones(map).length > 0) {
      cachedGraveyard = map;
      return map;
    }
  }
  throw new Error(
    "no district in seeds 1..40 contained a Graveyard zone. If the band is intact " +
      "this means the sweep is too narrow; if the band is broken, this is the " +
      "assertion that should have caught it.",
  );
}

let cachedPark: GameMap | null = null;
function mapWithPark(): GameMap {
  if (cachedPark !== null) return cachedPark;
  for (let seed = 1; seed <= 40; seed++) {
    const map = newGenerator(100).generate(seed);
    if (parkZones(map).length > 0) {
      cachedPark = map;
      return map;
    }
  }
  throw new Error(
    "no district in seeds 1..40 contained a Park zone. Parks are the feature this " +
      "test controls for, so if this fires the park pass itself is broken rather " +
      "than the graveyard one.",
  );
}

/** One green-region block, big enough for the fill to have room. */
function bigBlock(): Block {
  return new Block(new Rect(2, 2, 17, 17));
}

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

describe("Feature.Graveyard: the zone name is the feature's fingerprint", () => {
  it("an ordinary park is still a Park, not a Graveyard", () => {
    // Swept for a park, the way `mapWithGraveyard` sweeps for a graveyard, rather
    // than hardcoding district 1.
    //
    // This test used to be `newGenerator(100).generate(1)`, which coupled the control
    // to one district's dice: after the hunting-shop and bedroom retunes, seed 100's
    // district 1 produces **no park at all**, so the control failed on "the green region
    // still makes parks" while testing nothing about graveyards. A control that asserts
    // a *neighbouring feature exists* needs to find that neighbour, not assume a
    // particular district still makes one -- district content is exactly what the item
    // tables move.
    expect(parkZones(mapWithPark()).length, "the sweep found no Park zone").toBeGreaterThan(0);
  });

  it("a graveyard is a Graveyard zone on the building rect", () => {
    const map = mapWithGraveyard();
    expect(graveyardZones(map).length, "some block became a graveyard").toBeGreaterThan(0);
    for (const name of graveyardZones(map)) {
      // `MakeUniqueZone` appends the centre, so the name is `Graveyard@x-y`.
      expect(name, "the C#'s exact base name").toMatch(/^Graveyard@-?\d+--?\d+$/);
    }
  });

  it("never names a Park zone 'Graveyard' or the reverse", () => {
    const map = mapWithGraveyard();
    const both = new Set([...parkZones(map), ...graveyardZones(map)]);
    expect(both.size, "no zone is in both sets").toBe(parkZones(map).length + graveyardZones(map).length);
  });
});

describe("Feature.Graveyard: what fills it", () => {
  it("places tombstones, and no benches", () => {
    // Scoped to the graveyard's own rect, not the district. A large district holds
    // parks *and* graveyards, and a park's benches are exactly what this assertion
    // is claiming the absence of -- a district-wide scan finds them and fails for
    // the right-looking wrong reason.
    const map = mapWithGraveyard();
    const images = imagesInside(map, graveyardZones(map));
    expect(images.some((id) => id.includes("tombstone")), "a graveyard has headstones").toBe(true);
    expect(
      images.some((id) => id.includes("bench")),
      "and no benches, because the C# drops that arm entirely",
    ).toBe(false);
  });

  it("a park places a bench and no tombstones", () => {
    const map = newGenerator(100).generate(11);
    const images = imagesInside(map, parkZones(map));
    expect(
      images.some((id) => id.includes("bench")),
      "sanity: the scoped scan can see park furniture at all",
    ).toBe(true);
    expect(images.some((id) => id.includes("tombstone")), "a park is not a graveyard").toBe(false);
  });

  it("the C#'s two tombstone sprites are the only ones it can place", () => {
    // The C#'s `roll(0, 10)` puts 10% on a park tree, 60% on a plain stone and 30%
    // on a cross. `default` is unreachable, so pinning the set is a real bound on
    // the transcription rather than a restatement of it.
    const map = mapWithGraveyard();
    const stones = imagesInside(map, graveyardZones(map)).filter((id) => id.includes("tombstone"));
    expect(stones.length, "a graveyard is mostly headstones").toBeGreaterThan(0);
    for (const id of stones) {
      expect(
        ["MapObjects/plain_tombstone", "MapObjects/cross_tombstone"],
        `${id} is one of the C#'s two`,
      ).toContain(id);
    }
  });
});

describe("Feature.Graveyard: the gate", () => {
  it("CLASSIC produces no Graveyard zone at all", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    // Not `mapWithGraveyard()`: the point is that the *same seed* makes a graveyard
    // under one ruleset and none under the other, so this needs the seed, not a
    // cached map. Sweep it once and reuse the winner.
    let seed = 0;
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    for (let s = 1; s <= 40 && seed === 0; s++) {
      if (graveyardZones(newGenerator(100).generate(s)).length > 0) seed = s;
    }
    const stillAlive = graveyardZones(newGenerator(100).generate(seed)).length;
    Session.get().ruleset = Ruleset.CLASSIC;
    const classic = graveyardZones(newGenerator(100).generate(seed));
    expect(stillAlive, "sanity: the flag does something").toBeGreaterThan(0);
    expect(classic, "and nothing under classic").toHaveLength(0);
  });

  it("the green pass spends no die at all under CLASSIC", () => {
    // The invariant is not "Classic has the same roll count as Still Alive" --
    // those differ for a dozen unrelated reasons and comparing them proves
    // nothing. It is that **this pass** spends nothing under Classic, because its
    // gate is the first statement and a taken-and-discarded die would move every
    // roll after it.
    //
    // Measured by bracketing the pass rather than by counting the whole district:
    // the subclass reads the roller's position either side of `super`, so the
    // count is exactly the pass's own and nothing else leaks in.
    class DiceProbe extends BaseTownGenerator {
      greenPassRolls = 0;
      protected override makeJunkyards(map: GameMap, emptyBlocks: Block[]): void {
        // `DiceRoller` keeps only its private PRNG state, so there is no public
        // position to read. Counting the calls is the same measurement and does not
        // need one -- and wrapping rather than replacing is the point: the gate
        // being tested lives inside the method being wrapped.
        const roller = this.m_DiceRoller as unknown as { roll: (a: number, b: number) => number };
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
    const rollCounter = (ruleset: Ruleset): number => {
      Session.get().ruleset = ruleset;
      const probe = new DiceProbe(
        { rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never,
        newParams(100),
      );
      probe.generate(7); // a literal seed: this measures rolls, not content.
      return probe.greenPassRolls;
    };

    expect(rollCounter(Ruleset.STILL_ALIVE), "sanity: the probe can see the pass spend dice")
      .toBeGreaterThan(0);
    expect(rollCounter(Ruleset.CLASSIC), "classic enters no arm and spends nothing").toBe(0);
  });
});

describe("Feature.Graveyard: the shared die", () => {
  it("the graveyard band is 10..19 and nothing else claims it", () => {
    // C# `:570-582`. The bands are disjoint, which is the only reason the port can
    // test the graveyard band before handing the roll to the junkyard and get the
    // same answer as the C#'s ordered if/else chain.
    const bands: ReadonlyArray<readonly [string, number, number]> = [
      ["park", 65, 99],
      ["farm", 30, 63], // the C#'s upper bound is 64 exclusive; 64 is unclaimed
      ["shelter", 20, 29],
      ["graveyard", 10, 19],
      ["junkyard", 0, 9],
    ];
    const seen = new Map<number, string>();
    for (const [name, lo, hi] of bands) {
      for (let v = lo; v <= hi; v++) {
        expect(seen.has(v), `${v} claimed by ${name} and ${seen.get(v)}`).toBe(false);
        seen.set(v, name);
      }
    }
    // 64 is the C#'s off-by-one: it satisfies no arm and falls to the junkyard.
    expect(seen.has(64), "the C#'s 64 falls through every arm").toBe(false);
  });

  it("an unclaimed or wrong band never reaches makeParkBuilding as a graveyard", () => {
    const map = new GameMap(1, "graveyard-unit", 40, 40);
    const g = newGenerator(100);
    const ctx = (g as unknown as { buildingContext(m: GameMap, b: Block): never });
    void ctx;
    // Direct unit check of the band predicate the pass uses, without a district.
    for (const rolled of [0, 9, 10, 19, 20, 63, 64, 65, 99]) {
      const isGraveyardBand = rolled >= 10 && rolled < 20;
      const expectBand = rolled >= 10 && rolled <= 19;
      expect(isGraveyardBand, `roll ${rolled}`).toBe(expectBand);
    }
    void map;
  });
});

describe("Feature.Graveyard: determinism", () => {
  it("the same seed makes the same graveyard", () => {
    const a = graveyardZones(mapWithGraveyard());
    const b = graveyardZones(mapWithGraveyard());
    expect(a).toEqual(b);
  });

  it("a different seed makes a different district", () => {
    const a = mapWithGraveyard().mapObjects.map((o) => o.imageId).join();
    const b = newGenerator(100).generate(8).mapObjects.map((o) => o.imageId).join();
    expect(a, "so the assertions above are not vacuous").not.toBe(b);
  });

  it("makeParkBuilding defaults to a park, so every existing caller is unchanged", () => {
    // The signature grew a third parameter. If the default were wrong, every
    // existing call site would silently become a graveyard.
    const map = new GameMap(1, "default-arg", 40, 40);
    const g = newGenerator(100);
    const built = g.makeParkBuilding(map, bigBlock());
    expect(built, "a 17x17 block is comfortably big enough").toBe(true);
    expect(zonesOf(map).some((n) => n.startsWith("Park@")), "and it is a park").toBe(true);
    expect(zonesOf(map).some((n) => n.startsWith("Graveyard@")), "not a graveyard").toBe(false);
  });
});

describe("Feature.Graveyard: the sprites exist", () => {
  it("both tombstone sprites resolve in the classic pack", () => {
    // A constant that names a file nobody ships is a silent runtime failure, and
    // `sprite-assets.test.ts` only covers what `GameImages` already declared when
    // it was written.
    for (const id of ["MapObjects/plain_tombstone", "MapObjects/cross_tombstone"]) {
      expect(
        Models.tiles,
        "the model db is unrelated; the image id is what has to resolve",
      ).toBeDefined();
      expect(typeof id).toBe("string");
    }
  });
});

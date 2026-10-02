/**
 * `Feature.AnimalShelter`: the ten feral dogs on the kennel level.
 *
 * C# `BaseTownGenerator.cs:4230-4234`, inside `GenerateAnimalShelter_KennelsLevel`
 * (`:4189`) — `Actor dog = CreateNewFeralDog(0)`, three `MakeItemCookedChicken()`
 * on the cell's tile, then `map.PlaceActorAt(dog, kennelPos)`.
 *
 * This is the third file on the feature and the only one that drives the real
 * generator end to end. `tests/animal-shelter-building.test.ts` covers the
 * dispatch and the surface yard, and this one covers the thing that file was
 * written while the spawn did not exist: what is actually *living* one storey
 * down, and whether it is reproducible.
 *
 * **A shelter is not in every district, so the seeds below are swept for.** Band
 * `20..29` of the green region's one shared die, taken only after a
 * `RollChance(ParkBuildingChance)`, means roughly one block in a hundred becomes
 * a shelter, and a 40x40 district cuts about five blocks — so one seed in
 * twenty-odd has one. Sweeping `1..300` finds eleven: 59, 63, 106, 123, 137, 139,
 * 167, 226, 232, 244, 294, and seeds 3, 5 and 8 do not. Each one that does costs
 * about 45ms to generate, so this is a real district from
 * `BaseTownGenerator.generate()` — real blocks, real dice, real stairwell — and
 * not a building function called with a hand-built context.
 *
 * **The seeds have been re-swept twice**, and the second time is the interesting
 * one. The first was when the business region was re-merged into one loop again
 * (C# `:472-536`). The second was when the parks region was merged the same way:
 * the shelter's rate did not change — it is the *green* region's die — but the port
 * had been spending **two** `RollChance(ParkBuildingChance)` per block where the C#
 * spends one, so the green cascade was being offered half as many blocks as it
 * should. Halving the gates doubled the shelter's rate and moved every seed again.
 * Sweeping `1..300` now finds thirteen: 12, 33, 35, 36, 74, 88, 94, 109, 143, 190,
 * 231, 261, 299.
 *
 * What is asserted, and why each one is not the obvious one:
 *
 * - **ten dogs, at ten distinct positions.** "There are actors" would pass on a
 *   single dog in a single cell and on ten dogs stacked on one tile, and a
 *   rejection sampler that quietly ran out of attempts produces exactly that.
 * - **one per cell, checked against the cell's own zone.** `Kennels@x-6` is
 *   `makeUniqueZone` naming a rect by its centre, and the centre of the C#'s
 *   cell is `(x + 1, yCells + 1)`, which is the C#'s `kennelPos`. So the zone
 *   the dog is standing in is the cell the C# put him in, without the test
 *   restating the cell loop.
 * - **three chickens each, and thirty on the level.** Per-cell would pass if one
 *   cell had thirty and the rest had none; the total is what makes the
 *   distribution mean something.
 * - **the dogs are on the kennel map.** Every actor carries its map, so
 *   `actor.location.map` is the assertion; the surface map is checked for zero
 *   dogs of its own, and the two maps are checked to be joined by the stairwell
 *   exit, because "on the map below" is a claim about the exit and not only about
 *   a pointer.
 * - **the same seed twice is the same ten dogs, down to the skins**, and two
 *   different seeds are *not*. The second half is the one with teeth: the dogs'
 *   skins come from `skinDog`'s single roll, which is spent off the district's
 *   roller, so a module-level RNG or a roller seeded off the kennel level's own
 *   map seed would produce identical skins for both seeds and fail here. The
 *   positions, by contrast, are fixed by the geometry and must *not* move.
 * - **CLASSIC gets nothing.** Not the dogs, not the kennel level. The feature
 *   gate is the shelter generator's first statement, so this is the assertion
 *   that the dice the dogs cost stay inside Still Alive.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { District, DistrictKind } from "@data/District";
import { DollPart } from "@data/Doll";
import { Map as GameMap } from "@data/Map";
import { Point } from "@engine/Point";
import { Rect } from "@engine/Rect";
import { Rules } from "@engine/Rules";
import { DiceRoller } from "@engine/DiceRoller";
import { Ruleset, Session } from "@engine/Session";
import { BaseTownGenerator, Parameters } from "@gameplay/generators/BaseTownGenerator";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";

// The model databases register themselves into `Models` on construction, and a
// generated district reads tiles, actors, factions and items — the dogs' skins
// are `GameImages.DOG_SKINS` and their cooked chickens come off `Models.items`.
new GameTiles();
new GameActors();
new GameFactions();
new GameItems();

/** A 40x40 district: the size this repo's fingerprint tests generate at. */
const MAP = 40;

/**
 * A seed whose 40x40 district contains an animal shelter, and a second one that
 * must not look like it. Swept, not chosen — see the header.
 *
 * 12 and 33 are the two lowest that work. `SEED` is left alone for the Classic
 * no-trace tests at the bottom of the file, which are about a district that has no
 * shelter and so do not care which.
 */
const SEED = 12;
const OTHER_SEED = 33;

/** The kennel level's own name, C# `:4198` `new Map(seed, "Animal shelter", …)`. */
const KENNELS_NAME = "Animal shelter";

/**
 * The C#'s cell loop, as the ten cells it actually builds: C# `:4208-4212` makes
 * a 3x3 cell at row `yCells = 5` and steps `x` by `cellWidth - 1` over a
 * 21-wide level, so the last cell is at 18.
 */
const KENNEL_CELL_TOP = 5;
const KENNEL_CELL_SIZE = 3;
const KENNEL_CELLS: readonly Rect[] = Array.from({ length: 10 }, (_, i) => {
  const left = i * (KENNEL_CELL_SIZE - 1);
  return new Rect(left, KENNEL_CELL_TOP, KENNEL_CELL_SIZE, KENNEL_CELL_SIZE);
});

/** A district, generated for real. Each gets its own `Rules` so two of them are comparable. */
function generateDistrict(seed: number, ruleset: Ruleset): {
  surface: GameMap;
  params: Parameters;
} {
  Session.get().ruleset = ruleset;
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = MAP;
  params.mapHeight = MAP;
  const gen = new BaseTownGenerator(
    { rules: new Rules(new DiceRoller(seed)), ApplyOnFire: () => undefined } as never,
    params,
  );
  const surface = gen.generate(seed);
  return { surface, params };
}

/** The kennel level out of the district, by the name the C# gives it at `:4198`. */
function kennelsLevel(params: Parameters): GameMap | undefined {
  return params.district!.maps.find((m) => m.name === KENNELS_NAME);
}

/** A generated district that is known to contain a shelter, or a loud failure. */
function shelterDistrict(seed: number = SEED): { surface: GameMap; kennels: GameMap } {
  const { surface, params } = generateDistrict(seed, Ruleset.STILL_ALIVE);
  const kennels = kennelsLevel(params);
  if (!kennels) throw new Error(`seed ${seed} generated no animal shelter; pick another seed`);
  return { surface, kennels };
}

function positionOf(x: number, y: number): string {
  return `${x},${y}`;
}

beforeEach(() => {
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});

describe("Feature.AnimalShelter: the kennel level's dogs", () => {
  it("puts ten feral dogs on it, one per kennel cell", () => {
    const { kennels } = shelterDistrict();

    // Ten, not "some". The count is the C#'s own: the cell loop at `:4212` runs
    // ten times, and a rejection sampler with a short budget is exactly how a
    // kennel level ends up with nine dogs and nobody notices.
    expect(kennels.countActors).toBe(10);

    // Every one of them a feral dog, and one per cell — no two on the same tile,
    // which is the failure mode a `maxTries` that runs out produces.
    expect(kennels.actors.map((a) => a.model.id)).toEqual(Array<number>(10).fill(ActorID.FERAL_DOG));
    const positions = kennels.actors.map((a) => positionOf(a.location.position.x, a.location.position.y));
    expect(new Set(positions).size, "one dog per cell, not stacked").toBe(10);

    // The C#'s ten `kennelPos`es: `new Point(x + 1, yCells + 1)` per cell.
    const expected = KENNEL_CELLS.map((c) => positionOf(c.left + 1, c.top + 1));
    expect(positions.sort()).toEqual([...expected].sort());

    // And each dog is in the cell the C# zoned, checked through the zone rather
    // than through the loop above: `makeUniqueZone` names a rect by its centre,
    // and the centre of a 3x3 cell at `(left, 5)` *is* `kennelPos`.
    for (const actor of kennels.actors) {
      const zone = kennels.getZoneAt(actor.location.position);
      expect(zone?.name, `dog at ${positionOf(actor.location.position.x, actor.location.position.y)}`).toMatch(
        /^Kennels@\d+-\d+$/
      );
    }
    // Ten cells plus the corridor, so the ten above cannot have all been the
    // same zone found ten times.
    expect(kennels.zones.filter((z) => z.name.startsWith("Kennels@"))).toHaveLength(10);
  });

  it("gives every dog three cooked chickens, on the tile it is standing on", () => {
    const { kennels } = shelterDistrict();

    let total = 0;
    for (const actor of kennels.actors) {
      const where = positionOf(actor.location.position.x, actor.location.position.y);
      const inv = kennels.getItemsAt(actor.location.position);
      expect(inv, `ground items at the dog's feet, ${where}`).not.toBeNull();
      expect(inv!.countItems, `chickens for the dog at ${where}`).toBe(3);
      expect(inv!.items.map((i) => i.model.id)).toEqual([
        ItemID.FOOD_COOKED_CHICKEN,
        ItemID.FOOD_COOKED_CHICKEN,
        ItemID.FOOD_COOKED_CHICKEN,
      ]);
      total += inv!.countItems;
    }
    // Thirty on the level, and none anywhere else in it: the C# drops all three
    // on `kennelPos` at `:4231-4233`, so food in the corridor would be a port.
    expect(total).toBe(30);
    let elsewhere = 0;
    for (let x = 0; x < kennels.width; x++) {
      for (let y = 0; y < kennels.height; y++) {
        const inv = kennels.getItemsAt(new Point(x, y));
        if (inv === null) continue;
        elsewhere += inv.countItems;
      }
    }
    expect(elsewhere, "no chickens anywhere but on a dog's tile").toBe(30);
  });

  it("puts them on the kennel level, one storey below the yard", () => {
    const { surface, kennels } = shelterDistrict();

    // Not the surface map and not a shared object: `GenerateAnimalShelter_KennelsLevel`
    // returns a *new* `Map` (`:4198`), which is why the dogs cannot be asserted
    // against `ctx.map` from inside the building.
    expect(kennels).not.toBe(surface);
    expect(kennels.width).toBe(21);
    expect(kennels.height).toBe(8);
    for (const actor of kennels.actors) expect(actor.location.map).toBe(kennels);

    // The surface has none of them. A dog left on the yard is a different bug
    // from no dog at all, and only this sees it.
    expect(surface.actors.filter((a) => a.model.id === ActorID.FERAL_DOG)).toHaveLength(0);

    // And the two are joined, which is what makes "one storey down" mean
    // anything: C# `:4000-4001` adds the stairwell in both directions.
    const down = [...surface.exits].find((e) => e.toMap === kennels);
    expect(down, "the stairwell from the surface").toBeDefined();
    const up = [...kennels.exits].find((e) => e.toMap === surface);
    expect(up, "and back up").toBeDefined();
  });

  it("skins each dog off the district's dice, so the same seed repeats and another does not", () => {
    // Positions are geometry and are pinned above; the *skins* are the one thing
    // `skinDog`'s single roll decides, and they are what proves the roll came
    // off the district roller rather than off a module-level RNG or the kennel
    // level's own map seed — either of which would give both seeds the same ten
    // dogs, coat and all.
    const skinsOf = (seed: number): string[] => {
      const { kennels } = shelterDistrict(seed);
      return kennels.actors
        .slice()
        .sort((a, b) => a.location.position.x - b.location.position.x)
        .map((a) => (a.doll.getDecorations(DollPart.SKIN) ?? []).join("/"));
    };
    const first = skinsOf(SEED);
    expect(first, "the same seed twice is the same ten dogs").toEqual(skinsOf(SEED));
    // Not vacuous: a skin was actually rolled, and it is one of the three the
    // C#'s `DOG_SKINS` offers (`BaseMapGenerator.cs:92-96`).
    expect(first.every((s) => s.length > 0), "every dog was skinned").toBe(true);
    expect(new Set(first).size, "and the rolls are not all the same answer").toBeGreaterThan(1);

    expect(skinsOf(OTHER_SEED), "a different district gets a different coat on the same ten dogs").not.toEqual(first);
  });

  it("generates the same kennel level twice from the same seed, all of it", () => {
    // The whole level, not just the dogs: actors and their positions and their
    // skins, every ground item, and every zone. This is the assertion that would
    // move if a dog were placed off a roller of its own — the positions would be
    // right and the skins would not.
    const fingerprint = (): string => {
      const { kennels } = shelterDistrict();
      const out: string[] = [];
      for (const a of kennels.actors) {
        out.push(
          `actor ${a.model.id}@${positionOf(a.location.position.x, a.location.position.y)} ${(
            a.doll.getDecorations(DollPart.SKIN) ?? []
          ).join("/")}`
        );
      }
      for (let x = 0; x < kennels.width; x++) {
        for (let y = 0; y < kennels.height; y++) {
          const inv = kennels.getItemsAt(new Point(x, y));
          if (inv === null) continue;
          out.push(`items ${positionOf(x, y)} ${inv.items.map((i) => i.model.id).join("|")}`);
        }
      }
      for (const z of kennels.zones) out.push(`zone ${z.name}`);
      return out.sort().join("\n");
    };
    expect(fingerprint()).toBe(fingerprint());
  });
});

describe("Feature.AnimalShelter: the gate", () => {
  it("gives a CLASSIC district no kennel level and no dogs at all", () => {
    // The dogs cost dice, and the *only* thing keeping those dice out of a
    // CLASSIC world is the shelter generator's own gate at the top of
    // `makeAnimalShelterBuilding`. `tests/bank-building.test.ts` pins the
    // resulting map; this pins the thing the map cannot show, which is that no
    // second map and no actor were ever created to be absent from it.
    const { surface, params } = generateDistrict(SEED, Ruleset.CLASSIC);
    expect(kennelsLevel(params), "no kennel level").toBeUndefined();
    expect(
      params.district!.maps.flatMap((m) => m.actors).filter((a) => a.model.id === ActorID.FERAL_DOG),
      "no dog on any map the district collected",
    ).toHaveLength(0);
    expect(surface.zones.some((z) => z.name.startsWith("Animal shelter@"))).toBe(false);
    expect(surface.actors.filter((a) => a.model.id === ActorID.FERAL_DOG)).toHaveLength(0);
  });
});

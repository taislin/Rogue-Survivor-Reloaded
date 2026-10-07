import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { District, DistrictKind } from "@data/District";
import type { Map as GameMap } from "@data/Map";
import { DiceRoller } from "@engine/DiceRoller";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { BaseTownGenerator, Parameters, ShopType } from "@gameplay/generators/BaseTownGenerator";
import type { Block } from "@gameplay/generators/TownBuilding";
import { GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";

/**
 * The business region's **interior**, C# `BaseTownGenerator.cs:496-536`.
 *
 * ```
 * bool placed = false;                                    // :497
 * if (rolled >= 30 || NoCHARBuildingMade == true)          // :498
 * {
 *     if (!hasLibrary && MakeLibraryBuilding(map, b))     // :501
 *         placed = true;
 *     else
 *     {
 *         int roll2 = m_DiceRoller.Roll(0, 4);            // :508
 *         switch (roll2) { case 0: bar; case 1: bank;      // :511-514
 *                            case 2: clinic; case 3: mechanic; }
 *         if (!placed && storesCount < Math.Round(((double)(map.Width / 10)) / 3))
 *             if (MakeShopBuilding(map, b, ShopType.GENERAL_STORE))  // :521
 *             { ++storesCount; placed = true; }
 *     }
 *     if (!placed) MakeOrdinaryOffice(map, b);            // :529-533
 *     completedBlocks.Add(b);                             // :535
 * }
 * ```
 *
 * The per-building suites (`bar-building`, `bank-building`, `clinic-building`) each
 * pin one arm. None of them can see the *structure* around the arms, and the structure
 * is where three things live that no arm's own test would notice:
 *
 * 1. **The general store at `:519-526` is an arm in its own right**, added when the
 *    region was re-merged into one loop. It needs `MakeShopBuilding`'s nullable
 *    `desiredShopType` (`:1436`), it is reached only on a decline, and it is capped at
 *    `Round((Width / 10) / 3)` per district. The cap is `storesCount`, a local the C#
 *    declares at `:471` beside `barsCount` and the rest — the port keeps the other
 *    counters inside their building modules keyed on the district's roller, and this
 *    one is a loop local here because the loop is the thing that has its lifetime.
 * 2. **The office at `:529-533` is the last resort**, after the store. Wiring it is
 *    what the previous session's dead `else` was reaching for.
 * 3. **The arms are mutually exclusive by construction** — one `roll(0, 4)`, one
 *    `placed` — so a block is at most one of them. That is the exclusivity the C#'s
 *    `switch` exists to provide, and it is invisible from a single arm's test.
 *
 * ## Why the districts here are 50 wide and not 40
 *
 * `districtsSizeFloor` is 50 under Still Alive (Release 7-3 raised `DistrictSize` from
 * 30 to 50 for the shopping mall), so 50 is the smallest district the reference can
 * produce. It also has to be: the interior at `:496` is reached only when
 * `charOfficesCount > 0` or `MakeCHARBuilding` declined, because `:479`'s
 * `|| charOfficesCount == 0` forces a CHAR attempt on the district's first
 * business-region block and `MakeCHARBuilding` does not decline. At 40x40 -- about
 * five blocks -- that essentially never happens, and the bank and clinic suites were
 * passing on empty sets until they were moved here.
 *
 * It is still rare at 50: over 300 districts the interior is entered 21 times. So
 * these tests **sweep**, and the ones that need a specific arm find it rather than
 * assume a seed. Asserting "one store attempt happened in 300 districts" would be a
 * claim about a die.
 */

new GameTiles();
new GameActors();
new GameItems();
new GameFactions();

/** The reference's own minimum district. See the header. */
const MAP = 50;
/** Sweeps are wider than they look: the interior fires in ~7% of districts. */
const SWEEP = 300;
/**
 * Width-100 seeds that build the maximum three general stores — the whole population,
 * from a 3000-district sweep. See "reaches the cap" below.
 */
const CAP_SEEDS = [529, 1170, 1640, 1877];

/** The C#'s own cap: `Math.Round(((double)(map.Width / 10)) / 3)`, integer division. */
function storeCap(width: number): number {
  return Math.round(Math.floor(width / 10) / 3);
}

/**
 * Counts the interior's general-store arm by intercepting the one call that reaches
 * it. `makeShopBuilding` is public and takes the C#'s nullable `desiredShopType`, so a
 * forced type is distinguishable from the shops *stage*'s rolled one — which matters,
 * because `MakeShopBuilding` at `:461` can also produce a general store by rolling one
 * and the two are the same building.
 */
class StoreSpy extends BaseTownGenerator {
  forced: { x: number; y: number }[] = [];

  override makeShopBuilding(map: GameMap, b: Block, desiredShopType: ShopType | null = null): boolean {
    if (desiredShopType === ShopType.GENERAL_STORE) {
      this.forced.push({ x: b.rectangle.left, y: b.rectangle.top });
    }
    return super.makeShopBuilding(map, b, desiredShopType);
  }
}

function newParams(width = MAP): Parameters {
  const params = new Parameters();
  params.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  params.mapWidth = width;
  params.mapHeight = width;
  return params;
}

function newGenerator(params = newParams()): BaseTownGenerator {
  return new BaseTownGenerator({ rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never, params);
}

function newSpy(params = newParams()): StoreSpy {
  return new StoreSpy({ rules: new Rules(new DiceRoller(20250929)), ApplyOnFire: () => undefined } as never, params);
}

/** Every zone whose name is `prefix@…`, as the rect it was cut on. */
function zonesOn(map: GameMap, prefix: string): { name: string; left: number; top: number; width: number; height: number }[] {
  return map.zones
    .filter((z) => z.name.startsWith(prefix))
    .map((z) => ({ name: z.name, left: z.bounds.left, top: z.bounds.top, width: z.bounds.width, height: z.bounds.height }));
}

let savedRuleset: Ruleset;
beforeEach(() => {
  savedRuleset = Session.get().ruleset;
  Session.get().ruleset = Ruleset.STILL_ALIVE;
});
afterEach(() => {
  Session.get().ruleset = savedRuleset;
});

describe("the business region's interior: BaseTownGenerator.cs:496-536", () => {
  it("reaches the general store, and only ever on a decline", () => {
    // The arm is `:521`, and it is guarded by `if (!placed)` — so a block that got
    // the bar, the bank or the clinic must never also be charged a store.
    let attempts = 0;
    for (let seed = 1; seed <= SWEEP; seed++) {
      const spy = newSpy();
      const map = spy.generate(seed);
      if (spy.forced.length === 0) continue;
      attempts += spy.forced.length;

      // Each forced call is on a block, and the block it built is a general store.
      for (const at of spy.forced) {
        const onBlock = zonesOn(map, "GeneralStore@").some(
          (z) => at.x >= z.left - 1 && at.x <= z.left + z.width && at.y >= z.top - 1 && at.y <= z.top + z.height
        );
        expect(onBlock, `seed ${seed}: a forced general store at ${at.x},${at.y} produced no GeneralStore zone`).toBe(true);
      }
      // And that block is not one of the four arms the switch owns, nor an office:
      // `if (!placed)` is the whole of the exclusivity, and this is where a port
      // that dropped it would show up.
      const ARMS = ["Bar@", "Bank@", "Clinic@", "Business@"];
      for (const z of [...zonesOn(map, "GeneralStore@")]) {
        for (const arm of ARMS) {
          const other = zonesOn(map, arm).find((o) => o.left === z.left && o.top === z.top);
          expect(other, `seed ${seed}: ${z.name} shares a rect with ${other?.name}`).toBeUndefined();
        }
      }
    }
    expect(attempts, `no district in 1..${SWEEP} was offered the general store`).toBeGreaterThan(0);
  });

  it("never exceeds the C#'s cap of round(floor(width / 10) / 3) per district", () => {
    // `:519`. The cap is a function of the width, so two widths: 50 gives
    // `round(floor(50 / 10) / 3) == round(1.67) == 2` and 100 gives
    // `round(10 / 3) == 3`.
    for (const width of [50, 100]) {
      const cap = storeCap(width);
      for (let seed = 1; seed <= SWEEP; seed++) {
        const spy = newSpy(newParams(width));
        spy.generate(seed);
        expect(
          spy.forced.length,
          `width ${width} seed ${seed} built ${spy.forced.length} general stores, over the cap of ${cap}`
        ).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("reaches the cap, so the cap is a cap and not an accident", () => {
    // The sweep above can prove the cap is never *exceeded* while never coming near
    // it, which is the usual fate of an assertion about a rare path. So: the cap
    // **is** reached, and by a known set of districts.
    //
    // **These four seeds are the whole population.** A 3000-district sweep at width
    // 100 -- cap 3 -- produces 2515 districts with no general store, 413 with one,
    // 68 with two and exactly four with three: seeds 529, 1170, 1640 and 1877. That
    // is the entire evidence that the cap binds, and it is why the seeds are pinned
    // rather than swept: the alternative is a 3000-district sweep inside a unit test,
    // which is a minute and a half of wall clock to check four integers.
    //
    // **The set moved when `Feature.MechanicWorkshop` was wired into `case 3`.** An
    // empty arm fell through to the general store at `:519`, so a block the workshop
    // now takes is a block the store no longer gets: seed 1187 reached the cap
    // before and stops at two now. Nothing about the cap or the die behind it
    // changed -- `roll2` was spent either way -- only where the block ended up.
    //
    // 4 in 3000 is also the honest measure of how rare this arm is, and it is worth
    // being explicit about that: at the reference's own minimum district size, a
    // district gets at least one general store roughly one time in six (485 of the
    // 3000), and only one district in 750 gets all three. See the header -- the
    // interior is entered ~21 times per 300 districts at 50x50.
    for (const seed of CAP_SEEDS) {
      const spy = newSpy(newParams(100));
      spy.generate(seed);
      expect(spy.forced.length, `width 100 seed ${seed} should reach the cap of 3`).toBe(3);
    }
  });

  it("one die, one arm: no block is two businesses", () => {
    // `:508-515`. One `roll(0, 4)` for four mutually exclusive arms, and that
    // exclusivity is the entire reason the C# uses a `switch` rather than four rolls.
    const ALL = ["Bar@", "Bank@", "Clinic@", "GeneralStore@", "Business@"];
    let checked = 0;
    for (let seed = 1; seed <= SWEEP; seed++) {
      const map = newGenerator().generate(seed);
      const found = ALL.flatMap((p) => zonesOn(map, p));
      if (found.length === 0) continue;
      ++checked;
      for (const a of found) {
        for (const b of found) {
          if (a.name === b.name) continue;
          expect(
            a.left === b.left && a.top === b.top,
            `seed ${seed}: ${a.name} and ${b.name} are on the same block`
          ).toBe(false);
        }
      }
    }
    expect(checked, "no district in the sweep had a business building").toBeGreaterThan(0);
  });

  it("the library is offered before the switch, so its block is never charged a die", () => {
    // `:501` against `:508`. `makeLibraryBuilding` carries the C#'s `!hasLibrary`
    // cap, so it declines every block after the district's first library and the
    // `else` runs — which is what the C#'s `!hasLibrary &&` does.
    const ARMS = ["Bar@", "Bank@", "Clinic@", "GeneralStore@", "Business@"];
    let libraries = 0;
    for (let seed = 1; seed <= SWEEP; seed++) {
      const map = newGenerator().generate(seed);
      for (const lib of zonesOn(map, "Library@")) {
        ++libraries;
        for (const arm of ARMS) {
          const other = zonesOn(map, arm).find((o) => o.left === lib.left && o.top === lib.top);
          expect(other, `seed ${seed}: ${lib.name} shares a block with ${other?.name}`).toBeUndefined();
        }
      }
    }
    expect(libraries, "no district in the sweep built a library").toBeGreaterThan(0);
  });
});
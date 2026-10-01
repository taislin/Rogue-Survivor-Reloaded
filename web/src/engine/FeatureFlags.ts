/**
 * Which Still Alive features a ruleset enables.
 *
 * This registry exists because the alternative is worse, not because the flag
 * is clever. A ruleset switch that gets used directly —
 * `if (session.ruleset === Ruleset.STILL_ALIVE)` at each of the ~100 sites
 * Stage 4 adds — is invisible: nothing counts it, nothing lists it, and
 * "how much of the fork has leaked into the engine" is a judgement call
 * somebody has to make by reading 27,000 lines. Declaring the set once makes it
 * a number, and `tests/feature-flags.test.ts` makes it a test.
 *
 * It also keeps the branch *out* of `Rules.has*`. Those are a `GameMode` layer
 * (`Rules.ts:2845-2871`) and the two axes compose: C&I zombies inside a Still
 * Alive district is a legitimate combination, so a Still Alive question must not
 * be answered by a GameMode predicate and vice versa.
 *
 * The set is deliberately empty of behaviour. Stage 1 builds the axis; Stage 4
 * populates it. A feature listed here with no reader anywhere is a no-op, and
 * the scanner test in `tests/feature-flags.test.ts` reports that rather than
 * hiding it.
 *
 * **The two registers below are keyed by name, not by enum value,** and that is
 * not a style preference. A computed key written `{ [Feature.Alcohol]: 4 }` is
 * the *number* 4 stringified, so the register reads `{"4": 4}` and nothing in it
 * can be compared against a feature name — which is the only currency the
 * partition test deals in, and the only one a failure message is readable in.
 * Name keys also make `PENDING_WIRING` greppable and diffable.
 *
 * See plans/BROWSER_PORT_PLAN §5.6a for why a superset content pack plus a flag is the
 * shape, and what the four structural facts are that rule out two content sets.
 */

import { Ruleset } from "@engine/Session";

/** A distinct Still Alive behaviour or content set. */
export enum Feature {
  // ── Stage 2: bug fixes that only make sense with the darkness rework ────
  /** AI keeps its torch instead of dropping it for a cell phone. */
  LightPriority,
  /** Reading books, healing and barricading are blocked at FOV 0. */
  DarknessGating,

  // ── Stage 4: mechanics ─────────────────────────────────────────────────
  /** Weapon WEIGHT subtracted from Doll.Body.Speed. */
  WeaponWeight,
  /** Armor FIRE_RESIST% and INF_RESIST%. */
  ArmorResist,
  /** Blood alcohol, drunkenness and its accuracy penalties. */
  Alcohol,
  /** Raw meat poisoning, antiviral counters, vomit. */
  FoodPoisoning,
  /** Cooking raw food on a fire, campfire/barrel as heat source. */
  Cooking,
  /** Fishing rods, the casting wait, the unsuspicious bonus. */
  Fishing,
  /** Butchering corpses with a bladed weapon; raw vs cooked by cause of death. */
  Butchering,
  /** Tile fires: spread, extinguish, rain, damage to actors/corpses/crops. */
  TileFires,
  /** Ambient lighting and true darkness: player FOV 0, NPC floor 1. */
  DarknessFov,
  /** Fire extinguishers and siphon kits. */
  FireExtinguishers,
  SiphonFuel,
  /** Fire barrels, campfires and fuel units on cars. */
  FireBarrels,
  /** Nested-inventory backpacks, Hauler-gated slot tiers. */
  ShelterBackpacks,
  /** Difficulty options moved to character creation and locked mid-game. */
  DifficultyAtCreation,
  /** Resources Availability: underground loot, starting kit, fruit interval. */
  ResourcesAvailability,
  /** The helicopter-rescue endgame. */
  HelicopterRescue,
  /** Black Ops raids from day 14, CHAR research raids from day 21. */
  BlackOpsRaid,
  CHARResearchRaid,
  /** NPC-dropped items despawning after N days. */
  ItemDespawn,

  // ── Stage 5: content ───────────────────────────────────────────────────
  Church,
  Bank,
  Bar,
  Clinic,
  Library,
  Junkyard,
  Graveyard,
  Farm,
  FuelStation,
  FireStation,
  AnimalShelter,
  SportsCourts,
  ShoppingMall,
  ArmyBase,
  /** The thirteen ambient tracks on their own audio channel. */
  AmbientAudio,
  /** The 180-fork sound effect set. */
  ExtendedAudio,
}

/**
 * Every feature declared, in one list rather than as the enum body, so that
 * `allFeatures()` is a total function a test can iterate. A member of `Feature`
 * missing from here is a compile error at the partition test rather than a
 * feature that silently never resolves.
 */
const ALL_FEATURES: readonly Feature[] = [
  Feature.LightPriority,
  Feature.DarknessGating,
  Feature.WeaponWeight,
  Feature.ArmorResist,
  Feature.Alcohol,
  Feature.FoodPoisoning,
  Feature.Cooking,
  Feature.Fishing,
  Feature.Butchering,
  Feature.TileFires,
  Feature.DarknessFov,
  Feature.FireExtinguishers,
  Feature.SiphonFuel,
  Feature.FireBarrels,
  Feature.ShelterBackpacks,
  Feature.DifficultyAtCreation,
  Feature.ResourcesAvailability,
  Feature.HelicopterRescue,
  Feature.BlackOpsRaid,
  Feature.CHARResearchRaid,
  Feature.ItemDespawn,
  Feature.Church,
  Feature.Bank,
  Feature.Bar,
  Feature.Clinic,
  Feature.Library,
  Feature.Junkyard,
  Feature.Graveyard,
  Feature.Farm,
  Feature.FuelStation,
  Feature.FireStation,
  Feature.AnimalShelter,
  Feature.SportsCourts,
  Feature.ShoppingMall,
  Feature.ArmyBase,
  Feature.AmbientAudio,
  Feature.ExtendedAudio,
];

/**
 * Features deliberately withheld from Still Alive, with the reason. Currently
 * empty — the plan admits all of them. It is a register rather than a comment
 * because the partition test makes withholding one a deliberate, reviewed act:
 * a non-empty reason string is required, so "off" can never be the lazy answer.
 */
const WITHHELD_FROM_STILL_ALIVE: Readonly<Partial<Record<string, string>>> = {};

/**
 * Every feature a non-CLASSIC ruleset gets. A total function rather than a
 * per-feature test, so a `Ruleset` member that is neither of the two throws
 * instead of quietly getting classic behaviour.
 */
function featuresFor(ruleset: Ruleset): ReadonlySet<Feature> {
  switch (ruleset) {
    case Ruleset.CLASSIC:
      // Nothing. Classic is the port as it has been since the start, so an empty
      // set is the honest answer and any drift shows up as a test failure rather
      // than as a behaviour change nobody chose.
      return CLASSIC_FEATURES;
    case Ruleset.STILL_ALIVE:
      return STILL_ALIVE_FEATURES;
    default:
      // Same reason Session.descRuleset throws.
      throw new Error(`unhandled ruleset: ${ruleset}`);
  }
}

const CLASSIC_FEATURES: ReadonlySet<Feature> = new Set();

/** The Stage a feature is scheduled to land in. */
export type Stage = 2 | 4 | 5;

/**
 * Features that are on for Still Alive but have no reader anywhere yet.
 *
 * Without this the registry cannot be written honestly at Stage 1. Stage 1
 * builds the axis and declares what is coming; Stage 4 and 5 add the readers.
 * A two-way scan — "every declared feature has a call site" — would be red on
 * arrival and would have to be softened, which is how a strict test becomes a
 * decorative one. So the third state is declared here instead, with the stage it
 * belongs to, and `tests/feature-flags.test.ts` asserts the three sets partition
 * `Feature`. That is the same partition discipline `tests/actor-sprites.test.ts`
 * already applies to `SPRITE_OWNED`/`DOLL_OWNED`, and it makes the count fall
 * to zero as a consequence of writing the readers rather than of relaxing a rule.
 *
 * Removing an entry from this list is the point of Stage 4: it becomes a real
 * `hasFeature` call, and the test follows.
 *
 * **Empty.** `ShoppingMall` was the last, and it emptied the register in the way
 * this paragraph says it should: its reader is `makeShoppingMall`'s own first
 * statement (`buildings/makeShoppingMall.ts`), not a flag bolted on at a call site,
 * so there is exactly one place the mall can be switched off and it is ahead of
 * every roll the generator spends.
 */
const PENDING_WIRING: Readonly<Partial<Record<string, Stage>>> = {};

/**
 * Feature value -> name. The one reverse lookup in the project, and it exists
 * only to bridge the two representations: call sites and `ALL_FEATURES` speak
 * `Feature`, the two registers and every test speak names.
 */
const FEATURE_NAME: ReadonlyMap<Feature, string> = new Map(
  ALL_FEATURES.map((f) => [f, Feature[f]] as const)
);

/**
 * The Still Alive set. Built from `ALL_FEATURES` minus the withheld names, so it
 * cannot fall behind the enum.
 */
const STILL_ALIVE_FEATURES: ReadonlySet<Feature> = new Set(
  ALL_FEATURES.filter((f) => !((FEATURE_NAME.get(f) ?? "") in WITHHELD_FROM_STILL_ALIVE))
);

/**
 * Is `feature` on for this ruleset?
 *
 * A module function rather than a method on `Session` so the engine, the AI and
 * the generators can all ask without holding a session, and so the two
 * pre-computed sets above are the only allocation that ever happens.
 */
export function hasFeature(ruleset: Ruleset, feature: Feature): boolean {
  return featuresFor(ruleset).has(feature);
}

/**
 * How many features a ruleset turns on. For the summary line, the headless
 * harness, and the scanner test's "a feature nobody reads" report.
 */
export function featureCount(ruleset: Ruleset): number {
  return featuresFor(ruleset).size;
}

/** Every feature declared, for tests and diagnostics. Not for gameplay. */
export function allFeatures(): readonly Feature[] {
  return ALL_FEATURES;
}

/** The features deliberately withheld from Still Alive, and why. */
export function withheldFromStillAlive(): Readonly<Partial<Record<string, string>>> {
  return WITHHELD_FROM_STILL_ALIVE;
}

/**
 * Features that are on for Still Alive but have no reader yet, with the stage
 * they land in. `tests/feature-flags.test.ts` asserts this set is disjoint from
 * the set of features that *do* have a call site, so an entry left behind after
 * its reader was written is a test failure rather than a stale list.
 */
export function pendingWiring(): Readonly<Partial<Record<string, Stage>>> {
  return PENDING_WIRING;
}

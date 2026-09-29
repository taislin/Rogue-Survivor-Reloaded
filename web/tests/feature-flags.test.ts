import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { walk } from "./helpers/grepAll";
import { Ruleset, Session } from "@engine/Session";
import {
  Feature,
  allFeatures,
  hasFeature,
  featureCount,
  pendingWiring,
  withheldFromStillAlive,
} from "@engine/FeatureFlags";

/**
 * The Still Alive feature registry is the thing that keeps a ruleset flag from
 * becoming a pile of invisible branches.
 *
 * The failure this prevents: `if (session.ruleset === Ruleset.STILL_ALIVE)` at
 * each of the ~100 sites Stage 4 adds. Nothing counts those, nothing lists
 * them, and "how much of the fork has leaked into the engine" becomes a
 * judgement call somebody has to make by reading 27,000 lines of
 * `RogueGame.ts`. Declaring the set once makes it a number.
 *
 * So the test is a source scan in both directions, plus one more check that is
 * the real point: **no file may branch on the ruleset directly.** If every
 * question has to go through `hasFeature`, then `Feature` is genuinely the whole
 * surface, and a feature that nobody asks about is visible as such rather than
 * being a flag some future change will find and rewire.
 *
 * This is a shape assertion, not a fallback. It is the same technique as
 * `rule-result-usage.test.ts` and `point-identity.test.ts`, and it carries the
 * same caveat they do — `map-screen-conversion.test.ts:140-155` records what
 * happens when a scanner's pattern stops matching the source it guards. Hence
 * the two `expect`s below that assert the scan is *finding things at all*,
 * rather than passing vacuously.
 */

const SRC = join(__dirname, "../src");
const REGISTRY = join(SRC, "engine/FeatureFlags.ts");

/**
 * Feature members, by name.
 *
 * Read off the enum at runtime rather than parsed out of the source. An earlier
 * version of this file regexed the enum body and keyed on the literal text
 * `export const enum Feature {` — so dropping the `const` (which was necessary,
 * because the registry needs a reverse lookup and a const enum forbids one)
 * silently emptied the set and every partition assertion passed on nothing. A
 * runtime read cannot drift from the declaration, which is the entire point of
 * the partition test.
 *
 * A transpiled numeric enum is a *bidirectional* object —
 * `{0: "LightPriority", "LightPriority": 0, ...}` — so `Object.values` is
 * `[0, 1, ... 36, "LightPriority", ...]`: the numbers first, then the names.
 * Only the string half is the member list.
 */
function enumMembers(): Set<string> {
  return new Set(
    Object.values(Feature).filter((v): v is string => typeof v === "string")
  );
}

/**
 * Every `.ts` under src/ except the registry itself, with its text. The registry
 * is excluded because its `ALL_FEATURES` list is a *declaration* of every
 * Feature member — including it would make this scan report all 37 as "read",
 * which is exactly the vacuous pass the next test exists to catch.
 */
function sourceFilesExcludingRegistry(): { path: string; text: string }[] {
  return walk(SRC)
    .filter((p) => p !== REGISTRY)
    .map((p) => ({ path: relative(SRC, p), text: readFileSync(p, "utf-8") }));
}

/** Feature names used as the second argument of a `hasFeature(...)` call. */
function hasFeatureCallSites(): { feature: string; at: string }[] {
  const out: { feature: string; at: string }[] = [];
  for (const { path, text } of sourceFilesExcludingRegistry()) {
    text.split("\n").forEach((line, i) => {
      const m = line.match(/hasFeature\([^,]+,\s*Feature\.([A-Z][A-Za-z0-9_]*)/);
      if (m) out.push({ feature: m[1]!, at: `${path}:${i + 1}` });
    });
  }
  return out;
}

describe("Feature registry is total", () => {
  it("the enum body and ALL_FEATURES are the same set, both ways", () => {
    // Both directions on purpose. A member missing from ALL_FEATURES never
    // resolves; a name in ALL_FEATURES that is not a member does not compile.
    // Either is a compile error, so this is belt-and-braces against the list
    // drifting in a way the compiler would not catch (e.g. via a cast).
    expect(new Set(allFeatures().map((f) => Feature[f]))).toEqual(enumMembers());
  });

  it("STILL_ALIVE enables everything not withheld, and CLASSIC enables nothing", () => {
    const withheld = new Set(Object.keys(withheldFromStillAlive()));
    for (const f of allFeatures()) {
      const name = Feature[f];
      const shouldBeOn = !withheld.has(name);
      expect(hasFeature(Ruleset.STILL_ALIVE, f), `${name} under STILL_ALIVE`).toBe(shouldBeOn);
      expect(hasFeature(Ruleset.CLASSIC, f), `${name} under CLASSIC`).toBe(false);
    }
    expect(featureCount(Ruleset.CLASSIC)).toBe(0);
    expect(featureCount(Ruleset.STILL_ALIVE)).toBe(allFeatures().length - withheld.size);
  });

  it("an unrecognised ruleset throws rather than defaulting", () => {
    // A ruleset that is neither of the two must not quietly get classic
    // behaviour — that is the same discipline Session.descRuleset uses, and it
    // is why this is tested rather than assumed.
    expect(() => hasFeature(99 as Ruleset, Feature.Alcohol)).toThrow(/unhandled ruleset/);
    expect(() => featureCount(99 as Ruleset)).toThrow(/unhandled ruleset/);
  });

  it("withholding a feature requires a reason", () => {
    // "Off" is allowed to be a decision, but not an undocumented one: a feature
    // that is simply absent from STILL_ALIVE has to say why it is not there.
    for (const [name, reason] of Object.entries(withheldFromStillAlive())) {
      expect(typeof reason, `${name} has a reason`).toBe("string");
      expect((reason ?? "").trim().length, `${name}'s reason is not empty`).toBeGreaterThan(0);
    }
  });
});

describe("Feature registry is wired", () => {
  it("the scan is finding call sites at all, and the expected number of them", () => {
    // Anti-vacuity. If the pattern stops matching — a rename, a reformat, a
    // helper wrapping the call — the tests below pass by finding nothing, and
    // this is the assertion that says so.
    //
    // `Alcohol` is not read by gameplay code either: it is the harness line in
    // HeadlessRunner, which sets a field the engine has no reader for yet. The
    // other two are the first features with real readers, and both landed in
    // `Rules`: a speed term and an infection roll are both rules questions, and
    // `ArmorResist` moved there from the bite handler in `RogueGame` when its
    // gate, torso lookup and roll were folded into one function a test could
    // call. A feature whose reader drifts to another file should be a deliberate
    // change here, which is why the file is asserted and not just the name.
    //
    // Each call site is named *and located*, so a feature that stops being read
    // fails here rather than quietly leaving the partition below.
    const sites = hasFeatureCallSites();
    expect(sites.length).toBeGreaterThan(0);
    // The list is per *call site*, not per feature. `FoodPoisoning` has four,
    // which is the interesting one: two in `Rules` (the contraction roll and the
    // recovery roll, each gated where it lives) and two in the turn loop -- the
    // per-actor sweep and the antiviral cure. The sweep's gate is not redundant
    // with the recovery function's, because without it the loop walks every actor
    // on the map calling a function that immediately returns.
    //
    // Asserting the exact multiset means a new reader has to be added here, which
    // is the point: a reader is a decision, not an accident.
    expect(sites.map((s) => s.feature).sort())
      .toEqual(["Alcohol", "ArmorResist", "Cooking", "Cooking", "FireBarrels",
                "FireBarrels", "FoodPoisoning", "FoodPoisoning", "FoodPoisoning",
                "FoodPoisoning", "FoodPoisoning", "FoodPoisoning", "ItemDespawn",
                "ItemDespawn", "WeaponWeight"]);
    const at = (feature: string) => sites.find((s) => s.feature === feature)!.at;
    expect(at("Alcohol")).toMatch(/HeadlessRunner\.ts:\d+$/);
    expect(at("WeaponWeight")).toMatch(/Rules\.ts:\d+$/);
    expect(at("ArmorResist")).toMatch(/Rules\.ts:\d+$/);
    // `Cooking` is two, like `FoodPoisoning`: the predicate in `Rules` beside the
    // other "can this actor" questions, and the per-turn tick in `RogueGame`,
    // which guards its own loop over map objects for the same reason
    // `FoodPoisoning`'s sweep does.
    const cook = sites.filter((s) => s.feature === "Cooking");
    expect(cook.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(1);
    expect(cook.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(1);

    // The food-poisoning readers are split two-and-two, so the file is asserted
    // per site rather than per feature.
    // Six food-poisoning readers, and the split is the interesting part: two in
    // `Rules`, where the rolls live, and four in `RogueGame` -- the per-turn
    // sweep, the vomit, and the two medicine/eat hooks. The file is asserted per
    // site rather than per feature because "which half of the engine owns this" is
    // the question a reader of this suite is actually asking, and a reader who
    // adds a fifth hook should see the count move.
    const poison = sites.filter((s) => s.feature === "FoodPoisoning");
    expect(poison.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(2);
    expect(poison.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(4);

    // FireBarrels is two readers in two different files, and the split is the
    // point: the generator decides what a barrel *is*, the turn loop decides what
    // a lit barrel *does*. Collapsing either into a helper would hide the flag
    // behind an abstraction and make the count the only place it shows up.
    // ItemDespawn is two readers in two files for the same reason FireBarrels is:
    // the drop decides what becomes litter, the turn loop decides when litter goes.
    const despawn = sites.filter((s) => s.feature === "ItemDespawn");
    expect(despawn.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(2);

    const barrels = sites.filter((s) => s.feature === "FireBarrels");
    expect(barrels.filter((s) => /BaseMapGenerator\.ts/.test(s.at))).toHaveLength(1);
    expect(barrels.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(1);
  });

  it("every Feature member is read, pending, or withheld — and never two of them", () => {
    // The partition. READ comes from the scan, PENDING_WIRING is declared,
    // WITHHELD is a decision, and the three must be disjoint and total. A
    // feature that is on but unwired has to be named in PENDING_WIRING, so the
    // count falls to zero as a consequence of writing the readers rather than of
    // somebody relaxing this assertion.
    const read = new Set(hasFeatureCallSites().map((s) => s.feature));
    const pending = new Set(Object.keys(pendingWiring()));
    const withheld = new Set(Object.keys(withheldFromStillAlive()));
    const declared = enumMembers();

    const unaccounted = [...declared].filter(
      (n) => !read.has(n) && !pending.has(n) && !withheld.has(n)
    );
    expect(
      unaccounted,
      `these are on for Still Alive but neither read nor declared pending:\n  ${unaccounted.join("\n  ")}`
    ).toEqual([]);

    const bothReadAndPending = [...declared].filter((n) => read.has(n) && pending.has(n));
    expect(
      bothReadAndPending,
      `these have a reader AND are declared pending — the stale list:\n  ${bothReadAndPending.join("\n  ")}`
    ).toEqual([]);

    const overlap = [...read].filter((n) => withheld.has(n));
    expect(overlap, `withheld features must not be read:\n  ${overlap.join("\n  ")}`).toEqual([]);

    // The other direction: a name in any of the three that is not a member.
    const phantom = [...read, ...pending, ...withheld].filter((n) => !declared.has(n));
    expect(phantom, `not a Feature member:\n  ${phantom.join("\n  ")}`).toEqual([]);
  });

  it("every pending feature names a real stage", () => {
    for (const [name, stage] of Object.entries(pendingWiring())) {
      expect([2, 4, 5], `${name} names a stage in §5.6`).toContain(stage);
    }
  });
});

describe("Nothing branches on the ruleset directly", () => {
  it("no file outside the registry compares anything to a Ruleset member", () => {
    // This is the check the whole registry exists for. A direct comparison is
    // not forbidden by the type system and would be completely invisible: the
    // feature would answer `false` for every other Feature, so `ALL_FEATURES`,
    // `featureCount` and the partition test would all still pass while the
    // behaviour was wired up outside the registry.
    const offenders: string[] = [];
    for (const { path, text } of sourceFilesExcludingRegistry()) {
      text.split("\n").forEach((line, i) => {
        // A comment naming the rule is fine; code branching on it is not.
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (/ruleset\s*===/.test(code) || /===\s*Ruleset\./.test(code)) {
          offenders.push(`${path}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `branch on the ruleset directly — go through hasFeature():\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("Session exposes the ruleset but the desc helpers are exhaustive", () => {
    // The two description helpers throw on an unhandled ruleset, so a new one
    // cannot be added without deciding what the player is told. Asserted here
    // because the throw is the whole safety property and it is three lines of
    // switch that a future edit could turn into a `default` return.
    expect(Session.descShortRuleset(Ruleset.CLASSIC)).toBe("Classic");
    expect(Session.descShortRuleset(Ruleset.STILL_ALIVE)).toBe("Still Alive");
    expect(() => Session.descRuleset(99 as Ruleset)).toThrow(/unhandled ruleset/);
    expect(() => Session.descShortRuleset(99 as Ruleset)).toThrow(/unhandled ruleset/);
  });
});

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
    // `relative` is platform-native, so it hands back `gameplay\Backpacks.ts` on
    // Windows and `gameplay/Backpacks.ts` on Linux. The assertions below match on
    // paths -- `/gameplay\/Backpacks\.ts/` and friends -- so the native form makes
    // them separator-dependent: they hold on the Linux reference box and silently
    // match nothing anywhere else, which is the vacuous pass this file exists to
    // prevent. Normalising to `/` here keeps every downstream pattern written
    // once and reading the same on both platforms.
    .map((p) => ({
      path: relative(SRC, p).split(/[\\/]/).join("/"),
      text: readFileSync(p, "utf-8"),
    }));
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
    // `Alcohol` was, for a while, read *only* by the harness line in
    // HeadlessRunner -- a `step()` that labels a run with the ruleset it played.
    // That cosmetic call was enough to satisfy the partition below, which is how
    // the feature came to be marked done while entirely unimplemented. It now has
    // five gameplay readers and the harness line is the sixth. The lesson is
    // recorded here because the failure mode is general: **a "has a reader" check
    // that a log statement satisfies will eventually mark something done that
    // isn't.** A feature whose reader drifts to another file should be a
    // deliberate change here, which is why the file is asserted and not just the
    // name.
    //
    // `WeaponWeight` and `ArmorResist` are the two that live purely in `Rules`: a
    // speed term and an infection roll are both rules questions, and `ArmorResist`
    // moved there from the bite handler in `RogueGame` when its gate, torso lookup
    // and roll were folded into one function a test could call.
    //
    // Each call site is named *and located*, so a feature that stops being read
    // fails here rather than quietly leaving the partition below.
    const sites = hasFeatureCallSites();
    expect(sites.length).toBeGreaterThan(0);
    // The list is per *call site*, not per feature. `FoodPoisoning` has six, which
    // is the interesting one: two in `Rules` (the contraction roll and the
    // recovery roll, each gated where it lives) and four in the turn loop -- the
    // per-actor sweep, the antiviral cure, and the two eating paths. The sweep's
    // gate is not redundant with the recovery function's, because without it the
    // loop walks every actor on the map calling a function that immediately
    // returns.
    //
    // It said "four ... and two in the turn loop" and the same file got it right
    // fifty lines later, so the file carried both numbers at once. The multiset
    // below is the authority and it had been saying six the whole time.
    //
    // Asserting the exact multiset means a new reader has to be added here, which
    // is the point: a reader is a decision, not an accident.
    //
    // **The array below is generated, not written.** `scripts/gen-feature-flag-sites.mjs`
    // walks `src/` with this test's own regex and prints it in this shape; paste its
    // output over the array in the same commit as the reader. Hand-editing it is how a
    // "has a reader" check comes to disagree with the code it is checking, which is
    // the one failure mode a multiset is supposed to rule out.
    expect(sites.map((s) => s.feature).sort())
      .toEqual([
"Alcohol", "Alcohol", "Alcohol", "Alcohol", "Alcohol", "Alcohol", "Alcohol", "AmbientAudio", "AmbientAudio", "AmbientAudio",
   "AmbientAudio", "AmbientAudio", "AmbientAudio", "AnimalShelter", "AnimalShelter", "ArmorResist", "ArmyBase", "ArmyBase", "Bank", "Bank",                                                                                                         
   "Bar", "Bar", "BlackOpsRaid", "Butchering", "Butchering", "CHARResearchRaid", "Church", "Clinic", "Clinic", "Cooking",                                                                                                                           
   "Cooking", "Cooking", "DarknessFov", "DarknessFov", "DarknessFov", "DarknessFov", "DarknessFov", "DarknessFov", "DarknessFov", "DarknessFov",                                                                                                    
   "DarknessGating", "DerangedPatient", "DerangedPatient", "DifficultyAtCreation", "DifficultyAtCreation", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio",                                                     
   "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio",                                                                        
   "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio",                                                                        
   "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio",                                                                        
   "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "ExtendedAudio", "Farm", "Farm", "FireBarrels", "FireBarrels",                                                                                              
   "FireBarrels", "FireExtinguishers", "FireStation", "Fishing", "Fishing", "Fishing", "Fishing", "Fishing", "Fishing", "Fishing",                                                                                                                  
   "FoodPoisoning", "FoodPoisoning", "FoodPoisoning", "FoodPoisoning", "FoodPoisoning", "FoodPoisoning", "FuelStation", "Graveyard", "Graveyard", "HelicopterRescue",                                                                               
   "HelicopterRescue", "HelicopterRescue", "HelicopterRescue", "HelicopterRescue", "ItemDespawn", "ItemDespawn", "Junkyard", "Junkyard", "Library", "Library",                                                                                      
   "LightPriority", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability", "ResourcesAvailability",
   "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks",                                          
   "ShelterBackpacks", "ShelterBackpacks", "ShelterBackpacks", "ShoppingMall", "ShoppingMall", "ShoppingMall", "SiphonFuel", "SiphonFuel", "SportsCourts", "SportsCourts",                                                                          
   "TileFires", "TileFires", "TileFires", "TileFires", "TileFires", "WeaponWeight",
      ]);
      // 156 call sites across 38 features




    const at = (feature: string) => sites.find((s) => s.feature === feature)!.at;
    // `Alcohol`'s *first* reader is now in `RogueGame` (the per-turn decay), and
    // the harness line is one of seven rather than the only one.
    expect(at("Alcohol")).toMatch(/RogueGame\.ts:\d+$/);
    expect(sites.some((s) => s.feature === "Alcohol" && /HeadlessRunner\.ts/.test(s.at))).toBe(true);
    expect(at("WeaponWeight")).toMatch(/Rules\.ts:\d+$/);
    expect(at("ArmorResist")).toMatch(/Rules\.ts:\d+$/);
    // `Cooking` is three, like `FoodPoisoning`: the predicate in `Rules` beside the
    // other "can this actor" questions, the per-turn tick in `RogueGame`, which
    // guards its own loop over map objects for the same reason `FoodPoisoning`'s
    // sweep does, and `DoMakeFireForCooking` -- the command that made both of the
    // other two reachable, since before it a fire could only come from an explosion.
    const cook = sites.filter((s) => s.feature === "Cooking");
    expect(cook.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(1);
    expect(cook.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(2);

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

    // Alcohol has six, in three files, which is the most spread-out feature so
    // far -- the decay, the drink effect, the two accuracy penalties, the control
    // arm, and the log line in the headless harness that used to be its *only*
    // reader, which is how it came to be marked done while entirely unwritten.
    const alc = sites.filter((s) => s.feature === "Alcohol");
    expect(alc.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(2);
    expect(alc.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(4);
    expect(alc.filter((s) => /HeadlessRunner\.ts/.test(s.at))).toHaveLength(1);

    // ResourcesAvailability is seven readers in five files: the options row and
    // its arrow keys, the difficulty rating multiplier, the starting kit,
    // `BaseTownGenerator.makeCHARStorageRoom` -- the CHAR underground's loot
    // gate, Release 7-4 (`BaseTownGenerator.cs:8531` and `:8547`), which is the
    // first *generator* reader of the option and the first one a world generates
    // with rather than a session that starts with -- and the three sleeping-bag
    // readers.
    // The Butchering meat quantity reads it too, but through a helper rather
    // than inline, so it is counted at its one caller.
    //
    // **The sleeping bag is why the flag has three `RogueGame`/`BaseAI` readers, and
    // it is the argument for putting it on this flag at all.** There is no sleep flag
    // in the registry and there should not be one -- sleeping on a couch is a Classic
    // mechanic with its own `SLEEP_COUCH_SLEEPING_REGEN` constant, and any flag that
    // switched *that* off would be wrong. What the flag has to cover is the bag
    // itself, in all three places that can notice one: the `DoUseItem` arm that
    // unrolls it, the sleep-regen OR in the turn loop, and `BaseAI.behaviorSleep`'s
    // `couchPos` scan. Three readers in two files because the AI's copy is in
    // `BaseAI` and the other two are in `RogueGame` -- so this is the first feature
    // whose split is "engine and AI" rather than "engine and UI".
    const res = sites.filter((s) => s.feature === "ResourcesAvailability");
    expect(res.filter((s) => /OptionsScreen\.ts/.test(s.at))).toHaveLength(1);
    expect(res.filter((s) => /Scoring\.ts/.test(s.at))).toHaveLength(1);
    expect(res.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(3);
    // Two, not one: the CHAR storage room and now the CHAR lab both drop
    // construction items under this option. The lab is the second because it is a
    // separate room generator with its own roll, and a shared one would have had to
    // be threaded through `makeCHARStorageRoom` -- which is the shape this test
    // exists to make visible when a feature grows a reader.
    // Three now: the CHAR storage room, the CHAR lab, and one shared reader for the
    // army base's six rooms (`armyResourcesChance`, which is why the count grows by one
    // and not by four). A private helper the four call sites share is the difference
    // between this number growing once per feature and once per room.
    expect(res.filter((s) => /BaseTownGenerator\.ts/.test(s.at))).toHaveLength(3);
    expect(res.filter((s) => /ai\/BaseAI\.ts/.test(s.at))).toHaveLength(1);

    // DifficultyAtCreation is two readers in two files, and the split is the
    // feature: a screen nobody can reach, and a screen that leaves the same rows
    // editable mid-game, are the two halves of the same bug.
    const difficulty = sites.filter((s) => s.feature === "DifficultyAtCreation");
    expect(difficulty.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(1);
    expect(difficulty.filter((s) => /OptionsScreen\.ts/.test(s.at))).toHaveLength(1);

    // Butchering is two readers in two files: the "you need a bladed weapon"
    // check, and the meat block. The insanity carve-out for animals is gated by
    // neither, because it reads a data flag rather than a behaviour change --
    // an actor that is *not* a living animal gets exactly vanilla's sanity hit.
    const butcher = sites.filter((s) => s.feature === "Butchering");
    expect(butcher.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(1);
    expect(butcher.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(1);


    // FireExtinguishers is a single reader, in the spray-paint mode dispatch. One
    // gate there covers the banner, the refusal message and the handler call, so
    // CLASSIC cannot end up with an extinguisher that announces itself in
    // EXTINGUISH MODE and then tags a floor instead.
    expect(sites.filter((s) => s.feature === "FireExtinguishers")).toHaveLength(1);

    // Fishing is seven, split one-and-five-and-one, and all three halves are the
    // design rather than bookkeeping.
    //
    // The seventh is the pond, in `BaseTownGenerator`: Release 6-1's replacement for
    // alpha10's shed, and the only thing in the game that makes `Map.hasFishing`
    // true. It is gated at the step, which is what keeps Classic on the shed and
    // therefore byte-identical -- see the branch in `makeParkBuilding`.
    //
    // The one in `Rules` is the equip gate: a rod is a rod only beside water, and
    // that is a *rule*, so it belongs with the other "can this actor" questions
    // and is reachable by a test without building a message list. The C# has it as
    // a special case at each of its two equip sites instead; folding it into
    // `canActorEquipItem` is behaviour-identical, and it is called out in the
    // comment there because "the C# does it twice" is the kind of thing a reader
    // has to be told rather than left to find.
    //
    // The five in `RogueGame` are the five places the rod is *read*, and each is
    // separately gated because a survivor who could do one of them without the
    // feature would notice: the wait (which is also where a wait becomes a cast),
    // the `use` dispatch, the move force-unequip, the hit force-unequip, and the
    // inventory description's "to fish" line. The last one is the weakest gate in
    // the set and is kept anyway, because it is the only part of a cast the player
    // is *told* about, and a description that differs is a description that
    // differs.
    //
    // The two force-unequips are separately gated rather than folded into one
    // helper because they are reached from different paths (a move, and any
    // damage) and a survivor who kept a rod through one of them and not the other
    // would be a bug neither single gate could see.
    const fishing = sites.filter((s) => s.feature === "Fishing");
    expect(fishing).toHaveLength(7);
    expect(fishing.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(1);
    expect(fishing.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(5);
    expect(fishing.filter((s) => /BaseTownGenerator\.ts/.test(s.at))).toHaveLength(1);
    // And the `Rules` reader is the predicate, not the catch chance: the chance is
    // a pure number only the gated wait asks for, the same arrangement
    // `Rules.meatQuantityPerCorpse` has, so a second gate there would be a gate
    // that could not change anything.
    expect(fishing.find((s) => /Rules\.ts/.test(s.at))!.at).toMatch(/Rules\.ts:\d+$/);

    // TileFires has five readers, and the fifth is `DoUseItem`'s molotov arm.
    //
    // It was deliberately ONE until the per-actor fire subsystem landed: the spread
    // loop, the burn damage and the ignite/put-out primitives were one indivisible
    // feature, and gating `stepTileFires` alone was enough for CLASSIC because
    // nothing else called the primitives. That reasoning no longer holds — the
    // primitives are now reachable from three places that are not `stepTileFires`
    // (the per-turn alight pass, `DoWait`'s stop-drop-and-roll, and the fire
    // extinguisher's actor target), so the count is 2 *methods* rather than 1.
    //
    // **The fifth is a different kind of gate from the other four and says so in its
    // own header.** The first four guard *behaviour* — a fire spreads or does not. The
    // molotov arm guards an *offer*: whether the player is invited to turn a bottle of
    // liquor into the one item in the game whose whole job is to set fire. It is the
    // only site on this flag that is not a hazard simulation, and the reasoning for
    // putting it here rather than on `Cooking` or `FireBarrels` is written out at
    // `RogueGame.DoMakeMolotov`. Note what it is not: a thrown molotov under a
    // `TileFires`-off ruleset still ignites, because `ApplyExplosionDamage`'s seeding
    // call is not itself gated.
    //
    // The four *sites* below are two early returns plus two `&&` guards in `DoWait`.
    // The `&&` guards are not extra independent switches — they guard a public
    // entry point, exactly as `stepTileFires`'s early return guards its own — so
    // they are counted here rather than collapsed, because a gate nobody counts is
    // a gate nobody notices deleting.
    expect(sites.filter((s) => s.feature === "TileFires")).toHaveLength(5);
    const tileFires = sites.filter((s) => s.feature === "TileFires");
    expect(tileFires.every((s) => /RogueGame\.ts/.test(s.at))).toBe(true);
    // Two of the four are inside `DoWait` (the message guard and the
    // stop-drop-and-roll guard); the other two are the early returns in
    // `stepActorsOnFire` and `stepTileFires`. Pinned so that "somebody added a
    // fifth gate" is a deliberate edit to this file rather than a silent one.
    //
    // **By file order, not by line number.** This was `< 17000`, and any insertion
    // anywhere above `DoWait` moved it -- `PlayRangedWeaponSFX` and its table are
    // ~215 lines and pushed both gates past the boundary, so a feature landing
    // 200 lines away turned a structural claim into a line-count coincidence. The
    // first two gates in the file are the two `DoWait` ones because `DoWait` is
    // declared before both step functions; that ordering is a fact about the file's
    // structure and does not move.
    //
    // The fifth is *not* in that sequence: it is in `DoUseItem`, which is declared
    // after both step functions, so it sorts last by line number and by file position
    // alike. That is why only the first three are asserted as ordered.
    const tileFireLines = tileFires.map((s) => Number(/RogueGame\.ts:(\d+)/.exec(s.at)![1]));
    expect(tileFireLines.every((n) => Number.isInteger(n))).toBe(true);
    expect(tileFireLines.length, "all five are in RogueGame.ts").toBe(5);
    expect(tileFireLines[0] < tileFireLines[1] && tileFireLines[1] < tileFireLines[2], "declared in order")
      .toBe(true);

    // SiphonFuel has two readers in one file, and the second one is the
    // interesting one: the `use` dispatch and the handler's own guard. The handler
    // keeps its gate even though the only caller already checked, because it is
    // the method a test -- and eventually an AI action -- will reach, and a method
    // that is only safe because of its caller is a method with a precondition
    // nobody wrote down.
    const siphon = sites.filter((s) => s.feature === "SiphonFuel");
    expect(siphon).toHaveLength(2);
    expect(siphon.every((s) => /RogueGame\.ts/.test(s.at))).toBe(true);

    // ShelterBackpacks is seven, split two-and-five, and the split is the
    // feature rather than bookkeeping.
    //
    // The two in `Rules` are the *questions*: may this actor pick this bag up, and
    // may this item cross into one. Both are gates somebody has to get wrong, and
    // both answer a definite "not available in this ruleset" under CLASSIC rather
    // than falling through -- a rule a UI asks has to have a `false` to return.
    //
    // The five in `Backpacks.ts` are the *public entry points* of the mechanic:
    // the factory that is the only thing in the project that can produce an
    // `ItemBackpack`, the open, the auto-close that `BlockAction` does, and the
    // two directions of the move. They are gated separately because under CLASSIC
    // the ones that *emit a message* would otherwise say "You aren't carrying a
    // backpack." to a survivor who has never heard of one.
    //
    // `firstBackpack` and `isBackpackOpen` in the same file are deliberately NOT
    // readers. They are queries with no CLASSIC behaviour -- they answer `null` /
    // `false` because the gated factory is the only producer -- and a gate there
    // would be a second answer to a question that already has one.
    //
    // Eight, not seven: the subagent's seven are `Rules` (2) and `gameplay/Backpacks`
    // (5), and the eighth is the one *this* file's integration added -- the
    // "to move to backpack" line in `DescribeItemLong`, which decides whether the
    // description mentions `Y`. It is here rather than in `Backpacks.ts` because it
    // is a string in a HUD description, not a rule, and moving it would mean the
    // description module knew about item models.
    //
    // `Y` has no `PlayerCommand` binding under CLASSIC, so a description that
    // mentioned it would be naming a key the player cannot press. That is why this
    // gate exists at all rather than being cosmetic.
    //
    // Thirteen, not eight: the five above, plus the five the *placement* work added
    // in `BaseTownGenerator` (the sewers maintenance table, the subway bench, the
    // CHAR office roll and the park roll — five gates, and the park roll is in two
    // files because the mall re-derives it), and the mall's own copy.
    //
    // **Every one of those five is ahead of its roll rather than behind it**, and
    // that is the load-bearing part. `DiceRoller.rollChance` delegates to `roll`, so
    // it spends a die even at 0%; a gate that let the roll happen and then threw the
    // result away would move every subsequent district roll, and the Classic
    // district digest `e097b9d976ffac15` — asserted in seven suites — is what
    // notices. The placement sites are asserted to be short-circuiting in
    // `shelter-backpacks-placement.test.ts`; this count is what stops a *new*
    // ungated reader appearing here without anyone looking.
    const packs = sites.filter((s) => s.feature === "ShelterBackpacks");
    expect(packs).toHaveLength(13);
    expect(packs.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(2);
    expect(packs.filter((s) => /gameplay\/Backpacks\.ts/.test(s.at))).toHaveLength(5);
    expect(packs.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(1);
    expect(packs.filter((s) => /BaseTownGenerator\.ts/.test(s.at))).toHaveLength(4);
    expect(packs.filter((s) => /makeShoppingMall\.ts/.test(s.at))).toHaveLength(1);

    // DarknessGating has exactly one reader, in Rules, and that is the design
    // rather than an accident: five separate behaviours refuse in the dark
    // (medicine, reading, barricading a door, building a fortification, repairing
    // a fortification), and all five go through one `isActorInAbsoluteDarkness`
    // helper. Five independent gates would be five chances to disagree about what
    // "too dark" means.
    expect(sites.filter((s) => s.feature === "DarknessGating")).toHaveLength(1);

    // DarknessFov is a single reader and that is the point: the whole rebalance
    // is selected in one place (`Rules.fovProfile`), so there is exactly one
    // gate to get wrong rather than five independent ones that could disagree.
    // Two readers in two files, and the split matters: `Rules.fovProfile` picks
    // the number set and `LOS` decides what a range of 0 can see. A third
    // independent gate for a third number would be a third chance to disagree
    // with the other two, which is why the numbers themselves are one record.
    const dark = sites.filter((s) => s.feature === "DarknessFov");
    expect(dark.filter((s) => /Rules\.ts/.test(s.at))).toHaveLength(1);
    // Two in LOS, not one: the 2a adjacency shortcut and the 2b light scan. Both
    // must be gated separately -- the shortcut governs what FOV 0 can see at all,
    // the scan governs whether a fire two tiles away is visible from anywhere.
    expect(dark.filter((s) => /LOS\.ts/.test(s.at))).toHaveLength(2);

    // FireBarrels is three readers in three different files, and the split is the
    // point: the generator decides what a barrel *is* (`BaseMapGenerator`), the
    // turn loop decides what a lit barrel *does* (`RogueGame`), and the CHAR
    // underground's storage room decides whether the room gets one at all
    // (`BaseTownGenerator`, Release 7-6, `BaseTownGenerator.cs:8527`) -- gated
    // before the roll, because `DiceRoller.rollChance` spends a die even at 0%.
    // Collapsing any of the three into a helper would hide the flag behind an
    // abstraction and make the count the only place it shows up.
    // ItemDespawn is two readers in two files for the same reason FireBarrels is:
    // the drop decides what becomes litter, the turn loop decides when litter goes.
    const despawn = sites.filter((s) => s.feature === "ItemDespawn");
    expect(despawn.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(2);

    const barrels = sites.filter((s) => s.feature === "FireBarrels");
    expect(barrels.filter((s) => /BaseMapGenerator\.ts/.test(s.at))).toHaveLength(1);
    expect(barrels.filter((s) => /BaseTownGenerator\.ts/.test(s.at))).toHaveLength(1);
    expect(barrels.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(1);

    // FuelStation is one reader, in the building file, and the location is the
    // point rather than the count. The gate cannot live at the call site in
    // `BaseTownGenerator` because the call site is the parks loop's `&&` chain
    // (`BaseTownGenerator.ts:452-462`) -- gating there would have to wrap the
    // `if`, and the C#'s fuel station spends a `Roll(0, 4)` of its own. Putting it
    // as the building's first statement keeps one place to get right, and it is
    // free to come first because the C#'s first roll is after the suitability
    // return. Same shape as FireStation's single reader.
    const fuelStations = sites.filter((s) => s.feature === "FuelStation");
    expect(fuelStations).toHaveLength(1);
    expect(fuelStations[0]!.at).toMatch(
      /buildings\/makeFuelStationBuilding\.ts:\d+$/,
    );

    // BlackOpsRaid is one reader in `RogueGame`, and the location is the point.
    // This is the reader that was *missing* rather than misplaced: the raid was
    // fully implemented (`CheckForEvent_BlackOpsRaid` / `FireEvent_BlackOpsRaid`
    // and both spawners) and firing in every ruleset, which is why the feature sat
    // in `PENDING_WIRING` with zero call sites. The gate belongs on the *check*
    // rather than the *fire* -- `FireEvent` is reached from exactly one place and
    // gating it there would leave the three date/gap/chance dice spent in a
    // Classic district for a raid that can never happen.
    const blackOps = sites.filter((s) => s.feature === "BlackOpsRaid");
    expect(blackOps).toHaveLength(1);
    expect(blackOps[0]!.at).toMatch(/RogueGame\.ts:\d+$/);

    // CHARResearchRaid is one reader for the same reason, and it is worth pairing
    // with the assertion above because the two features differ in *how* they are
    // gated. BlackOps replaces a missing `GameOptions` option; CHAR replaces
    // nothing -- the C# gates it on no condition at all (`RogueGame.cs:28715`), so
    // the `hasFeature` here is purely the port's addition, and it is the only thing
    // keeping a shotgun-carrying team out of a Classic district.
    const charRaid = sites.filter((s) => s.feature === "CHARResearchRaid");
    expect(charRaid).toHaveLength(1);
    expect(charRaid[0]!.at).toMatch(/RogueGame\.ts:\d+$/);

    // SportsCourts is **two** readers, and the split is the feature: the C# reaches
    // the courts through `!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b)`
    // at `:555`, so each gates itself and the pair is one chain entry. Two readers
    // in one file, both in the building file rather than at the `BaseTownGenerator`
    // call site, which is the convention every other building here follows.
    const courts = sites.filter((s) => s.feature === "SportsCourts");
    expect(courts).toHaveLength(2);
    expect(courts.every((s) => /buildings\/makeSportsCourts\.ts/.test(s.at))).toBe(true);

    // ShoppingMall is **two** readers in two files, and it is the only feature in
    // the set whose second reader is not in `RogueGame` and not a call site: one is
    // the generator's own first statement, and the other is the **district-size
    // floor** in `GameOptions`. That split is the feature rather than bookkeeping.
    //
    // The C# raised `DistrictSize`'s floor from 30 to 50 globally in Release 7-3
    // (`GameOptions.cs:476`, `//@@MP - was 30 (Release 7-3)`) because `MakeMallBlocks`
    // splits the whole city rectangle at a hard-coded 50x50. It could do that
    // globally because the C# has one ruleset. This port has two and holds Classic
    // byte-identical -- `districtSize` is read by world generation, so a floor of 50
    // under Classic moves the pinned fingerprint `e097b9d976ffac15` -- so the floor
    // is ruleset-dependent and *this line is the whole of the fork's half of it*.
    // Dropping it would let a Still Alive player choose a 45-wide district, where
    // `MallQuadSplit`'s right/bottom splits go negative and the mall's three leftover
    // quads run off the map.
    //
    // The generator gate has to be the generator's *first statement*, not a call
    // site, for the usual reason: a mall under Classic spends dice (the three
    // `MakeNarrowPark` fills) and rewrites the whole block list, so it is not a
    // smaller change than a missing building, it is a different world.
    const mall = sites.filter((s) => s.feature === "ShoppingMall");
    expect(mall).toHaveLength(3);
    expect(mall.filter((s) => /engine\/GameOptions\.ts/.test(s.at))).toHaveLength(1);
    expect(mall.filter((s) => /buildings\/makeShoppingMall\.ts/.test(s.at))).toHaveLength(1);
    // The third is the **gate on the district roll** in `GenerateWorld`, and it is
    // the reader that makes the feature reachable at all. The C# draws the mall's
    // district unconditionally (`RogueGame.cs:4239`) because it has a single
    // ruleset; an ungated third roll here would spend a die under Classic and shift
    // every roll after it. So the gate sits on the roll rather than on the
    // generator's internals -- the same shape as the BlackOps gate, and the reason
    // the fingerprint holds.
    expect(mall.filter((s) => /engine\/RogueGame\.ts/.test(s.at))).toHaveLength(1);
    // And the generator one is the gate, which is a `return null` on the first line of
    // `makeShoppingMall` rather than something inside it - pinned by location so that
    // moving the gate below the first roll cannot be silent.
    expect(mall.find((s) => /makeShoppingMall\.ts/.test(s.at))!.at).toMatch(
      /buildings\/makeShoppingMall\.ts:\d+$/,
    );

    // Farm is two readers in *two* files, and that asymmetry is the design rather
    // than an accident. One is the gate on the green cascade's band test in
    // `BaseTownGenerator` -- which is where `Feature.Graveyard`'s gate lives too,
    // for the reason that a roll taken and discarded still moves every roll after
    // it. The other is inside the building itself. Unlike the courts and the
    // shelter, the farm does **not** take the shared `dispatchRoll` and decline
    // bands itself, so its band test had to live at the call site; that is the
    // reason for the split and is recorded there.
    const farm = sites.filter((s) => s.feature === "Farm");
    expect(farm).toHaveLength(2);
    expect(farm.filter((s) => /BaseTownGenerator\.ts/.test(s.at))).toHaveLength(1);
    expect(farm.filter((s) => /buildings\/makeFarmBuilding\.ts/.test(s.at))).toHaveLength(1);

    // AmbientAudio is five readers in one file, and the split is the design rather
    // than an accident: **one** that decides what should be audible
    // (`CheckAmbientAudio`, the port of the C#'s `CheckAmbientSFX`) and **four** that
    // only ever silence the channel -- going to sleep, dying, reincarnating, and
    // loading a save.
    //
    // The four are gated individually on purpose. Under CLASSIC nothing can have
    // started, so `stopAll()` is a no-op and one ungated call would be invisible --
    // except that a gate which is unnecessary today is a gate nobody has to think
    // about tomorrow, when something else in the engine learns to start a bed. The
    // count is asserted so that adding a sixth site is a decision.
    //
    // The one reader is the whole behaviour: rain, thundering rain and night
    // animals are five of the C#'s thirteen tracks, and the other eight (five
    // helicopter, two church bells, one debug) are *unwired* because the features
    // they belong to are. `tests/ambient-audio.test.ts` asserts those eight are
    // still unwired; this asserts the gates, not the tracks.
    //
    // Six, not five. The five were rain, thundering rain, night animals and the two
    // entry/exit guards; the sixth is `stopAll` in the death path, added with
    // `Feature.HelicopterRescue` because a landed helicopter is an *ambient* -- the
    // C#'s `m_AmbientSFXManager.StopAll()` at `RogueGame.cs:7290` -- and a rescue
    // bed that outlives the player is a bed the corpse is lying in.
    const ambient = sites.filter((s) => s.feature === "AmbientAudio");
    expect(ambient).toHaveLength(6);
    expect(ambient.every((s) => /RogueGame\.ts/.test(s.at))).toBe(true);

    // HelicopterRescue is five readers in two files, and the split is the
    // *endgame's* shape rather than bookkeeping: three of the five are the days a
    // survivor could meet it — the de-spawn at dusk, the spawn at dawn, and the
    // bump that ends the run — and they are separately gated because a CLASSIC
    // build that de-spawned without ever spawning would be removing map objects
    // that were never there, and one that spawned without de-spawning would leave
    // a permanent rescue square.
    //
    // The fourth is the site picker itself, and the fifth is the AI's decision to
    // run for the chopper. The picker is gated *inside*
    // `PickHelicopterRescueSite` rather than at the `GenerateWorld` call site on
    // purpose: it is the only reader that runs during world generation, it is the
    // one that spends a die, and a CLASSIC world must be byte-identical to one
    // generated before this feature existed.
    const heli = sites.filter((s) => s.feature === "HelicopterRescue");
    expect(heli).toHaveLength(5);
    expect(heli.filter((s) => /RogueGame\.ts/.test(s.at))).toHaveLength(4);
    expect(heli.filter((s) => /CivilianAI\.ts/.test(s.at))).toHaveLength(1);
    // The AI gate is in `CivilianAI` and the picker gate is in `RogueGame`, named
    // here so that moving either is a decision somebody edits rather than a diff
    // that happens to still pass.
    expect(
      heli.find((s) => /CivilianAI\.ts/.test(s.at))!.at,
    ).toMatch(/CivilianAI\.ts:\d+$/);
    expect(
      heli.filter((s) => /RogueGame\.ts/.test(s.at)).map((s) => s.at).sort(),
    ).toHaveLength(4);

    // ExtendedAudio is three readers in one file, and the count is the *opposite*
    // of the usual story. Every other feature here is a behaviour and its gate
    // count is the number of places the behaviour could differ; this one is 180
    // pairs of asset data with three call sites, and the data cannot leak into
    // CLASSIC no matter how many entries it has -- a sound id that nothing plays
    // is inert. So three is the number that has to be argued for rather than
    // the number that has to be grown.
    //
    // The three are not one behaviour either. Two are additions (the fishing
    // cast and the fishing reel, the four sounds plans/BROWSER_PORT_PLAN 5.6f hands
    // here from `Feature.Fishing`) and one is a *choice*: `DoEatCorpse` plays
    // the vanilla `UNDEAD_EAT` under CLASSIC and the fork's `UNDEAD_EAT_PLAYER`
    // above it, because the fork split that one effect per distance tier. Gating
    // the id rather than the call is the only way to keep a Classic corpse feast
    // on the file it has always used, and it is the reason this feature is not
    // zero readers.
    //
    // Six now. Three are one-shot effects, one gates `PlayRangedWeaponSFX` (which
    // reaches 45 further ids from one place), one gates `PlayBashOrBreakSFX` (16
    // more), and one gates the match-strike recording in `DoMakeFireForCooking` --
    // gated on *this* feature rather than on `Cooking`, because it is the fork's
    // recording of the fire and not the fire.
    //
    // Ten now, and the four that arrived with the Still Alive use paths are the first
    // ones on this feature that are **more than one id from one `if`**: the throwable
    // light packs play `FLARE` or `GLOWSTICK` by model (`RogueGame.cs:15067-15070`),
    // `DoMakeMolotov` plays `MAKE_MOLOTOV` (`:22124`), and `DoUnloadAmmoFromGun` plays
    // `EQUIP_GUN_PLAYER` (`:22192`). They are counted per gate rather than collapsed to
    // "the light packs, the molotov and the unload", for the reason the comment four
    // paragraphs up gives: a gate nobody counts is a gate nobody notices deleting.
    //
    // **`EQUIP_GUN_PLAYER` is the interesting one of the four**, because its name is a
    // lie about its provenance: it reads like a Classic id and is not. It is in the
    // fork's sound fixture, so it is in `FORK_IDS`, and the first version of
    // `DoUnloadAmmoFromGun` played it ungated on the assumption that the C#'s use of a
    // long-standing sound meant it was long-standing. The gate test above is what
    // caught that, which is precisely the review it exists for.
    //
    // The remaining tiered families still have no reader, and that is not a hole in
    // the gate: the C#'s `_nearby` / `_far` / `_visible` suffixes need the distance
    // model, and the sfx channel they have to play on did not exist until this
    // change. `tests/extended-audio.test.ts` asserts that no id is named anywhere
    // ungated, so this count can only rise through a decision.
    //
    // 16 -> 26, and the ten are the first inert distance tiers to be wired. They are
    // **ten gates for three call sites**, which looks like duplication and is not:
    // `extended-audio.test.ts` requires a fork id to be *named* within three lines of
    // a literal `Feature.ExtendedAudio`, so a gate hoisted to the top of a block falls
    // out of the window by the fourth branch. The door ladder is the case that forces
    // it -- four ids in four consecutive branches, one of which carries a comment
    // explaining itself.
    const extended = sites.filter((s) => s.feature === "ExtendedAudio");
    // 10 -> 16. Six gates came with the equip sounds: two on the shield-block roll
    // (`DoMeleeAttack`) and four in `OnEquipItem` -- one on the shield arm and three
    // across the `ItemLightModel` arm's night-vision / binoculars / torch chain. The
    // shield-block pair is the interesting one, because those two lines were
    // ungated *and* spelled `SHIELD_BLOCK_*_FILE`, and a `_FILE`'s value is a path
    // rather than a fork id -- so this scan counted them as no reader at all, which
    // is how two ungated fork-only sounds sat under a feature flag test that was
    // green. Naming them as ids is what put them back on this list.
    //
    // 26 -> 41, and the fifteen are seven inert families. Two earn their gate count on
    // their own:
    //
    // - **chainsaw** is three gates for one event, and the only three-rung ladder in
    //   the fork: `QUIET` then `MODERATE`, so it cannot be collapsed to a single band.
    // - **the jump block** is four gates for two ladders, and its fence arm re-reads
    //   `CLIMB_FENCE_*` -- ids the bash and break tables already own. Same sound, two
    //   lookups, in one class: the fence is matched by its *name* string here and by its
    //   *material* over there.
    expect(extended).toHaveLength(41);
    expect(extended.every((s) => /RogueGame\.ts/.test(s.at))).toBe(true);
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

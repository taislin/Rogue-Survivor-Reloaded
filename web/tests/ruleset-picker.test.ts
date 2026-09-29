import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Ruleset, Session } from "@engine/Session";
import { allFeatures, featureCount, hasFeature } from "@engine/FeatureFlags";

/**
 * The ruleset picker: `RogueGame.HandleSelectRuleset`.
 *
 * The new-game screens are modal `do { draw; wait }` loops and had no behavioural
 * test, because the DOM-free UI's idle key cycle can only ever hand back Enter,
 * Escape, `n`, `y` — enough for an unattended run to fall *through* a menu but not
 * to reach its second row. `NullRogueUI.pushKeys` is the seam that fixes that, and
 * this is the first test to use it.
 *
 * So this asserts the three things that are actually decidable about the screen:
 * what each row sets, that cancelling changes nothing, and — the one that would
 * bite — that a *cancelled* ruleset choice cannot leave a half-applied value
 * behind for the game screen that follows it.
 */

let game: RogueGame;
let ui: NullRogueUI;

beforeAll(async () => {
  // Before constructing: `RogueGame`'s constructor builds `Rules` from the
  // session seed, so a seed applied later would only half-pin the run.
  Session.useSeed(4242);
  ui = new NullRogueUI();
  game = new RogueGame(ui, new NullMusicManager());
  await game.LoadData();
});

afterEach(() => {
  Session.get().ruleset = Ruleset.CLASSIC;
});

describe("HandleSelectRuleset", () => {
  it("accepts the default row as Classic", async () => {
    // Enter with nothing queued takes row 0, which is the safe answer: a player
    // who presses through the menu gets what they got before this screen existed.
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
    await expect(game.HandleSelectRuleset()).resolves.toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
  });

  it("selects Still Alive from the second row", async () => {
    ui.pushKeys("ArrowDown", "Enter");
    await expect(game.HandleSelectRuleset()).resolves.toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
  });

  it("wraps from the first row to the last", async () => {
    // The arrow handling is cloned from `HandleNewGameMode`, and this is the
    // branch that is easy to get backwards: ArrowUp on row 0 should land on the
    // *last* row, not stay put.
    ui.pushKeys("ArrowUp", "Enter");
    await game.HandleSelectRuleset();
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
  });

  it("cancelling returns false and leaves the ruleset alone", async () => {
    // The case worth pinning: a player who reaches the screen, moves to Still
    // Alive, then presses Escape must get their previous ruleset back rather
    // than a half-made choice.
    //
    // **One** arrow, not two, and that is load-bearing. This first read pushed
    // "ArrowDown" twice, which wraps back to row 0 — so it passed even when the
    // screen was mutated to assign the ruleset on the arrow press instead of on
    // Enter, because the second press undid the first. Verified: that mutation
    // fails the wrap test and was invisible here. A test that cannot fail against
    // the bug it names is worse than no test, because it reads as coverage.
    Session.get().ruleset = Ruleset.CLASSIC;
    ui.pushKeys("ArrowDown", "Escape");
    await expect(game.HandleSelectRuleset()).resolves.toBe(false);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
  });

  it("cycling round to the first row selects Classic again", async () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    ui.pushKeys("ArrowDown", "ArrowDown", "Enter");
    await expect(game.HandleSelectRuleset()).resolves.toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
  });
});

describe("the ruleset the picker can choose", () => {
  it("has exactly two rulesets, and they are the two the plan names", () => {
    // Guards against a third being added without the picker growing a row. The
    // picker indexes rows with `selected === 1`, so a third member would silently
    // be unreachable — which is the same "a flag nobody can set" failure the
    // registry test exists to prevent, one level up.
    expect(Object.values(Ruleset).filter((v) => typeof v === "string")).toEqual([
      "CLASSIC",
      "STILL_ALIVE",
    ]);
  });

  it("Still Alive has features to gain and Classic has none", () => {
    // The premise of the whole design, asserted where it is cheapest: Classic is
    // the port as it has always been, so it must enable nothing, or picking it
    // would silently hand the player a modded game.
    expect(featureCount(Ruleset.CLASSIC)).toBe(0);
    expect(featureCount(Ruleset.STILL_ALIVE)).toBe(allFeatures().length);
    expect(hasFeature(Ruleset.CLASSIC, 0 as never)).toBe(false);
  });
});

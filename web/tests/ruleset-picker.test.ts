import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { GameMode, Ruleset, Session } from "@engine/Session";
import { allFeatures, featureCount, hasFeature } from "@engine/FeatureFlags";

/**
 * The ruleset + game-mode picker: `RogueGame.HandleSelectRulesetAndMode`.
 *
 * The new-game screens are modal `do { draw; wait }` loops and had no behavioural
 * test, because the DOM-free UI's idle key cycle can only ever hand back Enter,
 * Escape, `n`, `y` — enough for an unattended run to fall *through* a menu but not
 * to reach its second row. `NullRogueUI.pushKeys` is the seam that fixes that.
 *
 * **The navigation model changed when the two pickers merged**, and that is the
 * thing most worth reading here. It used to be a vertical list: up/down moved
 * between *rulesets* and Enter took the one you landed on. It is now two rows of
 * one screen — up/down picks the *field* (ruleset or mode) and left/right changes
 * *that field's value*. So "pick the second option" is `ArrowRight`, not
 * `ArrowDown`, and a test that still pushed `ArrowDown` would silently be testing
 * the mode row instead of the ruleset row.
 *
 * This asserts what each row sets, that the rows are independent, and — the one
 * that would bite — that a *cancelled* choice cannot leave a half-applied value
 * behind for the screen that follows it.
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
  Session.get().gameMode = GameMode.GM_STANDARD;
});

describe("HandleSelectRulesetAndMode", () => {
  it("accepts the defaults as Classic and Standard", async () => {
    // Enter with nothing queued takes both defaults, which are the safe answers: a
    // player who presses through the menu gets what they got before this screen
    // existed.
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
    expect(Session.get().gameMode).toBe(GameMode.GM_STANDARD);
    await expect(game.HandleSelectRulesetAndMode()).resolves.toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
    expect(Session.get().gameMode).toBe(GameMode.GM_STANDARD);
  });

  it("selects Still Alive from the ruleset row", async () => {
    ui.pushKeys("ArrowRight", "Enter");
    await expect(game.HandleSelectRulesetAndMode()).resolves.toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
    // And the mode row was left alone: the right/left keys act on one row only.
    expect(Session.get().gameMode).toBe(GameMode.GM_STANDARD);
  });

  it("wraps backwards from the first option to the last", async () => {
    // **One** arrow, not two, and that is load-bearing. Two would wrap all the way
    // round to Classic again and the test would pass for the wrong reason — the
    // same trap the previous version of this file recorded about `ArrowDown`.
    ui.pushKeys("ArrowLeft", "Enter");
    await game.HandleSelectRulesetAndMode();
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
  });

  it("reaches Vintage on the mode row, two rights down", async () => {
    // ArrowDown moves to the *mode field*; the rights then walk GM_STANDARD ->
    // GM_CORPSES_INFECTION -> GM_VINTAGE.
    ui.pushKeys("ArrowDown", "ArrowRight", "ArrowRight", "Enter");
    await expect(game.HandleSelectRulesetAndMode()).resolves.toBe(true);
    expect(Session.get().gameMode).toBe(GameMode.GM_VINTAGE);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
  });

  it("the two rows are independent", async () => {
    // Ruleset right, then down to the mode and right twice. If either row leaked
    // into the other this would land somewhere else.
    ui.pushKeys("ArrowRight", "ArrowDown", "ArrowRight", "ArrowRight", "Enter");
    await game.HandleSelectRulesetAndMode();
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
    expect(Session.get().gameMode).toBe(GameMode.GM_VINTAGE);
  });

  it("ArrowUp returns to the ruleset row, and keeps what the mode row was left on", async () => {
    // With two rows the up/down pair is a toggle, so ArrowUp is the only way back
    // from the mode field to the ruleset field.
    //
    // **The mode stays at what it was left on** — one right had already moved it to
    // C&I, and moving away from a row does not undo that. Only Escape discards,
    // which is the next test. Asserting GM_STANDARD here was wrong when this was
    // first written: the screen never had a reason to put it back.
    ui.pushKeys("ArrowDown", "ArrowRight", "ArrowUp", "ArrowRight", "Enter");
    await game.HandleSelectRulesetAndMode();
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
    expect(Session.get().gameMode).toBe(GameMode.GM_CORPSES_INFECTION);
  });

  it("cancelling returns false and leaves both rows alone", async () => {
    // The case worth pinning: a player who reaches the screen, changes both rows,
    // then presses Escape must get their previous values back rather than a
    // half-made choice. Neither row is applied as it changes, so nothing here can
    // be left mutated by the arrow presses.
    Session.get().ruleset = Ruleset.CLASSIC;
    Session.get().gameMode = GameMode.GM_STANDARD;
    ui.pushKeys("ArrowRight", "ArrowDown", "ArrowRight", "Escape");
    await expect(game.HandleSelectRulesetAndMode()).resolves.toBe(false);
    expect(Session.get().ruleset).toBe(Ruleset.CLASSIC);
    expect(Session.get().gameMode).toBe(GameMode.GM_STANDARD);
  });

  it("opens showing what is already set, rather than the defaults", async () => {
    // Escape on the *next* screen brings the player back here, and a screen that
    // always opened on Classic/Standard would silently offer to undo their earlier
    // choice.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    Session.get().gameMode = GameMode.GM_VINTAGE;
    ui.pushKeys("Escape");
    await expect(game.HandleSelectRulesetAndMode()).resolves.toBe(false);
    // Cancelled, so the session is untouched — but the rows must have been drawn
    // from it. Re-running with Enter is how that is observed: whatever was seeded
    // is what gets committed straight back.
    ui.pushKeys("Enter");
    await expect(game.HandleSelectRulesetAndMode()).resolves.toBe(true);
    expect(Session.get().ruleset).toBe(Ruleset.STILL_ALIVE);
    expect(Session.get().gameMode).toBe(GameMode.GM_VINTAGE);
  });
});

describe("what the picker can choose", () => {
  it("has exactly two rulesets, and they are the two the plan names", () => {
    // Guards against a third being added without the picker growing an option.
    // The picker indexes with `rulesetIdx === 1`, so a third member would
    // silently be unreachable — the same "a value nobody can set" failure the
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
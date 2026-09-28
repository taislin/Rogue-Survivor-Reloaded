import { describe, it, expect, beforeEach } from "vitest";
import { GameOptions, OptionIDs } from "@engine/GameOptions";
import { DEFAULT_VIEW_MODE, VIEW_MODES } from "@engine/firstperson/Types";
import { storage } from "@engine/storage";
import { Session } from "@engine/Session";

/**
 * The view mode is the option that makes the first-person renderer reachable at
 * all, and the interesting property is not that it can be set — it is that it
 * cannot be set *by accident*.
 *
 * A second renderer is opt-in from the first frame, so the default has to be the
 * C# behaviour or every player who has never heard of this sees a different game
 * than the one that was ported. The rest is about the saved value, which is
 * unvalidated JSON in a storage blob a player can hand-edit: an unknown value has
 * to fall back to top-down rather than select a renderer, because
 * `GameOptions.isFirstPersonView` is the only thing standing between a typo and a
 * player being dropped into a view drawn for a different coordinate space.
 */
describe("the view mode option", () => {
  beforeEach(() => {
    storage.removeItem(GameOptions.STORAGE_KEY);
  });

  it("defaults to top-down, so the port shows what the C# showed", () => {
    expect(DEFAULT_VIEW_MODE).toBe("top-down");
    expect(new GameOptions().viewMode).toBe("top-down");
    // And not merely as a field initialiser: a fresh load with nothing in
    // storage has to agree, since `load()` returns early on a null blob and so
    // skips every re-apply path.
    expect(GameOptions.load().viewMode).toBe("top-down");
  });

  it("is first-person only for the value that says so", () => {
    for (const mode of VIEW_MODES) {
      expect(GameOptions.isFirstPersonView(mode)).toBe(mode === "first-person");
    }
    // The failure direction matters more than the count: an unrecognised value
    // must read as top-down. `mode !== "first-person"` is true for all of these,
    // so a branch written that way would hand the player the other renderer.
    for (const junk of ["FIRST-PERSON", "firstperson", "3d", "", "1", "true"]) {
      expect(GameOptions.isFirstPersonView(junk), `"${junk}" selected a renderer`).toBe(false);
    }
  });

  it("round-trips through storage", () => {
    const options = new GameOptions();
    options.viewMode = "first-person";
    GameOptions.save(options);

    const loaded = GameOptions.load();
    expect(loaded.viewMode).toBe("first-person");
    expect(GameOptions.isFirstPersonView(loaded.viewMode)).toBe(true);
  });

  it("survives a restore-previous, which is the path that copies fields directly", () => {
    // `copyFrom` writes `m_*` fields straight onto the target, which is why the
    // sprite style and the font each have to be re-applied afterwards. The view
    // mode claims to need no such re-apply, and this is the test that would stop
    // claiming it if that ever stopped being true.
    const accepted = new GameOptions();
    accepted.viewMode = "first-person";
    const original = new GameOptions();
    const rejected = new GameOptions();

    rejected.copyFrom(original); // "restore previous": back to top-down
    expect(rejected.viewMode).toBe("top-down");
    rejected.copyFrom(accepted);
    expect(rejected.viewMode).toBe("first-person");
  });

  it("returns to top-down on reset", () => {
    const options = new GameOptions();
    options.viewMode = "first-person";
    options.resetToDefaultValues();
    expect(options.viewMode).toBe("top-down");
  });

  it("reads an unrecognised stored value as top-down rather than a renderer", () => {
    // What a hand-edited or half-written blob looks like. `load` has no
    // validation step, so the predicate is the backstop.
    storage.setItem(
      GameOptions.STORAGE_KEY,
      JSON.stringify({ m_ViewMode: "side-scroller" }),
    );
    const loaded = GameOptions.load();
    expect(GameOptions.isFirstPersonView(loaded.viewMode)).toBe(false);
  });

  it("has text for all three option-screen columns", () => {
    // Duplicated from `options-coverage.test.ts` on purpose, for the same reason
    // that file names the two most recent additions explicitly: `optionName` and
    // `describe` throw, so a missing case is a black screen when the row is
    // *selected*, not a failure anything else would notice.
    const options = new GameOptions();
    expect(() => GameOptions.optionName(OptionIDs.UI_VIEW_MODE)).not.toThrow();
    expect(() => GameOptions.describe(OptionIDs.UI_VIEW_MODE)).not.toThrow();
    expect(options.describeValue(Session.get().gameMode, OptionIDs.UI_VIEW_MODE)).not.toBe(
      "???",
    );
  });

  it("says which way to move, because the arrow keys change meaning", () => {
    // The one genuinely surprising consequence of turning this on: left and
    // right stop meaning west and east. A player who does not read the
    // description will think the controls are broken, so the description has to
    // name the new keys rather than gesture at the mode.
    const text = GameOptions.describe(OptionIDs.UI_VIEW_MODE);
    expect(text).toContain("Left and Right");
    expect(text).toContain("Up and Down");
    expect(text).toContain("turn");
  });
});

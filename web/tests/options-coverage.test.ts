import { describe, it, expect } from "vitest";
import { GameOptions, OptionIDs } from "@engine/GameOptions";
import { Session } from "@engine/Session";

/**
 * Every option the screen can show has text for all three of its columns.
 *
 * This exists because adding the font option without a `describe` case reached
 * master, and the symptom was a crash — "unhandled option" on a black screen,
 * thrown the moment the row was *selected*, which is to say when the player
 * scrolled to it. Not a warning, not a blank value: the options screen takes the
 * whole game down.
 *
 * The three functions are not equally strict, and that is the point:
 *
 *  - `optionName` and `describe` throw for an unhandled id, and both are meant to
 *    be exhaustive.
 *  - `describeValue` returns "???" instead, so it has three known holes — the
 *    spawn-chance options, which are not on the screen at all. Those are listed
 *    below by name, so a *new* option has to be added to the list to be exempt
 *    rather than inheriting an exemption nobody chose.
 */
const ALL_IDS = Object.values(OptionIDs).filter(
  (id): id is OptionIDs => typeof id === "number"
) as OptionIDs[];

/**
 * Options with no value string.
 *
 * `describeValue` answers "???" for an id it does not handle, and the three spawn
 * chances are genuinely exempt: the C# applies them internally and never shows
 * them. (`GAME_MAX_DOGS` is commented out of the options *list* but does have a
 * value string, so it is not one of these — the list is checked against the real
 * behaviour below rather than trusted.)
 *
 * Listed by name so a *new* option has to be added here to be exempt, rather than
 * inheriting an exemption nobody chose.
 */
const NO_VALUE_ROW: readonly OptionIDs[] = [
  OptionIDs.GAME_SPAWN_SKELETON_CHANCE,
  OptionIDs.GAME_SPAWN_ZOMBIE_CHANCE,
  OptionIDs.GAME_SPAWN_ZOMBIE_MASTER_CHANCE,
];

describe("every option has the text the options screen needs", () => {
  const options = new GameOptions();

  it("has a label", () => {
    for (const id of ALL_IDS) {
      const name = GameOptions.optionName(id);
      expect(name, `option ${OptionIDs[id]} has no label`).toBeTruthy();
      expect(name.trim(), `option ${OptionIDs[id]} has a blank label`).not.toBe("");
    }
  });

  it("has a description", () => {
    // The one whose absence takes the game down: `describe` throws, and the
    // description is drawn for the selected row.
    for (const id of ALL_IDS) {
      const text = GameOptions.describe(id);
      expect(text, `option ${OptionIDs[id]} has no description`).toBeTruthy();
      expect(text.trim(), `option ${OptionIDs[id]} has a blank description`).not.toBe("");
    }
  });

  it("has a value string for everything except the options with no row", () => {
    // Collected rather than asserted one at a time, so the failure names every
    // hole at once instead of the first one alphabetically.
    const holes: string[] = [];
    for (const id of ALL_IDS) {
      if (NO_VALUE_ROW.includes(id)) continue;
      if (options.describeValue(Session.get().gameMode, id) === "???") holes.push(OptionIDs[id]);
    }
    expect(holes, "these options render as \"???\" and have no row to show it on").toEqual([]);
  });

  it("keeps the no-row list honest", () => {
    // Two directions, because the list can rot either way. An id that has since
    // been given a row would silently go unchecked, and an id that no longer
    // exists would be listed in perpetuity for nothing.
    const actual = ALL_IDS.filter((id) => options.describeValue(Session.get().gameMode, id) === "???");
    const listed = NO_VALUE_ROW.filter((id) => ALL_IDS.includes(id)).sort((a, b) => a - b);

    expect(
      listed,
      "NO_VALUE_ROW is out of date: it should list exactly the options that still render as \"???\""
    ).toEqual(actual);
    // And nothing in it is a name that does not exist, which would read as
    // `undefined` rather than as an option.
    for (const id of NO_VALUE_ROW) {
      expect(OptionIDs[id], `"${String(id)}" is listed but is not an option`).toBeTruthy();
    }
  });
});

describe("the options added for the browser port", () => {
  const options = new GameOptions();

  it("the sprite style and the font both describe themselves", () => {
    // Named explicitly, because these are the two most recent additions and the
    // failure mode is a crash on selection rather than anything a test that boots
    // the game would necessarily hit.
    for (const id of [OptionIDs.UI_SPRITE_STYLE, OptionIDs.UI_FONT_CHOICE]) {
      expect(() => GameOptions.optionName(id)).not.toThrow();
      expect(() => GameOptions.describe(id)).not.toThrow();
      expect(() => options.describeValue(Session.get().gameMode, id)).not.toThrow();
    }
  });

  it("the font defaults to the bundled face, and the classic one is offered", () => {
    expect(options.fontChoice).toBe("bundled");
    expect(options.describeValue(Session.get().gameMode, OptionIDs.UI_FONT_CHOICE)).toMatch(
      /jetbrains/i
    );
    options.fontChoice = "classic";
    expect(options.describeValue(Session.get().gameMode, OptionIDs.UI_FONT_CHOICE)).toMatch(
      /classic/i
    );
  });
});

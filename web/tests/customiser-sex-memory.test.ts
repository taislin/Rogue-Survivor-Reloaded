import { describe, it, expect, beforeEach } from "vitest";
import {
  LAST_APPEARANCE_KEY,
  loadAppearance,
  loadRememberedSex,
  saveAppearance,
} from "@engine/NewGameConfig";
import { CharacterAppearance } from "@engine/CharacterAppearance";
import { storage } from "@engine/storage";

/**
 * The customiser remembered the layers but forgot the sex row.
 *
 * Those two are interpreted against each other, so remembering one without the other
 * is worse than remembering neither. The screen reopened wearing the last
 * character's clothes with `*Random*` back on the sex row; Enter then rolled a sex,
 * and `dressPlayerFromCharGen` resolved those remembered layer ids against the
 * *rolled* body's catalogue. None of a male body's ids are in a female body's
 * catalogue, so every layer fell back to the seeded random and the player got a
 * wholly random character of the other gender from a screen they had filled in.
 *
 * So the property pinned here is the pairing: the sex row and the layers are
 * written and read as one record, and a first run still means `*Random*`.
 */

beforeEach(() => {
  storage.removeItem(LAST_APPEARANCE_KEY);
});

describe("remembered sex", () => {
  it("is absent on a first run, so the row still opens on *Random*", () => {
    // The game has always rolled the sex of a character nobody has described yet.
    // Seeding the row from `CharGen.isMale` instead would make every first
    // character male, because that field is initialised `true`.
    expect(loadRememberedSex()).toBeNull();
    expect(loadAppearance().isAllRandom).toBe(true);
  });

  it("round-trips each of the row's three answers", () => {
    // 0 random, 1 male, 2 female -- the row's own order.
    for (const sex of [0, 1, 2]) {
      saveAppearance(new CharacterAppearance(), sex);
      expect(loadRememberedSex()).toBe(sex);
    }
  });

  it("keeps `*Random*` as `*Random*` rather than collapsing it into male", () => {
    // A boolean could not tell "the player answered the row" from "the player never
    // touched it", and *Random* is a real answer they can give on purpose.
    saveAppearance(new CharacterAppearance(), 0);
    expect(loadRememberedSex()).toBe(0);
  });

  it("survives an all-random look, which is the case that used to erase it", () => {
    // `saveAppearance` drops the record when it has nothing in it. With the sex in
    // the same record that is no longer "nothing", so an all-random look no longer
    // silently loses the body the player chose.
    const look = new CharacterAppearance();
    look.skin = "Actors/Decoration/male_skin3";

    saveAppearance(look, 2);
    expect(loadRememberedSex()).toBe(2);

    // And with no layers at all, only the sex recorded, the record must still exist.
    saveAppearance(new CharacterAppearance(), 2);
    expect(loadRememberedSex()).toBe(2);
  });

  it("still drops the record when there is genuinely nothing to remember", () => {
    saveAppearance(new CharacterAppearance(), null);
    expect(loadRememberedSex()).toBeNull();
    expect(storage.getItem(LAST_APPEARANCE_KEY)).toBeNull();
  });

  it("stays out of the layers, which are validated against a body catalogue", () => {
    // `fromJSON` reads only the six layer names, so the sibling field cannot be
    // mistaken for a sprite id -- or half-read as one.
    const look = new CharacterAppearance();
    look.torso = "Actors/Decoration/male_shirt1";
    saveAppearance(look, 1);

    const loaded = loadAppearance();
    expect(loaded.torso).toBe("Actors/Decoration/male_shirt1");
    expect(loaded.isAllRandom).toBe(false);
    expect(Object.keys(loaded.toJSON())).toEqual(["torso"]);
  });

  it("ignores a value that is not one of the three answers", () => {
    // A record from a future version, or a hand-edited one. An unknown number must
    // not be passed through as an index into the row.
    storage.setItem(
      LAST_APPEARANCE_KEY,
      JSON.stringify({ torso: "Actors/Decoration/male_shirt1", sex: 7 }),
    );
    expect(loadRememberedSex()).toBeNull();
    // The layers are still readable: one bad field must not cost the other five.
    expect(loadAppearance().torso).toBe("Actors/Decoration/male_shirt1");
  });

  it("survives a corrupt record without throwing", () => {
    storage.setItem(LAST_APPEARANCE_KEY, "{not json");
    expect(() => loadRememberedSex()).not.toThrow();
    expect(loadRememberedSex()).toBeNull();
    expect(loadAppearance().isAllRandom).toBe(true);
  });
});
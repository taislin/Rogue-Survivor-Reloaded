import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_IMAGE_SET,
  IMAGE_SETS,
  getImageSet,
  getImageSetGeneration,
  imagePath,
  imagePathIn,
  setImageSet,
  type ImageSet,
} from "@engine/AssetPaths";
import { GameOptions, OptionIDs } from "@engine/GameOptions";
import { storage } from "@engine/storage";

const IMAGES_DIR = join(__dirname, "../public/assets/images");

/** Every file under `dir`, recursively. Sprites are nested by category. */
function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name));
    else total++;
  }
  return total;
}

/**
 * Choosing a sprite set, and falling back out of `classic`.
 *
 * The three shipped sets are not three complete sprite collections: `classic` is
 * the full 1 124-image set and the other two are variations of it, so any of them
 * may be missing an entry. That makes the interesting behaviour what happens when
 * the selected set does not have a sprite — it has to come from `classic`
 * silently, because a hole in the middle of the play screen is a much worse
 * outcome than a slightly different-looking zombie.
 *
 * The second thing worth pinning is invalidation. The image cache is keyed by
 * image *id* and holds resolved URLs, so it cannot see that the set changed; a
 * cache that keeps serving the previous answer after the player picks a new style
 * is exactly the "loads, plays, quietly wrong" failure this project keeps paying
 * for, which is why `AssetPaths` publishes a generation rather than leaving every
 * caller to remember.
 */

beforeEach(() => {
  setImageSet(DEFAULT_IMAGE_SET);
  storage.removeItem(GameOptions.STORAGE_KEY);
});

describe("the sprite sets on disk", () => {
  it("names three, and the default is the complete one", () => {
    expect(IMAGE_SETS.length).toBe(3);
    expect(DEFAULT_IMAGE_SET).toBe("classic");
    expect(IMAGE_SETS).toContain(DEFAULT_IMAGE_SET);
  });

  it("has a folder for every set it advertises", () => {
    // The option cycles over `IMAGE_SETS`, so a set with no folder is a row in
    // the options screen that leads to a blank game. Checked against the disk
    // rather than against `imagePathIn`, which only builds a string.
    for (const set of IMAGE_SETS) {
      expect(
        existsSync(join(IMAGES_DIR, set)),
        `assets/images/${set} is advertised as a sprite set but has no folder`
      ).toBe(true);
    }
  });

  it("is the fallback because it is the biggest set, not just the first", () => {
    // The fallback is only sound if `classic` actually has the sprites the
    // others lack. If a future set were *larger*, the fallback would silently
    // become the wrong direction and this assertion is what would notice.
    const count = (set: ImageSet): number => countFiles(join(IMAGES_DIR, set));
    const sizes = IMAGE_SETS.map((set) => [set, count(set)] as const);
    const largest = sizes.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(largest[0], `the biggest set is "${largest[0]}", not the fallback`).toBe(DEFAULT_IMAGE_SET);
  });

  it("resolves an image against the current set, and against a named one", () => {
    setImageSet("genesis_classic_1.4");
    expect(imagePath("Actors/zombie")).toContain("/assets/images/genesis_classic_1.4/");
    // The named form is what the fallback needs: at that point the current set is
    // still the selected one.
    expect(imagePathIn(DEFAULT_IMAGE_SET, "Actors/zombie")).toContain("/assets/images/classic/");
  });

  it("takes both path separators, because the C# ids use backslashes", () => {
    setImageSet("deonapocalypse_v9_r1");
    expect(imagePath("Tiles\\wall_brick")).toBe(
      "/assets/images/deonapocalypse_v9_r1/Tiles/wall_brick.webp"
    );
  });

  it("ignores a set that is not shipped, rather than building a dead path", () => {
    setImageSet("no-such-set");
    expect(getImageSet()).toBe(DEFAULT_IMAGE_SET);
  });
});

describe("the sprite-set generation", () => {
  it("changes when the set changes, and not when it is set to what it already is", () => {
    const before = getImageSetGeneration();
    setImageSet("genesis_classic_1.4");
    const after = getImageSetGeneration();
    expect(after).not.toBe(before);

    // Idempotent, so a caller that re-applies the same style does not throw away
    // a warm image cache for nothing.
    setImageSet("genesis_classic_1.4");
    expect(getImageSetGeneration()).toBe(after);
  });
});

describe("the sprite style option", () => {
  it("defaults to the complete set", () => {
    expect(new GameOptions().spriteStyle).toBe(DEFAULT_IMAGE_SET);
  });

  it("applies as soon as it is set, without a reload", () => {
    const options = new GameOptions();
    options.spriteStyle = "deonapocalypse_v9_r1";
    // The option is only useful if the renderer follows it immediately, and
    // `AssetPaths` is what resolves every sprite URL.
    expect(getImageSet()).toBe("deonapocalypse_v9_r1");
  });

  it("survives a save/load roundtrip", () => {
    const options = new GameOptions();
    options.spriteStyle = "genesis_classic_1.4";
    GameOptions.save(options);

    const back = GameOptions.load();
    expect(back.spriteStyle).toBe("genesis_classic_1.4");
    // And it is *applied* after loading, not merely stored: `load` writes the
    // field directly rather than through the setter.
    expect(getImageSet()).toBe("genesis_classic_1.4");
  });

  it("is applied by copyFrom, so restoring previous options restores the look", () => {
    // The "R" key in the options screen is `copyFrom`; without the re-apply it
    // would put the numbers back and leave the screen drawn in the rejected
    // style, which is the sort of half-restored state this project keeps fixing.
    const previous = new GameOptions();
    const edited = previous.clone();
    edited.spriteStyle = "deonapocalypse_v9_r1";

    const live = new GameOptions();
    live.spriteStyle = "genesis_classic_1.4";
    live.copyFrom(edited);
    expect(live.spriteStyle).toBe("deonapocalypse_v9_r1");
    expect(getImageSet()).toBe("deonapocalypse_v9_r1");

    live.copyFrom(previous);
    expect(getImageSet()).toBe(DEFAULT_IMAGE_SET);
  });

  it("names the complete set, so the fallback is not a surprise", () => {
    expect(GameOptions.spriteStyleName(DEFAULT_IMAGE_SET)).toMatch(/complete set/);
    expect(GameOptions.spriteStyleName("deonapocalypse_v9_r1")).not.toMatch(/complete set/);
  });

  it("has a label and a description, or the options screen throws on it", () => {
    // `optionName` and `describe` both throw for an unhandled id, and the
    // description is drawn as soon as the row is selected.
    expect(() => GameOptions.optionName(OptionIDs.UI_SPRITE_STYLE)).not.toThrow();
    expect(() => GameOptions.describe(OptionIDs.UI_SPRITE_STYLE)).not.toThrow();
  });
});

describe("the fallback rule", () => {
  it("falls back to classic for a sprite the selected set does not have", () => {
    // The rule, stated directly: resolution order is "the selected set, then
    // classic". `CanvasUI.loadImage` is what implements it, and it is
    // deliberately not reachable headlessly — it needs a DOM `Image` — so this
    // pins the decision the loader is built on rather than the loader itself.
    const set: ImageSet = "deonapocalypse_v9_r1";
    const primary = imagePathIn(set, "Actors/rare-sprite-only-in-classic");
    const fallback = imagePathIn(DEFAULT_IMAGE_SET, "Actors/rare-sprite-only-in-classic");
    expect(primary).not.toBe(fallback);
    expect(fallback).toContain("/assets/images/classic/");
  });
});

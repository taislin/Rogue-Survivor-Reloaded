import { describe, it, expect, beforeEach } from "vitest";
import { CanvasUI } from "@ui/CanvasUI";
import { DEFAULT_IMAGE_SET, getImageSetGeneration, setImageSet } from "@engine/AssetPaths";
import { Color } from "@engine/Color";

/**
 * Changing the sprite style must take effect without a reload.
 *
 * This was a real bug and the reason it survived is worth recording, because the
 * code that was supposed to prevent it *existed* and read as though it did.
 *
 * `CanvasUI` caches sprites by image **id**, keyed to a URL that includes the set
 * name, and `AssetPaths` publishes a generation counter that changes when the set
 * does. The invalidation that ties those two together lived in `loadImage` — which
 * is reached only on a cache **miss** — and once in `UI_PreloadImages` at boot.
 * After the boot preload warmed the cache, no frame ever missed again, so
 * `invalidateImagesIfSetChanged` was never called again. `setImageSet` correctly
 * bumped its generation the whole time; the cache was stale and unreachable at
 * once. Picking a different style therefore changed the option, changed the
 * resolved path *for anything not yet cached*, and left every already-loaded
 * sprite drawing the old set until the page was reloaded.
 *
 * The existing test `applies as soon as it is set, without a reload` did not
 * catch it because it only asserted `getImageSet()` — the option plumbing, not
 * the renderer. The gap was that nothing tested the *cache*.
 *
 * So these drive the real `UI_Clear`, which is where a frame begins, and assert
 * on the cache itself. `CanvasUI` is built here by prototype rather than by its
 * constructor: the suite runs in node with no DOM, and the fields under test are
 * the ones a frame touches. That is not a mock of the behaviour under test — the
 * invalidation, the generation compare and the cache clears are all the real
 * implementations.
 */

/** The private surface a frame touches, plus the three caches. */
type Frame = {
  ctx: { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void };
  imageCache: Map<string, unknown>;
  imageLoading: Map<string, unknown>;
  imageChainIndex: Map<string, number>;
  /** The rasterised *grayscale* sprite, keyed by id alone -- see the note below. */
  grayCache: Map<string, unknown>;
  imageCacheGeneration: number;
  frameDraws: number;
  frameSkips: number;
  UI_Clear(c: Color): void;
  loadImage(id: string): Promise<unknown>;
};

function warmFrame(): Frame {
  const ui = Object.create(CanvasUI.prototype) as unknown as Frame;
  const cache = new Map<string, unknown>();
  // Pretend the boot preload already loaded these, under the default set.
  cache.set("Actors/zombie", { src: "zombie-from-classic" });
  cache.set("Tiles/floor_concrete", { src: "floor-from-classic" });
  ui.ctx = { fillStyle: "", fillRect: () => {} };
  ui.imageCache = cache;
  ui.imageLoading = new Map();
  ui.imageChainIndex = new Map();
  // A memorised grayscale tile. The player has been here before, so this is
  // populated in any real session -- and it is invisible to `imageCache` because
  // it is keyed by id alone and consulted without one.
  ui.grayCache = new Map([["Tiles/memorised", { src: "gray-from-classic" }]]);
  ui.imageCacheGeneration = getImageSetGeneration();
  ui.frameDraws = 0;
  ui.frameSkips = 0;
  return ui;
}

/** One frame, as `RedrawPlayScreen` starts every frame it draws. */
function frame(ui: Frame): void {
  ui.UI_Clear(Color.Black);
}

beforeEach(() => {
  // Every test starts from the default set so the generation is predictable.
  setImageSet(DEFAULT_IMAGE_SET);
});

describe("the sprite cache follows the sprite style", () => {
  it("keeps its sprites while the style has not changed", () => {
    const ui = warmFrame();
    frame(ui);
    expect(ui.imageCache.size, "a frame with no style change emptied the cache").toBe(2);
  });

  it("drops every cached sprite on the first frame after the style changes", () => {
    // The regression. A warm cache plus a changed set used to leave both sprites
    // in place, and they were then drawn from the old set on every frame after.
    const ui = warmFrame();
    setImageSet("deonapocalypse_v9_r1");
    frame(ui);
    expect(ui.imageCache.size, "the cache survived a sprite-style change").toBe(0);
  });

  it("drops the in-flight loads, the fallbacks and the grayscale cache too", () => {
    // All three are per-set. A sprite that had fallen back to `classic` under the
    // old style would keep resolving to `classic` under the new one, and an
    // in-flight load would insert an old-style image into the fresh cache the
    // moment it resolved -- a race that re-introduces the old art after the
    // invalidation.
    //
    // The grayscale cache is the subtle one, and it is a second, independent
    // cause of this exact symptom: it holds the *rasterised* sprite keyed by id
    // alone and is consulted without going through `imageCache`, so a stale entry
    // survives an `imageCache` clear. Without dropping it, unexplored tiles
    // redrew in the new style while every tile the player had already memorised
    // -- which is most of a visited map -- stayed in the old one.
    const ui = warmFrame();
    ui.imageLoading.set("Actors/zombie", Promise.resolve(null));
    ui.imageChainIndex.set("Actors/undead_master", 1);

    setImageSet("genesis_classic_1.4");
    frame(ui);

    expect(ui.imageLoading.size, "an in-flight load survived the style change").toBe(0);
    expect(ui.imageChainIndex.size, "a remembered chain position survived the style change").toBe(0);
    expect(ui.grayCache.size, "a memorised grayscale tile survived the style change").toBe(0);
  });

  it("is idempotent, so only the first frame after the change pays for it", () => {
    // The generation is stamped as it is consumed. If it were not, every
    // subsequent frame would clear the cache and the sprites would never settle.
    const ui = warmFrame();
    setImageSet("deonapocalypse_v9_r1");

    frame(ui);
    expect(ui.imageCache.size, "the first frame did not invalidate").toBe(0);

    // A frame that then loads a sprite, as the draws in it would.
    ui.imageCache.set("Actors/zombie", { src: "zombie-from-deon" });
    frame(ui);
    expect(ui.imageCache.size, "the second frame invalidated again").toBe(1);
    expect(ui.imageCache.get("Actors/zombie"), "the freshly loaded sprite was dropped").toEqual({
      src: "zombie-from-deon",
    });
  });

  it("empties the cache before the frame draws, not after", () => {
    // Ordering, which is the whole reason this is in `UI_Clear`. If the
    // invalidation ran at `UI_Repaint` the frame would have already drawn every
    // sprite from the old set, and the change would appear one frame late -
    // enough to look like it did not work.
    const ui = warmFrame();
    setImageSet("deonapocalypse_v9_r1");
    let cachedWhenCleared: number | null = null;
    const realFill = ui.ctx.fillRect;
    ui.ctx.fillRect = () => {
      // Stands in for the draws that follow the clear within the same frame.
      cachedWhenCleared = ui.imageCache.size;
    };
    ui.UI_Clear(Color.Black);
    ui.ctx.fillRect = realFill;

    expect(cachedWhenCleared, "the frame still had the old sprites cached when it started drawing").toBe(0);
  });
});

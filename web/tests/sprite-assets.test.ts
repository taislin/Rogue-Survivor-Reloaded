import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { imagePath, IMAGE_EXTENSION, IMAGE_SETS, DEFAULT_IMAGE_SET, getImageSet, setImageSet } from "@engine/AssetPaths";
import { GameImages, allImageIds } from "@gameplay/GameImages";

/**
 * Every sprite id the game can ask for resolves to a file that exists.
 *
 * This is the test that makes the PNG -> WebP migration safe to keep making.
 * `imagePath()` derives a URL from a `GameImages` id string, and there are 395
 * of those constants; a rename or an extension change breaks all of them
 * silently -- the type-checker is happy, the build succeeds, and the game draws
 * invisible tiles at runtime. That is the same failure shape as the nine runtime
 * bugs in §1.1 of the port plan.
 *
 * `GameImages` is a class of static readonly id strings, not a bag of named
 * exports, so the ids come off the constructor itself.
 */

const webRoot = resolve(__dirname, "..");

/** Every id constant declared on GameImages. */
function imageIds(): string[] {
  return Object.getOwnPropertyNames(GameImages)
    .filter((k) => k !== "length" && k !== "name" && k !== "prototype")
    .map((k) => (GameImages as unknown as Record<string, unknown>)[k])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

describe("sprite assets on disk", () => {
  it("uses a single extension for sprites", () => {
    expect(IMAGE_EXTENSION).toBe("webp");
  });

  it("resolves every GameImages id to a file that exists", () => {
    const ids = imageIds();
    // Guard against the collector silently finding nothing, which would make
    // this test vacuously pass. (It did, once: GameImages is a class, so
    // `import * as` yielded no values.)
    expect(ids.length).toBeGreaterThan(200);

    const missing: string[] = [];
    for (const id of ids) {
      // to filesystem path: /assets/... -> public/assets/...
      const rel = imagePath(id).replace(/^\//, "");
      if (!existsSync(resolve(webRoot, "public", rel))) missing.push(id);
    }
    expect(missing, `${missing.length} sprite id(s) have no file on disk`).toEqual([]);
  });

  it("leaves no PNG sprites behind", () => {
    // Guards the migration: a stray .png would be dead weight, and a
    // GameImages id pointing at one would 404 under the new extension.
    const leftovers: string[] = [];
    for (const set of IMAGE_SETS) {
      const root = resolve(webRoot, "public", "assets", "images", set);
      if (!existsSync(root)) continue;
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const p = resolve(dir, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (entry.name.toLowerCase().endsWith(".png")) leftovers.push(p);
        }
      };
      walk(root);
    }
    expect(leftovers).toEqual([]);
  });

  it("normalises C# backslash ids to forward slashes", () => {
    // GameImages constants are C# paths like "Tiles\\floor_asphalt".
    const id = "Tiles\\floor_asphalt";
    const p = imagePath(id);
    expect(p).not.toContain("\\");
    expect(p).toBe(`/assets/images/classic/Tiles/floor_asphalt.webp`);
    expect(existsSync(resolve(webRoot, "public", p.replace(/^\//, "")))).toBe(true);
  });
});

/**
 * `allImageIds()` is the preload manifest `RogueGame.Run` fetches before the
 * first frame. If it silently returned an empty or short list, the preload
 * would appear to succeed while leaving the map to fill in lazily — which is
 * precisely the bug it exists to prevent, and it would look like a performance
 * quirk rather than a bug.
 */
describe("preload manifest", () => {
  it("enumerates every declared id", () => {
    const all = allImageIds();
    expect(all.length).toBe(imageIds().length);
    expect(all.length).toBeGreaterThan(200);
  });

  it("contains no duplicates", () => {
    const all = allImageIds();
    expect(new Set(all).size).toBe(all.length);
  });

  it("contains only non-empty strings", () => {
    // A stray `undefined` would become the literal path "undefined.webp" and
    // 404 once per frame, forever.
    for (const id of allImageIds()) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).not.toContain("undefined");
    }
  });

  it("resolves every manifest entry to a file on disk", () => {
    // The manifest is only useful if it is complete; a gap here is a sprite that
    // will be missing from the screen.
    const missing = allImageIds().filter((id) => {
      const rel = imagePath(id).replace(/^\//, "");
      return !existsSync(resolve(webRoot, "public", rel));
    });
    expect(missing, `${missing.length} manifest id(s) have no file on disk`).toEqual([]);
  });

  it("covers the tile sprites the map is drawn from", () => {
    // The map is ~578 tile draws a frame; if Tiles/ were absent from the
    // manifest the whole map would render blank.
    const tiles = allImageIds().filter((id) => id.startsWith("Tiles/"));
    expect(tiles.length).toBeGreaterThan(20);
  });
});

describe("image set switching", () => {
  it("defaults to the classic set", () => {
    expect(getImageSet()).toBe(DEFAULT_IMAGE_SET);
    expect(imagePath("Tiles\\floor_asphalt")).toContain("/classic/");
  });

  it("switches to another set and back", () => {
    try {
      setImageSet("deonapocalypse_v9_r1");
      expect(getImageSet()).toBe("deonapocalypse_v9_r1");
      expect(imagePath("Tiles\\floor_asphalt")).toContain("/deonapocalypse_v9_r1/");
    } finally {
      setImageSet(DEFAULT_IMAGE_SET);
    }
    expect(getImageSet()).toBe(DEFAULT_IMAGE_SET);
  });

  it("falls back to the default for an unknown set rather than 404ing", () => {
    try {
      setImageSet("no-such-set");
      expect(getImageSet()).toBe(DEFAULT_IMAGE_SET);
    } finally {
      setImageSet(DEFAULT_IMAGE_SET);
    }
  });
});

/**
 * The favicon and PWA icons are referenced from `index.html` and
 * `manifest.webmanifest` as plain URL strings, so nothing in the type system
 * connects them to a file on disk. A rename 404s them silently: the build
 * passes, the tests pass, and the browser quietly shows a default globe or a
 * broken install prompt. This is the same failure shape as the sprite-id
 * problem above, in the one place where the ids are not centralised.
 */
describe("favicon and manifest icons", () => {
  const publicDir = resolve(webRoot, "public");
  const html = readFileSync(resolve(webRoot, "index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8")) as {
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  it("points the favicon at icon-reloaded.png, and that file exists", () => {
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/icon-reloaded\.png"/);
    expect(existsSync(resolve(publicDir, "icon-reloaded.png"))).toBe(true);
  });

  it("resolves every icon the manifest declares", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    const missing = manifest.icons
      .map((i) => i.src.replace(/^\//, ""))
      .filter((rel) => !existsSync(resolve(publicDir, rel)));
    expect(missing, `manifest icon(s) with no file: ${missing.join(", ")}`).toEqual([]);
  });

  it("includes the reloaded icon in the manifest, so the installed app matches the tab", () => {
    expect(manifest.icons.some((i) => i.src === "/icon-reloaded.png")).toBe(true);
  });

  it("keeps a maskable icon, which Android needs for a non-cropped install", () => {
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("has no duplicate icon entries", () => {
    const keys = manifest.icons.map((i) => `${i.src} ${i.sizes} ${i.purpose}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

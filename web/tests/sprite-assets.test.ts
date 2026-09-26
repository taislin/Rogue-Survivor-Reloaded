import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { imagePath, IMAGE_EXTENSION, IMAGE_SETS, DEFAULT_IMAGE_SET, getImageSet, setImageSet } from "@engine/AssetPaths";
import { GameImages } from "@gameplay/GameImages";

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

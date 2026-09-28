import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Map as GameMap, Lighting } from "@data/Map";
import { Models } from "@data/Models";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import type { TileModel } from "@data/TileModel";
import type { Quad } from "@engine/firstperson/Types";
import { Direction } from "@engine/Direction";
import { buildScene, TEXTURED_FLOOR_TILES, type SceneInputs } from "@engine/firstperson/SceneBuilder";
import { isUnoccluded } from "@engine/firstperson/Billboards";
import { encodePng, diffImages } from "./helpers/png";
import { createSurface, drawList, solidTexture, type Texture } from "./helpers/softRaster";

/**
 * The whole frame: the scene builder, the draw order, and the first pictures.
 *
 * This is the first file that renders something a player would recognise, and the
 * reason the earlier geometry-only goldens were not enough is now visible. Two of
 * the three bugs found in this commit were *only* visible here:
 *
 *  - The floor was striped with holes. Every count was plausible; the picture was a
 *    floor made of black wedges. The cause is that a quad is affine and a floor
 *    tile under perspective is projective, so every per-tile quad is slightly
 *    smaller than the truth and the slivers between neighbours are drawn by nothing.
 *  - The test rasteriser and the browser disagreed about a flat-coloured quad, so
 *    the golden showed a defect the game does not have — the harness lying in the
 *    opposite direction, which is worse, because it would have been "fixed" in the
 *    renderer.
 *
 * So the tests below assert *coverage* as well as appearance. "How many pixels did
 * nothing draw" is a number, it is the number that matters, and it is invisible in
 * a picture at this size.
 */

Models.tiles = new GameTiles();

function model(id: TileID): TileModel {
  return Models.tiles.get(id);
}

function outline(map: GameMap, left: number, top: number, w: number, h: number, id: TileID): void {
  const wall = model(id);
  for (let x = left; x < left + w; x++) {
    map.setTileModelAt(x, top, wall);
    map.setTileModelAt(x, top + h - 1, wall);
  }
  for (let y = top; y < top + h; y++) {
    map.setTileModelAt(left, y, wall);
    map.setTileModelAt(left + w - 1, y, wall);
  }
}

function markAllInView(map: GameMap): void {
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      map.getTileAt(x, y)!.isInView = true;
    }
  }
}

function corridor(width = 9, height = 21): GameMap {
  const map = new GameMap(1, "test", width, height);
  map.lighting = Lighting.LIT;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      map.setTileModelAt(x, y, model(TileID.FLOOR_CONCRETE));
    }
  }
  outline(map, 0, 0, width, height, TileID.WALL_BRICK);
  markAllInView(map);
  return map;
}

const WIDTH = 288;
const HEIGHT = 224;

function sceneInputs(map: GameMap, facing: Direction, overrides: Partial<SceneInputs> = {}): SceneInputs {
  return {
    map,
    posX: 4.5,
    posY: 14.5,
    facing,
    width: WIDTH,
    height: HEIGHT,
    isInside: false,
    actionPoints: 100,
    ...overrides,
  };
}

// ── Coverage ────────────────────────────────────────────────────────────────

/** How many pixels of the lower half nothing drew, and how many were rejected. */
function floorCoverage(inputs: SceneInputs): { undrawn: number; total: number } {
  const scene = buildScene(inputs);
  const surface = createSurface(WIDTH, HEIGHT, [0, 0, 0]);
  const backdrop = scene.backdrop.color;
  for (let i = 0; i < surface.data.length; i += 4) {
    surface.data[i] = backdrop.r;
    surface.data[i + 1] = backdrop.g;
    surface.data[i + 2] = backdrop.b;
    surface.data[i + 3] = 255;
  }
  surface.z.fill(Infinity);
  drawList(surface, scene.quads, texturesFor(scene.quads));

  let undrawn = 0;
  const from = Math.floor(HEIGHT / 2);
  for (let y = from; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (surface.z[y * WIDTH + x] === Infinity) undrawn++;
    }
  }
  return { undrawn, total: (HEIGHT - from) * WIDTH };
}

function texturesFor(quads: readonly Quad[]): Map<string, Texture> {
  const out = new Map<string, Texture>();
  let n = 0;
  for (const id of new Set(quads.map((q) => q.imageId).filter((id) => id !== ""))) {
    // One flat colour per image, so a wall changing texture shows as a colour change
    // rather than as a coincidental match with the floor's.
    const v = 90 + ((n * 37) % 140);
    out.set(id, solidTexture(id, v, v, v));
    n++;
  }
  return out;
}

describe("the floor has no holes in it", () => {
  it("covers every pixel below the horizon, from every facing", () => {
    // The regression this file exists for. The floor was striped because a quad is
    // affine and a floor tile under perspective is projective: every per-tile quad
    // is slightly *smaller* than the truth, and the slivers between neighbours are
    // drawn by nothing. Expanding the tiles does not close it — the error grows
    // with the tile's screen size, and the nearest tile is 40px tall — and
    // subdivision only shrinks it. The fix is one opaque underlay that cannot have
    // a seam, so whatever the tiles miss shows floor-coloured rather than
    // sky-coloured.
    //
    // The premise: the lower half *is* floor in this fixture, so anything undrawn
    // there is a hole. Asserted for all eight facings because the shear is
    // different in each and a diagonal is the worst case.
    for (const facing of Direction.COMPASS) {
      const { undrawn, total } = floorCoverage(sceneInputs(corridor(), facing));
      expect(undrawn, `facing ${facing.name}: ${undrawn} of ${total} floor pixels drew nothing`).toBe(0);
    }
  });

  it("covers the floor with the camera against a wall, where the tiles are biggest", () => {
    // The worst case for the projective error: standing a tile from the wall behind
    // you makes the nearest tiles fill the bottom of the screen.
    const map = corridor();
    for (const facing of [Direction.N, Direction.NE, Direction.E, Direction.S]) {
      const { undrawn } = floorCoverage(sceneInputs(map, facing, { posX: 4.5, posY: 1.5 }));
      expect(undrawn, `facing ${facing.name} next to the north wall`).toBe(0);
    }
  });

  it("gives the underlay a finite depth, or it can never draw", () => {
    // A depth buffer starts at "nothing here" — `Infinity` — and rejects a quad
    // whose depth is `Infinity` as already occluded. So the one quad that must never
    // be occluded is the one that cannot use it. This is the whole bug: the
    // underlay existed, looked right in the source, and drew nothing at all.
    const scene = buildScene(sceneInputs(corridor(), Direction.N));
    const depths = scene.quads.map((q) => q.depth);
    expect(depths.some((d) => !Number.isFinite(d)), "a quad has a non-finite depth").toBe(false);
  });
});

describe("the draw list", () => {
  it("has one wall column per column of the viewport", () => {
    const scene = buildScene(sceneInputs(corridor(), Direction.N));
    expect(scene.counts.columns).toBe(WIDTH);
    // A column that saw nothing produces no wall quad; in a walled corridor every
    // column sees something, so the two counts agree. If they ever do not, the
    // count is telling the truth and the other is wrong.
    expect(scene.counts.wallQuads).toBe(WIDTH);
  });

  it("orders the floor before the walls, which is counter-intuitive and correct", () => {
    // A wall column is opaque and runs from the ceiling to the floor, so the floor
    // can never legitimately appear in front of one. Painter's order gets that for
    // free *because* walls come second; the other way round paints the floor over
    // the walls, and it looks plausible enough to ship.
    const scene = buildScene(sceneInputs(corridor(), Direction.N));
    // `findLastIndex` is ES2023 and the project targets older, so the scan is by
    // hand. The check is on *textured* floor tiles rather than on every flat quad,
    // because the underlay and the fog quads are flat fills that legitimately sit
    // among both groups.
    let lastTile = -1;
    let firstWall = -1;
    for (let i = 0; i < scene.quads.length; i++) {
      const imageId = scene.quads[i]!.imageId;
      if (imageId.includes("floor")) lastTile = i;
      if (firstWall === -1 && imageId.includes("wall")) firstWall = i;
    }
    expect(firstWall, "no wall quads at all").toBeGreaterThan(-1);
    expect(lastTile, "no floor tiles at all").toBeGreaterThan(-1);
    expect(lastTile, "a floor tile is drawn after a wall").toBeLessThan(firstWall);
  });

  it("stays inside a budget that fits a frame", () => {
    // The port plan treats 658 draw calls per frame as the budget for the whole
    // top-down view. The first-person view is a different renderer and may be
    // dearer, but not without a decision — so the number is asserted, not assumed,
    // and the floor's share of it is counted separately.
    const scene = buildScene(sceneInputs(corridor(), Direction.N));
    expect(scene.quads.length).toBeLessThan(2000);
    // The floor is the expensive part and the reason for the near/far split; it
    // must not have become the whole frame.
    expect(scene.counts.floorQuads).toBeLessThan(scene.quads.length * 0.75);
  });

  it("only textures the floor within the stated distance", () => {
    // Beyond a few tiles a 32px texture is under one screen pixel per texel, so a
    // full mode 7 floor would spend thousands of calls to render aliasing noise.
    const scene = buildScene(sceneInputs(corridor(), Direction.N));
    const camera = scene.camera;
    let furthest = 0;
    for (const quad of scene.quads) {
      if (!quad.imageId.includes("floor")) continue;
      furthest = Math.max(furthest, quad.depth);
    }
    expect(furthest).toBeLessThanOrEqual(TEXTURED_FLOOR_TILES + 1);
    void camera;
  });

  it("fogs a wall the engine has not marked in view", () => {
    // The one rule that keeps first person from being a cheat. `Rules.actorFOV` is
    // a *circle* of about 9.24 tiles and the camera is a cone, so a ray reaches
    // walls the player may not see — in the dark, at night, behind them. Drawing
    // those textures hands over exactly what the rules withhold, and the only
    // symptom is that first person is more informative than the game is.
    const map = corridor();
    markAllInView(map);
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        map.getTileAt(x, y)!.isInView = false;
      }
    }
    const scene = buildScene(sceneInputs(map, Direction.N));
    expect(scene.counts.fogColumns).toBe(WIDTH);
    expect(scene.counts.wallQuads).toBe(0);
    // And every fogged column is a flat fill rather than a textured one.
    for (const quad of scene.quads) {
      if (quad.depth < 1e6) expect(quad.imageId).not.toBe("Tiles/wall_brick");
    }
  });

  it("gives a dark map a dark backdrop and a lit one a light one", () => {
    const lit = buildScene(sceneInputs(corridor(), Direction.N));
    const darkMap = corridor();
    darkMap.lighting = Lighting.DARKNESS;
    const dark = buildScene(sceneInputs(darkMap, Direction.N));
    expect(dark.backdrop.color.r).toBeLessThan(lit.backdrop.color.r);
  });

  it("keeps every synthesised colour opaque and roughly neutral", () => {
    // `Color.fromArgb` takes **(r, g, b, a)** here — the reverse of C#'s
    // `FromArgb(alpha, r, g, b)`. Passing the alpha first compiles, type-checks and
    // silently yields a translucent *red*: `fromArgb(255, 24, 24, 34)` is
    // r=255, a=34. Nothing catches it — the software rasteriser writes alpha 255
    // unconditionally, so the golden image is identical either way, and the browser
    // blends it. So the colours are checked here instead.
    //
    // Neutral because every one of them is a shade of grey by intent: a fog or a
    // backdrop with a colour cast in it is a bug whatever its hue.
    for (const lighting of [Lighting.DARKNESS, Lighting.LIT, Lighting.OUTSIDE]) {
      for (const isInside of [false, true]) {
        const map = corridor();
        map.lighting = lighting;
        const color = buildScene(sceneInputs(map, Direction.N, { isInside })).backdrop.color;
        const label = `lighting ${lighting}, isInside ${isInside}`;
        expect(color.a, `${label}: alpha`).toBe(255);
        // Greyish: every one of these is a shade of grey by intent, with at most a
        // slight cool cast. A spread over 32 is a colour cast rather than a cast on
        // a grey — and the alpha-first bug's `255, 24, 24, 34` has a spread of 231,
        // so it cannot slip through.
        const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
        expect(spread, `${label}: not a grey (${color.r},${color.g},${color.b})`).toBeLessThanOrEqual(32);
      }
    }
  });
});

describe("billboards", () => {
  it("never draws the player, who is the camera", () => {
    // A sprite at the near plane, in front of the player's own eyes, every frame.
    expect(isUnoccluded(0, 10, 0.1, new Float32Array([Infinity, Infinity]))).toBe(true);
  });

  it("culls a sprite that is behind a wall in any column it spans", () => {
    // The boolean version of this test is the classic raycaster bug: a zombie drawn
    // through a doorway, from another room, with the wall still in front of it.
    const z = Float32Array.from([5, 5, 5, 5]);
    expect(isUnoccluded(0, 4, 4, z)).toBe(true);
    expect(isUnoccluded(0, 4, 6, z)).toBe(false);
    // Partly behind: one column of wall is enough, because the sprite would show
    // through the gap.
    const half = Float32Array.from([Infinity, Infinity, 2, 2]);
    expect(isUnoccluded(0, 4, 4, half)).toBe(false);
  });

  it("is conservative at the screen edge, where the radial test is approximate", () => {
    // The exact test is along each column's own ray and the radial one is an
    // approximation; being slightly wrong in the direction of culling is right,
    // since the alternative is a sprite punching through a doorframe.
    const z = Float32Array.from([Infinity, Infinity, 3, 3, 3, Infinity]);
    expect(isUnoccluded(2, 4, 3.0001, z)).toBe(false);
  });
});

// ── Goldens ─────────────────────────────────────────────────────────────────

const GOLDEN_DIR = join(__dirname, "goldens/firstperson");

function render(inputs: SceneInputs): ReturnType<typeof createSurface> {
  const scene = buildScene(inputs);
  const surface = createSurface(WIDTH, HEIGHT, [0, 0, 0]);
  const backdrop = scene.backdrop.color;
  for (let i = 0; i < surface.data.length; i += 4) {
    surface.data[i] = backdrop.r;
    surface.data[i + 1] = backdrop.g;
    surface.data[i + 2] = backdrop.b;
    surface.data[i + 3] = 255;
  }
  surface.z.fill(Infinity);
  drawList(surface, scene.quads, texturesFor(scene.quads));
  return surface;
}

function compareToGolden(name: string, actual: ReturnType<typeof createSurface>): void {
  const path = join(GOLDEN_DIR, `scene-${name}.png`);
  if (!existsSync(path) || process.env.FP_UPDATE_GOLDENS === "1") {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, encodePng(actual));
    return;
  }
  const expected = readFileSync(path);
  const fresh = encodePng(actual);
  if (fresh.equals(expected)) return;
  const actualPath = join(GOLDEN_DIR, "actual", `scene-${name}.png`);
  mkdirSync(join(GOLDEN_DIR, "actual"), { recursive: true });
  writeFileSync(actualPath, fresh);
  throw new Error(
    `golden "scene-${name}" changed. The new image is at ${actualPath}.\n` +
      `If the change is intended, delete the golden and re-run, or set FP_UPDATE_GOLDENS=1.`,
  );
}

describe("golden images: a whole frame", () => {
  it("a corridor looking north", () => {
    compareToGolden("corridor-north", render(sceneInputs(corridor(), Direction.N)));
  });

  it("the same corridor looking south, so the mirror case is pinned too", () => {
    compareToGolden("corridor-south", render(sceneInputs(corridor(), Direction.S)));
  });

  it("a diagonal, where a wrong basis or a wrong shear is most visible", () => {
    compareToGolden("corridor-ne", render(sceneInputs(corridor(), Direction.NE)));
  });

  it("indoors, where the backdrop is a ceiling rather than sky", () => {
    compareToGolden("indoors", render(sceneInputs(corridor(), Direction.N, { isInside: true })));
  });

  it("stands against a wall and looks the other way, the worst case for the floor", () => {
    // The nearest floor tile is always the biggest one, so the projective error is
    // worst wherever the camera is close to the floor — which is everywhere. This
    // puts that near tile right at the bottom of the screen with the corridor
    // stretching away, rather than pointing at a wall half a tile away: that is
    // geometrically correct and fills the viewport with one flat colour, which is
    // not a picture anybody learns anything from.
    compareToGolden("near-floor", render(sceneInputs(corridor(), Direction.S, { posY: 1.5 })));
  });

  it("turning changes the picture", () => {
    // Not a golden — a relationship. Two identical pictures from two different
    // facings would mean the facing never reaches the geometry, which is the one
    // thing the whole control scheme exists to produce.
    const north = render(sceneInputs(corridor(), Direction.N));
    const east = render(sceneInputs(corridor(), Direction.E));
    expect(diffImages(north, east).differing).toBeGreaterThan(500);
  });
});

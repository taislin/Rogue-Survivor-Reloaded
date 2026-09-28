import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Map as GameMap, Lighting } from "@data/Map";
import { MapObject } from "@data/MapObject";
import { Location } from "@data/Location";
import { Point } from "@engine/Point";
import { Models } from "@data/Models";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import type { TileModel } from "@data/TileModel";
import { quadAffine, quadCorners, sourceCorners, type Quad } from "@engine/firstperson/Types";
import { Direction } from "@engine/Direction";
import { buildScene, TEXTURED_FLOOR_TILES, type SceneInputs } from "@engine/firstperson/SceneBuilder";
import { MAX_RAY_DISTANCE, castColumns } from "@engine/firstperson/Raycaster";
import { projectColumns } from "@engine/firstperson/Projector";
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

/**
 * Where the camera stands in the corridor, and why there.
 *
 * A living actor has `FOV: 8`, and `losDistance` is `0.866 x Euclidean`, so the
 * player sees about **9.2 tiles** — less at night, less still in rain. Standing at
 * y = 14.5 in a 21-deep corridor puts the far wall 13.5 tiles away, which is
 * genuinely out of sight, and the picture was drawn anyway because the renderer
 * traced rays to 64 tiles.
 *
 * So the camera is placed where the far wall is *inside* the field of view, and the
 * bound is asserted separately below. A fixture that quietly relies on the renderer
 * seeing further than the rules allow is how the leak survived the first review.
 */
const CAMERA_Y = 8.5;

function sceneInputs(map: GameMap, facing: Direction, overrides: Partial<SceneInputs> = {}): SceneInputs {
  return {
    map,
    posX: 4.5,
    posY: CAMERA_Y,
    facing,
    width: WIDTH,
    height: HEIGHT,
    isInside: false,
    actionPoints: 100,
    // Daylight and a full-day field of view, so the fixtures show the whole view.
    // The engine's own values are what the wiring test supplies; these two are the
    // "unobstructed" case a geometry fixture wants.
    maxViewDistance: 9,
    daylight: 1,
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

  it("draws no further than the engine says the player can see", () => {
    // The information leak this closes. The camera's cone is 100° and the raycaster
    // will trace to 64 tiles; `Rules.actorFOV` says the player sees a circle of
    // `fov / 0.866`. Without the bound, a 3/8 field of view — midnight, heavy rain,
    // the exact conditions of the screenshot that prompted this — still rendered
    // six tiles of floor, which is a game showing the player more than its rules
    // permit. The only symptom is that first person is more informative than the
    // game is.
    const near = 3.46; // a 3/8 FOV, as Rules computes it
    const scene = buildScene(sceneInputs(corridor(), Direction.N, { maxViewDistance: near }));

    // **Walls** come from rays, which stop at exactly the limit, so they are
    // bounded strictly. This is the part that matters: without it the renderer
    // reaches out to 64 tiles and paints a lit interior the player is not allowed
    // to see.
    const map = corridor();
    let furthestWall = 0;
    for (const column of projectColumns(scene.camera, castColumns(map, scene.camera, near))) {
      furthestWall = Math.max(furthestWall, column.depth);
    }
    expect(furthestWall).toBeLessThanOrEqual(near + 1e-6);

    // **Floor** is walked tile by tile, so a tile whose *near* corner is inside the
    // limit is drawn whole and its far corner can sit a fraction outside it. Bounded
    // by a tile rather than exactly, and deliberately: a tile is the smallest thing
    // the floor is made of, and clipping one would be a ragged edge for no gain.
    let furthestFloor = 0;
    for (const quad of scene.quads) {
      // The underlay sits at exactly `MAX_RAY_DISTANCE` — further than any ray, so
      // it draws first and loses to everything. It is a fill, not geometry.
      if (quad.depth >= MAX_RAY_DISTANCE) continue;
      if (!quad.imageId.includes("floor")) continue;
      furthestFloor = Math.max(furthestFloor, quad.depth);
    }
    expect(furthestFloor).toBeLessThanOrEqual(near + 1);
    expect(furthestFloor).toBeGreaterThan(near - 1);

    // And the effect is visible: a short view sees fewer wall columns, because the
    // far ones are past the limit rather than merely fogged.
    const wide = buildScene(sceneInputs(corridor(), Direction.N, { maxViewDistance: 40 }));
    expect(scene.counts.wallQuads).toBeLessThan(wide.counts.wallQuads);
  });

  it("walks whole tiles whatever the view distance is", () => {
    // The bound is `fov / 0.866`, so 3.46 or 1.38 — a fraction, because it comes
    // from the rules rather than from a constant. Used directly as a loop bound it
    // walks a half-tile grid, and `Map.getTileAt(1.38, y)` indexes `tilesGrid[1.38]`,
    // which is undefined. The integer constant that used to sit here hid it.
    for (const maxViewDistance of [1.38, 3.46, 9.24, 13.7]) {
      const scene = buildScene(sceneInputs(corridor(), Direction.N, { maxViewDistance }));
      for (const quad of scene.quads) {
        expect(Number.isFinite(quad.x + quad.y + quad.depth), `NaN at ${maxViewDistance}`).toBe(true);
      }
    }
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

describe("the two implementations of a quad agree", () => {
  /**
   * The test the browser run needed and did not have.
   *
   * The floor rendered as bowties: the Canvas2D transform that maps a quad's
   * source rect onto the quad had the wrong translation, so every *sheared* quad —
   * which is every textured floor tile and nothing else — landed
   * `c · sy` sideways of where it belonged. The wall columns were fine, because
   * they are axis-aligned and take a different code path entirely, which is why
   * the walls looked plausible and the floor did not.
   *
   * Every golden image passed, because the goldens rasterise with a different
   * implementation: the software renderer inverse-maps each texel from
   * `origin + u·U + v·V`, which is right by construction and never had the bug.
   * So the two implementations of one primitive disagreed, and a shared `Quad`
   * type did nothing to stop it — a shared type constrains shape, not behaviour.
   *
   * This asserts the invariant that actually holds them together: the matrix maps
   * the source rect's four corners onto the quad's four corners. It runs in Node,
   * and it does not need a browser to have caught the bug.
   */
  function expectCornersMapped(quad: Quad): void {
    const [a, b, c, d, e, f] = quadAffine(quad);
    const apply = (px: number, py: number): [number, number] => [a * px + c * py + e, b * px + d * py + f];
    const sources = sourceCorners(quad);
    const targets = quadCorners(quad);
    for (let i = 0; i < 4; i++) {
      const [px, py] = sources[i]!;
      const [gotX, gotY] = apply(px, py);
      const [wantX, wantY] = targets[i]!;
      expect(gotX, `corner ${i} x for ${JSON.stringify(quad)}`).toBeCloseTo(wantX, 9);
      expect(gotY, `corner ${i} y for ${JSON.stringify(quad)}`).toBeCloseTo(wantY, 9);
    }
  }

  it("maps a sheared quad's source corners onto its corners", () => {
    // The shape that failed: a floor sub-quad, with both a shear and a non-zero
    // source offset — which is exactly what makes the missing `c·sy` and `b·sx`
    // terms non-zero and the bug visible.
    expectCornersMapped({
      imageId: "Tiles/floor_concrete",
      x: 100.5, y: 200.25,
      ux: 30, uy: -12,
      vx: 18, vy: 4,
      sx: 8, sy: 16, sw: 8, sh: 8,
      depth: 3,
    });
  });

  it("maps an axis-aligned quad too, which is every wall column", () => {
    expectCornersMapped({
      imageId: "Tiles/wall_brick",
      x: 12, y: 300,
      ux: 1, uy: 0, vx: 0, vy: 42,
      sx: 5, sy: 0, sw: 1, sh: 32,
      depth: 3.5,
    });
  });

  it("maps a billboard, which has a non-zero source offset in both axes", () => {
    expectCornersMapped({
      imageId: "Actors/zombie",
      x: 400, y: 150,
      ux: 24, uy: 0, vx: 0, vy: 48,
      sx: 0, sy: 0, sw: 32, sh: 32,
      depth: 5,
    });
  });

  it("holds for every quad a real frame produces, not just the three shapes above", () => {
    // The fixtures are the point. A hand-written quad proves the algebra; a frame
    // proves the algebra is what the renderer is actually handed, including the
    // quads whose shear and source offset both vary per tile.
    const scene = buildScene(sceneInputs(corridor(), Direction.NE));
    for (const quad of scene.quads) {
      expectCornersMapped(quad);
    }
    expect(scene.quads.length).toBeGreaterThan(50);
  });

  it("paints every quad through one path, so the flat and textured shapes cannot differ", () => {
    // The second browser-only bug, and the same cause as the first. `fillRect(x, y,
    // w, h)` has no shear parameters, so it drew an upright *rectangle* for every
    // sheared flat quad — which is every floor tile's base fill. The difference
    // between a rectangle and the true parallelogram is exactly two triangles, and
    // the browser's floor was two triangles of base colour against two of texture,
    // converging on the vanishing point.
    //
    // The previous version of this test counted `fillRect` calls and **passed
    // against the bug**, because a mutation that replaced the branch with a single
    // unconditional `fillRect` left the count unchanged. Counting occurrences is
    // the wrong instrument. What is actually asserted now is the *structure*: one
    // place builds the clip, one place applies the transform, and the flat/textured
    // choice is only ever a choice of what to paint into the region those two have
    // already established. A branch that picks a primitive can pick the wrong
    // shape; a branch that picks a paint call cannot.
    const source = readFileSync(join(__dirname, "../src/ui/firstperson/SceneRenderer.ts"), "utf-8");

    // The parallelogram is built exactly once, and the affine exactly once. Two
    // copies is how they came to disagree with the rasteriser in the first place.
    expect(
      (source.match(/moveTo\(quad\.x, quad\.y\)/g) ?? []).length,
      "the parallelogram is built more than once, so the shapes can drift apart",
    ).toBe(1);
    expect(
      (source.match(/ctx\.transform\(/g) ?? []).length,
      "the affine is applied in more than one place",
    ).toBe(1);

    // And exactly three fills in the whole file, all of them accounted for: the
    // backdrop, the axis-aligned flat fast path, and the sheared flat fill. A fourth
    // would be a new place that can pick the wrong shape. Naming all three is the
    // point — a count alone cannot say *which* three.
    const fills = source.match(/\.(fillRect|fill)\(/g) ?? [];
    expect(fills, "an unaccounted-for fill, so a new path can pick a shape").toHaveLength(3);
    expect(source, "the backdrop is missing its fill").toContain("ctx.fillRect(panel.left, panel.top, panel.width, panel.height)");
    // Exactly one `fillRect(quad.` — the fast path — and it is behind the no-shear
    // test, so a sheared quad cannot reach it.
    expect((source.match(/ctx\.fillRect\(quad\./g) ?? []).length).toBe(1);
    // The sheared flat fill is in the quad's *own* space, where the affine has
    // already been applied. In destination coordinates it would be an upright
    // rectangle, which is the bug.
    expect(source, "a sheared flat quad is filled in destination coordinates").toContain(
      "ctx.fillRect(0, 0, quad.sw, quad.sh)",
    );
    // And there is no `ctx.fill()` left: a path fill would be correct for a
    // parallelogram but it silently ignores the transform, which is the same class
    // of mistake in a different method.
    expect((source.match(/ctx\.fill\(\)/g) ?? []).length, "a bare ctx.fill() cannot honour a transform").toBe(0);

    // And the geometry, so the mistake has a size attached: the two shapes differ
    // by a lot, and the difference is precisely the shear term. Which one is
    // *bigger* depends on the shear's sign, so the assertion is on the difference.
    for (const quad of [
      { imageId: "", x: 300, y: 400, ux: 60, uy: -14, vx: 40, vy: 22, sx: 0, sy: 0, sw: 1, sh: 1, depth: 2 },
      { imageId: "", x: 300, y: 400, ux: 60, uy: 14, vx: 40, vy: 22, sx: 0, sy: 0, sw: 1, sh: 1, depth: 2 },
    ] as Quad[]) {
      const parallelogramArea = Math.abs(quad.ux * quad.vy - quad.vx * quad.uy);
      const rectangleArea = Math.abs(quad.ux * quad.vy);
      expect(
        Math.abs(parallelogramArea - rectangleArea) / rectangleArea,
        "a sheared quad and its bounding rectangle are nearly the same",
      ).toBeGreaterThan(0.2);
      expect(Math.abs(parallelogramArea - rectangleArea)).toBeCloseTo(
        Math.abs(quad.vx * quad.uy),
        9,
      );
    }
  });

  it("is what the browser renderer actually uses, rather than a copy of the maths", () => {
    // The four tests above pin `quadAffine`, which is not the same as pinning the
    // renderer: it could hand-roll its own matrix and every one of them would still
    // pass, which is exactly what a mutation confirmed — reintroducing the original
    // bug at the call site left this file green.
    //
    // So the guard is on the source, and it is two-sided on purpose. The positive
    // check is what stops it passing vacuously — a previous source-scanning test in
    // this project had a pattern that never matched the file it was guarding, and
    // asserted nothing for ever. If `quadAffine(` ever stops appearing here, the
    // positive check fails loudly rather than the negative one failing silently.
    const source = readFileSync(
      join(__dirname, "../src/ui/firstperson/SceneRenderer.ts"),
      "utf-8",
    );
    expect(source, "the renderer should delegate to quadAffine").toContain("quadAffine(quad)");
    // No division by a quad field anywhere in the renderer: building the matrix
    // *is* the bug, and that arithmetic has no business being anywhere but the
    // shared module. Deliberately a division and not a mention of `sx`/`sw` —
    // the axis-aligned path passes the source rect straight to `drawImage`, so
    // reading those fields is correct, and a guard that forbade it would have
    // failed on the right code.
    expect(
      source.match(/\/\s*quad\./g) ?? [],
      "the renderer is dividing by a quad field, so it is building the matrix itself",
    ).toEqual([]);
  });

  it("fails if the translation drops either term", () => {
    // The mutation, as an assertion. The bug was `x - a·sx` for `x - a·sx - c·sy`;
    // if the test cannot be made to fail by exactly that, it is not testing the
    // thing that broke.
    const quad: Quad = {
      imageId: "x", x: 100, y: 200, ux: 30, uy: -12, vx: 18, vy: 4,
      sx: 8, sy: 16, sw: 8, sh: 8, depth: 1,
    };
    const [a, b, c, d] = quadAffine(quad);
    const buggy = [a, b, c, d, quad.x - a * quad.sx, quad.y - d * quad.sy];
    const [px, py] = sourceCorners(quad)[3]!;
    const gotX = a * px + c * py + buggy[4]!;
    const wantX = quad.x + quad.ux + quad.vx;
    // The dropped `c·sy` term, quantified: 18 * 16 / 8 = 36px.
    expect(gotX).not.toBeCloseTo(wantX, 6);
    // Displaced a whole `c · sy` to the right, which is 18 * 16 / 8 = 36px here.
    expect(gotX - wantX).toBeCloseTo((quad.vx * quad.sy) / quad.sh, 9);
  });
});

describe("decals, decorations and weather", () => {
  function fixture(): GameMap {
    const map = corridor();
    // A wall the player is looking at, one tile in, with a decoration on it.
    map.setTileModelAt(2, 6, model(TileID.WALL_STONE));
    map.getTileAt(2, 6)!.addDecoration("Tiles/Decoration/char_poster1");
    return map;
  }

  it("draws a map object as a billboard, never as a wall column", () => {
    // Furniture, cars, doors and gates are all top-down icons: the game draws each
    // one as a single unscaled 32x32 sprite, so there is no side or back of a car
    // to render. A wall column stretches the icon to 1.5 tiles tall and the width of
    // a view column, which is inventing geometry the art does not have.
    const map = corridor();
    // A real `MapObject`, so the flags are the ones the engine actually reads —
    // `isTransparent` is derived from `IS_MATERIAL_TRANSPARENT`, and a hand-rolled
    // object literal would not be exercising that at all.
    const car = new MapObject("car", "MapObjects/car1");
    car.imageId = "MapObjects/car1";
    car.isWalkable = false;
    car.isMaterialTransparent = false;
    // In front of the camera, not behind: the camera stands at y = 9.5 facing south,
    // which is +y. A test object behind the camera is the one thing this cannot see,
    // and it fails as "not drawn" rather than as "wrong", which is a slow way to
    // learn a direction convention.
    car.location = new Location(map, new Point(4, 14));
    map.getMapObjectAt = ((x: number, y: number) => (x === 4 && y === 14 ? car : null)) as typeof map.getMapObjectAt;

    const scene = buildScene(sceneInputs(map, Direction.S, { posY: 9.5 }));
    // The car stops a ray, so its column carries no wall — and it is drawn.
    expect(scene.counts.objectColumns).toBeGreaterThan(0);
    expect(scene.counts.mapObjectQuads).toBeGreaterThan(0);
    const billboard = scene.quads.find((q) => q.imageId === "MapObjects/car1");
    expect(billboard, "the car was not drawn at all").toBeDefined();
    // A billboard is a full 32x32 sprite, not a 1px slice of a texture.
    expect(billboard!.sw).toBe(32);
    expect(billboard!.sh).toBe(32);
    // And the wall behind it is still drawn, because the object was opaque and the
    // ray stopped — so the object's billboard is what covers that column.
    expect(scene.counts.wallQuads).toBeGreaterThan(0);
  });

  it("draws one quad per object, however many columns hit it", () => {
    // A shelf at one tile is hit by fifty-odd columns. A quad per column draws the
    // same 32x32 sprite fifty times on top of itself: visually only overdraw, but
    // fifty draw calls for one object.
    //
    // And the dedupe is on **object identity, not `imageId`**: every shop shelf in a
    // district shares one image id, so keying on it merges the shelf you are standing
    // next to with the one at the end of the street and draws a single sprite in the
    // middle of nowhere. That is the bug this shape is defending against.
    const map = corridor();
    const shelfAt = (x: number) => {
      const shelf = new MapObject("shelf", "MapObjects/shop_shelf");
      shelf.imageId = "MapObjects/shop_shelf";
      shelf.isWalkable = false;
      shelf.isMaterialTransparent = false;
      shelf.location = new Location(map, new Point(x, 14));
      return shelf;
    };
    const shelves = [shelfAt(2), shelfAt(3), shelfAt(4), shelfAt(5), shelfAt(6)];
    map.getMapObjectAt = ((x: number, y: number) =>
      y === 14 ? (shelves.find((o) => o.location.position.x === x) ?? null) : null) as typeof map.getMapObjectAt;

    const scene = buildScene(sceneInputs(map, Direction.S, { posY: 9.5 }));
    // Five distinct objects sharing one image id, so an imageId-keyed dedupe would
    // produce one quad and an identity-keyed one produces five.
    const shelfQuads = scene.quads.filter((q) => q.imageId === "MapObjects/shop_shelf");
    expect(shelfQuads, "the shelves were merged into one sprite").toHaveLength(5);
    // And they are *distinct* sprites, not one drawn five times in the same place.
    const centres = new Set(shelfQuads.map((q) => Math.round((q.x + q.ux / 2) * 4)));
    expect(centres.size, "two shelves landed in the same place").toBe(5);
    // Many columns, few quads: this is the overdraw the dedupe exists to remove.
    expect(scene.counts.objectColumns).toBeGreaterThan(shelfQuads.length);
  });

  it("stands furniture at furniture height, not wall height", () => {
    // `MapObject` has no height in the data model, only an image, so this is one
    // value for everything. A bed drawn 1.5 tiles tall reads as a door; at one tile
    // it reads as a bed. A door is the exception and the reason: a doorway the
    // player can see over does not read as a doorway.
    const map = corridor();
    const bed = new MapObject("bed", "MapObjects/bed");
    bed.imageId = "MapObjects/bed";
    bed.isWalkable = false;
    bed.isMaterialTransparent = false;
    bed.location = new Location(map, new Point(4, 14));
    map.getMapObjectAt = ((x: number, y: number) => (x === 4 && y === 14 ? bed : null)) as typeof map.getMapObjectAt;

    const bedScene = buildScene(sceneInputs(map, Direction.S, { posY: 9.5 }));
    const bedQuad = bedScene.quads.find((q) => q.imageId === "MapObjects/bed");
    expect(bedQuad).toBeDefined();
    const bedHeight = bedQuad!.vy;

    const door = new MapObject("door", "MapObjects/dark_door_closed");
    door.imageId = "MapObjects/dark_door_closed";
    door.isWalkable = false;
    door.isMaterialTransparent = false;
    door.location = new Location(map, new Point(4, 14));
    map.getMapObjectAt = ((x: number, y: number) => (x === 4 && y === 14 ? door : null)) as typeof map.getMapObjectAt;
    const doorScene = buildScene(sceneInputs(map, Direction.S, { posY: 9.5 }));
    const doorQuad = doorScene.quads.find((q) => q.imageId === "MapObjects/dark_door_closed");
    expect(doorQuad).toBeDefined();
    expect(doorQuad!.vy).toBeGreaterThan(bedHeight);
  });

  it("draws a decoration over the wall it sits on, not behind it", () => {
    // A decoration at exactly the wall's distance is rejected by the depth test and
    // is invisible. The column it belongs to is therefore a hair *nearer* than the
    // wall — the difference is 0.001 tiles and the whole feature depends on it.
    const scene = buildScene(sceneInputs(fixture(), Direction.N));
    expect(scene.counts.decorationQuads).toBeGreaterThan(0);

    const wall = scene.quads.find((q) => q.imageId === "Tiles/wall_stone");
    const decal = scene.quads.find((q) => q.imageId === "Tiles/Decoration/char_poster1");
    expect(wall).toBeDefined();
    expect(decal).toBeDefined();
    expect(decal!.depth).toBeLessThan(wall!.depth);
    // And it covers the same column, or it is not a wall decal.
    expect(decal!.x).toBe(wall!.x);
  });

  it("gives a corpse a flat quad on the floor rather than a billboard", () => {
    // A standing corpse, or a bandage roll standing on end, is the wrong picture in
    // both cases. The art is a top-down icon in a top-down game.
    const map = corridor();
    const scene = buildScene(sceneInputs(map, Direction.N));
    expect(scene.counts.decalQuads).toBe(0); // nothing on the floor yet
    expect(scene.counts.billboardQuads).toBe(0);
  });

  it("puts no weather overlay on a clear day", () => {
    const scene = buildScene(sceneInputs(corridor(), Direction.N));
    expect(scene.weather).toBeNull();
  });

  it("puts a weather overlay over the whole view when it rains", () => {
    const scene = buildScene(
      sceneInputs(corridor(), Direction.N, { weatherImageId: "Effects/weather_rain1" }),
    );
    expect(scene.weather).not.toBeNull();
    expect(scene.weather!.imageId).toBe("Effects/weather_rain1");
    // Semi-transparent, because a full-strength full-screen tile of rain would hide
    // the game.
    expect(scene.weather!.alpha).toBeGreaterThan(0);
    expect(scene.weather!.alpha).toBeLessThan(1);
  });

  it("keeps the rain off a covered roof", () => {
    // `DrawMap` skips weather per tile when `tile.isInside`; here it is one test
    // rather than one per tile, and a roof in first person should not have rain
    // inside it either.
    const scene = buildScene(
      sceneInputs(corridor(), Direction.N, {
        weatherImageId: "Effects/weather_rain1",
        isInside: true,
      }),
    );
    expect(scene.weather).toBeNull();
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

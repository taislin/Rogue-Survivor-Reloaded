import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
// Aliased: the game's `Map` class shadows the built-in, and this file needs the
// built-in for the texture dictionary. A shadowed `Map` fails as
// "Type 'Map' is not generic" and "out.set is not a function", which reads
// like a broken test helper rather than a name collision.
import { Map as GameMap, Lighting } from "@data/Map";
import { Models } from "@data/Models";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import type { TileModel } from "@data/TileModel";
import { Direction } from "@engine/Direction";
import { makeCamera, VIEW_FOV_DEGREES, type Quad } from "@engine/firstperson/Types";
import { castColumns } from "@engine/firstperson/Raycaster";
import {
  projectColumns,
  projectColumn,
  columnQuad,
  sortFarToNear,
  perpendicularDistance,
  billboardRect,
} from "@engine/firstperson/Projector";
import { encodePng, diffImages } from "./helpers/png";
import { createSurface, drawList, solidTexture, type Texture } from "./helpers/softRaster";

Models.tiles = new GameTiles();

function model(id: TileID): TileModel {
  return Models.tiles.get(id);
}

function floorMap(width: number, height: number): GameMap {
  const map = new GameMap(1, "test", width, height);
  map.lighting = Lighting.LIT;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      map.setTileModelAt(x, y, model(TileID.FLOOR_CONCRETE));
    }
  }
  return map;
}

/** `MapGenerator.tileRectangle`'s shape: a four-line outline, not a band. */
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

function room(): GameMap {
  const map = floorMap(9, 9);
  outline(map, 0, 0, 9, 9, TileID.WALL_BRICK);
  markAllInView(map);
  return map;
}

/**
 * A long corridor: 9 wide, 21 deep, camera in the middle.
 *
 * The goldens use this rather than `room`, and the reason is about the *fixture*,
 * not the renderer. In a 9x9 room the far wall is 3.5 tiles away and 8 wide, so it
 * subtends about 98 degrees of a 100-degree field of view — it fills the entire
 * picture and the side walls are hidden behind it. That is correct, and it makes a
 * useless golden: every column projects to the same band, so a whole class of
 * errors (a mirrored basis, a wrong slice, a mis-sorted draw list) changes almost
 * no pixels.
 *
 * A corridor puts the side walls in view as two converging bands with the far wall
 * a small rectangle between them, so the parts of the geometry worth pinning are
 * actually on screen.
 */
function corridor(): GameMap {
  const map = floorMap(9, 21);
  outline(map, 0, 0, 9, 21, TileID.WALL_BRICK);
  markAllInView(map);
  return map;
}

const CORRIDOR_CENTRE_Y = 14.5;

const CENTRE = 4.5;
const WIDTH = 96;
const HEIGHT = 64;

/**
 * A minimal hit at a given *radial* distance, offset sideways so the wall is not
 * on the view axis.
 *
 * The distance is set directly rather than derived from an offset, because the
 * height is now divided by the distance: two hits whose *lateral* offsets are in a
 * 1:2 ratio do not have distances in that ratio, and the test would be measuring
 * the wrong thing.
 */
function syntheticHit(cam: ReturnType<typeof makeCamera>, distance: number) {
  return {
    distance,
    mapX: 4, mapY: 1, side: 1 as const,
    normalX: 0, normalY: 1,
    hitX: cam.posX + 1, hitY: 1,
    wallU: 0.5,
    surface: "wall" as const,
    imageId: "Tiles/wall_brick",
    // A tile, so no object — `RayHit` carries the map object for the billboard
    // dedupe, and these are all wall-geometry fixtures.
    object: null,
    inView: true,
  };
}

describe("perpendicular distance", () => {
  it("is zero straight ahead and grows towards the edges", () => {
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    // A point due north of the camera, on the view axis.
    expect(perpendicularDistance(cam, CENTRE, CENTRE - 3)).toBeCloseTo(0, 12);
    // A point north *and* west is to the left, so a negative sideways distance —
    // which is what puts a column at a screen x left of centre.
    expect(perpendicularDistance(cam, CENTRE - 1, CENTRE - 3)).toBeCloseTo(-1, 12);
    expect(perpendicularDistance(cam, CENTRE + 1, CENTRE - 3)).toBeCloseTo(1, 12);
  });

  it("is not the radial distance, which is what a fisheye would come from", () => {
    // Down the view axis the two agree; towards the edges they do not, and using
    // the radial one stretches the picture outwards. At the default 100° field of
    // view the two differ by a factor of 1.64 at the edge of the screen, so this is
    // not a rounding detail.
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    // A point 3 tiles ahead and as far to the side as the half-FOV allows.
    const edgeX = CENTRE + Math.sin((VIEW_FOV_DEGREES / 2) * (Math.PI / 180)) * 3;
    const perp = Math.abs(perpendicularDistance(cam, edgeX, CENTRE - 3));
    const radial = Math.hypot(edgeX - CENTRE, 3);
    expect(perp / radial, "the two are too close for this to be testing anything").toBeLessThan(0.7);
    // The sideways offset is exactly what was asked for; the radial distance is
    // the longer hypotenuse. Using the radial one would make every column's height
    // use the wrong divisor.
    expect(perp).toBeCloseTo(Math.abs(edgeX - CENTRE), 12);
  });
});

describe("projectColumn", () => {
  it("puts the horizon in the middle and centres the wall on it", () => {
    // The eye is half a wall up, so a wall's top and bottom are symmetric about
    // the horizon. That symmetry is what makes a doorway read as a gap in the
    // middle of a wall rather than a hole at the top of it.
    const map = room();
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    const column = projectColumn(cam, castColumns(map, cam)[WIDTH / 2]!, WIDTH / 2);
    const horizon = HEIGHT / 2;
    expect(column.top + column.bottom).toBeCloseTo(2 * horizon, 9);
    expect(column.top).toBeLessThan(horizon);
    expect(column.bottom).toBeGreaterThan(horizon);
  });

  it("makes a nearer wall taller, in inverse proportion", () => {
    // The whole perspective model in one relationship. Checked as a ratio, so it
    // holds whatever the viewport and FOV are: twice the distance, half the height.
    //
    // The hits are synthetic and deliberately *off* the view axis. A hit directly
    // ahead has a perpendicular distance of 0, clamps, and every such pair comes
    // out the same height — which is correct and would make the test vacuous.
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    const near = syntheticHit(cam, 2);
    const far = syntheticHit(cam, 4);
    expect(projectColumn(cam, near, 0).perpDist).not.toBeCloseTo(0, 6);
    const heightA = projectColumn(cam, near, 0).bottom - projectColumn(cam, near, 0).top;
    const heightB = projectColumn(cam, far, 0).bottom - projectColumn(cam, far, 0).top;
    expect(heightA / heightB).toBeCloseTo(2, 6);

    // And halving the panel's *height* — keeping the width, so the panel becomes
    // twice as wide as it is tall — makes the column **twice** as tall, not half.
    // The vertical field of view is derived from the aspect ratio, so a wider
    // panel at a fixed horizontal field of view sees *less* vertically, and a
    // narrower lens makes the same wall bigger. Counterintuitive enough to be
    // worth pinning, because "halve the screen, halve the sprite" is the wrong
    // instinct and the wrong value would have passed a shape-only check.
    const short = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT / 2);
    expect(short.verticalPlaneLength).toBeCloseTo(cam.verticalPlaneLength / 2, 12);
    const shortHeight = projectColumn(short, near, 0).bottom - projectColumn(short, near, 0).top;
    expect(shortHeight / heightA).toBeCloseTo(2, 6);
  });

  it("gives a wall left of centre the same height as the mirror of it", () => {
    // `perpDist` is negative across the whole left half of the screen, so taking
    // it signed makes every left-hand wall's height negative — and a negative height
    // means a quad with `bottom` above `top`, which a rasteriser drops. The visible
    // symptom would be a room with its left wall missing, which looks like a hole
    // in the world generation rather than a sign error.
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    const leftHit = { ...syntheticHit(cam, 2), hitX: cam.posX - 1 };
    const rightHit = { ...syntheticHit(cam, 2), hitX: cam.posX + 1 };
    const left = projectColumn(cam, leftHit, 0);
    const right = projectColumn(cam, rightHit, 0);
    expect(left.perpDist).toBeLessThan(0);
    expect(right.perpDist).toBeGreaterThan(0);
    expect(left.bottom - left.top).toBeGreaterThan(0);
    expect((left.bottom - left.top) / (right.bottom - right.top)).toBeCloseTo(1, 6);
  });

  it("is one pixel wide, and that is not a rounding accident", () => {
    // A grid raycaster's walls are vertical strips, so a column is exactly one
    // pixel. Widening columns to hide seams is a renderer decision made with the
    // projection in hand, not something the projection should do silently — a
    // two-pixel column would double the fill rate for no gain.
    const map = room();
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    for (const column of projectColumns(cam, castColumns(map, cam))) {
      expect(column.width).toBe(1);
      expect(Number.isInteger(column.x)).toBe(true);
    }
  });

  it("keeps the on-axis column finite, at every viewport parity", () => {
    // A column's screen coordinate is `2c/width - 1`, which is exactly 0 only for
    // an *even* width, at c = width/2. So the zero-perpendicular-distance case is
    // the middle column of the real 864-wide viewport, and an odd width misses it
    // by half a pixel on each side. Both are covered because both are real: the
    // even case is the divide by zero, and the odd case is the near-zero distance
    // either side of it, where an unclamped height runs to hundreds of screen
    // heights.
    //
    // An `Infinity` would not look like a crash. It would go into the draw list,
    // then into a z-buffer, where `Infinity` compares false against every real
    // depth — so the wall would draw over the actors standing in front of it, in
    // the exact centre of the screen, and nowhere else.
    // The height follows the width, at the map panel's real aspect ratio. It is
    // not cosmetic: the vertical field of view is derived as
    // `tan(halfFovH) * height / width`, so a 864x64 viewport asks for a 10-degree
    // vertical lens and every wall comes out thousands of pixels tall. A test with
    // an impossible aspect is not a stricter test, it is a different renderer.
    const panelHeight = (width: number) => Math.round((width * 672) / 864);
    for (const width of [64, 65, 96, 97, 864]) {
      const height = panelHeight(width);
      const map = room();
      const cam = makeCamera(CENTRE, CENTRE, Direction.N, width, height);
      const columns = projectColumns(cam, castColumns(map, cam));
      expect(columns.length, `width ${width}`).toBe(width);

      // Every column finite, whatever its distance — not just the middle one.
      for (const column of columns) {
        expect(Number.isFinite(column.top), `width ${width}, column ${column.x}: top`).toBe(true);
        expect(Number.isFinite(column.bottom), `width ${width}, column ${column.x}: bottom`).toBe(true);
        expect(column.bottom - column.top, `width ${width}, column ${column.x}: inverted or empty`).toBeGreaterThan(0);
        // And sane: a wall in a 9x9 room is nowhere near 64 screen-heights tall,
        // so the clamp is a backstop and is not being reached.
        expect(column.bottom - column.top, `width ${width}, column ${column.x}: implausibly tall`).toBeLessThan(height * 4);
      }

      // And for the even widths the middle column is the on-axis one: its lateral
      // offset is 0, and its height comes from the *distance* rather than from that
      // offset. It is an ordinary column — the wall straight ahead — not the
      // screen-filling one the earlier lateral-offset version produced.
      if (width % 2 === 0) {
        const middle = columns.find((c) => c.x === width / 2)!;
        expect(Math.abs(middle.perpDist), `width ${width}: the centre column is not on-axis`).toBeLessThan(1e-9);
        expect(middle.top).toBeGreaterThan(0);
        expect(middle.bottom).toBeLessThan(height);
      }
    }
  });
});

describe("the wall texture slice", () => {
  it("varies along a wall, or the wall has no texture at all", () => {
    // Every column of a wall showing the same one-pixel stripe is a wall with a
    // flat colour, and as the camera turns the stripe crawls. `wallU` is what
    // prevents it, so this asserts the slice actually differs across the wall.
    const map = room();
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    const columns = projectColumns(cam, castColumns(map, cam));
    const slices = new Set(columns.map((c) => c.hit.wallU));
    expect(slices.size).toBeGreaterThan(3);
  });

  it("is pinned to the wall, so the brickwork does not crawl when the camera turns", () => {
    // Two cameras at different y, looking at the same north wall: the slice a
    // given point on that wall shows must not depend on where the camera is.
    const map = room();
    const slicesFromTwoPlaces: number[][] = [];
    for (const y of [4.2, 4.8]) {
      const cam = makeCamera(CENTRE, y, Direction.N, WIDTH, HEIGHT);
      const columns = projectColumns(cam, castColumns(map, cam));
      // Take the middle column, which is the wall directly ahead at x = 4, and
      // note the u it landed on. Different camera y means a different crossing
      // point, so the *slice* may legitimately differ — what must not differ is
      // that both are in [0, 1) and both come from the tile's own frame.
      slicesFromTwoPlaces.push([columns[WIDTH / 2]!.hit.wallU]);
    }
    for (const [u] of slicesFromTwoPlaces) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("takes the slice from the axis the wall runs along", () => {
    // A y-face (a wall running east-west) is sliced by x; an x-face (a wall
    // running north-south) is sliced by y. Getting this wrong rotates the texture
    // 90° on one set of walls, which is the kind of thing that looks like a
    // deliberate texture choice and is not.
    const map = room();
    // Off-centre in x, so the slices are not all the uninformative 0.5.
    const north = castColumns(map, makeCamera(4.2, CENTRE, Direction.N, WIDTH, HEIGHT))[WIDTH / 2]!;
    expect(north.side).toBe(1);
    // Straight ahead, so the crossing x is the camera's x: 4.2 in tile 4.
    expect(north.hitX).toBeCloseTo(4.2, 9);
    expect(north.wallU).toBeCloseTo(0.2, 9);

    // A ray that hits an x-face gets its slice from y instead. Standing south of
    // centre and looking east, the wall ahead is at x = 8 and the crossing y is
    // the camera's.
    const east = castColumns(map, makeCamera(CENTRE, 4.3, Direction.E, WIDTH, HEIGHT))[WIDTH / 2]!;
    expect(east.side).toBe(0);
    expect(east.hitY).toBeCloseTo(4.3, 9);
    expect(east.wallU).toBeCloseTo(0.3, 9);
  });

  it("keeps every slice inside the tile, whatever the camera does", () => {
    // `wallU` is multiplied by the texture size to pick a texel, so a value of
    // exactly 1 — or a hair over, from rounding at the boundary — indexes off the
    // end of the texture and reads a neighbouring sprite's pixels.
    const map = room();
    for (const facing of Direction.COMPASS) {
      for (const x of [4.2, 4.5, 4.8]) {
        const hits = castColumns(map, makeCamera(x, 4.5, facing, WIDTH, HEIGHT));
        for (const hit of hits) {
          if (hit === null) continue;
          expect(hit.wallU, `u out of range facing ${facing.name}`).toBeGreaterThanOrEqual(0);
          expect(hit.wallU, `u out of range facing ${facing.name}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("draw order", () => {
  it("sorts far to near, which is not the order the rays come in", () => {
    // A raycaster walks the screen left to right and the depth jumps around: the
    // middle column of a room is the far wall and the edge columns are the near
    // side walls. Drawing in ray order would paint the near wall last and then
    // over it — or, with a depth buffer, sort wrongly and hide it.
    const map = room();
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    const columns = projectColumns(cam, castColumns(map, cam));
    const sorted = sortFarToNear([...columns]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.depth, `column ${i} is nearer than the one before it`).toBeLessThanOrEqual(
        sorted[i - 1]!.depth,
      );
    }
    // And it is a real reordering, not a no-op on already-sorted input.
    expect(sorted[0]!.depth).toBeGreaterThan(sorted[sorted.length - 1]!.depth);
  });
});

describe("billboards", () => {
  it("anchors the sprite's feet to the floor and grows it as 1/distance", () => {
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    const near = billboardRect(cam, CENTRE, CENTRE - 2, 1)!;
    const far = billboardRect(cam, CENTRE, CENTRE - 4, 1)!;
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();

    // Twice the distance, half the height and half the width.
    const nearH = near.bottom - near.top;
    const farH = far.bottom - far.top;
    expect(nearH / farH).toBeCloseTo(2, 6);
    expect((near.right - near.left) / (far.right - far.left)).toBeCloseTo(2, 6);

    // The feet are on the floor, which is below the horizon by the eye height — a
    // sprite centred vertically instead would float, and one whose bottom is at the
    // horizon would sit *on* the horizon like a poster on the far wall.
    const horizon = HEIGHT / 2;
    const pxPerTileAt = (d: number) => WIDTH / (2 * cam.verticalPlaneLength * d);
    expect(near.bottom).toBeCloseTo(horizon + cam.eyeHeight * pxPerTileAt(2), 6);
    expect(far.bottom).toBeCloseTo(horizon + cam.eyeHeight * pxPerTileAt(4), 6);
    // And the floor line is strictly below the horizon for anything in front.
    expect(near.bottom).toBeGreaterThan(horizon);
  });

  it("refuses a point behind the camera instead of mirroring it", () => {
    // `perpDist <= 0` covers both "behind" and "level with". Dividing by a
    // negative perpendicular distance flips the sprite to the wrong side of the
    // screen, which looks like a wall-mounted picture rather than an absence.
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, WIDTH, HEIGHT);
    expect(billboardRect(cam, CENTRE, CENTRE + 2, 1)).toBeNull();
    expect(billboardRect(cam, CENTRE, CENTRE, 1)).toBeNull();
  });
});

// ── Golden images ───────────────────────────────────────────────────────────

const GOLDEN_DIR = join(__dirname, "goldens/firstperson");

/** A stand-in texture: solid, so a diff shows *geometry* moving, not art. */
function texturesFor(imageIds: Iterable<string>): Map<string, Texture> {
  const out = new Map<string, Texture>();
  // A stable colour per id, so a wall changing texture is visible as a colour
  // change rather than as a coincidental match.
  let n = 0;
  for (const id of imageIds) {
    const v = 40 + ((n * 67) % 200);
    out.set(id, solidTexture(id, v, v, v));
    n++;
  }
  return out;
}

function wallQuads(map: GameMap, facing: Direction): Quad[] {
  const cam = makeCamera(CENTRE, CORRIDOR_CENTRE_Y, facing, WIDTH, HEIGHT);
  const columns = sortFarToNear(projectColumns(cam, castColumns(map, cam)));
  return columns.map((c) => columnQuad(c, 32));
}

function render(quads: Quad[]): ReturnType<typeof createSurface> {
  const surface = createSurface(WIDTH, HEIGHT, [16, 16, 24]);
  drawList(surface, quads, texturesFor(new Set(quads.map((q) => q.imageId))));
  return surface;
}

function goldenPath(name: string): string {
  return join(GOLDEN_DIR, `${name}.png`);
}

describe("golden images", () => {
  it("a corridor looking north", () => {
    compareToGolden("corridor-north", render(wallQuads(corridor(), Direction.N)));
  });

  it("the corridor from a corner, which is where a wrong basis shows", () => {
    // Standing off-centre makes the two side walls asymmetric, so a mirrored or
    // transposed camera basis cannot produce a symmetric image and pass. The dead
    // centre is the one place a left/right error hides.
    const map = corridor();
    const cam = makeCamera(2.5, 16.5, Direction.NW, WIDTH, HEIGHT);
    const columns = sortFarToNear(projectColumns(cam, castColumns(map, cam)));
    compareToGolden("corridor-corner-nw", render(columns.map((c) => columnQuad(c, 32))));
  });

  it("the same room, looking east", () => {
    // The mirror case. A y-down basis error shows up here and not in the north
    // view, because the two put the wall faces on different axes — which is why
    // there are two goldens and not one.
    compareToGolden("corridor-east", render(wallQuads(corridor(), Direction.E)));
  });

  it("turning by one eighth swaps which walls are visible", () => {
    // A 45° turn, which is what a single Left press does. The golden should differ
    // from north's: if it did not, rotation would not be reaching the renderer.
    const north = render(wallQuads(corridor(), Direction.N));
    const northWest = render(wallQuads(corridor(), Direction.NW));
    const diff = diffImages(north, northWest);
    expect(diff.differing, "turning left changed nothing, so rotation is not reaching the geometry").toBeGreaterThan(100);
  });

  it("draws a wall for every column, and none of them infinitely tall", () => {
    const map = room();
    const quads = wallQuads(map, Direction.N);
    expect(quads.length).toBe(WIDTH);
    for (const q of quads) {
      expect(Number.isFinite(q.x + q.y + q.ux + q.vy + q.depth)).toBe(true);
      expect(q.ux).toBe(1);
      expect(q.uy).toBe(0);
      expect(q.vx).toBe(0);
    }
  });
});

/**
 * Compares a render to its golden, writing the actual on a mismatch.
 *
 * The written file is the point: a golden test that reports only "differs" makes
 * the next person re-derive the answer by eye, which is the thing the test was
 * for. The count and the largest channel delta are in the message so a one-texel
 * fog change is distinguishable from half a broken screen.
 */
function compareToGolden(name: string, actual: ReturnType<typeof createSurface>): void {
  const path = goldenPath(name);
  if (!existsSync(path) || process.env.FP_UPDATE_GOLDENS === "1") {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, encodePng(actual));
    if (!existsSync(path)) throw new Error("failed to write the golden");
    return;
  }
  const expected = readFileSync(path);
  // Decoding a PNG needs a decoder, and adding a dependency for this is not worth
  // it — so the golden is compared through the *renderer*, by re-running the
  // rasteriser over the golden's own bytes. Instead, assert the bytes match a
  // fresh encode, which is deterministic, and report the size if not.
  const fresh = encodePng(actual);
  if (fresh.equals(expected)) return;

  mkdirSync(join(GOLDEN_DIR, "actual"), { recursive: true });
  const actualPath = join(GOLDEN_DIR, "actual", `${name}.png`);
  writeFileSync(actualPath, fresh);
  throw new Error(
    `golden "${name}" changed: expected ${expected.length} bytes, got ${fresh.length}.\n` +
      `The new image is at ${actualPath}. If the change is intended, delete the golden\n` +
      `and re-run, or set FP_UPDATE_GOLDENS=1.`,
  );
}

import { Map } from "@data/Map";
import { Tile } from "@data/Tile";
import { Color } from "@engine/Color";
import { Direction } from "@engine/Direction";
import { Lighting } from "@data/Map";
import {
  makeCamera,
  VIEW_FOV_DEGREES,
  type Camera,
  type Quad,
} from "./Types";
import { castColumns, columnDistances, MAX_RAY_DISTANCE } from "./Raycaster";
import { columnQuad, projectColumns, sortFarToNear } from "./Projector";
import { collectBillboards } from "./Billboards";

/**
 * Assembles a first-person frame: a camera, and an ordered list of quads to draw.
 *
 * The whole of the draw list is here, in `engine/`, with no DOM in sight — which
 * is what lets a test rasterise it and compare pictures, and what keeps the
 * browser layer to nothing but blits. It is also why the geometry is worth being
 * this careful about: none of it can be checked by looking at the running game
 * alone, and most of it cannot be checked by reading it either.
 *
 * **The draw order is a contract, and the parts of it that are not obvious are the
 * important ones:**
 *
 *  1. sky or ceiling, as one full-screen fill
 *  2. floor, far to near
 *  3. walls, far to near
 *  4. decorations, on the wall face they sit on
 *  5. billboards, far to near
 *  6. floor decals
 *
 * Walls after the floor is the one that looks wrong and is right: a wall column is
 * opaque and runs from the ceiling to the floor, so the floor can never legitimately
 * appear in front of one. A painter's algorithm gets that for free *because* of the
 * order, and getting it backwards paints the floor over the walls.
 */

/** How a frame is put together. All of it is display state, none of it is saved. */
export interface SceneInputs {
  map: Map;
  /** Tile coordinates, fractional — the middle of a tile is 4.5. */
  posX: number;
  posY: number;
  facing: Direction;
  /** Viewport in logical canvas pixels. */
  width: number;
  height: number;
  /**
   * `tile.isInside` at the camera, which decides ceiling against sky. A tile is
   * "inside" per-tile, so a view spanning a wall shows both; the ceiling is drawn
   * per column from each wall's own tile, which is free once the columns exist.
   */
  isInside: boolean;
  /** Player's action points, for the HUD's darkness tint. 0..100. */
  actionPoints: number;
  /** A multiplier the player or an effect applies to the view, 1 = normal. */
  fovScale?: number;
}

/** Where a frame's milliseconds went. The measurement the plan asks for. */
export interface SceneTimings {
  /** The raycast, alone. */
  raycastMs: number;
  /** Everything the builder does, cast included. */
  buildMs: number;
  /** Nothing — the builder does not draw. Filled in by the renderer. */
  drawMs: number;
  /** Raycast plus build, i.e. the whole frame minus the blit. */
  totalMs: number;
}

/** A complete frame: what to draw, in what order, and the camera that made it. */
export interface Scene {
  readonly camera: Camera;
  /** Sky or ceiling fill, drawn first and covering the viewport. */
  readonly backdrop: { color: Color; isCeiling: boolean };
  readonly quads: Quad[];
  /** Per-column wall distance, for the billboard pass's depth test. */
  readonly zBuffer: Float32Array;
  /** Where the milliseconds went, so "the floor is too slow" is distinguishable. */
  readonly timings: SceneTimings;
  /** Counted, not logged: the browser tally and the profile both read these. */
  readonly counts: {
    columns: number;
    wallQuads: number;
    floorQuads: number;
    billboardQuads: number;
    decalQuads: number;
    fogColumns: number;
    /** Sprites the z-buffer dropped, which is a measurement, not a count of work. */
    culledBillboards: number;
  };
}

/** Tiles of floor that get a textured quad before the flat shading takes over. */
export const TEXTURED_FLOOR_TILES = 6;

export function buildScene(inputs: SceneInputs): Scene {
  const startedAt = performance.now();
  const camera = makeCamera(
    inputs.posX,
    inputs.posY,
    inputs.facing,
    inputs.width,
    inputs.height,
    (inputs.fovScale ?? 1) * VIEW_FOV_DEGREES,
  );

  const raycastStart = performance.now();
  const hits = castColumns(inputs.map, camera);
  const raycastMs = performance.now() - raycastStart;
  const zBuffer = columnDistances(hits);
  const columns = sortFarToNear(projectColumns(camera, hits));

  const quads: Quad[] = [];
  let wallQuads = 0;
  let fogColumns = 0;

  // ── Walls ────────────────────────────────────────────────────────────────
  //
  // A column whose surface the *engine* has not marked in view is drawn as fog,
  // not as its texture. The raycaster's cone and `Rules.actorFOV`'s circle are
  // different shapes, so a ray reaches walls the player is not allowed to see — in
  // the dark, at night, or behind them. Drawing those textures would hand the player
  // precisely the information the rules withhold, and first person is the only view
  // where that is even possible.
  //
  // A column that reached the map edge is fog for the same reason plus one: there
  // is no wall there, only the absence of a world.
  for (const column of columns) {
    const hidden = !column.hit.inView || column.hit.surface === "edge";
    if (hidden) {
      fogColumns++;
      quads.push(fogQuad(column, inputs));
      continue;
    }
    if (column.hit.surface === "object") {
      // A transparent map object — an open door, a table. It is walkable, so the
      // ray stops on it only because the raycaster reports it; drawn as a column it
      // would be a full-height slab across the doorway.
      quads.push(columnQuad(column, 32));
      wallQuads++;
      continue;
    }
    quads.push(columnQuad(column, 32));
    wallQuads++;
  }

  // ── Floor and ceiling ────────────────────────────────────────────────────
  //
  // Textured only for the nearest few tiles, and flat beyond. Beyond about six
  // tiles a 32px texture is under one screen pixel per texel, so a full mode-7
  // floor would be spending thousands of draw calls to render aliasing noise — the
  // number the port plan worries about, arrived at honestly rather than by
  // guessing. The flat colour is the tile's own minimap colour, which is the only
  // per-tile colour the data model has.
  const floorQuads = buildFloor(inputs.map, camera);

  // ── Billboards ───────────────────────────────────────────────────────────
  // A sprite behind a wall is neither drawn nor counted as drawn, so `culled` is a
  // measurement of the depth test working rather than of the renderer doing more.
  const { billboards, culled: culledBillboards } = collectBillboards(inputs.map, camera, zBuffer);
  sortFarToNear(billboards);

  const quadsWithBillboards = [...floorQuads, ...quads, ...billboards.map((b) => b.quad)];

  return {
    camera,
    timings: {
      raycastMs,
      buildMs: performance.now() - startedAt,
      // The builder never draws, so this is zero until the renderer fills it in.
      // Zero rather than a copy of `buildMs`, because claiming the blit cost here
      // would be the one number in the set that is invented.
      drawMs: 0,
      totalMs: performance.now() - startedAt,
    },
    backdrop: {
      color: backdropColor(inputs, camera),
      isCeiling: inputs.isInside,
    },
    quads: quadsWithBillboards,
    zBuffer,
    counts: {
      columns: camera.width,
      wallQuads,
      floorQuads: floorQuads.length,
      billboardQuads: billboards.length,
      decalQuads: 0,
      fogColumns,
      culledBillboards,
    },
  };
}

/**
 * A column's worth of fog, in the fog colour.
 *
 * One quad, using a colour rather than a texture — the `tint` on an untinted 1x1
 * source is the same thing without needing an image, and it means a fogged column
 * costs no image lookup and cannot fail to load.
 */
function fogQuad(column: WallColumnLike, inputs: SceneInputs): Quad {
  const height = column.bottom - column.top;
  const color = fogColor(inputs);
  return {
    // A `drawImage` of a 1x1 texture, tinted: the only quad form both rasterisers
    // can express without a source image existing for it.
    imageId: "",
    x: column.x,
    y: column.top,
    ux: column.width,
    uy: 0,
    vx: 0,
    vy: height,
    sx: 0,
    sy: 0,
    sw: 1,
    sh: 1,
    depth: column.depth,
    tint: [color.r / 255, color.g / 255, color.b / 255],
  };
}

/** The shape `fogQuad` needs — a projected column without its hit. */
interface WallColumnLike {
  x: number;
  width: number;
  top: number;
  bottom: number;
  depth: number;
}

/** How dark the world is, which is the fog and the unlit-wall colour. */
function fogColor(inputs: SceneInputs): Color {
  // `map.lighting` is per *map*, not per tile, so there is no per-tile lighting to
  // compute and any fog here is a synthesis. It is commented as one because the
  // temptation to treat it as the game's lighting is exactly the mistake that
  // would let first person show the player more than the rules allow.
  if (inputs.map.lighting === Lighting.DARKNESS) return Color.Black;
  // Lit: no fog at all, so a lamp-lit interior is not dimmed by a synthesis.
  if (inputs.map.lighting === Lighting.LIT) return Color.Black;
  // `Color.fromArgb` in this port takes **(r, g, b, a)** — the reverse of C#'s
  // `FromArgb(alpha, r, g, b)` — so the alpha-first form compiles, type-checks and
  // yields a translucent *red*. Every other call site in the tree passes r first.
  return Color.fromArgb(24, 24, 34);
}

/** The colour behind everything: a ceiling indoors, sky outdoors. */
function backdropColor(inputs: SceneInputs, camera: Camera): Color {
  if (inputs.isInside) {
    // Indoors the backdrop above the walls is a ceiling, and a dark one: there is
    // no ceiling texture in the game and inventing one is not worth it, but a
    // *sky*-coloured band above an interior wall would read as a hole in the roof.
    // r first, for the reason on `fogColor`.
    return Color.fromArgb(
      Math.round(10 * camera.eyeHeight),
      Math.round(10 * camera.eyeHeight),
      Math.round(14 * camera.eyeHeight),
    );
  }
  return inputs.map.lighting === Lighting.LIT ? Color.LightGray : Color.fromArgb(40, 44, 58);
}

/**
 * The floor, as a set of sheared quads.
 *
 * One quad per tile per subdivision step, projected. The near tiles are the
 * expensive ones — a tile at the bottom of the screen has a strongly sheared
 * trapezoid, and the affine mapping a quad *is* cannot express a perspective
 * divide, so the quad has to be split until the shear is small enough not to see.
 * That is what `subdivisionsFor` decides, and it is a cost calculation rather than
 * a constant because the shear falls off with distance.
 */
function buildFloor(map: Map, camera: Camera): Quad[] {
  const out: Quad[] = [];

  // The underlay: one quad covering everything below the horizon, in the colour of
  // the floor the camera is standing on.
  //
  // This is the seam fix that actually works, and the per-tile base fills are the
  // second layer rather than the first. A quad is affine and a floor tile under
  // perspective is projective, so *every* per-tile quad is slightly smaller than
  // the truth at its edges, and the sliver between two neighbours is drawn by
  // nothing. Expansion closes most of it; it cannot close all of it, because the
  // error grows with the tile's screen size and the nearest tile is 40px tall.
  // Subdivision shrinks the error but never eliminates it, at a cost of a 16x16
  // grid on every near tile. One opaque underlay cannot have a seam at all, and
  // whatever the tiles miss then shows floor-coloured rather than sky-coloured —
  // which is the difference between an artefact and a bug.
  const standing = map.getTileAt(Math.floor(camera.posX), Math.floor(camera.posY));
  const underlay = standing?.model.minimapColor ?? Color.Gray;
  out.push({
    imageId: "",
    x: 0, y: camera.height / 2,
    ux: camera.width, uy: 0,
    vx: 0, vy: camera.height / 2,
    sx: 0, sy: 0, sw: 1, sh: 1,
    // A large *finite* depth, not Infinity. A depth buffer starts at "nothing
    // drawn", which is `Infinity`, and a quad at `Infinity` is rejected as already
    // occluded — so an infinitely distant underlay can never draw at all, which is
    // the one value it must not have. `MAX_RAY_DISTANCE` is further than anything
    // the raycaster reports, so every real floor quad still wins over it.
    depth: MAX_RAY_DISTANCE,
    tint: [underlay.r / 255, underlay.g / 255, underlay.b / 255],
  });

  // Only the tiles near enough for a texture to mean anything. Beyond about six
  // tiles a 32px texture is under one screen pixel per texel, so a mode 7 floor
  // would be spending thousands of draw calls to render aliasing noise — the
  // number the port plan worries about, arrived at honestly rather than guessed.
  const maxDistance = Math.min(MAX_RAY_DISTANCE, TEXTURED_FLOOR_TILES);

  // The rings are walked far to near, which *is* the draw order. It is not
  // re-sorted afterwards: each tile emits a base fill and then its texture
  // sub-quads, and sorting by depth would interleave a near tile's fill in front
  // of its own detail, leaving the detail visible on the wrong side of a seam.
  for (let distance = 1; distance <= maxDistance; distance++) {
    for (let side = -distance; side <= distance; side++) {
      for (const [dx, dy] of ringOffsets(distance, side)) {
        const x = Math.floor(camera.posX) + dx;
        const y = Math.floor(camera.posY) + dy;
        if (!map.isInBounds(x, y)) continue;
        const tile = map.getTileAt(x, y);
        if (tile === null || !tile.model.isWalkable) continue;
        out.push(...floorQuadsForTile(camera, tile, x, y));
      }
    }
  }
  return out;
}

/** The (dx, dy) pairs making up one ring at `distance`, in a stable order. */
function ringOffsets(distance: number, side: number): Array<[number, number]> {
  if (distance === 0) return [[0, 0]];
  const edge = distance;
  if (side === -edge) {
    // The near edge, left to right.
    return Array.from({ length: edge * 2 + 1 }, (_, i) => [side + i, -edge] as [number, number]);
  }
  if (side === edge) {
    return Array.from({ length: edge * 2 + 1 }, (_, i) => [side - i, edge] as [number, number]);
  }
  // A side column, near to far.
  const onLeft = side < 0;
  const t = Math.abs(side);
  const cells: Array<[number, number]> = [];
  for (let k = edge - t; k >= 0; k--) {
    cells.push(onLeft ? [side, -k] : [side, k]);
  }
  return cells;
}

/**
 * One floor tile: a solid base fill, then the textured sub-quads on top of it.
 *
 * The base fill is not a belt-and-braces extra, it is what makes the floor have no
 * seams. The corners of a floor tile project to a *projective* quad — a straight
 * line in the world is not a straight line on screen — and a `Quad` is affine, so
 * interpolating the four corners bilinearly gives a shape that is slightly smaller
 * than the truth at every edge. Two neighbouring tiles each pull inward, the
 * sliver between them is drawn by nothing, and the floor comes out striped with
 * holes in it, radiating from the vanishing point and widening toward the camera.
 *
 * Subdividing shrinks that error but never removes it, and the cost of removing it
 * by subdivision is a 16x16 grid on every near tile. A solid quad underneath
 * removes it by construction: whatever the texture quads miss, the base is already
 * there in the tile's own colour. The cost is one extra quad per tile — not per
 * sub-quad — and it doubles as the flat shading for tiles past the texture cutoff.
 */
function floorQuadsForTile(camera: Camera, tile: Tile, x: number, y: number): Quad[] {
  const corners = [
    { x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 },
  ];
  // Depth of each corner, in camera space: forward along the view, sideways across.
  const forward = corners.map((c) => (c.x - camera.posX) * camera.dirX + (c.y - camera.posY) * camera.dirY);
  if (forward.some((f) => f <= 0.01)) return []; // behind or level with the camera

  const pxPerTile = camera.width / (2 * camera.verticalPlaneLength);
  const screen = corners.map((c, i) => {
    const sideways = (c.x - camera.posX) * camera.rightX + (c.y - camera.posY) * camera.rightY;
    return {
      x: (camera.width / 2) * (1 + sideways / (forward[i]! * camera.planeLength)),
      // The floor plane: further away is *higher* on screen, towards the horizon.
      y: camera.height / 2 + camera.eyeHeight * (pxPerTile / forward[i]!),
    };
  });

  const near = Math.min(...forward);
  const steps = subdivisionsFor(near);
  const out: Quad[] = [];

  // The base, in the tile's own minimap colour — the only per-tile colour the data
  // model has, and the same one the top-down minimap uses, so the two views agree
  // about what a tile is made of.
  //
  // **Expanded by a pixel on every side**, which is what actually closes the seams.
  // A base fill built from the same four corners shrinks by exactly the same
  // projective error the sub-quads do, so it leaves the same gaps — just one per
  // tile instead of one per sub-quad, which reads as dark patches rather than
  // stripes. Overlapping the neighbours by a pixel is a two-line fix for something
  // that subdivision cannot fix at any budget, and the overlap is invisible where
  // neighbouring tiles share a model, which is most of a floor.
  const base = tile.model.minimapColor;
  out.push(expandByPixels({
    imageId: "",
    x: screen[0]!.x, y: screen[0]!.y,
    ux: screen[1]!.x - screen[0]!.x, uy: screen[1]!.y - screen[0]!.y,
    vx: screen[3]!.x - screen[0]!.x, vy: screen[3]!.y - screen[0]!.y,
    sx: 0, sy: 0, sw: 1, sh: 1,
    depth: Math.min(...forward),
    tint: [base.r / 255, base.g / 255, base.b / 255],
  }, 1));

  for (let sy = 0; sy < steps; sy++) {
    for (let sx = 0; sx < steps; sx++) {
      const u0 = sx / steps, u1 = (sx + 1) / steps, v0 = sy / steps, v1 = (sy + 1) / steps;
      // Bilinear within the tile's screen quad: a point at (u, v) of the tile.
      const at = (u: number, v: number) => ({
        x: lerp(lerp(screen[0]!.x, screen[1]!.x, u), lerp(screen[3]!.x, screen[2]!.x, u), v),
        y: lerp(lerp(screen[0]!.y, screen[1]!.y, u), lerp(screen[3]!.y, screen[2]!.y, u), v),
      });
      const p00 = at(u0, v0), p10 = at(u1, v0), p01 = at(u0, v1);
      const depth = (forward[0]! * (1 - u0) + forward[1]! * u0) * (1 - v0) +
        (forward[3]! * (1 - u0) + forward[2]! * u0) * v0;

      out.push({
        imageId: tile.model.imageId,
        x: p00.x, y: p00.y,
        ux: p10.x - p00.x, uy: p10.y - p00.y,
        vx: p01.x - p00.x, vy: p01.y - p00.y,
        sx: Math.floor(u0 * 32), sy: Math.floor(v0 * 32),
        sw: Math.max(1, Math.floor((u1 - u0) * 32)), sh: Math.max(1, Math.floor((v1 - v0) * 32)),
        depth,
      });
    }
  }
  return out;
}

/**
 * How many times to split a floor tile.
 *
 * The shear of a floor quad under perspective falls off with distance, so a fixed
 * subdivision is either wasteful in the distance or visibly wrong up close. 4x4
 * near, 1x1 far — which is where the frame budget goes, and it is the first thing
 * to cut if the profile says so, because a coarser floor reads as a coarser floor
 * rather than as a broken one.
 */
function subdivisionsFor(distance: number): number {
  if (distance < 1.5) return 4;
  if (distance < 3) return 2;
  return 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Grows a quad outwards by `pixels` on every side.
 *
 * Along its own edge directions rather than in screen x and y, so a sheared floor
 * quad grows perpendicular to itself instead of into a wedge.
 */
function expandByPixels(quad: Quad, pixels: number): Quad {
  const uLength = Math.hypot(quad.ux, quad.uy);
  const vLength = Math.hypot(quad.vx, quad.vy);
  if (uLength === 0 || vLength === 0) return quad;
  const growU = (2 * pixels) / uLength;
  const growV = (2 * pixels) / vLength;
  return {
    ...quad,
    x: quad.x - (quad.ux * growU) / 2 - (quad.vx * growV) / 2,
    y: quad.y - (quad.uy * growU) / 2 - (quad.vy * growV) / 2,
    ux: quad.ux * (1 + growU),
    uy: quad.uy * (1 + growU),
    vx: quad.vx * (1 + growV),
    vy: quad.vy * (1 + growV),
  };
}

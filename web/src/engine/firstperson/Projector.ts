import { Camera, Quad, WallColumn } from "./Types";
import { RayHit } from "./Types";

/**
 * Turns ray hits into screen geometry.
 *
 * All of it is the same two lines of arithmetic, applied per column:
 *
 *   perpDist = how far the hit is *sideways* from the camera axis
 *   lineHeight = how many pixels tall the wall is there
 *
 * and everything else — the slice of texture, the horizon, the odd centre column
 * — is a consequence of those. There is no perspective matrix, because a grid
 * raycaster does not need one: for a point at perpendicular distance `d` from a
 * camera whose view plane is `planeLength` wide, the projection is
 *
 *   height on screen = (screenHeight / planeLength) * worldHeight / d
 *
 * so the whole of the perspective divide is one reciprocal. The screen x needs no
 * arithmetic at all beyond the column it is in, which is why a column is exactly
 * one pixel wide and why a wall that slants along a view is a staircase of
 * columns rather than a trapezoid.
 */

/**
 * The perpendicular distance from the camera axis to a hit, in tiles.
 *
 * Not the same as `RayHit.distance`, and the difference is not academic: the
 * radial distance is how far the ray travelled, this is how far the hit is to the
 * side. They agree down the middle of the screen and diverge towards the edges,
 * and it is *this* one that decides where a column lands. Using the radial
 * distance stretches the picture outwards — a wide-angle lens that is not the one
 * the field of view asked for.
 *
 * Derived from the hit point rather than from the ray, so it is exact rather than
 * reconstructed from a camera-space product.
 */
export function perpendicularDistance(
  camera: Camera,
  hitX: number,
  hitY: number,
): number {
  return (hitX - camera.posX) * camera.rightX + (hitY - camera.posY) * camera.rightY;
}

/**
 * A ray hit as a screen column: where it is, and how tall.
 *
 * `perpDist` is recomputed rather than taken from the ray, for the reason above.
 * A hit straight ahead has `perpDist` 0 and is infinitely tall — the centre column
 * of an odd-width viewport — and that is a real case, not a division by zero to
 * be guarded: the wall is simply taller than the screen and gets clipped.
 */
export function projectColumn(camera: Camera, hit: RayHit, column: number): WallColumn {
  // The crossing point is carried by the ray rather than re-derived here. The
  // projection is the wrong place to own that arithmetic: a second copy of "where
  // is the face" is a second place for half a tile of error to hide, and half a
  // tile silently thickens every wall in the game.
  const perpDist = perpendicularDistance(camera, hit.hitX, hit.hitY);

  // **The height is divided by the distance from the camera, not by the lateral
  // offset.** These are the same number down the middle of the screen and
  // completely different numbers at the edges, and the difference is the difference
  // between a corridor and a grey wall filling the viewport: the lateral offset of
  // a wall directly ahead is 0, so dividing by it makes that wall infinitely tall
  // — and it is the wall the player is looking at.
  //
  // A raycaster's usual formulation divides by the lateral offset of the ray at
  // that depth, which works only because it offsets the ray's *origin* one unit
  // forward so the number is never zero. Deriving the height from the true
  // distance is both correct and has no special case, which is why there is no
  // ray-origin offset here.
  const pxPerTile = camera.width / (2 * camera.verticalPlaneLength * hit.distance);
  const lineHeight = Math.min(camera.wallHeight * pxPerTile, camera.height * MAX_WALL_SCREEN_HEIGHTS);

  // The horizon is the middle of the screen, and the eye is half a wall up, so the
  // wall is centred on it: a doorway is then a gap in the middle of the wall rather
  // than a hole at the top or the bottom.
  const horizon = camera.height / 2;
  return {
    x: column,
    width: 1,
    top: horizon - lineHeight / 2,
    bottom: horizon + lineHeight / 2,
    // Radial, from the ray: the ray already measured it in tiles, and reusing it
    // keeps the z-buffer in the same units as the billboards that will be tested
    // against it. See `WallColumn.depth`.
    depth: hit.distance,
    perpDist,
    hit,
  };
}

/**
 * Projects every column of a cast, skipping the ones that saw nothing.
 *
 * Returned in ray order, which is *not* draw order. A raycaster walks the screen
 * left to right and the depth jumps around — the middle column is the far wall of
 * the room and the edge columns are the near side walls — so a painter's algorithm
 * needs them sorted far to near. The sort is here rather than in the renderer
 * because this is where the distances are known, and because "the draw list is
 * ordered" is a property worth being able to assert.
 */
export function projectColumns(
  camera: Camera,
  hits: ReadonlyArray<RayHit | null>,
): WallColumn[] {
  const out: WallColumn[] = [];
  for (let column = 0; column < camera.width; column++) {
    const hit = hits[column];
    if (hit === null) continue;
    out.push(projectColumn(camera, hit, column));
  }
  return out;
}

/**
 * Far to near, the order a painter's algorithm needs.
 *
 * Sorts on `depth`, which is radial. Sorting on the signed perpendicular distance
 * instead put every wall left of centre behind every wall right of centre, since
 * negative sorts as "infinitely far" — the picture came out as one half of the
 * room painted over the other.
 */
export function sortFarToNear<T extends { depth: number }>(items: T[]): T[] {
  return items.sort((a, b) => b.depth - a.depth);
}

/** The source column of a wall texture for a given face, in texels. */
export function wallSliceX(hit: RayHit, size: number): number {
  // `side` says which grid line was crossed. A ray travelling east/west crosses an
  // x-face and sees that wall's *side*; north/south crosses a y-face. Which texel
  // of the 32 that is depends on where along the wall the ray landed, and without
  // it every column of a wall shows the same one-pixel stripe — a wall with no
  // texture at all, or worse, one that shimmers as the camera moves.
  //
  // The wall is exactly one tile, so the face spans the full width of the texture
  // and the texel is chosen by the perpendicular position within it. `frac` is the
  // distance along the wall from its near edge, in tiles.
  return Math.min(size - 1, Math.max(0, Math.floor(hit.wallU * size)));
}

/**
 * One textured quad for a projected column.
 *
 * Axis-aligned by construction — a grid raycaster's walls are vertical strips —
 * so the affine basis is the identity case and there is no perspective shear. That
 * is the whole reason this renderer is cheap, and it is why the floor (which *is*
 * sheared) is the expensive part.
 */
export function columnQuad(column: WallColumn, textureSize: number): Quad {
  return {
    imageId: column.hit.imageId,
    x: column.x,
    y: column.top,
    ux: column.width,
    uy: 0,
    vx: 0,
    vy: column.bottom - column.top,
    sx: wallSliceX(column.hit, textureSize),
    sy: 0,
    sw: 1,
    sh: textureSize,
    depth: column.depth,
  };
}

/** How many screen-heights a wall may be projected as before it is clamped. */
const MAX_WALL_SCREEN_HEIGHTS = 64;

/**
 * Where a billboard goes on screen, given where it is in the world.
 *
 * Two distances, and conflating them is the bug: `forward` is along the view axis
 * and is what decides whether the sprite is *in front at all*; `distance` is
 * perpendicular and is what sizes it. A sprite directly ahead has a perpendicular
 * distance of exactly 0, so a guard written on that rejects the single most common
 * case in the game — the thing the player is looking at.
 *
 * Returns null only for something behind the camera, which then cannot be drawn
 * and must not be mirrored onto the far side of the screen.
 */
/** A billboard's screen rectangle, in logical canvas pixels. */
export interface BillboardRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Distance from the camera to the billboard's anchor, in tiles. */
  depth: number;
  /** Signed sideways distance, negative left of centre. */
  perpDist: number;
}

export function billboardRect(
  camera: Camera,
  worldX: number,
  worldY: number,
  spriteHeight: number,
  scale = 1,
): BillboardRect | null {
  const dx = worldX - camera.posX;
  const dy = worldY - camera.posY;
  const forward = dx * camera.dirX + dy * camera.dirY;
  // Zero, not just negative: level with the camera is on the plane through it, and
  // dividing by that puts the sprite at infinity in both directions.
  if (forward <= 0) return null;

  const sideways = dx * camera.rightX + dy * camera.rightY;

  // Screen x: the sideways offset as a fraction of the view plane's half-width at
  // that depth. Zero sideways lands dead centre, which is the common case.
  const screenX = (camera.width / 2) * (1 + sideways / (forward * camera.planeLength));

  // Divided by the distance from the camera, for the same reason a wall's height
  // is: the lateral offset of something directly ahead is 0.
  const pxPerTile = camera.width / (2 * camera.verticalPlaneLength * Math.hypot(sideways, forward));
  const height = spriteHeight * scale * pxPerTile;
  // The floor line is the horizon plus the eye height, at this sprite's distance.
  // Anchoring to the floor rather than centring vertically is what stops a zombie
  // from floating; anchoring to the horizon would make it stand on the horizon
  // instead, which reads as a poster on the far wall.
  const floorY = camera.height / 2 + camera.eyeHeight * pxPerTile;

  return {
    left: screenX - height / 2,
    right: screenX + height / 2,
    top: floorY - height,
    bottom: floorY,
    // Radial, for the same reason and with the same reasoning as a wall's depth:
    // the z-buffer has to compare like with like, and it is compared against
    // distances the raycaster measured radially.
    depth: Math.hypot(sideways, forward),
    perpDist: sideways,
  };
}

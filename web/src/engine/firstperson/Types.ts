import { Direction } from "@engine/Direction";

/**
 * Types shared by the engine and the first-person renderer.
 *
 * DOM-free by construction, like the rest of `engine/`: the modules here take a
 * `Map` and produce geometry, and `ui/firstperson/` does the blitting. That split
 * is what lets the raycaster, the projector and the scene builder be unit-tested
 * in Node, and it is what lets a test rasterise the same draw list the browser
 * blits — which is the whole reason `Quad` lives here rather than in the test
 * helper. Two structurally identical types with no relationship between them
 * would be two coordinate spaces wearing the same name, and the golden image
 * would be testing a lookalike.
 */

/**
 * The view the play screen is drawn in.
 *
 * The values *are* the option, and they are a list that has to be visible from
 * both `OptionsScreen` (for its bounds) and the renderer, so it lives here rather
 * than as an enum declared inside `GameOptions`. Same reasoning, and the same
 * consequence, as `GameOptions.spriteStyle` pointing at `AssetPaths.IMAGE_SETS`
 * rather than keeping a copy of the list: a second list is a second thing to
 * forget to update.
 */
export const VIEW_MODES = ["top-down", "first-person"] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * The default view.
 *
 * Top-down, which is what the C# original draws and therefore what a port
 * should show on a first run. The first-person renderer is a second renderer, not
 * a replacement one, so it is opt-in from the first frame rather than something
 * the player has to switch off.
 */
export const DEFAULT_VIEW_MODE: ViewMode = "top-down";

// ── Geometry ────────────────────────────────────────────────────────────────

/** Wall height in tiles. 1.5, so a one-tile doorway admits the player. */
export const WALL_HEIGHT = 1.5;

/** Eye height in tiles: half a wall, so the horizon bisects it. */
export const EYE_HEIGHT = 0.75;

/**
 * Horizontal field of view, in degrees.
 *
 * Presentation only — `Rules.actorFOV` decides what is actually *visible* and is
 * untouched by this. 100 rather than the genre-standard 90 because rotation is
 * quantised to 45°: at 90° a turn reveals exactly one new compass column, which
 * turns a survey into a slideshow, and at 100° it reveals rather more than one.
 */
export const VIEW_FOV_DEGREES = 100;

/**
 * Where the camera is and what it can see.
 *
 * The basis is derived from a `Direction` rather than from an angle, which is
 * what removes trigonometry from this whole subsystem: `Direction.nx/ny` is
 * already a unit vector, and screen-right is simply its perpendicular. There is
 * no `Math.sin` anywhere in the port and this is why one is not needed here.
 */
export interface Camera {
  /** Camera position in tile coordinates — fractional, so a tile centre is 5.5. */
  readonly posX: number;
  readonly posY: number;
  /** Unit vector the camera looks along. */
  readonly dirX: number;
  readonly dirY: number;
  /** Unit vector to screen-right: the perpendicular, (-dirY, dirX). */
  readonly rightX: number;
  readonly rightY: number;
  /**
   * Tangent of the *half* horizontal field of view.
   *
   * `tan(fov / 2)`, so the total field of view is `2 * atan(planeLength)`.
   *
   * **Not scaled by the viewport width, and not its reciprocal.** Two separate
   * mistakes, both of which produce a plausible picture:
   *
   *  - Scaling by `width / 2` (the first version) makes the *field of view* depend
   *    on how many pixels the canvas has. `cameraX` already runs -1..1 across the
   *    screen, so the width cancels. At 1366px the edges subtended nearly 180° — a
   *    fisheye that only appeared at one window size.
   *  - `1 / tan` (the second version) inverts it, which is the reciprocal of what
   *    a view plane means, and is invisible at 90° because `atan(tan(45°))` and
   *    `atan(1/tan(45°))` are both 45°. Only a field of view that is not 90 tells
   *    the two apart, so the test uses one.
   *
   * A ray is `dir + right * planeLength * cameraX`, whose lateral-to-forward ratio
   * at the screen edge is therefore `planeLength` — the tangent of the half field
   * of view, as it must be.
   */
  readonly planeLength: number;
  /**
   * Tangent of the half *vertical* field of view, derived from the aspect ratio.
   *
   * The horizontal field of view is what the option asks for; the vertical one
   * follows from the panel's shape. Without this the same `planeLength` is used
   * for both axes, and a 864x672 panel is squashed vertically by a third.
   */
  readonly verticalPlaneLength: number;
  /** Height above the floor, in tiles. */
  readonly eyeHeight: number;
  /** Wall height, in tiles. */
  readonly wallHeight: number;
  /** Viewport size, in logical canvas pixels. */
  readonly width: number;
  readonly height: number;
}

/**
 * Builds a camera for a position and a facing.
 *
 * `facing` is a `Direction` and not an angle because rotation is quantised to
 * one eighth of a turn — 45°, which is exactly one step of `Direction.left` /
 * `right` — so the facing is always a `Direction.COMPASS` entry. That is what
 * makes forward movement exact rather than rounded: the direction the player
 * walks in is `facing` itself, never a direction near it.
 */
export function makeCamera(
  posX: number,
  posY: number,
  facing: Direction,
  width: number,
  height: number,
  fovDegrees: number = VIEW_FOV_DEGREES,
): Camera {
  const dirX = facing.nx;
  const dirY = facing.ny;
  const halfFov = (fovDegrees * Math.PI) / 180 / 2;
  return {
    posX,
    posY,
    dirX,
    dirY,
    // The one place the y-down grid has to be respected. `Direction` runs
    // clockwise from north with y increasing downward, so screen-right is the
    // left-hand perpendicular of the forward vector. Taking the other one is the
    // classic raycaster mirror — it looks plausible, and every wall face and
    // every billboard lands on the wrong side.
    rightX: -dirY,
    rightY: dirX,
    planeLength: Math.tan(halfFov),
    // The vertical field of view follows from the aspect ratio rather than being
    // asked for: at a fixed horizontal field of view, a 864x672 panel sees less
    // vertically than it does horizontally, and using one `planeLength` for both
    // squashes the picture by a third.
    verticalPlaneLength: Math.tan(halfFov) * (height / width),
    eyeHeight: EYE_HEIGHT,
    wallHeight: WALL_HEIGHT,
    width,
    height,
  };
}

/**
 * What a ray found.
 *
 * `side` and the normal are both reported because they answer different
 * questions: `side` says which grid line was crossed (and so where the sprite
 * column's slice comes from), the normal says which way the face points.
 */
export interface RayHit {
  /** Distance along the ray, in tiles. Always positive. */
  readonly distance: number;
  /** The tile the ray ended in. */
  readonly mapX: number;
  readonly mapY: number;
  /** 0 = an x-face (normal along ±x), 1 = a y-face. */
  readonly side: 0 | 1;
  /** Face normal, pointing back toward the camera. */
  readonly normalX: number;
  readonly normalY: number;
  /**
   * Where the ray actually crossed the face, in tile coordinates.
   *
   * Not the tile centre, and not reconstructible from `mapX`/`mapY` alone: the
   * face is the *boundary* of the tile the ray entered, and it lies somewhere
   * along it. A wall reconstructed from its tile centre is half a tile too far
   * away, which turns a one-tile corridor into a wider one and every wall
   * thickness into a different thickness.
   */
  readonly hitX: number;
  readonly hitY: number;
  /**
   * Where along the face the ray landed, 0..1, measured along the wall.
   *
   * This is what selects which texel of a wall texture a column shows, and it is
   * the difference between a wall with brickwork and a wall that is a flat colour
   * with one vertical stripe. A y-face runs along x and an x-face runs along y, so
   * it is the fractional coordinate along the running axis — taken from the *tile*
   * origin rather than the crossing point, so the texture is pinned to the wall
   * and does not slide as the camera moves.
   */
  readonly wallU: number;
  /**
   * What stopped the ray.
   *
   *  - `wall`: a tile that is not walkable, or a map object that is not walkable
   *    and not transparent. Drawn as a textured column.
   *  - `object`: a map object that is transparent — an open door, a table. Drawn
   *    as a billboard, not a column. This case is the reason a DDA that
   *    terminates on `isWalkable` alone is wrong: an open door *is* walkable, so
   *    the ray walks through it and the door is never drawn at all.
   *  - `edge`: the ray left the map. Drawn as fog, which is also what a wall the
   *    engine's FOV does not cover must look like.
   */
  readonly surface: "wall" | "object" | "edge";
  /** Image for the face: the map object's if it has one, else the tile's. */
  readonly imageId: string;
  /** True when the engine has this tile in view — the gate on drawing anything. */
  readonly inView: boolean;
}

/** One screen column's worth of wall, after projection. */
export interface WallColumn {
  /** The column's left edge, in logical canvas pixels. */
  readonly x: number;
  /** Width in pixels — normally 1, more where a column is widened for coverage. */
  readonly width: number;
  /** Top and bottom of the column on screen. */
  readonly top: number;
  readonly bottom: number;
  /**
   * Distance from the camera to the face, in tiles.
   *
   * **Radial, not perpendicular.** The two agree down the middle of the screen and
   * differ towards the edges, and they are not interchangeable:
   *
   *  - the *height* of the column comes from the perpendicular distance, because
   *    that is what the projection divides by — and it is **signed**, negative for
   *    every column left of centre, which is most of a wide field of view;
   *  - the *depth* for sorting and the z-buffer has to be the radial distance,
   *    because "which of these two walls is nearer" is not answerable from how far
   *    to the side each one is. Sorting on the signed perpendicular put every
   *    left-hand wall behind every right-hand one.
   *
   * Carrying one number for both is the bug; carrying two with distinct names is
   * the fix.
   */
  readonly depth: number;
  /** Signed perpendicular distance: negative left of centre, positive right. */
  readonly perpDist: number;
  /** The hit this came from, for the texture and the face. */
  readonly hit: RayHit;
}

/**
 * One textured parallelogram — the only drawing primitive this view needs, and
 * the only one both rasterisers implement.
 *
 * P(u, v) = (x, y) + u * (ux, uy) + v * (vx, vy) for u, v in [0, 1], sampling the
 * source rect (sx, sy, sw, sh) of the image. An axis-aligned rectangle is the
 * special case uy = vx = 0, which is how wall columns and billboards are drawn;
 * a sheared one is a floor sub-quad.
 *
 * Not a perspective quad, and that is a constraint rather than a shortcut: it is
 * exactly what `Canvas2D`'s `setTransform` + `drawImage` can express, and the
 * test rasteriser inverse-maps the same affine. So neither implementation can
 * express something the other cannot, and the golden image cannot pass for a
 * renderer the browser would draw differently.
 */
export interface Quad {
  imageId: string;
  x: number;
  y: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Camera-space distance, for the depth test and for fog. */
  depth: number;
  /** Multiplied into the sampled colour; omitted for untinted. */
  tint?: readonly [number, number, number];
}

/**
 * What one frame cost, in the only place a real frame exists.
 *
 * `npm run profile` counts painting calls on `NullRogueUI`, which drops every one
 * of them, so it cannot see a renderer that goes through `UI_DrawScene` at all.
 * The port plan asks for this renderer's cost to be measured rather than guessed at
 * — a mode 7 floor is a per-texel operation and the two candidate answers differed
 * by an order of magnitude — so the measurement is taken here, in the browser,
 * behind `?debug=1`.
 */
export interface SceneRendererStats {
  /** Wall-clock milliseconds for the three phases, summed over `frames`. */
  readonly frameMs: number;
  readonly raycastMs: number;
  readonly buildMs: number;
  readonly drawMs: number;
  readonly frames: number;
  /** `ctx` calls issued per frame, averaged — the proxy for rasterisation cost. */
  readonly drawCallsPerFrame: number;
  /** The scene's own counts, from the last frame built. */
  readonly columns: number;
  readonly wallQuads: number;
  readonly floorQuads: number;
  readonly billboardQuads: number;
  readonly fogColumns: number;
  /** Sprites dropped by the z-buffer, per frame. */
  readonly culledBillboards: number;
  /** Sprites whose image was not loaded yet, per frame. */
  readonly missingImages: number;
}

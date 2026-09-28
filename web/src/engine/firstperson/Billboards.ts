import { Map } from "@data/Map";
import type { Quad, Camera } from "./Types";
import { billboardRect } from "./Projector";

/**
 * Sprites standing in the world: actors, and the map objects big enough to be seen
 * edge-on.
 *
 * Collected in `engine/`, before any UI, so a test can check *which* sprites a
 * camera would draw and in what order without a canvas — and the choice of which is
 * full of rules that are invisible in a picture. A sprite drawn when the engine has
 * not marked its tile in view, for instance, is a player being shown an actor the
 * rules say they cannot see; nothing in the rendered image would say so.
 */

/** How tall a sprite stands, in tiles. */
export const ACTOR_SPRITE_HEIGHT = 1.6;

export interface Billboard {
  readonly quad: Quad;
  /** Radial distance, for the draw order. */
  readonly depth: number;
  /** What this is, for the counts and for debugging a golden. */
  readonly kind: "actor" | "mapObject";
  /** The image it wants; a billboard can be culled if it will not load. */
  readonly imageId: string;
}

/**
 * Every sprite the camera should draw, far to near.
 *
 * The depth test is the whole reason this is not a loop in the renderer. A sprite
 * spanning many screen columns cannot be tested against one wall distance, so it is
 * tested per column against the z-buffer, and a sprite that is *anywhere* behind a
 * wall is dropped. Losing that test is not a subtle error: a zombie would draw
 * through a doorway, from a different room, with the wall still in front of it.
 *
 * `zBuffer` is the per-column wall distance the raycaster produced, so this needs
 * no second cast.
 */
export function collectBillboards(
  map: Map,
  camera: Camera,
  zBuffer: Float32Array,
  spriteHeight: number = ACTOR_SPRITE_HEIGHT,
): { billboards: Billboard[]; culled: number } {
  const out: Billboard[] = [];
  let culled = 0;

  for (const actor of map.actors) {
    // The player is the camera. Drawing a sprite for it would put a picture of the
    // player in front of the player's own eyes, at the near plane, every frame.
    if (actor.isPlayer) continue;

    const pos = actor.location.position;
    if (!map.isInBounds(pos.x, pos.y)) continue;

    // The engine's view, not the renderer's cone. `tile.isInView` is a *circle* of
    // about 9.24 tiles and the camera is a cone, so this gate is what stops first
    // person showing what the top-down view deliberately hides.
    if (!(map.getTileAt(pos.x, pos.y)?.isInView ?? false)) continue;

    // `imageId` is nullable on the model: an actor with no sprite is a data
    // problem, not a crash, and dropping it is better than drawing a hole.
    const imageId = actor.model.imageId;
    if (imageId == null || imageId === "") continue;

    const rect = billboardRect(
      camera,
      pos.x + 0.5,
      pos.y + 0.5,
      spriteHeight,
    );
    if (rect === null) continue;

    // Cull against the z-buffer: the sprite must be nearer than the wall in every
    // column it covers, or there is nothing to draw.
    if (!isUnoccluded(rect.left, rect.right, rect.depth, zBuffer)) {
      culled++;
      continue;
    }

    out.push({
      kind: "actor",
      imageId,
      depth: rect.depth,
      quad: {
        imageId,
        x: rect.left,
        y: rect.top,
        ux: rect.right - rect.left,
        uy: 0,
        vx: 0,
        vy: rect.bottom - rect.top,
        // The whole 32x32 cell: the sprite is authored with the figure standing at
        // the bottom, so the destination's bottom edge is the floor line the
        // projection already put it on.
        sx: 0, sy: 0, sw: 32, sh: 32,
        depth: rect.depth,
      },
    });
  }

  return { billboards: out, culled };
}

/**
 * Whether a billboard at `depth` is in front of the walls in every column it spans.
 *
 * Compares radial distances, which is the standard approximation: the exact test is
 * along each column's own ray, and the error is a fraction of a tile at the screen
 * edge. Being slightly conservative — culling a sprite that is a hair too far — is
 * the right direction to be wrong in, since the alternative is a sprite punching
 * through a doorframe.
 *
 * A column with no wall in it is `Infinity` and never culls, which is what makes a
 * sprite visible down an open corridor.
 */
export function isUnoccluded(left: number, right: number, depth: number, zBuffer: Float32Array): boolean {
  const from = Math.max(0, Math.floor(left));
  const to = Math.min(zBuffer.length - 1, Math.ceil(right) - 1);
  if (to < from) return false;
  for (let column = from; column <= to; column++) {
    if (depth >= zBuffer[column]!) return false;
  }
  return true;
}

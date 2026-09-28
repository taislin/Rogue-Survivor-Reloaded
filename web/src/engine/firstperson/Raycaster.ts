import { Map } from "@data/Map";
import { Camera, RayHit } from "./Types";

/**
 * A grid raycaster: one DDA per screen column, no perspective maths.
 *
 * It works because of a property of the world's generation that is easy to miss
 * and expensive to rediscover: **walls are exactly one tile thick.**
 * `MapGenerator.tileRectangle` fills a four-line *outline*, not a band, so no ray
 * that starts in walkable space can ever reach the back of a wall or an interior
 * face. The face a ray hits is therefore derivable from the grid line it crossed
 * and the direction of travel, and no autotiling, no per-face data and no
 * neighbour inspection is needed — which is usually the thing that makes a grid
 * raycaster expensive.
 *
 * DOM-free and taking a `Map`, so every case below is a unit test.
 */

/** How many tiles a ray may cross before giving up. */
export const MAX_RAY_DISTANCE = 64;

/**
 * Traces one ray to the first thing it cannot see past.
 *
 * Standard DDA — step to whichever axis boundary is nearer, then the other — but
 * written against a **y-down** grid, which is the one place a raycaster ported
 * from the usual tutorials goes wrong. In y-up the step signs follow from the ray
 * components directly; here north is negative y, so `stepY` is negative for any
 * ray with a northward component. The signs are derived from the components
 * rather than assumed, so the grid orientation cannot leak in.
 *
 * `maxDistance` is in tiles along the ray, not in steps: a ray at 45° crosses a
 * cell every 0.707 tiles but a ray along an axis every tile, so bounding the step
 * count instead would clip shallow angles short.
 */
export function castRay(
  map: Map,
  posX: number,
  posY: number,
  rayX: number,
  rayY: number,
  maxDistance: number = MAX_RAY_DISTANCE,
): RayHit | null {
  if (rayX === 0 && rayY === 0) return null;

  // Normalised here rather than demanded of the caller.
  //
  // The DDA advances by `1 / |rayComponent|`, which measures the ray *parameter*,
  // not distance — they are the same only for a unit vector. `castColumns` cannot
  // supply one: an edge ray is `dir + right * planeLength * cameraX`, and with
  // the default 100° field of view `planeLength` is 0.84, so the vector's length
  // ranges from 1 in the middle of the screen to 1.31 at the edges. Left
  // unnormalised, every `distance` came out scaled by that factor — a wall at the
  // edge of the screen projecting as if it were a third further away than it is,
  // which is a fisheye in the one place nothing else would notice.
  //
  // It also keeps `distance` meaning one thing everywhere. The projector still
  // derives the *perpendicular* distance from the hit point, because that, not
  // the radial distance, is what decides where a column lands on screen — but
  // the two were silently different units here, which is precisely how a
  // plausible default becomes a wrong value.
  const length = Math.hypot(rayX, rayY);
  rayX /= length;
  rayY /= length;

  let mapX = Math.floor(posX);
  let mapY = Math.floor(posY);

  const deltaX = rayX === 0 ? Infinity : Math.abs(1 / rayX);
  const deltaY = rayY === 0 ? Infinity : Math.abs(1 / rayY);

  // Distance along the ray to the next x boundary and the next y boundary. The
  // first cell is the one the camera stands in, which is walkable by definition,
  // so the initial value is measured from the *near* edge in the direction of
  // travel — 1 - frac for a positive component, frac for a negative one.
  const fracX = posX - mapX;
  const fracY = posY - mapY;
  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;
  if (rayX < 0) {
    stepX = -1;
    sideDistX = fracX * deltaX;
  } else {
    stepX = 1;
    sideDistX = (1 - fracX) * deltaX;
  }
  if (rayY < 0) {
    stepY = -1;
    sideDistY = fracY * deltaY;
  } else {
    stepY = 1;
    sideDistY = (1 - fracY) * deltaY;
  }

  let side: 0 | 1 = 0;
  let distance = 0;

  // Bounded by distance rather than by a step count, and the bound is inclusive:
  // a wall exactly `maxDistance` tiles away is still a wall the player can see.
  while (distance <= maxDistance) {
    if (sideDistX < sideDistY) {
      distance = sideDistX;
      sideDistX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      distance = sideDistY;
      sideDistY += deltaY;
      mapY += stepY;
      side = 1;
    }
    if (distance > maxDistance) break;

    const hit = surfaceAt(map, mapX, mapY);
    if (hit !== null) {
      // The crossing is on the *boundary* of the tile just entered, so its moving
      // coordinate comes from the ray and its fixed one from the grid line. Both
      // are recorded rather than reconstructed by the projector, because a
      // projection that has to re-derive the hit point is a second place for the
      // same arithmetic to go wrong — and half a tile of error there silently
      // thickens every wall.
      const hitX = side === 0 ? mapX + 0.5 - stepX * 0.5 : posX + distance * rayX;
      const hitY = side === 1 ? mapY + 0.5 - stepY * 0.5 : posY + distance * rayY;
      return {
        distance,
        mapX,
        mapY,
        side,
        normalX: side === 0 ? -stepX : 0,
        normalY: side === 1 ? -stepY : 0,
        hitX,
        hitY,
        // An x-face runs along y and a y-face along x. Taken from the tile origin
        // so the texture is fixed to the wall, not to the ray: a value derived
        // from the crossing point alone would make the brickwork crawl as the
        // player turns.
        wallU: side === 0 ? hitY - mapY : hitX - mapX,
        surface: hit.surface,
        imageId: hit.imageId,
        // The engine's FOV, not the renderer's cone. A wall the ray reaches but
        // the player cannot *see* must be drawn as fog rather than as its
        // texture, or first person shows the player things the top-down view
        // deliberately hides — the whole of the dark, and a slice of every
        // nighttime map.
        inView: !map.isInBounds(mapX, mapY) || (map.getTileAt(mapX, mapY)?.isInView ?? false),
      };
    }
  }
  return null;
}

interface Surface {
  surface: RayHit["surface"];
  imageId: string;
}

/**
 * What a tile offers a ray, or null for "nothing here".
 *
 * The three cases are the ones that make a DDA total, and getting the second one
 * wrong is a bug that is easy to ship: a map object that is transparent is
 * *walkable*, so a raycaster terminating on `isWalkable` alone walks straight
 * through an open door and never draws it. A closed door is not walkable, so it
 * stops the ray and needs no special case at all — doors only need handling while
 * open.
 */
function surfaceAt(map: Map, x: number, y: number): Surface | null {
  if (!map.isInBounds(x, y)) return { surface: "edge", imageId: "" };

  const obj = map.getMapObjectAt(x, y);
  if (obj != null) {
    if (!obj.isWalkable) {
      // Blocking and opaque: a wall, a closed door, a gate. Drawn as a column.
      return { surface: "wall", imageId: obj.imageId };
    }
    if (obj.isTransparent) {
      // Walkable but see-through: an open door, a table. Drawn as a billboard.
      return { surface: "object", imageId: obj.imageId };
    }
  }

  const tile = map.getTileAt(x, y);
  if (tile == null) return { surface: "edge", imageId: "" };
  if (!tile.model.isWalkable) return { surface: "wall", imageId: tile.model.imageId };
  return null;
}

/**
 * Traces one ray per screen column.
 *
 * `width` rays, not `width` rays plus extras: a column is one pixel wide, and
 * widening columns to cover seams is the projector's job because only it knows
 * the projection.
 *
 * Results are in draw order — far to near — because that is the order a painter's
 * algorithm needs and sorting a few hundred columns per frame in the renderer
 * would be a sort nobody can see the point of.
 */
export function castColumns(
  map: Map,
  camera: Camera,
  maxDistance: number = MAX_RAY_DISTANCE,
): Array<RayHit | null> {
  const out: Array<RayHit | null> = new Array(camera.width);
  for (let column = 0; column < camera.width; column++) {
    // -1 at the left edge, +1 at the right: the screen coordinate across the view
    // plane, scaled so the plane's own half-width is one unit.
    const cameraX = (2 * column) / camera.width - 1;
    out[column] = castRay(
      map,
      camera.posX,
      camera.posY,
      camera.dirX + camera.rightX * camera.planeLength * cameraX,
      camera.dirY + camera.rightY * camera.planeLength * cameraX,
      maxDistance,
    );
  }
  return out;
}

/**
 * The farthest visible wall distance per column, as a z-buffer.
 *
 * A billboard is a single quad spanning many columns, so it cannot be tested
 * against one distance. This is the per-column array it is tested against, and
 * returning it separately keeps the billboard pass from having to re-derive the
 * walls.
 */
export function columnDistances(hits: ReadonlyArray<RayHit | null>): Float32Array {
  const out = new Float32Array(hits.length);
  for (let i = 0; i < hits.length; i++) {
    out[i] = hits[i]?.distance ?? Infinity;
  }
  return out;
}

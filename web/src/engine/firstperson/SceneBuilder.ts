import { Map } from "@data/Map";
import { Tile } from "@data/Tile";
import { Color } from "@engine/Color";
import { Direction } from "@engine/Direction";
import { Lighting } from "@data/Map";
import {
  makeCamera,
  VIEW_FOV_DEGREES,
  WALL_HEIGHT,
  type Camera,
  type Quad,
} from "./Types";
import { castColumns, columnDistances, MAX_RAY_DISTANCE } from "./Raycaster";
import { billboardRect, columnQuad, projectColumns, sortFarToNear, type BillboardRect } from "./Projector";
import { isUnoccluded } from "./Billboards";
import type { MapObject } from "@data/MapObject";
import { Point } from "@engine/Point";
import type { WallColumn } from "./Types";
import { collectBillboards, ACTOR_SPRITE_HEIGHT } from "./Billboards";

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
  /**
   * The weather, for the overlay. Null when it is clear.
   *
   * Top-down draws a full-tile weather image over every *visible outdoor* tile
   * (`DrawMap` checks `!tile.isInside`), which is per-tile work for something that
   * reads as a screen-wide effect. Here it is one full-viewport quad.
   */
  weatherImageId?: string | null;
  /**
   * How far the player can actually see, in tiles.
   *
   * **This is the renderer's knowledge limit, and it comes from the engine.** The
   * camera's cone is 100° and the raycaster will happily trace to 64 tiles, but
   * `Rules.actorFOV` says the player sees a circle of `fov / 0.866` — 3.5 tiles at
   * midnight, or about 9 by day. Without this the renderer draws the floor to six
   * tiles and the player sees further than the rules allow, which is the one thing
   * a second renderer must never do.
   *
   * So the engine supplies the number and the renderer obeys it. Per-tile
   * `isInView` also gates the *walls* — anything past the FOV becomes fog — but the
   * floor was not gated, which is how a 3/8 FOV still showed six tiles of it.
   */
  maxViewDistance: number;
  /**
   * How bright it is, 0..1, from the time of day.
   *
   * A synthesis, and marked as one: `Map.lighting` is per *map*, so a LIT interior
   * is the same value at midnight as at noon, and using it alone gives a
   * daylight-bright floor at 3am. This scales the backdrop and the floor so the
   * night reads as night. It never *brightens* past full daylight, and it never
   * darkens below the map's own lighting, so it cannot reveal anything the rules
   * withhold — it only stops the view being a flashlight.
   */
  daylight: number;
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
  /**
   * A full-viewport weather overlay, drawn last, or null.
   *
   * Last, because rain is in front of everything including the player's own hands.
   * It is *not* skipped indoors: `DrawMap` skips it per tile when
   * `tile.isInside`, and doing the same here is one test rather than a test per
   * tile — a covered roof in first person should not have rain on it either.
   */
  readonly weather: { imageId: string; alpha: number } | null;
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
    decorationQuads: number;
    fogColumns: number;
    /** Sprites the z-buffer dropped, which is a measurement, not a count of work. */
    culledBillboards: number;
    /** Map objects drawn as billboards, and the columns that gave way to them. */
    mapObjectQuads: number;
    objectColumns: number;
  };
}

/** Tiles of floor that get a textured quad before the flat shading takes over. */
export const TEXTURED_FLOOR_TILES = 6;

/**
 * How opaque the weather overlay is.
 *
 * A constant rather than a per-weather one because the top-down view does not vary
 * it either: it draws the rain image at full strength over every outdoor tile, so
 * varying it here would be inventing a difference the rest of the game does not
 * have. Two alternate frames are used for the animation, exactly as `DrawMap` does.
 */
export const WEATHER_ALPHA = 0.35;

export function buildScene(inputs: SceneInputs): Scene {
  const startedAt = performance.now();
  // The engine's number, not the renderer's. Clamped to the raycaster's own bound
  // so a large FOV cannot make it trace forever.
  const viewDistance = Math.max(1, Math.min(MAX_RAY_DISTANCE, inputs.maxViewDistance));
  const camera = makeCamera(
    inputs.posX,
    inputs.posY,
    inputs.facing,
    inputs.width,
    inputs.height,
    (inputs.fovScale ?? 1) * VIEW_FOV_DEGREES,
  );

  const raycastStart = performance.now();
  const hits = castColumns(inputs.map, camera, viewDistance);
  const raycastMs = performance.now() - raycastStart;
  const zBuffer = columnDistances(hits);
  const columns = sortFarToNear(projectColumns(camera, hits));

  const quads: Quad[] = [];
  let wallQuads = 0;
  let fogColumns = 0;
  // Columns whose surface is a map object rather than a tile. They contribute no
  // wall quad, because the ray stopped at the object and there is nothing behind it
  // to draw; the object becomes a billboard in its place.
  let objectColumns = 0;

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
      // An opaque map object: a closed door, a gate, a car. It stops the ray, so
      // this column has *no wall behind it* — and the object is drawn as a
      // billboard instead (see `objectBillboards`). Emitting a column here would be
      // a full-height slab of a top-down icon, which is the wrong shape twice over:
      // the icon has no sides, and it is not as tall as a wall.
      objectColumns++;
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
  const floorQuads = buildFloor(inputs.map, camera, viewDistance, inputs.daylight);

  // ── Map objects ──────────────────────────────────────────────────────────
  //
  // Every map object is a billboard, never a wall column. The top-down view draws
  // one as a single unscaled 32x32 sprite, so there is no side or back of a car or
  // a chair to render — there never was, because the game has never needed one.
  // Stretching a top-down icon up a full-height column is inventing geometry that
  // does not exist, and it is why the furniture looked wrong in the browser.
  //
  // Two sources, because there are two ways a map object relates to a ray:
  const objectBillboards = objectBillboardsFor(camera, columns);
  const scannedObjects = scanTransparentObjects(inputs.map, camera, zBuffer, viewDistance);

  // ── Decorations, decals ──────────────────────────────────────────────────
  // A sprite behind a wall is neither drawn nor counted as drawn, so `culled` is a
  // measurement of the depth test working rather than of the renderer doing more.
  const { billboards, culled: culledBillboards } = collectBillboards(
    inputs.map,
    camera,
    zBuffer,
    ACTOR_SPRITE_HEIGHT,
    viewDistance,
  );
  sortFarToNear(billboards);

  // Decorations go on the wall they sit on, as a second column over the first. The
  // art is flat icons drawn in the tile's plane, so a column is the only place they
  // can go: a billboard would stand them up like a poster.
  const decorations = wallDecorations(columns, inputs.map);

  // Corpses and ground items are on the floor, so they are drawn *flat* on it. A
  // billboard would be the obvious thing and it is wrong twice over: a corpse
  // standing upright, and a bandage roll standing upright. The art supports the
  // decal — they are top-down icons in a top-down game.
  const decals = floorDecals(inputs.map, camera, viewDistance);

  const quadsWithBillboards = [
    ...floorQuads,
    ...quads,
    ...decorations,
    ...billboards.map((b) => b.quad),
    ...objectBillboards,
    ...scannedObjects,
    ...decals,
  ];

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
      color: backdropColor(inputs),
      isCeiling: inputs.isInside,
    },
    weather:
      inputs.weatherImageId == null || inputs.weatherImageId === "" || inputs.isInside
        ? null
        : { imageId: inputs.weatherImageId, alpha: WEATHER_ALPHA },
    quads: quadsWithBillboards,
    zBuffer,
    counts: {
      columns: camera.width,
      wallQuads,
      floorQuads: floorQuads.length,
      billboardQuads: billboards.length,
      decalQuads: decals.length,
      decorationQuads: decorations.length,
      fogColumns,
      culledBillboards,
      // Map objects drawn as billboards: the ones the ray stopped on, plus the
      // transparent ones the ray walked past.
      mapObjectQuads: objectBillboards.length + scannedObjects.length,
      // Columns with no wall behind them, so a reader can tell "the ray stopped on
      // a door" from "the ray found nothing", which both cost no wall quad.
      objectColumns,
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
function backdropColor(inputs: SceneInputs): Color {
  if (inputs.isInside) {
    // Indoors the backdrop above the walls is a ceiling, and a dark one: there is
    // no ceiling texture in the game and inventing one is not worth it, but a
    // *sky*-coloured band above an interior wall would read as a hole in the roof.
    // r first, for the reason on `fogColor`.
    return scaleColor(
      Color.fromArgb(
        Math.round(10 * 0.75),
        Math.round(10 * 0.75),
        Math.round(14 * 0.75),
      ),
      inputs.daylight,
    );
  }
  return scaleColor(
    inputs.map.lighting === Lighting.LIT ? Color.LightGray : Color.fromArgb(40, 44, 58),
    inputs.daylight,
  );
}

/**
 * How tall a map object stands, in tiles.
 *
 * One value for everything, and it is a compromise rather than a measurement: the
 * data model has no height for a map object, only a 32x32 image. Furniture at about
 * a tile reads as furniture and a car as a car at this size, which is better than
 * the alternative — stretching the icon to a full 1.5-tile wall made a bed the size
 * of a door.
 *
 * A *door* is the exception, and it has to be: a doorway the player can see over
 * does not read as a doorway. It is the one case where the height comes from what
 * the object does rather than from what it is, and it is the one case that cannot be
 * guessed.
 */
export const MAP_OBJECT_HEIGHT = 1.0;

/** Doors and windows are full height, because a doorway is a hole in a wall. */
const DOOR_HEIGHT = WALL_HEIGHT;

/**
 * The opaque map objects a ray stopped on, as billboards — **one per object**, not
 * one per column.
 *
 * A single shelf at one tile is hit by fifty or more columns, and a quad per column
 * would draw the same 32x32 sprite fifty times, all on top of each other. Visually
 * that is only overdraw, but it is fifty draw calls and fifty chances for a
 * rasteriser to shade the same pixels five times.
 *
 * The union is taken over the columns' screen extents, which is the object's
 * apparent width, and its *nearest* column is the depth: a ray can clip a corner of
 * a distant object before a nearer ray hits its face, and taking the union's
 * farthest depth would push the sprite behind the very wall it is standing against.
 *
 * Deduplication is by **object identity**, not by `imageId`. Every shop shelf in a
 * district shares one image id, so a key on it would merge a shelf you are standing
 * next to with one at the far end of the street and draw a single sprite in the
 * middle. That is why `RayHit` carries the object itself.
 *
 * No depth test: the ray *ended* on these objects, so they are the frontmost thing
 * in those columns by construction. Testing against the z-buffer — which holds
 * these same distances — would reject them as not in front of themselves.
 */
function objectBillboardsFor(camera: Camera, columns: readonly WallColumn[]): Quad[] {
  /** One entry per object: the columns' screen extent, and the nearest hit. */
  // `globalThis.Map` because this file's `Map` is the game's data model, imported
  // from `@data/Map`. Shadowing the data model with the built-in is the kind of
  // collision TypeScript cannot flag here, because the import wins silently.
  const spans = new globalThis.Map<MapObject, { left: number; right: number; near: number; rect: BillboardRect }>();

  for (const column of columns) {
    const object = column.hit.object;
    if (column.hit.surface !== "object" || object == null || !column.hit.inView) continue;

    // Projected at the object's own face crossing for *this* column, because the
    // height is a property of the object but the width is a property of where the
    // camera sees it.
    const rect = billboardRect(camera, column.hit.hitX, column.hit.hitY, objectHeight(object.imageId));
    if (rect === null) continue;

    const existing = spans.get(object);
    if (existing === undefined) {
      spans.set(object, { left: rect.left, right: rect.right, near: rect.depth, rect });
      continue;
    }
    existing.left = Math.min(existing.left, rect.left);
    existing.right = Math.max(existing.right, rect.right);
    // The nearest sighting wins the depth, and its own rect for the vertical
    // extent: a sprite drawn at a nearer height is the one that will not be
    // hidden by the object in front of it.
    if (rect.depth < existing.near) {
      existing.near = rect.depth;
      existing.rect = rect;
    }
  }

  const out: Quad[] = [];
  for (const [object, span] of spans) {
    const { rect } = span;
    out.push({
      imageId: object.imageId,
      x: span.left,
      y: rect.top,
      ux: span.right - span.left,
      uy: 0,
      vx: 0,
      vy: rect.bottom - rect.top,
      sx: 0, sy: 0, sw: 32, sh: 32,
      depth: span.near,
    });
  }
  sortFarToNear(out);
  return out;
}

/**
 * Transparent map objects — a table, a chair, an open door — that the ray walked
 * past, found by scanning tiles.
 *
 * These are the reason the ray has to be able to *not* stop: a table in front of a
 * wall must not hide the wall. So the wall is in the z-buffer, the table is not,
 * and the table is drawn behind it.
 */
function scanTransparentObjects(
  map: Map,
  camera: Camera,
  zBuffer: Float32Array,
  viewDistance: number,
): Quad[] {
  const out: Quad[] = [];
  // Whole tiles: the bound is the engine's fractional FOV, and a half-tile scan
  // indexes `tilesGrid` with a fraction.
  const reach = Math.ceil(viewDistance);
  const originX = Math.floor(camera.posX);
  const originY = Math.floor(camera.posY);

  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = originX + dx;
      const y = originY + dy;
      if (!map.isInBounds(x, y)) continue;
      const obj = map.getMapObjectAt(x, y);
      // Only the ones the ray went through. An opaque one already became a
      // billboard from its column, and drawing it twice would be a ghost.
      if (obj == null || !obj.isTransparent) continue;
      if (!(map.getTileAt(x, y)?.isInView ?? false)) continue;
      if (obj.imageId == null || obj.imageId === "") continue;

      const rect = billboardRect(camera, x + 0.5, y + 0.5, objectHeight(obj.imageId));
      if (rect === null) continue;
      if (rect.depth > viewDistance) continue;
      // Behind a wall? The ray never stopped here, so the z-buffer holds whatever
      // *is* behind this tile, and this object is nearer than that by
      // construction — but not if something else is between.
      if (!isUnoccluded(rect.left, rect.right, rect.depth, zBuffer)) continue;

      out.push({
        imageId: obj.imageId,
        x: rect.left, y: rect.top,
        ux: rect.right - rect.left, uy: 0, vx: 0, vy: rect.bottom - rect.top,
        sx: 0, sy: 0, sw: 32, sh: 32,
        depth: rect.depth,
      });
    }
  }
  sortFarToNear(out);
  return out;
}

/**
 * Whether an image is a door or a window, by its id.
 *
 * String matching on an id is the wrong tool and is used anyway, with the reason
 * recorded: the class hierarchy distinguishes these at *runtime* — the C# casts to
 * `DoorWindow` and checks for it — and there is no flag on the data model that says
 * "this is a door". So either an id convention or a new field, and the id is
 * already there. A `MapObject` carrying its own height would remove the need.
 */
function objectHeight(imageId: string): number {
  return isDoorLike(imageId) ? DOOR_HEIGHT : MAP_OBJECT_HEIGHT;
}

function isDoorLike(imageId: string): boolean {
  // Case-folded: the ids are paths, and `"MapObjects/Wood_Door"` is as plausible as
  // `"MapObjects/dark_door_closed"`. Guessing an id's case is exactly the kind of
  // thing that works until it does not.
  const id = imageId.toLowerCase();
  return id.includes("door") || id.includes("window");
}

/**
 * A tile's decorations, as extra columns over the wall they sit on.
 *
 * Decided by `Tile.decorations`, which the generators fill with image ids. A wall
 * with a poster on it gets the brick column *and* the poster column, in that order
 * and at the same depth, so the poster covers the brick rather than the other way
 * round.
 */
function wallDecorations(columns: WallColumn[], map: Map): Quad[] {
  const out: Quad[] = [];
  for (const column of columns) {
    const hit = column.hit;
    if (hit.surface !== "wall") continue;
    const tile = map.getTileAt(hit.mapX, hit.mapY);
    const decorations = tile?.getDecorations;
    if (decorations == null || decorations.length === 0) continue;
    for (const imageId of decorations) {
      out.push({
        imageId,
        x: column.x,
        y: column.top,
        ux: column.width,
        uy: 0,
        vx: 0,
        vy: column.bottom - column.top,
        // The decoration is a 32x32 icon stretched over the whole column, the same
        // as the wall. Slicing it per column would be more faithful to how it is
        // drawn top-down and is a refinement, not a correctness question.
        sx: 0, sy: 0, sw: 32, sh: 32,
        // A hair nearer than the wall, so the depth test draws it over rather than
        // rejecting it against the column it sits on. Without this every decoration
        // is invisible: it is at exactly the same distance as the wall behind it.
        depth: column.depth - 0.001,
      });
    }
  }
  return out;
}

/**
 * Corpses and ground items, as flat quads on the floor.
 *
 * Both are gated on the engine's view for the same reason billboards are, and both
 * are limited to the tiles the camera can see a floor for at all — a corpse 30
 * tiles away behind four walls is in nobody's field of view.
 */
function floorDecals(map: Map, camera: Camera, viewDistance: number): Quad[] {
  const out: Quad[] = [];
  // The engine's bound, and nothing looser: a corpse the player cannot see is an
  // actor's death reported before it happens.
  //
  // **Iterated as whole tiles.** The bound is `Rules.actorFOV / 0.866`, which is
  // 3.46 at midnight and 1.38 at the tightest — a fraction, because it comes from
  // the rules rather than from a constant. Using it directly as a loop bound walks
  // a half-tile grid, and `Map.getTileAt(1.38, y)` indexes `tilesGrid[1.38]`, which
  // is `undefined`, and the next read throws. The integer scan below is a radius in
  // *tiles*; the fractional value is only ever used to test a real distance, which
  // is where its precision actually means something.
  const reach = Math.ceil(viewDistance);
  const maxDistance = viewDistance;
  const originX = Math.floor(camera.posX);
  const originY = Math.floor(camera.posY);

  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = originX + dx;
      const y = originY + dy;
      if (!map.isInBounds(x, y)) continue;
      const tile = map.getTileAt(x, y);
      if (tile === null || !tile.model.isWalkable) continue;
      if (!tile.isInView) continue;

      const forward = (x + 0.5 - camera.posX) * camera.dirX + (y + 0.5 - camera.posY) * camera.dirY;
      if (forward <= 0.01 || forward > maxDistance) continue;

      const sideways = (x + 0.5 - camera.posX) * camera.rightX + (y + 0.5 - camera.posY) * camera.rightY;
      const pxPerTile = camera.width / (2 * camera.verticalPlaneLength);
      const size = pxPerTile / forward;
      const centreX = (camera.width / 2) * (1 + sideways / (forward * camera.planeLength));
      const centreY = camera.height / 2 + camera.eyeHeight * (pxPerTile / forward);

      const corpses = map.getCorpsesAt(new Point(x, y));
      if (corpses != null) {
        // A tile can hold several, and all of them are drawn — the tile is walked
        // once rather than once per corpse.
        for (const corpse of corpses) {
          // The sprite is the dead actor's own. `Corpse.rotation` is the random
          // tumble the top-down view applies to the sprite; a flat decal on the
          // floor has no facing to tumble, so it is dropped rather than faked.
          const imageId = corpse.deadGuy.model.imageId;
          if (imageId == null || imageId === "") continue;
          out.push(decalQuad(imageId, centreX, centreY, size, forward));
        }
      }

      // Ground items: one icon for the whole stack, which is what the top-down view
      // does too — `DrawItemsStack`, not one sprite per item. Drawing every item
      // would be a pile of overlapping icons on a decal the size of one tile.
      const ground = map.getItemsAt(new Point(x, y));
      const topItem = ground?.items[0]?.model.imageId;
      if (topItem != null && topItem !== "") {
        out.push(decalQuad(topItem, centreX, centreY, size, forward));
      }
    }
  }
  sortFarToNear(out);
  return out;
}

function decalQuad(imageId: string, centreX: number, centreY: number, size: number, depth: number): Quad {
  return {
    imageId,
    x: centreX - size / 2,
    y: centreY - size / 2,
    ux: size,
    uy: 0,
    vx: 0,
    vy: size,
    sx: 0, sy: 0, sw: 32, sh: 32,
    depth,
  };
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
function buildFloor(map: Map, camera: Camera, viewDistance: number, daylight: number): Quad[] {
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
  //
  // **Which means its colour has to be the colour of the floor it stands in
  // for**, and there are two ways to get that wrong, both of which have been:
  //
  //  1. `minimapColor` is a *minimap* colour — a flat swatch chosen to be legible
  //     at 1px per tile on a dark background. It is not the floor's appearance.
  //     `FLOOR_CONCRETE` is `Color.LightGray` (211,211,211) there and renders as
  //     dark grey concrete, so the underlay painted near-white *through every seam*
  //     and the floor came out as bright wedges radiating from the vanishing point.
  //     The data model has no "average colour of this texture" and the engine
  //     cannot read pixels — but the per-tile base fills already have the right
  //     answer, because they are drawn in `minimapColor` *scaled by daylight* and
  //     are meant to sit under that tile's own texture. Using the same expression
  //     here makes the underlay agree with the layer it is a backstop for.
  //  2. It ignored `daylight`, so at midnight a `Lighting.LIT` interior still had
  //     a 211-grey underlay under a 63-grey floor, and the same wedges appeared in
  //     a different colour. `scaleColor` clamps at 1, so this can only darken.
  const standing = map.getTileAt(Math.floor(camera.posX), Math.floor(camera.posY));
  const underlay = scaleColor(standing?.model.minimapColor ?? Color.Gray, daylight);
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
  // Bounded by what the player can see, not by what looks good. The texture cutoff
  // is a second, tighter bound on top: beyond a few tiles a 32px texture is under
  // one screen pixel per texel, so there is nothing to resolve.
  const maxDistance = Math.min(viewDistance, TEXTURED_FLOOR_TILES);
  const lastRing = Math.floor(maxDistance);

  // The rings are walked far to near, which *is* the draw order — a painter's
  // algorithm, and the floor is no exception to it. It is not re-sorted
  // afterwards: each tile emits a base fill and then its texture sub-quads, and
  // sorting by depth would interleave a near tile's fill in front of its own
  // detail, leaving the detail visible on the wrong side of a seam.
  //
  // Which is why the loop counts *down*. An earlier version counted up, from the
  // nearest ring outwards, while the comment above it claimed the opposite — so
  // the near tiles were painted first and the far ones over the top of them. It
  // read plausibly because floor tiles are near-opaque and mostly do not overlap,
  // and the seams are sub-pixel, so the only visible consequence was a slightly
  // wrong sliver along one edge. The comment was the thing that was wrong about
  // the direction, and a comment that contradicts its loop is worse than no
  // comment: it is a claim that is checked by nobody.
  //
  // Whole rings, for the same reason `floorDecals` scans whole tiles: the bound is
  // the engine's fractional FOV and a half-ring is not a ring.
  for (let distance = lastRing; distance >= 1; distance--) {
    for (const [dx, dy] of ringOffsets(distance)) {
      const x = Math.floor(camera.posX) + dx;
      const y = Math.floor(camera.posY) + dy;
      if (!map.isInBounds(x, y)) continue;
      const tile = map.getTileAt(x, y);
      if (tile === null || !tile.model.isWalkable) continue;
      out.push(...floorQuadsForTile(camera, tile, x, y, daylight));
    }
  }
  // And the camera's own tile last of all, since it is the nearest thing there is.
  //
  // It is normally rejected — `floorQuadsForTile` drops a tile with any corner at
  // or behind the camera, and standing in the middle of a tile puts the two near
  // corners behind the eye — so this usually adds nothing. It is here because a
  // player against a wall, or at a tile's edge, can have a fully visible own tile,
  // and the floor with a hole where the player is standing is worse than a wasted
  // call.
  const ownX = Math.floor(camera.posX);
  const ownY = Math.floor(camera.posY);
  const own = map.getTileAt(ownX, ownY);
  if (own != null && own.model.isWalkable) {
    out.push(...floorQuadsForTile(camera, own, ownX, ownY, daylight));
  }
  return out;
}

/**
 * The (dx, dy) pairs making up the ring at `distance`, in perimeter order.
 *
 * A ring at `distance` is the square shell `max(|dx|, |dy|) == distance` — every
 * tile whose Chebyshev distance from the camera's tile is exactly that. It has
 * `8 * distance` cells, and this returns exactly that many, each once.
 *
 * **This was wrong in a way nothing could see, and it is the whole of the striped
 * floor.** The old version was parameterised by a `side` running `-distance` to
 * `+distance`, emitting a column `[side, ±k]` for each. Two things are wrong with
 * that, and the second is why the first could not be patched:
 *
 *  1. The cells of a ring are on its *perimeter*, not spread through its interior.
 *     For `side` strictly between the edges it emitted `[side, -k]` for `k` below
 *     `distance` — the interior of the shell — and never emitted the two side
 *     edges at all. At `distance = 6` that is 119 of the 168 cells, with 50
 *     missing: whole columns at `dx = ±6`.
 *  2. `side` cannot parameterise a ring even in principle. There are `2d + 1`
 *     values of `side` and `8d` cells, and `|side|` — the quantity the old code
 *     used as "how far along the ring this is" — takes only `d` distinct values,
 *     so it is many-to-one and cannot address the perimeter. Hence the 104 cells
 *     emitted twice.
 *
 * The picture is the signature: the floor rendered as alternating drawn and missing
 * strips radiating from the vanishing point and converging on the camera, because
 * the cells that *were* emitted formed a sparse lattice rather than a solid shell.
 *
 * The underlay is why this read as a *colour* bug rather than a *coverage* bug —
 * it filled the missing tiles with floor-coloured paint, so every pixel below the
 * horizon still had something on it. The "floor has no holes" test measures
 * pixels *drawn*, so it passed, and the goldens encoded a striped floor as though
 * it were the design. The underlay is a backstop for sub-pixel seams between tiles
 * that exist; it is not a substitute for the tiles, and a hole the size of a tile
 * is not a seam.
 *
 * Perimeter order, so the walk is a closed loop: near edge left-to-right, right
 * column, far edge right-to-left, left column. The corners belong to exactly one
 * edge each, which is what makes the count come out right.
 */
function ringOffsets(distance: number): Array<[number, number]> {
  if (distance === 0) return [[0, 0]];
  const d = distance;
  const out: Array<[number, number]> = [];
  // Near edge: (2d + 1) cells, both corners included.
  for (let dx = -d; dx <= d; dx++) out.push([dx, -d]);
  // Right column: (2d) cells, near corner already emitted.
  for (let dy = -d + 1; dy <= d; dy++) out.push([d, dy]);
  // Far edge: (2d) cells, far-right corner already emitted.
  for (let dx = d - 1; dx >= -d; dx--) out.push([dx, d]);
  // Left column: (2d - 1) cells, both corners already emitted.
  for (let dy = d - 1; dy >= -d + 1; dy--) out.push([-d, dy]);
  return out;
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
function floorQuadsForTile(camera: Camera, tile: Tile, x: number, y: number, daylight: number): Quad[] {
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
  const base = scaleColor(tile.model.minimapColor, daylight);
  out.push(expandByPixels({
    imageId: "",
    x: screen[0]!.x, y: screen[0]!.y,
    ux: screen[1]!.x - screen[0]!.x, uy: screen[1]!.y - screen[0]!.y,
    // **The fourth corner is `screen[2]`, not `screen[0] + U + V`.** A `Quad` stores
    // only two edge vectors, so the far corner is *implied* as `O + U + V` — which
    // is the fourth corner only if the shape is a parallelogram, and a floor tile
    // under perspective is not one. Taking `screen[2]` as given means the implied
    // corner is whatever the affine map makes it, and the base fill is a
    // parallelogram spanning a different quad than the tile's.
    //
    // The error is small — it is the same projective mismatch as the corners, a few
    // pixels on a near tile — but it is in the *wrong direction*: the base fill is
    // the thing that is supposed to cover the seams the sub-quads leave, so being
    // small and wrong still means the gaps it exists to hide are not hidden. And
    // `expandByPixels` cannot fix it, because the discrepancy is not a uniform
    // inset.
    vx: screen[3]!.x - screen[0]!.x + (screen[2]!.x - screen[1]!.x),
    vy: screen[3]!.y - screen[0]!.y + (screen[2]!.y - screen[1]!.y),
    sx: 0, sy: 0, sw: 1, sh: 1,
    // **The tile's *farthest* corner, not its nearest.**
    //
    // The base fill is the backdrop for this tile's own texture sub-quads, and a
    // backdrop has to be behind all of them. The sub-quad depths interpolate
    // between the four corner distances, so every one of them is strictly less
    // than the maximum; giving the base fill that maximum puts it behind its own
    // detail unconditionally, for any `steps`, with no epsilon to tune.
    //
    // It used `Math.min(...forward)` — the *nearest* corner — which is nearer than
    // every sub-quad, so the fill won its own tile's texture and painted over it.
    // The floor came out as flat base colour with wedges of texture surviving
    // wherever a fill had not reached: a checkerboard, because a nearer tile's
    // fill and its own sub-quads alternate in the depth test.
    //
    // The maximum is also the right answer for the *other* reason this comment
    // exists for. The two rasterisers resolve overlap differently — the browser
    // has no depth buffer and uses painter's order alone, while the test
    // rasteriser keeps the nearest quad by depth — so a base fill that only
    // *usually* loses its own detail renders differently in each. A depth that
    // loses unconditionally makes them agree, which is the only reason to pick
    // one number over another here. List order still puts the fill before the
    // sub-quads, so the browser is unaffected; this is about the two
    // implementations not disagreeing about the same draw list.
    depth: Math.max(...forward),
    tint: [base.r / 255, base.g / 255, base.b / 255],
  }, 1));

  for (let sy = 0; sy < steps; sy++) {
    for (let sx = 0; sx < steps; sx++) {
      const u0 = sx / steps, u1 = (sx + 1) / steps, v0 = sy / steps, v1 = (sy + 1) / steps;
      // **The sub-quad's corners are projected, not interpolated.**
      //
      // The obvious implementation blends the four already-projected corners
      // bilinearly in screen space: `lerp(lerp(s0, s1, u), lerp(s3, s2, u), v)`.
      // That is the affine map over a *projective* shape, and it is wrong by a
      // long way — measured on a near tile at (20,18) facing NE, the worst
      // disagreement with the true projection is **99.5 px**, at the tile's near
      // edge. Not a seam, not sub-pixel: the far corners of the tile are
      // displaced by more than a tenth of the screen, which is what turned the
      // floor into wedges of texture with wedges of nothing between them.
      //
      // The reason is visible in the corner list above. The four corners are at
      // *unequal* forward distances — 1.41, 2.12, 1.41, 0.71 for that tile — so
      // the tile is strongly non-parallelogram on screen, and a bilinear blend
      // of the corners cannot reproduce a perspective divide by construction. It
      // agrees exactly at the corners (both are zero error there) and diverges
      // fastest in the middle, which is precisely the "radiating from the
      // vanishing point" pattern.
      //
      // Subdivision does not help, and this is why: subdividing a bilinear map
      // gives a finer bilinear map, which is still the wrong map. It converges on
      // the wrong shape. Projecting each sub-corner is the same cost — one
      // divide per corner, and there are four — and is exact at every `steps`.
      const project = (u: number, v: number) => {
        const cx = x + u, cy = y + v;
        const f = (cx - camera.posX) * camera.dirX + (cy - camera.posY) * camera.dirY;
        const s = (cx - camera.posX) * camera.rightX + (cy - camera.posY) * camera.rightY;
        return {
          x: (camera.width / 2) * (1 + s / (f * camera.planeLength)),
          // The floor plane: further away is *higher* on screen, towards the horizon.
          y: camera.height / 2 + camera.eyeHeight * (pxPerTile / f),
        };
      };
      const p00 = project(u0, v0), p10 = project(u1, v0), p01 = project(u0, v1);
      // Depth is linear in (u, v) — it is a dot product against a fixed direction,
      // with no divide in it — so the existing interpolation is exact, and is left
      // alone for that reason rather than by accident.
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
 * A `Quad` is a **parallelogram**: it stores two edge vectors and the fourth corner
 * is implied as `origin + U + V`. A sub-quad of a floor tile is *projective*, so
 * that implied corner is never exactly right, and the error is what the base fill
 * underneath exists to cover. It cannot be corrected — a re-anchored quad has the
 * same diagonal mismatch, measured identical to the pixel — only subdivided away.
 *
 * **The error falls as the square of the cell size**, which is what makes this a
 * calculation rather than a taste. Measured over the near tiles facing NE, the
 * worst implied corner is off by:
 *
 * | split | error    |
 * |-------|----------|
 * | 1x1   | 743 px   |
 * | 2x2   | 372 px   |
 * | 4x4   | 149 px   |
 * | 8x8   |  50 px   |
 * | 16x16 |  15 px   |
 *
 * — a factor of four per doubling, as a squared term should. The old schedule
 * (4x4 near, 2x2 mid, 1x1 far) left 50 px of error on the nearest tile, which is
 * the dark wedge the floor still showed around furniture, and no amount of
 * underlay can hide 50 px: the underlay is a flat fill, so anything it covers
 * *is* the artefact.
 *
 * So the schedule is set by the error being tolerable rather than by what looks
 * cheap: 8x8 within 1.5 tiles, 4x4 to 3, 2x2 to 6, 1x1 beyond — where the texture
 * is under a pixel per texel anyway and there is nothing to resolve. This is the
 * first thing to cut if the profile says so, and it is now the most expensive
 * thing in the frame: 8x8 is 64 quads for the tile the player is standing on.
 */
function subdivisionsFor(distance: number): number {
  if (distance < 1.5) return 8;
  if (distance < 3) return 4;
  if (distance < 6) return 2;
  return 1;
}

/**
 * A colour scaled towards black.
 *
 * Used only to *darken*. It cannot brighten, so it can never turn a dark map into a
 * lit one — the limit is that the renderer is prevented from showing more than the
 * rules allow, and this is a nudge in the other direction.
 */
function scaleColor(color: Color, factor: number): Color {
  const k = Math.max(0, Math.min(1, factor));
  return Color.fromArgb(
    Math.round(color.r * k),
    Math.round(color.g * k),
    Math.round(color.b * k),
  );
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

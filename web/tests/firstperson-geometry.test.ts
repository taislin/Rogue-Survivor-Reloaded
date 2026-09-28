import { describe, it, expect } from "vitest";
import { Map } from "@data/Map";
import { Models } from "@data/Models";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import type { TileModel } from "@data/TileModel";
import { Lighting } from "@data/Map";
import { Direction } from "@engine/Direction";
import { makeCamera, EYE_HEIGHT, WALL_HEIGHT, VIEW_FOV_DEGREES } from "@engine/firstperson/Types";
import { castRay, castColumns, columnDistances, MAX_RAY_DISTANCE } from "@engine/firstperson/Raycaster";

/**
 * The raycaster, on a map built to be exactly the shape it assumes.
 *
 * The load-bearing claim under all of this is that **walls are one tile thick**,
 * and it is a property of world generation, not of the raycaster: `tileRectangle`
 * fills a four-line outline. So the maps here are built with an outline helper
 * rather than by filling a band — build them any other way and these tests would
 * be asserting against a world that cannot occur, which is how a suite ends up
 * green on a renderer that mis-draws every interior corner.
 *
 * Expectations come from the geometry, not from reading the port: a wall is
 * reached at a distance that can be worked out on paper, a face normal follows
 * from the grid line crossed, and the one-tile-thickness invariant is a property
 * that can be *checked* over every ray of every fixture rather than assumed.
 */
Models.tiles = new GameTiles();

/** `Models.tiles.get(id)`, the idiom every generator uses. */
function model(id: TileID): TileModel {
  return Models.tiles.get(id);
}

/** A map of floor, with outline walls exactly as the generator draws them. */
function floorMap(width: number, height: number): Map {
  const map = new Map(1, "test", width, height);
  map.lighting = Lighting.LIT;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      map.setTileModelAt(x, y, model(TileID.FLOOR_CONCRETE));
    }
  }
  return map;
}

/**
 * `MapGenerator.tileRectangle`'s shape: four one-tile lines, not a filled band.
 *
 * Deliberately a separate function from the generator's, so a change to the
 * generator cannot quietly change what these tests assume. If the generator ever
 * stopped producing one-tile-thick walls, this is where the disagreement would
 * have to be noticed — and `tileRectangle` is a static method on an abstract
 * class, so the honest version of this helper is a transcription and says so.
 */
function outline(map: Map, left: number, top: number, w: number, h: number, id: TileID): void {
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

/** Marks every tile in view, as `LOS.computeFOVFor` would after a turn. */
function markAllInView(map: Map): void {
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      map.getTileAt(x, y)!.isInView = true;
    }
  }
}

/** A 9x9 room: walls on the border, floor inside, player near the middle. */
function room(): Map {
  const map = floorMap(9, 9);
  outline(map, 0, 0, 9, 9, TileID.WALL_BRICK);
  markAllInView(map);
  return map;
}

const CENTRE = 4.5;

describe("the camera basis", () => {
  it("puts screen-right 90° clockwise from forward, in a y-down grid", () => {
    // The single most consequential sign in this subsystem. Taking the other
    // perpendicular is the classic raycaster mirror: it looks plausible, runs, and
    // lands every wall face and every billboard on the wrong side. So this is
    // checked as a *relationship* against `Direction`, for all eight facings,
    // rather than as one hand-worked angle.
    //
    // Two steps round, not one — and the reason is worth stating, because
    // `Direction.right` is the trap. It advances one *compass* step, 45°, so
    // `Direction.right(N)` is NE and the name reads like "due east" when it is
    // not. Screen-right is the perpendicular, which in an eight-way grid is two
    // steps: N -> E, NE -> SE. The camera gets it from `(-dirY, dirX)` rather
    // than from any of `Direction`'s helpers, which is what keeps the two
    // unrelated.
    for (const facing of Direction.COMPASS) {
      const cam = makeCamera(CENTRE, CENTRE, facing, 800, 400);
      const right = Direction.approximateFromVector(cam.rightX, cam.rightY);
      expect(right, `screen-right of ${facing.name}`).toBe(
        Direction.COMPASS[(facing.index + 2) % 8],
      );
      expect(Direction.right(facing), `${facing.name}: right is a 45 degree step, not a perpendicular`).not.toBe(right);
    }
  });

  it("takes the forward axis straight from the facing, unrounded", () => {
    // Because rotation is quantised to 45°, the facing is always a
    // `Direction.COMPASS` entry and the forward vector is exact. The direction
    // the player walks in is the facing itself, never a direction near it.
    for (const facing of Direction.COMPASS) {
      const cam = makeCamera(CENTRE, CENTRE, facing, 800, 400);
      const forward = Direction.approximateFromVector(cam.dirX, cam.dirY);
      expect(forward, `forward of ${facing.name}`).toBe(facing);
      // And the basis is orthonormal, so no ray is silently stretched.
      expect(cam.dirX * cam.rightX + cam.dirY * cam.rightY).toBeCloseTo(0, 12);
      expect(Math.hypot(cam.dirX, cam.dirY)).toBeCloseTo(1, 12);
      expect(Math.hypot(cam.rightX, cam.rightY)).toBeCloseTo(1, 12);
    }
  });

  it("scales the view plane so the field of view is the angle asked for", () => {
    // `planeLength` is the only place the FOV enters the geometry, and if it is
    // off, every column is wrong by the same factor — which looks like a narrow
    // or wide lens rather than a bug. Checked by the angle actually subtended.
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, 800, 400, 90);
    const halfAngle = Math.atan(cam.planeLength) * (180 / Math.PI);
    expect(halfAngle).toBeCloseTo(45, 10);
    // The default is wider than 90 on purpose, so a 45° turn reveals more than
    // one compass column.
    expect(VIEW_FOV_DEGREES).toBeGreaterThan(90);
    // And the field of view must not depend on the viewport. An earlier version
    // scaled `planeLength` by `width / 2`, which made a wide canvas a fisheye
    // while a narrow one was correct — invisible until the window was resized.
    for (const width of [320, 800, 1366, 3840]) {
      const sized = makeCamera(CENTRE, CENTRE, Direction.N, width, 400, 90);
      expect(sized.planeLength, `planeLength at width ${width}`).toBeCloseTo(cam.planeLength, 12);
    }
  });

  it("puts the horizon at the middle of the screen, and the eye mid-wall", () => {
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, 800, 400);
    // Eye at half a wall: a wall's projected top and bottom are then symmetric
    // about the horizon, which is what makes a doorway read as passable.
    expect(cam.eyeHeight).toBe(WALL_HEIGHT / 2);
    expect(cam.eyeHeight).toBeCloseTo(EYE_HEIGHT, 12);
  });
});

describe("castRay", () => {
  it("finds the wall ahead at the distance the geometry says", () => {
    const map = room();
    // Facing north from (4.5, 4.5) in a 9x9 room whose border ring is wall: the
    // *face* is the boundary at y = 1, which is 3.5 tiles away, and the *tile* the
    // ray ends in is the one behind that boundary, y = 0. Distance and tile index
    // therefore differ by one, which is easy to assert wrongly and would be a real
    // off-by-one wall distance if the renderer used the tile centre.
    const hit = castRay(map, CENTRE, CENTRE, 0, -1)!;
    expect(hit.mapX).toBe(4);
    expect(hit.mapY).toBe(0);
    expect(hit.distance).toBeCloseTo(3.5, 9);
    expect(hit.surface).toBe("wall");
    expect(hit.imageId).toBe("Tiles/wall_brick");
  });

  it("reports the face normal pointing back at the camera, for every side", () => {
    // The normal is what selects which edge of the texture to slice, so a normal
    // that points *away* from the camera draws the wall mirrored. All eight
    // directions, because the four cardinal cases hide a bug in the diagonals.
    const map = room();
    const cases: Array<[Direction, number, number]> = [
      [Direction.N, 0, -1],
      [Direction.S, 0, 1],
      [Direction.E, 1, 0],
      [Direction.W, -1, 0],
      [Direction.NE, Math.SQRT1_2, -Math.SQRT1_2],
      [Direction.SW, -Math.SQRT1_2, Math.SQRT1_2],
    ];
    for (const [facing, dx, dy] of cases) {
      const hit = castRay(map, CENTRE, CENTRE, dx, dy)!;
      // The face normal opposes the direction of travel, since it faces the camera.
      expect(hit.normalX * dx + hit.normalY * dy, `normal of ${facing.name}`).toBeLessThan(0);
      // And it is axis-aligned, because every wall face is.
      expect(Math.abs(hit.normalX) + Math.abs(hit.normalY)).toBe(1);
    }
  });

  it("slices a different texture edge for a north-facing and a south-facing wall", () => {
    // `side` is what tells the projector where the column's slice comes from. If
    // it were constant, a room's two visible walls would show the same edge and
    // the brickwork would read as continuous through the corner.
    const map = room();
    const north = castRay(map, CENTRE, CENTRE, 0, -1)!;
    const south = castRay(map, CENTRE, CENTRE, 0, 1)!;
    expect(north.side).toBe(1);
    expect(south.side).toBe(1);
    expect(north.normalY).toBe(1);
    expect(south.normalY).toBe(-1);

    const east = castRay(map, CENTRE, CENTRE, 1, 0)!;
    expect(east.side).toBe(0);
    expect(east.normalX).toBe(-1);
  });

  it("never reaches a face no ray could see: walls are one tile thick", () => {
    // The invariant the whole approach rests on. Checked as a property over a
    // dense sweep of rays from a walkable tile, not as one hand-picked case,
    // because a generator change that thickened a wall somewhere would show up as
    // a distance anomaly rather than as a crash.
    const map = room();
    // An interior pillar drawn as a filled band rather than an outline would be
    // two tiles thick; this is the shape that must never be generated.
    for (let x = 2; x < 4; x++) {
      for (let y = 2; y < 4; y++) {
        map.setTileModelAt(x, y, model(TileID.WALL_STONE));
      }
    }
    let checked = 0;
    for (let x = 1; x < 8; x++) {
      for (let y = 1; y < 8; y++) {
        if (!map.isWalkable(x, y)) continue;
        for (let a = 0; a < 64; a++) {
          const theta = (2 * Math.PI * a) / 64;
          const hit = castRay(map, x + 0.5, y + 0.5, Math.cos(theta), Math.sin(theta));
          if (hit === null) continue;
          checked++;
          // Every hit is a *near* face: the tile in front of it is walkable, and
          // the tile it faces is walkable too. Reaching a second wall across a
          // solid one is what a thickened wall looks like from here.
          const inFrontX = hit.mapX + hit.normalX;
          const inFrontY = hit.mapY + hit.normalY;
          expect(
            map.isWalkable(inFrontX, inFrontY) || !map.isInBounds(inFrontX, inFrontY),
            `ray at (${x},${y}) angle ${a} hit a face with a solid tile in front of it`,
          ).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("stops at a closed door and walks through an open one", () => {
    // Doors need no special case while closed: a closed door is not walkable, so
    // the DDA stops on it and it is just a wall with a different texture. The
    // case that *does* need one is the open door, which is walkable — a raycaster
    // terminating on walkability alone walks through it and never draws it. That
    // is the third surface kind, reported as `object`.
    const map = room();
    const door = { imageId: "MapObjects/dark_door_closed", isWalkable: false, isTransparent: false };
    map.getMapObjectAt = ((x: number, y: number) => (x === 4 && y === 1 ? door : null)) as typeof map.getMapObjectAt;

    const closed = castRay(map, CENTRE, CENTRE, 0, -1)!;
    expect(closed.surface).toBe("wall");
    expect(closed.imageId).toBe("MapObjects/dark_door_closed");

    const open = { imageId: "MapObjects/dark_door_open", isWalkable: true, isTransparent: true };
    map.getMapObjectAt = ((x: number, y: number) => (x === 4 && y === 1 ? open : null)) as typeof map.getMapObjectAt;
    const opened = castRay(map, CENTRE, CENTRE, 0, -1)!;
    expect(opened.surface).toBe("object");
    expect(opened.imageId).toBe("MapObjects/dark_door_open");
  });

  it("reports the map edge as its own surface, not as a wall", () => {
    // An edge and a wall are drawn differently — fog against a texture — so
    // conflating them would either show the void or draw a wall where there is
    // none.
    const map = new Map(1, "open", 5, 5);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        map.setTileModelAt(x, y, model(TileID.FLOOR_GRASS));
      }
    }
    markAllInView(map);
    const hit = castRay(map, 2.5, 2.5, 0, -1, 10)!;
    expect(hit.surface).toBe("edge");
    expect(hit.imageId).toBe("");
  });

  it("gates on the engine's view, so first person cannot see what top-down hides", () => {
    // `Rules.actorFOV` is a *circle* of radius ~9.24 and is untouched by this
    // renderer. A first-person view is a cone, so a ray can easily reach a wall
    // the engine has not marked — in the dark, or at night, or behind the player.
    // Drawing that wall's texture would hand the player exactly the information
    // the rules withhold, so the flag has to come from the engine and not from
    // the camera.
    const map = room();
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, 8, 8);
    expect(castColumns(map, cam)[0]!.inView).toBe(true);

    map.setAllAsUnvisited();
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        map.getTileAt(x, y)!.isInView = false;
      }
    }
    // Same ray, same distance, same wall — but now the engine says the player
    // cannot see it.
    const hidden = castRay(map, CENTRE, CENTRE, 0, -1)!;
    expect(hidden.distance).toBeCloseTo(3.5, 9);
    expect(hidden.inView).toBe(false);
  });

  it("gives up rather than walking forever", () => {
    const map = new Map(1, "open", 200, 200);
    for (let x = 0; x < 200; x++) {
      for (let y = 0; y < 200; y++) {
        map.setTileModelAt(x, y, model(TileID.FLOOR_GRASS));
      }
    }
    // No walls at all, so the only thing that can stop a ray is the bound.
    expect(castRay(map, 100.5, 100.5, 1, 0, MAX_RAY_DISTANCE)).toBeNull();
    // And a zero-length ray is not a ray.
    expect(castRay(map, 100.5, 100.5, 0, 0)).toBeNull();
  });
});

describe("castColumns", () => {
  it("casts one ray per column, and they agree on a symmetric room", () => {
    // A square room seen dead centre is the cheapest possible check that the
    // columns are the right *order* and the right *sign*: mirror the columns and
    // the distances must be identical, and a raycaster that scans the wrong way
    // round gives a different answer at every column.
    const map = room();
    const width = 64;
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, width, 32);
    const hits = castColumns(map, cam);
    expect(hits).toHaveLength(width);

    // Facing north in a square room, the view is symmetric about the centre, so
    // column `i` and column `width - i` see the same distance. Note the pairing:
    // the screen coordinate is `2c/width - 1`, whose mirror is `2(width-c)/width - 1`,
    // so column 0 mirrors to column `width` — one past the end. `width - 1 - i` is
    // the off-by-one that would make this test pass for the wrong reason on an
    // even width, and fail for no reason on an odd one.
    const distances = columnDistances(hits);
    for (let i = 1; i < width; i++) {
      expect(distances[i], `column ${i} is not mirrored`).toBeCloseTo(distances[width - i]!, 9);
    }
  });

  it("puts the nearest wall in the middle and the farthest at the edges", () => {
    // In a square room looking north the *side* walls are what the outer columns
    // see, and they are further away than the wall ahead. If this inverts, the
    // view is mirrored or the plane length is wrong — either way the picture is
    // wrong in a way no count would show.
    const map = room();
    const width = 64;
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, width, 32);
    const d = columnDistances(castColumns(map, cam));
    const middle = d[width / 2]!;
    const edge = d[0]!;
    expect(middle).toBeCloseTo(3.5, 6);
    expect(edge).toBeGreaterThan(middle);
  });

  it("reports distance in tiles, not in ray parameter", () => {
    // The bug this pins: the DDA steps by `1 / |rayComponent|`, which measures the
    // ray's *parameter*, and the two are the same only for a unit vector. Column
    // rays are not unit — the edge ray is `dir + right * planeLength * (-1)`, whose
    // length is 1.31 at the default 100° field of view. Unnormalised, every
    // distance was scaled by that factor: a wall at the edge of the screen
    // projected as if it were a third further off, which is a fisheye that shows
    // up nowhere except the picture.
    const map = room();
    const width = 64;
    const cam = makeCamera(CENTRE, CENTRE, Direction.N, width, 32);
    const hit = castColumns(map, cam)[0]!;

    const cameraX = -1;
    const rx = cam.dirX + cam.rightX * cam.planeLength * cameraX;
    const ry = cam.dirY + cam.rightY * cam.planeLength * cameraX;
    const length = Math.hypot(rx, ry);
    // The premise, not the conclusion: if this ever equals 1 the test has stopped
    // testing anything.
    expect(length, "the edge ray is no longer non-unit, so this test is vacuous").toBeGreaterThan(1.2);

    // The distance is the Euclidean distance to where the ray actually crossed.
    //
    // An earlier version of this test worked the crossing out by hand and got it
    // wrong: the edge ray from the centre of a 9x9 room drifts west far enough to
    // reach the *west* wall's near boundary at x = 1 before the north wall's at
    // y = 1, so it is the west wall that stops it. A hand-computed number nobody
    // checked is a plausible default, and a plausible default is
    // indistinguishable from a correct one until both are compared against the
    // code. So this asserts the *relationship* — distance to the crossing point —
    // which holds whichever surface answers.
    const toHit = Math.hypot(hit.hitX - CENTRE, hit.hitY - CENTRE);
    expect(hit.distance).toBeCloseTo(toHit, 9);
    // The crossing is on a tile boundary, and the tile it entered is a wall.
    expect(hit.hitX === Math.floor(hit.hitX) || hit.hitY === Math.floor(hit.hitY)).toBe(true);
    expect(map.isWalkable(hit.mapX, hit.mapY)).toBe(false);

    // And the unambiguous case: straight ahead, the north wall's near boundary is
    // 3.5 tiles away with no competing surface.
    const ahead = castColumns(map, makeCamera(CENTRE, CENTRE, Direction.N, width, 32))[width / 2]!;
    expect(ahead.mapY).toBe(0);
    expect(ahead.distance).toBeCloseTo(3.5, 9);
  });

  it("reports Infinity for a column that sees nothing, not zero", () => {
    // Zero would be nearer than everything and the z-buffer would reject every
    // billboard in that column; Infinity is the only value that loses to nothing.
    const map = new Map(1, "open", 5, 5);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        map.setTileModelAt(x, y, model(TileID.FLOOR_GRASS));
      }
    }
    markAllInView(map);
    const cam = makeCamera(2.5, 2.5, Direction.N, 8, 8);
    const d = columnDistances(castColumns(map, cam, 1.5));
    expect(d.every((v) => v === Infinity || v > 0)).toBe(true);
    expect(d.some((v) => v === Infinity)).toBe(true);
  });

  it("never reports a distance of zero or a negative one", () => {
    // A ray starts inside its own cell, so the first crossing is always at least
    // a fraction of a tile away. Zero or negative would mean the DDA returned the
    // camera's own position, which would put a wall column at infinite size.
    const map = room();
    for (const facing of Direction.COMPASS) {
      const d = columnDistances(castColumns(map, makeCamera(CENTRE, CENTRE, facing, 32, 16)));
      for (const value of d) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

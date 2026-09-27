import { describe, it, expect, beforeAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { Actor } from "@data/Actor";
import { Map as GameMap } from "@data/Map";
import { World } from "@data/World";
import { DoorWindow } from "@engine/mapobjects/MapObjects";

/**
 * Generator integrity: the invariants a town must satisfy before anyone plays.
 *
 * Phase 8 §4.3 item 3, and the highest-value of the two remaining test items,
 * because nothing previously checked any of this. A generator bug does not
 * crash -- it produces a district with a sealed quarter, or an actor embedded
 * in a wall, and the game only looks subtly wrong.
 *
 * **The C# has no equivalent check** (grepped `src/` for reachability / flood /
 * integrity: nothing), so this is new coverage rather than a port of an
 * existing assertion. Thresholds are therefore calibrated from measurement, not
 * guessed -- see the numbers recorded below.
 *
 * One seed per file, following the constraint in BROWSER_PORT_PLAN §4.1a:
 * `Session.get()` is a process-wide singleton and the model databases
 * self-register into `Models` statics, so two games in one process share state.
 * `reproducibility.test.ts` shells out to the CLI for the same reason. The seed
 * is 42 because a six-seed sweep found it to be the *hardest* world measured
 * (see the calibration note on the connectivity test).
 */

const SEED = 42;

let world: World | null;
let player: Actor;

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED);
  const metrics = await runner.run({ worldSize: 1, maxTurns: 1, isUndead: true, bot: false });
  expect(metrics.error, "world generation threw").toBeUndefined();
  world = runner.rogueGame.session.world;
  player = runner.rogueGame.player as Actor;
}, 120_000);

/** Every map in the world. */
function allMaps(): GameMap[] {
  const w = world;
  if (!w) throw new Error("world not generated");
  const out: GameMap[] = [];
  for (let dx = 0; dx < w.size; dx++) {
    for (let dy = 0; dy < w.size; dy++) {
      const d = w.getDistrict(dx, dy);
      if (!d) continue;
      out.push(...d.maps);
    }
  }
  return out;
}

/** The 50x50 surface maps, excluding the tunnel networks. */
function surfaceDistricts(): GameMap[] {
  return allMaps().filter(
    (m) => m.width === 50 && m.height === 50 && !/sewer|subway/i.test(m.name)
  );
}

/**
 * Statically passable: a walkable tile with no permanently impassable object on
 * it. A closed door counts as passable because it can be opened, which is why
 * `DoorWindow` is special-cased -- `Rules.isWalkableFor` treats a closed door
 * as openable-but-costly rather than a wall.
 */
function passable(map: GameMap, x: number, y: number): boolean {
  const tile = map.getTileAt(x, y);
  if (!tile || !tile.model.isWalkable) return false;
  const obj = map.getMapObjectAt(x, y);
  if (obj && !obj.isWalkable && !(obj instanceof DoorWindow)) return false;
  return true;
}

/** 4-connected flood fill of the passable region containing (sx, sy). */
function flood(map: GameMap, sx: number, sy: number): Set<number> {
  const key = (x: number, y: number) => y * map.width + x;
  const seen = new Set<number>([key(sx, sy)]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!map.isInBounds(nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k) || !passable(map, nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** All passable tiles of the map, grouped into connected components. */
function components(map: GameMap): number[][] {
  const key = (x: number, y: number) => y * map.width + x;
  const assigned = new Set<number>();
  const comps: number[][] = [];
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      if (!passable(map, x, y)) continue;
      if (assigned.has(key(x, y))) continue;
      const size = flood(map, x, y);
      size.forEach((k) => assigned.add(k));
      comps.push([...size]);
    }
  }
  return comps;
}

describe("generator integrity", () => {
  it("generates a world with maps and a placed player", () => {
    expect(world).not.toBeNull();
    expect(world!.size).toBeGreaterThan(0);
    expect(allMaps().length).toBeGreaterThan(10);
    expect(surfaceDistricts().length).toBeGreaterThan(0);
    expect(player).not.toBeNull();
    expect(player.location.map).not.toBeNull();
  });

  it("never places an actor on a wall, or outside the map", () => {
    // The sharpest available invariant: an actor embedded in geometry can
    // never path anywhere, and the AI has no recovery from it.
    const offenders: string[] = [];
    for (const map of allMaps()) {
      for (const a of map.actors) {
        const { x, y } = a.location.position;
        if (!map.isInBounds(x, y)) {
          offenders.push(`${map.name}: ${a.name} out of bounds at ${x},${y}`);
          continue;
        }
        const tile = map.getTileAt(x, y);
        if (!tile || !tile.model.isWalkable) {
          offenders.push(`${map.name}: ${a.name} on a non-walkable tile at ${x},${y}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never writes a map object outside the map", () => {
    const offenders: string[] = [];
    for (const map of allMaps()) {
      for (const o of map.mapObjects) {
        const p = o.location?.position;
        if (!p || !map.isInBounds(p.x, p.y)) {
          offenders.push(`${map.name}: object out of bounds at ${p?.x},${p?.y}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives every map at least one passable tile", () => {
    const empty: string[] = [];
    for (const map of allMaps()) {
      let any = false;
      outer: for (let x = 0; x < map.width && !any; x++) {
        for (let y = 0; y < map.height; y++) {
          if (passable(map, x, y)) {
            any = true;
            break outer;
          }
        }
      }
      if (!any) empty.push(map.name);
    }
    expect(empty).toEqual([]);
  });

  it("starts the player on a passable tile, inside the main region of its map", () => {
    const map = player.location.map as GameMap;
    const { x, y } = player.location.position;
    expect(map.isInBounds(x, y)).toBe(true);
    expect(passable(map, x, y), `player spawned on an impassable tile at ${x},${y}`).toBe(true);

    const comps = components(map);
    const key = (px: number, py: number) => py * map.width + px;
    const containing = comps.find((c) => c.includes(key(x, y)));
    expect(containing, "player's tile is not in any passable region").toBeDefined();
    // The player must not be walled into a pocket: their region has to be the
    // largest one on the map.
    const largest = Math.max(...comps.map((c) => c.length));
    expect(containing!.length).toBe(largest);
  });

  /**
   * Calibration, from a six-seed sweep (1, 7, 42, 99, 4242, 12345, 54 surface
   * districts): the main connected region of a surface district covers
   * **75.6% – 100%** of its passable tiles, and the orphan remainder is a
   * stable 300–415 tiles per district rather than noise.
   *
   * Those orphans are building interiors the generator did not give a doorway.
   * That is a characteristic of the ported generator, consistent across every
   * seed measured, so asserting 100% here would be asserting the original has
   * no unreachable rooms -- which is not established and not the point. The
   * threshold below is set at 60%, well under the observed floor, so it fires
   * only if a *regression* seals a district: a whole quarter walled off, or a
   * generator change that stops placing doors.
   */
  it("leaves no surface district substantially sealed off", () => {
    const sealed: string[] = [];
    for (const map of surfaceDistricts()) {
      const comps = components(map);
      const total = comps.reduce((n, c) => n + c.length, 0);
      if (total === 0) continue;
      const main = Math.max(...comps.map((c) => c.length));
      const pct = (main / total) * 100;
      if (pct < 60) {
        sealed.push(`${map.name}: main region ${pct.toFixed(1)}% of ${total} tiles (${comps.length} regions)`);
      }
    }
    expect(sealed).toEqual([]);
  });

  it("keeps tunnel networks fragmented but non-empty", () => {
    // Sewers and subways are *meant* to be many disconnected tunnels joined by
    // stairs, so connectivity is not the invariant there -- non-emptiness is.
    // This exists to stop someone "fixing" the surface-district threshold by
    // loosening `passable` until the sewers look connected.
    const tunnels = allMaps().filter((m) => /sewer|subway/i.test(m.name));
    expect(tunnels.length).toBeGreaterThan(0);
    for (const map of tunnels) {
      const comps = components(map);
      expect(comps.length, `${map.name} is a single region`).toBeGreaterThan(1);
    }
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { LOS } from "@engine/LOS";
import { coordKey } from "@engine/CoordKey";
import { Point } from "@engine/Point";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Actor } from "@data/Actor";
import { GameImages } from "@gameplay/GameImages";
import { Activity } from "@data/Activity";
import { Color } from "@engine/Color";

/**
 * `Point` is a **class** in the port and a **struct** in the C#.
 *
 * Every construct that leans on a `Point`'s *value* semantics therefore changed
 * meaning when it was translated, and in each case the translation still
 * type-checked, still built, and still passed the whole test suite:
 *
 *   - `p1 == p2` / `p1 != p2` — value equality in C#, **reference** identity here.
 *   - `Set<Point>.has(p)` / `HashSet<Point>.Contains(p)` — same.
 *   - `fov.has(p.toString())` — `Point.toString()` is `(x, y)`, and an FOV is
 *     keyed `x,y`. Always false, forever, with no type error.
 *
 * What that cost, in this port, before these tests existed:
 *
 *   1. `DrawPlayerActorTargets` was never called. `DrawMap` tested
 *      `m_Player.location.position == position` against a `Point` it had just
 *      allocated, so the whole method was dead — the player lost *both* target
 *      markers, including the "an NPC is chasing you" threat indicator, with
 *      `showPlayerTargets` on by default.
 *   2. All of ORDER_MODE was dead. `HandlePlayerOrderMode`'s follower-selection
 *      test, and the click-to-tile gate in all four
 *      `HandlePlayerOrderFollowerTo{BuildFortification,Barricade,Guard,Patrol}`
 *      handlers, could never be true — so a follower standing in plain sight was
 *      greyed out and unselectable, and clicking a tile never issued an order.
 *
 * `tsc` is clean on the broken version, the Vite build is clean, and 667 tests
 * pass, because nothing observes the difference. So the shape is checked
 * mechanically here, and the two consequences that matter are checked by
 * actually running the game.
 */

const SRC = join(__dirname, "../src");

/** Every `.ts` under `src/`, recursively. */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Every non-comment line of a file, with its 1-based line number. */
function codeLines(path: string): Array<{ line: number; text: string }> {
  return readFileSync(path, "utf-8")
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    // A match inside a comment is the comment *documenting* the rule, which is
    // the point of them, not a violation of it.
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
}

const FILES = sourceFiles().map((p) => ({ path: p, lines: codeLines(p) }));

describe("a Point is never compared or looked up by identity", () => {
  it("no source compares two .position (or Point) values with == or !=", () => {
    const offenders: string[] = [];
    for (const { path, lines } of FILES) {
      for (const { line, text } of lines) {
        // `a.position == b.position`, and the `x == y` shape of a Point compare.
        if (/\.position\s*(==|!=)\s*[^=]/.test(text) || /[^=!<>]\s*(==|!=)\s*[^=]*\.position\b/.test(text)) {
          offenders.push(`${path.replace(SRC, "src")}:${line}  ${text.trim()}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no collection is keyed by Point, which would make .has() reference identity", () => {
    const offenders: string[] = [];
    for (const { path, lines } of FILES) {
      for (const { line, text } of lines) {
        if (/\b(Set|Map|WeakMap)<Point\b/.test(text) || /:\s*(Set|Map)<Point>\s*=/.test(text)) {
          offenders.push(`${path.replace(SRC, "src")}:${line}  ${text.trim()}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("no FOV membership test goes through Point.toString()", () => {
    // `Point.toString()` renders `(x, y)`; an FOV is keyed `x,y`. This compiles
    // and is always false, which is the trap `LOS.fovKey` exists to close.
    const offenders: string[] = [];
    for (const { path, lines } of FILES) {
      for (const { line, text } of lines) {
        if (/\.has\([^)]*\.toString\(\)/.test(text) && /fov|FOV|Visible/i.test(text)) {
          offenders.push(`${path.replace(SRC, "src")}:${line}  ${text.trim()}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the FOV key is built in exactly one place", () => {
    // A hand-rolled `${x},${y}` outside LOS.ts is how the two formats drifted
    // apart in the first place. `LOS.fovKey` is the only sanctioned spelling.
    const offenders: string[] = [];
    for (const { path, lines } of FILES) {
      if (path.endsWith(join("engine", "LOS.ts"))) continue;
      for (const { line, text } of lines) {
        if (/`\$\{[^}]*\},\$\{[^}]*\}`/.test(text)) {
          offenders.push(`${path.replace(SRC, "src")}:${line}  ${text.trim()}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the FOV key cannot be confused with a Point", () => {
  it("is a number, so Point.toString() can never be passed to it", () => {
    // The original trap. The key was the string `"x,y"` and `Point.toString()`
    // is `"(x, y)"`, so `fov.has(p.toString())` type-checked, compiled, and was
    // permanently false — which is what silently disabled all of ORDER_MODE. The
    // key is now the shared numeric `coordKey`, so the mistake is a type error
    // rather than a silent wrong answer.
    const p = new Point(3, 4);
    expect(typeof LOS.fovKey(p.x, p.y)).toBe("number");
    expect(p.toString()).toBe("(3, 4)");
  });

  it("fovHas finds a tile from a Point built separately from the key", () => {
    // The whole failure mode in miniature: the key and the lookup are built by
    // different code from the same coordinates. Identity can never bridge that;
    // the key can.
    const fov = new Set([LOS.fovKey(7, 9)]);
    const rebuiltFromScratch = new Point(7, 9);

    expect(fov.has(LOS.fovKey(rebuiltFromScratch.x, rebuiltFromScratch.y))).toBe(true);
    expect(LOS.fovHas(fov, rebuiltFromScratch)).toBe(true);
    // Reference identity, on a set that plainly contains the tile.
    expect(rebuiltFromScratch == new Point(7, 9)).toBe(false);
    // ...and value equality, which is what the port should have said all along.
    expect(rebuiltFromScratch.equals(new Point(7, 9))).toBe(true);
  });

  it("fovKey is injective over the range maps actually use", () => {
    // The stride is 1024 and maps are capped at 100x100, with border-ring exits
    // stored one tile *outside* the edge — so the widest real `x` is 100. Assert
    // the bound rather than trusting the comment, since an aliasing key answers
    // `false` for a tile that is present and never throws.
    const seen = new Map<number, string>();
    for (let x = 0; x <= 100; x++) {
      for (let y = 0; y <= 100; y++) {
        const k = LOS.fovKey(x, y);
        const coord = `${x},${y}`;
        const prev = seen.get(k);
        expect(prev, `key ${k} maps to both ${prev} and ${coord}`).toBeUndefined();
        seen.set(k, coord);
      }
    }
    expect(seen.size).toBe(101 * 101);
  });

  it("uses the same key as Map's spatial tables, so the two cannot drift", () => {
    // `Map` had its own copy of this formula and the FOV had a different one
    // again; a drifted key does not throw, it just answers false. One function
    // now, and this is what pins that.
    expect(LOS.fovKey(37, 91)).toBe(coordKey(37, 91));
    expect(LOS.fovKey(0, 0)).toBe(coordKey(0, 0));
  });
});

describe("the two features the identity bug disabled", () => {
  let game: RogueGame;
  let player: Actor;

  beforeAll(async () => {
    const runner = new HeadlessRunner(24681, new NullRogueUI());
    game = runner.rogueGame;
    await game.LoadData();
    await runner.run({ worldSize: 1, maxTurns: 2, isUndead: true, bot: true });
    player = game.m_Player;
  }, 120_000);

  it("DrawMap draws the 'being targeted' icon when an NPC is chasing the player", () => {
    // Driven through `DrawMap`, because that is where the bug was: the tile loop
    // built a fresh `new Point(x, y)` per iteration and tested
    // `m_Player.location.position == position`, so the call to
    // `DrawPlayerActorTargets` was unreachable and the method was dead code.
    // Testing the method directly would pass on the broken build.
    const map = player.location.map!;
    const other = map.actors.find((a) => a !== player && !a.isDead);
    expect(other, "fixture needs one other live actor").toBeDefined();

    // The condition `DrawPlayerActorTargets` needs: an actor that can see the
    // player, is targeting them, and is actively chasing.
    other!.targetActor = player;
    other!.activity = Activity.CHASING;
    game.UpdatePlayerFOV(player);
    map.placeActor(other!, new Point(player.location.position.x, player.location.position.y - 1));
    expect(
      game.IsVisibleToPlayer(other!),
      "fixture: the chaser must be visible to the player for the icon to draw",
    ).toBe(true);

    const drawn: string[] = [];
    const realDraw = game.m_UI.UI_DrawImage.bind(game.m_UI);
    (game.m_UI as { UI_DrawImage: (id: string, x: number, y: number) => void }).UI_DrawImage = (
      id: string,
      x: number,
      y: number,
    ) => {
      drawn.push(id);
      realDraw(id, x, y);
    };
    try {
      game.DrawMap(map, Color.Black);
    } finally {
      (game.m_UI as { UI_DrawImage: typeof realDraw }).UI_DrawImage = realDraw;
      other!.targetActor = null;
    }

    expect(drawn).toContain(GameImages.ICON_IS_TARGETTED);
  });

  it("a follower the player can see passes the ORDER_MODE link test", () => {
    // The gate that made every follower greyed out. Calls the shipped predicate
    // (`RogueGame.isActorLinkedToPlayer`) rather than restating it, so this
    // fails if the real one regresses — the previous version of this test
    // inlined `LOS.fovHas` and would have passed on the broken build.
    const map = player.location.map!;
    game.UpdatePlayerFOV(player);

    const follower = map.actors.find((a) => a !== player && !a.isDead);
    expect(follower, "fixture needs one other live actor").toBeDefined();

    // Put the follower on a tile the player can see, and re-derive both FOVs.
    // Scanned by coordinate because `Map.tilesGrid` is private and there is no
    // public tile iterator.
    let visible: { x: number; y: number } | null = null;
    for (let x = 0; x < map.width && visible === null; x++) {
      for (let y = 0; y < map.height; y++) {
        const t = map.getTileAt(x, y);
        if (t !== null && t.isInView) {
          visible = { x, y };
          break;
        }
      }
    }
    expect(visible, "fixture needs a tile in the player's view").not.toBeNull();
    // `placeActor` rather than assigning `location.position`: `Location` is
    // immutable, and `placeActor` is the sanctioned add-or-move path that keeps
    // the position index in step with the list.
    map.placeActor(follower!, new Point(visible!.x, visible!.y));

    const followerFov = LOS.computeFOVFor(
      game.m_Rules,
      follower!,
      game.m_Session.worldTime,
      game.m_Session.world!.weather,
    );

    expect(
      game.isActorLinkedToPlayer(followerFov, follower!, player),
      "a follower standing in view must count as linked",
    ).toBe(true);
  });

  it("a follower the player cannot see does not pass the ORDER_MODE link test", () => {
    // The control for the test above: a predicate that returned true
    // unconditionally would pass it, so pin the negative too.
    const map = player.location.map!;
    game.UpdatePlayerFOV(player);

    const follower = map.actors.find((a) => a !== player && !a.isDead);
    expect(follower, "fixture needs one other live actor").toBeDefined();

    // Somewhere the player cannot see: the far corner, which the FOV cannot
    // reach on a 1x1 district map of any playable size.
    const dark = new Point(map.width - 1, map.height - 1);
    map.placeActor(follower!, dark);

    const followerFov = LOS.computeFOVFor(
      game.m_Rules,
      follower!,
      game.m_Session.worldTime,
      game.m_Session.world!.weather,
    );

    expect(
      LOS.fovHas(game.m_PlayerFOV, follower!.location.position),
      "control: the far corner must genuinely be out of view",
    ).toBe(false);
    expect(game.isActorLinkedToPlayer(followerFov, follower!, player)).toBe(false);
  });

  it("fovPoints round-trips a computed FOV back to the tiles it came from", () => {
    const fov = LOS.computeFOVFor(
      game.m_Rules,
      player,
      game.m_Session.worldTime,
      game.m_Session.world!.weather,
    );
    expect(fov.size).toBeGreaterThan(0);

    // Every point the FOV yields must be a member of it — the property that
    // `UpdatePlayerFOV` relies on when it hands them to `setViewAndMarkVisited`.
    for (const p of LOS.fovPoints(fov)) {
      expect(LOS.fovHas(fov, p), `point ${p} lost in the round trip`).toBe(true);
    }
    // And the player's own tile is in view of itself, which is what makes the
    // `isMapBoundary`/exit drawing and the target marker work.
    expect(LOS.fovHas(fov, player.location.position)).toBe(true);
  });
});

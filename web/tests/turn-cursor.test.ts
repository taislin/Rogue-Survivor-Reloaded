/**
 * Multiplayer Phase 1 slice 3 — the turn cursor, and why the save still does not
 * carry it.
 *
 * `plans/MULTIPLAYER_PLAN.md` §6 item 8 lists `Map.m_checkNextActorIndex` as
 * `skip`ped "as a cache. Safe at a turn boundary, wrong mid-turn" **[d]**, and
 * §8 Phase 1 names it as "**the item that decides whether the version bump … is
 * needed**, since an old build handed a two-player save would misread the cursor
 * rather than merely lack it."
 *
 * This file is that decision, with the evidence on both sides.
 *
 * ## What the cursor actually is
 *
 * `Rules.getNextActorToAct` scans `map.actors` from `map.checkNextActorIndex`
 * for `actionPoints > 0 && !isSleeping`, parks the cursor on the first hit, and
 * returns `null` at the end of the list — which is what makes `NextMapTurn` run,
 * and `NextMapTurn` resets the cursor to 0 as it regenerates action points.
 *
 * So within one map turn the cursor only ever moves *forward past actors that
 * were not eligible*. It is not a turn number and it is not state: it is where
 * the sweep had got to. `finish()` sets it to 0 on load, and the question is
 * whether starting over from 0 is observationally different from resuming.
 *
 * **It is different only if some actor behind the cursor became eligible in the
 * meantime.** Action points cannot do that mid-turn — the writes are a spend
 * (`RogueGame.ts:5281`), two `= 0` assignments (`:27171`, `:34987`, `:34543`),
 * the spawn initialiser (`Actor.ts:385`, and `placeActor` appends at the end of
 * the list, past any cursor), and the regen in `NextMapTurn` (`:5667`) which
 * resets the cursor itself. Sleeping cannot either: `DoStartSleeping` sets the
 * flag true and spends the actor's points.
 *
 * **`DoWakeUp` (`:24479`) is the one mutation that creates eligibility behind
 * the cursor** — it clears the flag and touches neither the cursor nor the
 * action points. It is also the only one of these that `Map` does not already
 * invalidate for: `placeActor`, `removeActor` and `moveActor` all write
 * `m_checkNextActorIndex = 0 // invalidated`.
 *
 * ## The three claims, and what each buys
 *
 * 1. **Carrying the cursor would be a breaking change.** `assignFields`
 *    (`SessionGraph.ts:410-414`) *throws* on a key the spec marks `skip`:
 *    "carries `m_checkNextActorIndex`, which the format does not carry". The
 *    existing spec marks it `skip` (`specs.ts:485`), so a build that starts
 *    writing it hands every older build a save it refuses outright. That is the
 *    mechanism behind §8's "misread rather than merely lack" — and it is why
 *    carrying it costs `GRAPH_VERSION` 2, which costs **every existing
 *    single-player save**.
 * 2. **In practice it never bites.** Checked across a real run rather than
 *    asserted: at every call the invariant "no actor behind the cursor is
 *    eligible" held, so restarting the scan at 0 would have chosen the same
 *    actor. Zero violations.
 * 3. **`DoWakeUp` is the exception, and it is characterised rather than
 *    argued away.** Waking an actor behind the cursor is the one thing that
 *    breaks the invariant, and the consequence of breaking it after a load is
 *    that the woken actor takes its turn **earlier in the same sweep** than it
 *    otherwise would have. No state is lost, nothing is corrupted, and the order
 *    it gets is arguably the fairer one.
 *
 * ## The decision
 *
 * **Do not carry the cursor; do not bump the version.** Refusing every existing
 * single-player save is a large, permanent cost paid to remove a divergence that
 * requires saving *mid-sweep* and *after a wake*, and whose entire effect is that
 * one actor acts a little sooner. §6 item 8's "carry it" was right that the
 * field is skipped and right that the skip is not free — it was wrong about the
 * price being worth paying.
 *
 * The alternative considered and rejected: invalidating the cursor in
 * `DoWakeUp`, which would make the skip exactly correct by construction. It
 * would also change when a woken actor gets to act, and the C# has the same
 * code. Trading a turn-order rule for a save field, against C# parity, to solve
 * a case that only exists if you save mid-sweep, is the wrong way round.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { NullRogueUI } from "@ui/NullRogueUI";
import { Rules } from "@engine/Rules";
import { RogueGame, SimFlags } from "@engine/RogueGame";
import { Map } from "@data/Map";
import type { GraphData } from "@engine/serialization/SessionGraph";
import type { Actor } from "@data/Actor";
import {
  findPlayerActor,
  readSessionGraph,
  writeSessionGraph,
} from "@engine/serialization/sessionGraphRoot";

const SEED = 20261005;
const SETTLE_TURNS = 12;
/** Turns the invariant is watched over — a real run, not a fixture. */
const WATCHED_TURNS = 30;

let game: RogueGame;
let map: Map;

/** Every point where an eligible actor sat behind the cursor. */
interface Violation {
  cursor: number;
  index: number;
  actor: string;
  actionPoints: number;
  sleeping: boolean;
}
let violations: Violation[] = [];
/** Calls the probe saw, so "zero violations" cannot mean "zero calls". */
let watchedCalls = 0;

let uninstallProbe: () => void = () => {};

/** Is the actor at `index` something `getNextActorToAct` would pick? */
function eligible(m: Map, index: number): boolean {
  const a = m.getActor(index);
  return a.actionPoints > 0 && !a.isSleeping;
}

/**
 * The invariant, checked at the moment the cursor is *about to be used*.
 *
 * Entry rather than exit, because a load resumes by calling this: the state a
 * restored world is in is exactly the state found on the way back in. Between
 * one call and the next, the actors that ran have spent their points, so entry
 * is the earliest and therefore the strictest reading of "would restarting at 0
 * pick something different".
 */
function checkInvariant(m: Map | null): void {
  if (m == null) return;
  const c = m.checkNextActorIndex;
  if (c <= 0) return;
  for (let i = 0; i < c && i < m.countActors; i++) {
    if (!eligible(m, i)) continue;
    violations.push({
      cursor: c,
      index: i,
      actor: m.getActor(i).theName,
      actionPoints: m.getActor(i).actionPoints,
      sleeping: m.getActor(i).isSleeping,
    });
  }
}

beforeAll(async () => {
  const runner = new HeadlessRunner(SEED, new NullRogueUI());
  await runner.run({ worldSize: 1, maxTurns: SETTLE_TURNS, bot: true });
  game = runner.rogueGame;
  map = game.session.currentMap!;
  expect(map, "the settled run left a live map").toBeTruthy();

  const proto = Rules.prototype as unknown as {
    getNextActorToAct: (m: Map | null, turn: number) => Actor | null;
  };
  const original = proto.getNextActorToAct;
  proto.getNextActorToAct = function (
    this: Rules,
    m: Map | null,
    turn: number,
  ): Actor | null {
    if (violations !== null) {
      watchedCalls++;
      checkInvariant(m);
    }
    return original.call(this, m, turn);
  };
  uninstallProbe = () => {
    proto.getNextActorToAct = original;
  };
}, 120_000);

afterAll(() => {
  uninstallProbe();
});

describe("the turn cursor can be discarded", () => {
  it("never sits in front of an actor that is eligible, across a real run", async () => {
    violations = [];
    watchedCalls = 0;

    const session = game.session;
    for (let i = 0; i < WATCHED_TURNS; i++) {
      const district = session.currentMap?.district;
      if (district == null) break;
      await game.AdvancePlay(district, 0 as never);
      session.currentMap?.assertActorIntegrity();
    }

    // Pinned together: a report of "no violations" from a probe that never ran
    // would say nothing, so the call count is part of the finding.
    expect(watchedCalls, "the probe actually watched calls").toBeGreaterThan(100);
    expect(
      violations.length,
      `no actor behind the cursor was eligible at any call — ` +
        `${violations.length} violation(s) in ${watchedCalls} calls: ` +
        `${JSON.stringify(violations.slice(0, 5))}`,
    ).toBe(0);
  }, 300_000);

  it("so restarting the scan at 0 picks exactly what the cursor would have", async () => {
    // The claim, stated as an equality rather than left as an implication: run
    // the map turn to a point where the cursor has moved, then compare the
    // parked pick against the pick a freshly loaded map (cursor 0) would make.
    const before = map.localTime.turnCounter;

    // One actor at a time, not one district turn: `NextMapTurn` resets the
    // cursor to 0 the moment a map turn completes, so a district advance always
    // lands on a boundary and would report 0 every time. The interesting state
    // is *inside* a sweep, and only `AdvancePlay(map, …)` stops there.
    let guard = 0;
    while (map.checkNextActorIndex === 0 && map.localTime.turnCounter === before) {
      if (++guard > 5_000) break;
      await game.AdvancePlay(map, SimFlags.NOT_SIMULATING);
    }
    expect(
      map.checkNextActorIndex,
      "the sweep got part-way (one actor per step, cursor parked off zero)",
    ).toBeGreaterThan(0);

    const turn = map.localTime.turnCounter;
    const withCursor = game.rules.getNextActorToAct(map, turn);

    // What `finish()` does on load.
    const savedCursor = map.checkNextActorIndex;
    map.checkNextActorIndex = 0;
    const fromZero = game.rules.getNextActorToAct(map, turn);

    expect(
      fromZero === withCursor,
      `restarting at 0 chose ${fromZero?.theName ?? "null"}, the parked cursor ` +
        `chose ${withCursor?.theName ?? "null"}`,
    ).toBe(true);

    // Put it back: this map is shared with the file's other cases.
    map.checkNextActorIndex = savedCursor;
  }, 300_000);
});

describe("and the one thing that breaks it", () => {
  it("DoWakeUp creates eligibility behind the cursor without touching it", async () => {
    // The exception, constructed rather than hoped for. `Map` invalidates the
    // cursor on `placeActor`, `removeActor` and `moveActor`; `DoWakeUp` is the
    // only mutation that can make an actor eligible without doing so.
    //
    // Walk the sweep forward one actor at a time — a district advance ends on a
    // turn boundary where the cursor is 0 by construction and there is nothing
    // to sit behind.
    const turnBefore = map.localTime.turnCounter;
    let guard = 0;
    while (map.checkNextActorIndex === 0 && map.localTime.turnCounter === turnBefore) {
      if (++guard > 5_000) break;
      await game.AdvancePlay(map, SimFlags.NOT_SIMULATING);
    }
    const cursor = map.checkNextActorIndex;
    expect(cursor, "there is a cursor to sit behind").toBeGreaterThan(0);

    // Behind the cursor *every* actor is ineligible — that is the invariant the
    // previous case spent 30 turns establishing. So there is no victim to find
    // by inspection; the only shape that can become eligible is one holding
    // action points while asleep, and if none is holding any they have to be
    // given some. Which path was taken is reported rather than assumed, because
    // "constructed" and "found" are different strengths of evidence.
    let victimIndex = -1;
    for (let i = 0; i < cursor && i < map.countActors; i++) {
      if (map.getActor(i).actionPoints > 0) {
        victimIndex = i;
        break;
      }
    }
    let constructed = false;
    if (victimIndex < 0) {
      constructed = true;
      victimIndex = 0;
      map.getActor(victimIndex).actionPoints = 1;
    }

    const victim = map.getActor(victimIndex);
    const apBefore = victim.actionPoints;
    expect(victimIndex, "the victim is behind the cursor").toBeLessThan(cursor);
    expect(
      apBefore,
      "the victim is holding action points, so only sleep is holding them back",
    ).toBeGreaterThan(0);

    victim.isSleeping = true;
    expect(eligible(map, victimIndex), "asleep ⇒ not eligible").toBe(false);
    expect(
      checkInvariant(map),
      "the invariant holds while they are asleep",
    ).toBeUndefined();

    const cursorBefore = map.checkNextActorIndex;
    game.DoWakeUp(victim);

    expect(
      map.checkNextActorIndex,
      "DoWakeUp left the cursor where it was — unlike placeActor/removeActor/moveActor",
    ).toBe(cursorBefore);
    expect(eligible(map, victimIndex), "awake with points ⇒ eligible").toBe(true);
    expect(
      map.checkNextActorIndex,
      "…so an eligible actor now sits behind it",
    ).toBeGreaterThan(victimIndex);

    // Which is precisely the divergence: a load from here starts the scan at 0
    // and finds them; the live map does not look at them again until the next
    // `NextMapTurn` resets the cursor. That is the whole of it — one actor, one
    // sweep, a different order, and no state lost.
    violations = [];
    checkInvariant(map);
    expect(
      violations.length,
      `the invariant reports it (${constructed ? "victim constructed" : "victim found holding points"}), ` +
        `which is the whole of the exception`,
    ).toBe(1);
    violations = [];

    // Leave the world as found.
    victim.isSleeping = false;
    victim.actionPoints = apBefore;
  }, 300_000);
});

describe("carrying the cursor instead", () => {
  it("would hand every older build a save it refuses to open", async () => {
    // The other half of the decision, and the reason it is not simply "save the
    // field and be exact": `assignFields` throws on a key whose codec says
    // `skip`. The existing spec says `skip` (`specs.ts:485`), so writing it
    // turns an additive-looking field into a hard refusal downstream — which is
    // what §8 means by an old build misreading rather than lacking, and what
    // makes the alternative cost `GRAPH_VERSION` 2 and every existing save.
    const session = game.session;
    const world = session.world!;
    const currentMap = session.currentMap!;

    const data = writeSessionGraph(
      world,
      currentMap,
      session.scoring,
      session,
      findPlayerActor(currentMap),
      session.worldTime.turnCounter,
    );

    // Sanity: the untouched graph still reads, so the throw below is the field.
    expect(() => readSessionGraph(data)).not.toThrow();

    const mapIndex = data.objs.findIndex((o) => o.k === "Map");
    expect(mapIndex, "the graph carries a Map record").toBeGreaterThanOrEqual(0);

    const tampered: GraphData = {
      ...data,
      objs: data.objs.map((o, i) =>
        i === mapIndex
          ? { ...o, f: { ...o.f, m_checkNextActorIndex: 7 } }
          : o,
      ),
    };

    expect(() => readSessionGraph(tampered)).toThrowError(
      /carries m_checkNextActorIndex, which the format does not carry/,
    );
  }, 120_000);
});

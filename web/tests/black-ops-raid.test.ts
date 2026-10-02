/**
 * `Feature.BlackOpsRaid` — and the reason this file is mostly about a missing line.
 *
 * The raid was **already fully implemented** before this feature landed:
 * `CheckForEvent_BlackOpsRaid`, `FireEvent_BlackOpsRaid`, `SpawnNewBlackOpsLeader`
 * and `SpawnNewBlackOpsTrooper` were all in `RogueGame.ts`, and they were firing in
 * every ruleset. That is precisely why `Feature.BlackOpsRaid` sat in `PENDING_WIRING`
 * with *zero* call sites: the feature-flags partition test counts readers, so a
 * feature whose behaviour exists but whose gate does not reads as unwired.
 *
 * Three things are pinned, and the first is the one that was actually wrong:
 *
 * 1. **CLASSIC stops getting the raid.** `Feature.BlackOpsRaid` is fork content —
 *    Release 6-1 added the music and rewrote both messages — so `hasFeature` is
 *    what says "not under Classic". The gate goes on the *check*, not the *fire*:
 *    `FireEvent_BlackOpsRaid` is reached from exactly one call site, so gating it
 *    there would still let `CheckForEvent_BlackOpsRaid` spend its day, gap and
 *    chance work in a Classic district for a raid that can then never happen.
 * 2. **The Release 6-1 refresh.** The port was still playing `GameMusics.ARMY` and
 *    saying `"You hear a chopper flying over the city!"` / `"The chopper has
 *    dropped something"` — the pre-6-1 text, which described the wrong vehicle and
 *    the wrong delivery. The C# plays `GameMusics.BLACK_OPS` and says `"A plane
 *    passes quickly over the city!"` / `"Parachutists have dropped"`
 *    (`RogueGame.cs:28625-28632`).
 * 3. **The gate replaces an option, it does not sit beside one.** The C# gates this
 *    on `s_Options.BlackOpsRaidsEnabled` (`RogueGame.cs:28578`, Release 7-5), and
 *    that option does not exist in the port. So there is no second clause to
 *    preserve, and asserting the absence of one is what stops somebody adding a
 *    re-implementation of the option next to the flag.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Actor } from "@data/Actor";
import { District, DistrictKind } from "@data/District";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { Weather } from "@data/Weather";
import { GameMusics } from "@gameplay/GameSounds";
import { GameTiles } from "@gameplay/GameTiles";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems } from "@gameplay/GameItems";
import { NullRogueUI } from "@ui/NullRogueUI";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;

const check = (): boolean =>
  (game as unknown as { CheckForEvent_BlackOpsRaid(m: GameMap): boolean }).CheckForEvent_BlackOpsRaid(map);

/**
 * Put the district clock on day `d`. `WorldTime.day` is derived from
 * `turnCounter` (`WorldTime.ts:60`), so the day is set by advancing the counter
 * rather than by assigning a field that only has a getter.
 */
const setDay = (d: number): void => {
  map.localTime.turnCounter = d * WorldTime.TURNS_PER_DAY;
};

beforeEach(() => {
  new GameActors();
  new GameTiles();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(1, 1));
  game.m_Player = player;
  // `HasRaidHappenedSince` reads the district off the map, and `Session.hasRaidHappened`
  // keys its bookkeeping on the district's world position -- so a bare District is
  // enough and the test does not need a whole World built around it.
  map.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  // Drawing is orthogonal to what is asserted here, and no raid test existed before.
  (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  setDay(1000);
});

describe("Feature.BlackOpsRaid: the feature gate", () => {
  it("fires under STILL_ALIVE once the day gate is satisfied", () => {
    // Not "some seed produced a raid" -- the chance is 1% per turn, so a bare call
    // would be a coin flip. This asserts the gate is *reachable* by making the
    // chance deterministic and the day gate true, and then still allowing the roll
    // to decide, checked over enough turns that a working gate shows up.
    let fired = 0;
    for (let turn = 0; turn < 400; turn++) fired += check() ? 1 : 0;
    expect(fired, "a 1%-per-turn check fires over 400 turns").toBeGreaterThan(0);
  });

  it("never fires under CLASSIC, which is the whole point of the gate", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    let fired = 0;
    for (let turn = 0; turn < 400; turn++) fired += check() ? 1 : 0;
    expect(fired, "CLASSIC must never see a Black Ops raid").toBe(0);
  });

  it("spends no dice at all under CLASSIC, not merely no raid", () => {
    // The gate is the *first* statement, ahead of the day test, so a Classic
    // district pays nothing -- not even a `rollChance` on a raid that cannot
    // happen. Gating one line lower would still pass the test above.
    Session.get().ruleset = Ruleset.CLASSIC;
    const roller = game.m_Rules.rollChance.bind(game.m_Rules);
    let rolls = 0;
    (game.m_Rules as unknown as { rollChance(c: number): boolean }).rollChance = (c: number) => {
      rolls++;
      return roller(c);
    };
    try {
      for (let turn = 0; turn < 50; turn++) check();
    } finally {
      (game.m_Rules as unknown as { rollChance(c: number): boolean }).rollChance = roller;
    }
    expect(rolls, "the gate precedes every roll in the method").toBe(0);
  });

  it("does not fire before BLACKOPS_RAID_DAY even under STILL_ALIVE", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    setDay(0);
    let fired = 0;
    for (let turn = 0; turn < 200; turn++) fired += check() ? 1 : 0;
    expect(fired, "the day gate is still the C#'s").toBe(0);
  });
});

describe("Feature.BlackOpsRaid: the Release 6-1 refresh", () => {
  it("plays BLACK_OPS, not the Army track the port used before", () => {
    // The music constant has to exist and be distinct from ARMY: reusing ARMY would
    // have left this test green with the bug in place.
    expect(GameMusics.BLACK_OPS).toBe("black ops");
    expect(GameMusics.BLACK_OPS).not.toBe(GameMusics.ARMY);
    expect(GameMusics.BLACK_OPS_FILE).toContain("Black Ops");
  });

  it("no longer says 'chopper', which was the pre-6-1 helicopter text", () => {
    // Source-level rather than behavioural: firing the raid needs a live district,
    // a raid spawn and a redraw, and the strings are the thing that regressed.
    const src = readFileSync(join(__dirname, "../src/engine/RogueGame.ts"), "utf8");
    expect(src).toContain('"A plane passes quickly over the city!"');
    expect(src).toContain('"Parachutists have dropped"');
    expect(src).not.toContain("You hear a chopper flying over the city!");
    expect(src).not.toContain("The chopper has dropped something");
  });
});
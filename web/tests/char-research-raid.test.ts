/**
 * `Feature.CHARResearchRaid` — the encounter in `RogueGame.ts`: the fifth
 * constants, the ninth dispatch arm, the check, the fire, and three spawners.
 *
 * The factories these call are covered by `char-research-raid-factories.test.ts`;
 * this file is about the encounter's own shape, and four things in it are the kind
 * of detail that a plausible port gets wrong:
 *
 * 1. **The gate is the whole feature for Classic purposes.** The C# gates this on
 *    *nothing* — no `hasFeature`, and no option either, unlike
 *    `CheckForEvent_BlackOpsRaid` which tests `s_Options.BlackOpsRaidsEnabled` at
 *    `:28578`. So the port's `hasFeature` is an addition, and without it a Classic
 *    district fields a four-strong CHAR team with tactical shotguns.
 * 2. **The dispatch is the ninth of nine, and order is load-bearing.** Each
 *    `CheckForEvent` spends a `RollChance`, so moving this arm changes the dice
 *    stream and every district's event sequence after it.
 * 3. **The two squad loops subtract one from different totals, and that asymmetry is
 *    the reference's.** `SCIENTISTS_TEAM_SCIENTISTS - 1` is right — the leader is
 *    spawned separately, so 4 - 1 gives three colleagues and four scientists in
 *    all. `SCIENTISTS_TEAM_GUARDS - 1` gives **two** guards for a raid the
 *    constant describes as three. "Fixing" it would make the raid one actor
 *    stronger than the reference.
 * 4. **The gate precedes every roll.** A Classic district pays nothing, not even
 *    the 1% chance roll — which a gate one line lower would still pass.
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
import { Weather } from "@data/Weather";
import {
  SCIENTISTS_TEAM_CHANCE_PER_TURN,
  SCIENTISTS_TEAM_DAY,
  SCIENTISTS_TEAM_DAY_GAP,
  SCIENTISTS_TEAM_GUARDS,
  SCIENTISTS_TEAM_SCIENTISTS,
} from "@engine/RogueGame";
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
  (
    game as unknown as { CheckForEvent_CHARScientists(m: GameMap): boolean }
  ).CheckForEvent_CHARScientists(map);

const setDay = (d: number): void => {
  map.localTime.turnCounter = d * 720; // WorldTime.TURNS_PER_DAY
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
  map.district = new District(new Point(0, 0), DistrictKind.GENERAL);
  (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  setDay(1000);
});

/**
 * The source text of one method, bounded by the *next* method's leading comment.
 *
 * An unbounded `slice` is a trap here: `src.indexOf("SpawnNewCHARGuard(map: Map")`
 * then running to end-of-file picks up three further `makeItemShotgunAmmo()`
 * occurrences from later methods, and a count assertion silently reads six.
 */
function methodSource(signature: string): string {
  const src = readFileSync(join(__dirname, "../src/engine/RogueGame.ts"), "utf8");
  const start = src.indexOf(signature);
  expect(start, `${signature} exists in RogueGame.ts`).toBeGreaterThan(0);
  const rest = src.slice(start + signature.length);
  const next = rest.search(/\n\t(?:\/\/|\/\*\*)/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("Feature.CHARResearchRaid: the constants", () => {
  it("are the C#'s `RogueGame.cs:339-343`, verbatim", () => {
    expect(SCIENTISTS_TEAM_DAY).toBe(21);
    expect(SCIENTISTS_TEAM_SCIENTISTS).toBe(4);
    expect(SCIENTISTS_TEAM_GUARDS).toBe(3);
    expect(SCIENTISTS_TEAM_CHANCE_PER_TURN).toBe(1);
    expect(SCIENTISTS_TEAM_DAY_GAP).toBe(5);
  });
});

describe("Feature.CHARResearchRaid: the feature gate", () => {
  it("fires under STILL_ALIVE once the day gate is satisfied", () => {
    // Not "some seed produced a raid" -- the chance is 1% per turn, so a bare call
    // would be a coin flip. Checking enough turns makes a working gate observable
    // without deciding the dice.
    let fired = 0;
    for (let turn = 0; turn < 400; turn++) fired += check() ? 1 : 0;
    expect(fired).toBeGreaterThan(0);
  });

  it("never fires under CLASSIC", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    let fired = 0;
    for (let turn = 0; turn < 400; turn++) fired += check() ? 1 : 0;
    expect(fired, "CLASSIC must never field a CHAR research team").toBe(0);
  });

  it("spends no dice at all under CLASSIC", () => {
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
    expect(rolls, "the gate precedes the day test and the chance roll").toBe(0);
  });

  it("still honours the day gate under STILL_ALIVE", () => {
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    setDay(0);
    let fired = 0;
    for (let turn = 0; turn < 200; turn++) fired += check() ? 1 : 0;
    expect(fired).toBe(0);
  });
});

describe("Feature.CHARResearchRaid: the dispatch and the squad shape", () => {
  it("is the ninth of nine, after Band of Survivors", () => {
    // Source-level, because the property is *order*: each arm spends a RollChance,
    // so a reordering would change every district's event sequence. The two
    // comments are the C#'s own numbering (`:5710` is "9 CHAR scientists").
    const src = readFileSync(join(__dirname, "../src/engine/RogueGame.ts"), "utf8");
    const bandAt = src.indexOf("CheckForEvent_BandOfSurvivors(entryMap)");
    const charAt = src.indexOf("CheckForEvent_CHARScientists(entryMap)");
    expect(bandAt).toBeGreaterThan(0);
    expect(charAt).toBeGreaterThan(bandAt);
    expect(src).toContain("// 9 CHAR scientists research team?");
  });

  it("spawns two guards and not three, because the C#'s loops disagree", () => {
    // The asymmetry is the point. Four scientists total (leader + 3) is consistent;
    // three guards described by the constant and two actually spawned is not, and
    // it is preserved.
    expect(SCIENTISTS_TEAM_SCIENTISTS - 1).toBe(3);
    expect(SCIENTISTS_TEAM_GUARDS - 1).toBe(2);

    const src = readFileSync(join(__dirname, "../src/engine/RogueGame.ts"), "utf8");
    expect(src).toContain("i < SCIENTISTS_TEAM_SCIENTISTS - 1");
    expect(src).toContain("i < SCIENTISTS_TEAM_GUARDS - 1");
  });

  it("gives the guard a tactical shotgun and three shells, and the scientists nothing extra", () => {
    // `char-research-raid-factories.test.ts` covers the factory's own loot; this is
    // about what `SpawnNewCHARGuard` adds on top of `createNewCHARGuard`.
    const body = methodSource("SpawnNewCHARGuard(map: Map");
    expect(body).toContain("makeItemTacticalShotgun()");
    expect((body.match(/makeItemShotgunAmmo\(\)/g) ?? [])).toHaveLength(3);
    expect(body).toContain("SkillID.AGILE");
    expect(body).toContain("SkillID.FIREARMS");
    expect(body).toContain("SkillID.TOUGH");

    // The scientist spawner adds a skill and nothing else -- no weapon, no ammo.
    const scientist = methodSource("SpawnNewCHARScientist(map: Map");
    expect(scientist).toContain("SkillID.LEADERSHIP");
    expect(scientist).not.toContain("Shotgun");
  });

  it("puts the leader on the map border and everyone else near the leader", () => {
    expect(methodSource("SpawnNewCHARScientistLeader(map: Map")).toContain(
      "SpawnActorOnMapBorder",
    );
    expect(methodSource("SpawnNewCHARScientist(map: Map")).toContain("SpawnActorNear");
  });
});

describe("Feature.CHARResearchRaid: the announcement", () => {
  it("plays CHAR_RESEARCHERS, and that constant resolves to a file", () => {
    expect(GameMusics.CHAR_RESEARCHERS).toBe("char researchers");
    expect(GameMusics.CHAR_RESEARCHERS_FILE).toContain("RS - CHAR researchers");
  });

  it("says the C#'s two lines, not a helicopter's", () => {
    const src = readFileSync(join(__dirname, "../src/engine/RogueGame.ts"), "utf8");
    expect(src).toContain("You hear a strange, electronic whirring in the distance.");
    expect(src).toContain("A vehicle has stopped");
    expect(src).toContain("A CHAR research team entered the district.");
  });
});
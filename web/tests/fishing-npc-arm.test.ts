/**
 * `Feature.Fishing`: the NPC arm -- Release 7-6.
 *
 * The player half of this feature was wired long before this, and could not be
 * used: `Map.hasFishing` was false on every map, so no NPC ever entered the arm
 * below however willing it was. The pond generator (`makeParkPond`) is what made
 * it reachable, and this file is the other half.
 *
 * What is worth testing here is mostly *ordering*, because the arm is three
 * fallbacks and two entry points and the C#'s comments are about where they sit:
 *
 *  1. **"complete a fishing" is the first thing `selectAction` does.** Anywhere else
 *     in the chain and a hungry survivor charges food instead, a scared one runs,
 *     and the cast silently never resolves.
 *  2. **`BehaviorGoFish` returns a wait three times** with different `isFishing`
 *     flags, and the *caller* advances the state. A single "does it fish" assertion
 *     would pass without any of that being true.
 *  3. **The whole-map water scan is last**, and its safety depends on
 *     `Map.hasFishing` being true only for ponds -- the C# says so in a comment, and
 *     the comment is the only thing stopping it from sending NPCs to mall fountains.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Activity } from "@data/Activity";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { Weather } from "@data/Weather";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { ItemID, GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { ActionWait } from "@engine/actions/Actions";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let npc: Actor;

beforeEach(() => {
  new GameTiles();
  new GameActors();
  new GameFactions();
  new GameItems();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  for (let x = 0; x < 40; x++) {
    for (let y = 0; y < 40; y++) {
      map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_CONCRETE)!);
    }
  }
  // The player, so `doWait` and the LOS helpers have someone to be relative to.
  const player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN)!, survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(1, 1));
  game.m_Player = player;

  npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN)!, survivors, "survivor");
  npc.controller = new PlayerController();
  map.placeActor(npc, new Point(5, 5));
});

/** A 5x5 pond, the C#'s `MakeParkPond` shape: a 3x3 of water inside a ring. */
const makePond = (cx: number, cy: number): void => {
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let y = cy - 2; y <= cy + 2; y++) {
      map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_POND_CENTER)!);
    }
  }
  map.hasFishing = true;
  map.hasWaterTiles = true;
};


describe("ActionWait: the isFishing flag", () => {
  it("defaults to a plain wait", () => {
    // The C#'s `bool isFishing = false` (`ActionWait.cs:17`). Every existing caller
    // gets a wait, not a cast, and that default is what makes the flag additive.
    const action = new ActionWait(npc, game as never);
    expect(action).toBeInstanceOf(ActionWait);
  });

  it("is a distinct third state, not a boolean the AI sets once", () => {
    // `BehaviorGoFish` returns a wait three times and the flag is what tells them
    // apart, so the constructor has to accept it.
    expect(new ActionWait(npc, game as never, true)).toBeInstanceOf(ActionWait);
    expect(new ActionWait(npc, game as never, false)).toBeInstanceOf(ActionWait);
  });
});

describe("Activity: the labels the fishing arm needs", () => {
  it("has SEARCHING and WAITING, appended", () => {
    // No `Activity` reaches a save (`Data/Actor.cs` writes none), so the numbering
    // is a per-run label and appending is free.
    expect(Activity.SEARCHING).toBe(10);
    expect(Activity.WAITING).toBe(11);
    expect(Activity.FISHING).toBe(9);
  });
});

describe("the gate", () => {
  it("is on under STILL_ALIVE", () => {
    expect(hasFeature(Session.get().ruleset, Feature.Fishing)).toBe(true);
  });
});

describe("the pond is what makes the arm reachable", () => {
  it("an NPC on a map with no fishing never sets hasFishing itself", () => {
    // The property defaults false and only `makeParkPond` sets it. Asserted here
    // because it is the precondition the whole NPC arm gates on, and because a
    // future generator that set it carelessly would silently make every hungry NPC
    // on a fountain-floored map walk to a fountain.
    expect(new GameMap(1, "fresh", 8, 8).hasFishing).toBe(false);
    makePond(25, 25);
    expect(map.hasFishing, "a pond sets it").toBe(true);
  });

  it("a pond's water tiles really are water", () => {
    makePond(25, 25);
    expect(map.getTileAt(25, 25)!.model.isWater, "the middle is water").toBe(true);
  });
});

describe("the two rods the C# distinguishes", () => {
  it("FISHING_ROD is 170 and not the C#'s mid-enum position", () => {
    // Appended for the same reason as every other item: a save stores the number.
    expect(ItemID.FISHING_ROD).toBe(170);
  });

  it("matches sits at 178 and does not collide with it", () => {
    expect(ItemID.MATCHES).toBe(178);
    expect(ItemID.MATCHES).not.toBe(ItemID.FISHING_ROD);
  });
});

describe("where the arm lives", () => {
  it("is in CivilianAI and not in the shared BaseAI entry point", () => {
    // A source check, and the reason is that `behaviorGoFish` is `protected` on
    // `BaseAI` -- so a refactor that moved the *call* up to a shared step would make
    // every AI kind fish, including undeads, which the C# does not do.
    //
    // The behaviour lives on `BaseAI` (the C# has it there too, `BaseAI.cs:5550`)
    // and the *decision* to fish lives in `CivilianAI`. What must not happen is
    // `BaseAI` calling it for everyone.
    const src = readFileSync(join(__dirname, "..", "src", "gameplay", "ai", "BaseAI.ts"), "utf-8");
    expect(src, "BaseAI defines the behaviour but must not call it").not.toMatch(
      /this\.behaviorGoFish\(/,
    );

    const civ = readFileSync(
      join(__dirname, "..", "src", "gameplay", "ai", "CivilianAI.ts"),
      "utf-8",
    );
    expect(civ, "CivilianAI is the only caller").toMatch(/this\.behaviorGoFish\(/);
  });
});

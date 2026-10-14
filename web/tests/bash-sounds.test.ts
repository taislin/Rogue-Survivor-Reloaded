/**
 * The bash half of the bash/break ladder — Still Alive, Release 5-4.
 *
 * `PlayBashOrBreakSFX` had one caller and it passed `isBroken: true`, so every
 * bash of a door played the *break* sound and the four `BASH_*` ids in
 * `BASH_BY_MATERIAL` were unreachable: a ladder whose second half had nothing
 * to read it. The C# calls it three times in `DoBreak` (`RogueGame.cs:22477`,
 * `:22559`, `:22588`) and once in `DoDestroyObject` (`:22435`), and the port had
 * only the last of those.
 *
 * What is asserted here is the shape of that fix and not the sounds: which arm
 * plays, which arm stays silent, and why the broken arm is silent — the C# takes
 * its break sound from `DoDestroyObject` and says so at `:22581`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Location } from "@data/Location";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import type { ISoundManager } from "@engine/audio/ISoundManager";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameSounds } from "@gameplay/GameSounds";
import { NullRogueUI } from "@ui/NullRogueUI";

const survivors = new Faction("The Survivors", "survivor");

/** Records every id, and pretends nothing is still ringing. */
class Recording implements ISoundManager {
  public readonly played: string[] = [];
  play(id: string): void {
    this.played.push(id);
  }
  playIfNotAlreadyPlaying(id: string): boolean {
    this.played.push(id);
    return true;
  }
  stopAll(): void {}
  setVolume(): void {}
  setEnabled(): void {}
  getVolume(): number {
    return 1;
  }
  preload(): Promise<void> {
    return Promise.resolve();
  }
}

/** The four bash ids, read out of the ladder rather than hand-listed. */
const BASH_IDS: readonly string[] = [
  GameSounds.BASH_WOOD_NEARBY,
  GameSounds.BASH_METALDOOR_NEARBY,
  GameSounds.BASH_CERAMIC_VISIBLE,
  GameSounds.BASH_OTHER_OBJECTS_NEARBY,
];

let sfx: Recording;
let game: RogueGame;
let map: GameMap;
let player: Actor;

/** A door that gives wood, so the ladder's wood rung answers. */
function woodenDoor(hitPoints: number): DoorWindow {
  const d = new DoorWindow(
    "a door",
    GameImages.OBJ_WOODEN_DOOR_CLOSED,
    GameImages.OBJ_WOODEN_DOOR_OPEN,
    GameImages.OBJ_WOODEN_DOOR_BROKEN,
    DoorWindow.BASE_HITPOINTS,
  );
  d.location = new Location(map, new Point(5, 5));
  d.givesWood = true;
  d.hitPoints = hitPoints;
  return d;
}

beforeEach(() => {
  new GameActors();
  new GameItems();
  sfx = new Recording();
  game = new RogueGame(new NullRogueUI(), undefined, undefined, sfx);
  map = new GameMap(1, "test", 40, 40);
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  player.location = new Location(map, new Point(6, 5));
  map.placeActor(player, player.location.position);
  game.m_Player = player;
  // `DoBreak` reaches the play screen on its visible arm; the door is out of
  // the player's FOV in these tests, so the stub is belt and braces.
  (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
});

describe("the bash half of the bash/break ladder", () => {
  it("plays when a barricaded door is hit, whatever the player can see", async () => {
    // C# `:22477`: the barricade arm plays a bash *before* anything else, so
    // this is the one call site that does not depend on visibility or
    // audibility -- and the one the port was missing, which is why the whole
    // `isBroken: false` half of the ladder was dead.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const door = woodenDoor(40);
    door.barricadePoints = 10;
    await game.DoBreak(player, door);
    expect(sfx.played.length, "one bash id was played").toBe(1);
    expect(BASH_IDS).toContain(sfx.played[0]);
  });

  it("plays when an unbarricaded door is hit and does not break", async () => {
    // C# `:22559`, the seen arm: the object survives the hit, so what is heard
    // is a bash. 400 HP against a civilian's unarmed attack is not a break.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const door = woodenDoor(400);
    await game.DoBreak(player, door);
    expect(sfx.played.length, "one bash id was played").toBe(1);
    expect(BASH_IDS).toContain(sfx.played[0]);
  });

  it("plays when someone else bashes a door the player can only hear", async () => {
    // C# `:22588`, the heard arm: the player sees neither the actor nor the
    // object, and hears the bash anyway. This is the arm most bashes land in
    // during real play -- the survivor is usually looking somewhere else --
    // and the reason the third call exists as well as the second.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "someone");
    npc.location = new Location(map, new Point(6, 5));
    await game.DoBreak(npc, woodenDoor(400));
    expect(sfx.played.length, "one bash id was played").toBe(1);
    expect(BASH_IDS).toContain(sfx.played[0]);
  });

  it("plays nothing when the hit breaks the door", async () => {
    // The C#'s `:22581` comment -- "sound effect for this can be found in
    // `DoDestroyObject`" -- so the broken arm deliberately plays no bash, and
    // the break sound that *is* played comes from there. A second sound here
    // would be a crash followed by a thump.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    const door = woodenDoor(1);
    await game.DoBreak(player, door);
    expect(BASH_IDS.some((id) => sfx.played.includes(id))).toBe(false);
  });

  it("plays nothing under Classic, because every bash id is Release 5-4", async () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    const door = woodenDoor(40);
    door.barricadePoints = 10;
    await game.DoBreak(player, door);
    expect(sfx.played).toEqual([]);
  });
});

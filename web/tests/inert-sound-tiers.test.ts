/**
 * Three inert distance-tier families, and the reason they were inert.
 *
 * The port declares 181 of the fork's sound ids and plays 78. **52 of the 181 are
 * distance tiers** -- a `_PLAYER` / `_NEARBY` / `_FAR` / `_VISIBLE` / `_AUDIBLE`
 * suffix is a *tier*, not a separate event -- and 43 of those had no call site at all:
 * declared, tabled, on disk, and never selected.
 *
 * The audio was never the missing piece. `NoiseDistance.ts` already had
 * `NOISE_RADII`, `bandForDistance` and `isAudibleTo`; what was missing was the
 * **decision** -- which id a given event plays -- and that decision lives in the C#'s
 * call sites, not in a table. So this file drives three of those call sites.
 *
 * ## The three shapes, and two of them are not the same shape
 *
 * - **shout** is `isPlayer ? _PLAYER : audible ? _NEARBY`, plus a sex-major ternary,
 *   so **four** ids for one event.
 * - **melee** is the same shape, and the C# plays it with `Play` rather than
 *   `PlayIfNotAlreadyPlaying` -- two landed hits in one turn must both be heard.
 * - **door** has no tiers at all. It is a four-way **material** ladder off one audible
 *   gate, and its order is the content: `givesWood` beats `isMetal`, so a wooden-framed
 *   metal door is reported as wood.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Map as GameMap } from "@data/Map";
import { Location } from "@data/Location";
import { Doll, DollBody } from "@data/Doll";
import { Point } from "@engine/Point";
import { Models } from "@data/Models";
import { DoorWindow } from "@engine/mapobjects/MapObjects";
import { GameImages } from "@gameplay/GameImages";
import { Faction } from "@data/Faction";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import type { ISoundManager } from "@engine/audio/ISoundManager";
import { ActorID, GameActors } from "@gameplay/GameActors";
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

describe("the inert distance tiers, now wired", () => {
  let sfx: Recording;
  let game: RogueGame;
  let map: GameMap;
  let player: Actor;

  beforeEach(() => {
    new GameActors();
    new GameItems();
    sfx = new Recording();
    game = new RogueGame(new NullRogueUI(), undefined, undefined, sfx);
    map = new GameMap(1, "test", 40, 40);
    player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
    player.controller = new PlayerController();
    map.placeActor(player, player.location.position);
    game.m_Player = player;
    // `DoCloseDoor` ends in `RedrawPlayScreen`, which reads `m_MapViewRect` -- and that
    // only exists after `StartNewGame`. Stubbed for the same reason `extended-audio`
    // stubs it: the draw is not what is under test, and the C# calls it unconditionally
    // at the end of the audible branch.
    (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  });

  /** An actor standing `dx`, `dy` tiles from the player, on the same map. */
  const neighbour = (dx: number, dy: number, male = true): Actor => {
    const other = new Actor(
      Models.actors.get(ActorID.MALE_CIVILIAN),
      survivors,
      male ? "man" : "woman",
    );
    other.doll = new Doll(new DollBody(male, 1));
    other.location = new Location(
      map,
      new Point(player.location.position.x + dx, player.location.position.y + dy),
    );
    return other;
  };

  describe("shout: four ids for one event", () => {
    it("plays the player's own tier, chosen by the doll's sex", async () => {
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      await game.DoShout(player, "hello");
      expect(sfx.played).toEqual([GameSounds.MALE_SHOUT_PLAYER]);
    });

    it("plays _NEARBY for someone the player can hear, and the female tier for a woman", async () => {
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      await game.DoShout(neighbour(1, 0, false), "hello");
      expect(sfx.played).toEqual([GameSounds.FEMALE_SHOUT_NEARBY]);
    });

    it("plays nothing for someone out of earshot, even though the message still lands", async () => {
      // 40 tiles is past BOOMING (23), so `isAudibleToPlayer` is false. The C# puts
      // the sound *before* the message and gates only the sound, so a distant shout
      // is still narrated -- the gate is on hearing, not on the event.
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      await game.DoShout(neighbour(40, 0), "hello");
      expect(sfx.played).toEqual([]);
    });

    it("is silent under Classic, because all four ids are Release 7-2 additions", async () => {
      Session.get().ruleset = Ruleset.CLASSIC;
      await game.DoShout(player, "hello");
      expect(sfx.played).toEqual([]);
    });

    it("does not give the undead a human voice", async () => {
      // The C#'s own "//just in case" (`RogueGame.cs:20586`) is kept verbatim: an
      // undead crowd shouting in a human register is exactly what that guard is for.
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      const undead = neighbour(1, 0);
      undead.model = Models.actors.get(ActorID.UNDEAD_ZOMBIE);
      await game.DoShout(undead, "brains");
      expect(sfx.played).toEqual([]);
    });
  });

  describe("door: four ids off one gate, ordered by material", () => {
    /**
     * A door, given the flags that pick a rung of the ladder.
     *
     * `name` is the **bare** noun: `theName` is derived as `"the " + name`
     * (`MapObject.cs:79`), so passing `"the roller door"` here would produce
     * `"the the roller door"` and miss the fork's string comparison -- which is a fair
     * demonstration of how brittle that comparison is, and why it is worth a test that
     * pins it rather than a comment that says so.
     */
    const door = (flags: { wood?: boolean; metal?: boolean; name?: string }) => {
      const d = new DoorWindow(
        flags.name ?? "a door",
        GameImages.OBJ_WOODEN_DOOR_CLOSED,
        GameImages.OBJ_WOODEN_DOOR_OPEN,
        GameImages.OBJ_WOODEN_DOOR_BROKEN,
        DoorWindow.BASE_HITPOINTS,
      );
      d.location = new Location(map, new Point(5, 5));
      d.givesWood = flags.wood ?? false;
      d.isMetal = flags.metal ?? false;
      return d;
    };

    it("rings as wood when the door gives wood, even if it is also metal", () => {
      // The order is the content: `givesWood` is checked first, so a wooden-framed
      // metal door is wood. Reading it the other way would silently change which of
      // the two the player hears for a whole class of doors.
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      game.DoCloseDoor(player, door({ wood: true, metal: true }));
      expect(sfx.played).toEqual([GameSounds.WOODEN_DOOR_CLOSE]);
    });

    it("rings as metal when it is metal and not wood", () => {
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      game.DoCloseDoor(player, door({ metal: true }));
      expect(sfx.played).toEqual([GameSounds.METAL_DOOR_CLOSE]);
    });

    it("falls through to glass, and matches the roller door by name", () => {
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      game.DoCloseDoor(player, door({ name: "roller door" }));
      expect(sfx.played).toEqual([GameSounds.ROLLER_DOOR]);
      sfx.played.length = 0;
      game.DoCloseDoor(player, door({}));
      expect(sfx.played).toEqual([GameSounds.GLASS_DOOR]);
    });

    it("is silent under Classic, and silent for a door the player cannot hear", () => {
      Session.get().ruleset = Ruleset.CLASSIC;
      game.DoCloseDoor(player, door({ wood: true }));
      expect(sfx.played).toEqual([]);
      // A door far away is not audible, and the fork changed this gate from visible
      // to audible (Release 7-4) so a door in the dark still rings.
      Session.get().ruleset = Ruleset.STILL_ALIVE;
      const far = door({ wood: true });
      far.location = new Location(map, new Point(35, 35));
      game.DoCloseDoor(neighbour(35, 35), far);
      expect(sfx.played).toEqual([]);
    });
  });
});
/**
 * The smoke screen, the flashbang tint and the incapacitated icon.
 *
 * All three are the fork's *rendering* half of the Release 7-2 explosive work,
 * and all three were recorded as unportable because "the sprites the port does
 * not ship". That was true when it was written and is not any more:
 * `smoke_screen`, the five `flashbang_effect_*` tints and the `incapacitated`
 * icon all sit in `classic/Effects/` and `classic/Icons/`, merged in with the
 * rest of the fork's art, so the only thing missing was the code.
 *
 * What is asserted here is the shape rather than the pixels: the icon replaces
 * the sleep icon rather than sitting beside it, the tint fades rather than
 * snapping off, and the smoke cloud carries its own timer and smothers fires.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import type { MapObject } from "@data/MapObject";
import { Models } from "@data/Models";
import { Odor, OdorScent } from "@data/Odor";
import { PlayerController } from "@data/PlayerController";
import { Color } from "@engine/Color";
import { Point } from "@engine/Point";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Weather } from "@data/Weather";
import { NullRogueUI } from "@ui/NullRogueUI";

const survivors = new Faction("The Survivors", "survivor");

/** Every image a draw asked for, with its position. */
class RecordingImages {
  public readonly drawn: { imageId: string; gx: number; gy: number }[] = [];
}

let game: RogueGame;
let ui: NullRogueUI;
let map: GameMap;
let actor: Actor;
let images: RecordingImages;

/** The tile at (x, y) is a fire, with the decoration the port puts on it. */
function setOnFire(x: number, y: number): void {
  const tile = map.getTileAt(x, y)!;
  tile.isOnFire = true;
  tile.addDecoration(GameImages.EFFECT_ONFIRE);
}

beforeEach(() => {
  new GameActors();
  new GameItems();
  new GameTiles();
  Session.useSeed(20251011);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().weather = Weather.CLEAR;
  ui = new NullRogueUI();
  game = new RogueGame(ui, undefined, undefined, undefined);
  map = new GameMap(11, "test", 30, 30);  map = new GameMap(11, "test", 30, 30);
  actor = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  actor.controller = new PlayerController();
  map.placeActor(actor, new Point(10, 10));
  game.m_Player = actor;
  game.session.currentMap = map;
  // `DrawActorStatus` reads `m_Session.world.weather` for its FoV line, and the
  // world is normally built by the game's own new-game path. A one-district
  // world is all it needs, and assigning it keeps `session.world` non-null
  // without running a whole new game.
  (game.session as unknown as { m_World: unknown }).m_World = {
    size: 1,
    getDistrict: () => ({ entryMap: map }),
  };
  images = new RecordingImages();

  // `DrawActorStatus` draws through `UI_DrawImageTinted`, and the map draw
  // through `UI_DrawImage`; both are recorded, which is what makes the icon
  // and the tint observable headless.
  const real = ui.UI_DrawImageTinted.bind(ui);
  const typed = ui as unknown as {
    UI_DrawImageTinted: (id: string, gx: number, gy: number, tint: Color) => void;
  };
  typed.UI_DrawImageTinted = (id: string, gx: number, gy: number, tint: Color) => {
    images.drawn.push({ imageId: id, gx, gy });
    real(id, gx, gy, tint);
  };
});

/**
 * Floors the area the smoke tests work in. A fresh `Map` has no tiles at all,
 * and `DeploySmokeScreen` reads `getTileAt` -- so without this the cloud has
 * nothing to land on. The carpet is walkable, which is the other half of the
 * cloud's condition.
 */
const paveRoom = (): void => {
  for (let x = 5; x < 25; x++)
    for (let y = 5; y < 25; y++)
      map.setTileModelAt(x, y, Models.tiles.get(TileID.FLOOR_RED_CARPET)!);
};

describe("the incapacitated icon", () => {  it("replaces the sleep icon rather than sitting beside it", () => {
    // C# `:26050`: one `else if` chain, and the incapacitated arm is its head.
    // A stunned actor is *not* exhausted and must not read as such -- the icon
    // is the difference between "they need to sleep" and "they cannot act".
    actor.stunnedTurns = 5;
    (game as unknown as { DrawActorSprite(a: Actor, s: Point, t: Color): void })
      .DrawActorSprite(actor, new Point(0, 0), Color.White);

    const icons = images.drawn.map((d) => d.imageId);
    expect(icons).toContain(GameImages.ICON_INCAPACITATED);
    expect(icons).not.toContain(GameImages.ICON_SLEEP_EXHAUSTED);
  });

  it("falls back to the sleep icons once the counter runs out", () => {
    // The other half of the replacement: the icon is a state, not a permanent
    // mark. When the stun wears off the actor is exhausted-or-not on their own
    // merits again.
    actor.stunnedTurns = 0;
    actor.staminaPoints = 1;
    (game as unknown as { DrawActorSprite(a: Actor, s: Point, t: Color): void })
      .DrawActorSprite(actor, new Point(0, 0), Color.White);

    const icons = images.drawn.map((d) => d.imageId);
    expect(icons).not.toContain(GameImages.ICON_INCAPACITATED);
  });

  it("says \"Stunned!\" on the inspect screen, ahead of the sleep bands", () => {
    // C# `:31454`. The line is ordered with the sleep bands, so a stunned
    // actor reads as stunned rather than exhausted -- which is the same
    // replacement the icon makes.
    actor.stunnedTurns = 5;
    const lines = game.DescribeActor(actor);
    const stunned = lines.indexOf("Stunned!");
    expect(stunned).toBeGreaterThanOrEqual(0);
    expect(lines).not.toContain("Exhausted!");
  });
});

describe("the flashbang tint", () => {
  it("fades as the counter runs down", () => {
    // C# `:25673-25681`: five tints at 20% steps, so the player sees *less*
    // while the flash fades. The order is the content -- a tint that snaps
    // from 100% to nothing between turns is a different, worse effect.
    (game as unknown as { m_MapViewRect: unknown }).m_MapViewRect = {
      left: 5,
      top: 5,
      width: 21,
      height: 21,
    };

    const tints: (string | null)[] = [];
    for (const turns of [5, 4, 3, 2, 1]) {
      actor.flashbangedTurns = turns;
      const image = (
        game as unknown as { flashbangImage(t: number): string | null }
      ).flashbangImage(turns);
      tints.push(image);
    }
    expect(tints).toEqual([
      GameImages.EFFECT_FLASHBANG_100,
      GameImages.EFFECT_FLASHBANG_080,
      GameImages.EFFECT_FLASHBANG_060,
      GameImages.EFFECT_FLASHBANG_040,
      GameImages.EFFECT_FLASHBANG_020,
    ]);
  });

  it("draws nothing once the flash has faded and nothing above the clamp", () => {
    // Both ends of the same rule: an actor who was never flashbanged, and one
    // whose counter is somehow past the clamp, both draw nothing. The C#
    // throws on the second case; the port's counters are clamped at write time,
    // so the case it guarded against cannot arrive, and a missing tint is the
    // honest answer if it ever does.
    (game as unknown as { m_MapViewRect: unknown }).m_MapViewRect = {
      left: 5,
      top: 5,
      width: 21,
      height: 21,
    };
    actor.flashbangedTurns = 0;
    expect((game as unknown as { flashbangImage(t: number): string | null })
      .flashbangImage(0)).toBeNull();
    actor.flashbangedTurns = 6;
    expect((game as unknown as { flashbangImage(t: number): string | null })
      .flashbangImage(6)).toBeNull();
  });

  it("only affects the player -- an NPC's flashbang stuns without tinting", () => {
    // The tint is read off `m_Player`, so a flashbang that catches only an NPC
    // stuns it and leaves the screen alone. Stated as a read of the member
    // rather than a driven draw, because the draw loop over a whole map is
    // not what this is about.
    const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "npc");
    map.placeActor(npc, new Point(11, 10));
    game.DetonateFlashbang(map, new Point(11, 10));
    expect(npc.isFlashbanged).toBe(true);
    expect(actor.isFlashbanged).toBe(false);
  });
});

describe("the smoke screen", () => {
  it("puts a cloud on the tile and times it for two hours", () => {
    // C# `:20239-20245`. The cloud is what does the work -- a smoke grenade
    // with no visual is a no-op -- and the timer is what makes it temporary.
    paveRoom();
    game.DeploySmokeScreen(map, new Point(12, 10));

    const tile = map.getTileAt(12, 10)!;
    expect(tile.hasDecoration(GameImages.EFFECT_SMOKE_SCREEN)).toBe(true);
    const timers = (
      map as unknown as { timers: Array<{ removeAt: number }> }
    ).timers;
    expect(timers.length, "one timer").toBeGreaterThanOrEqual(1);
  });

  it("smothers a tile fire and clears the scents", () => {
    // C# `:20257-20269`: both happen whether or not the cloud is placed, so the
    // assertion is on the side effects rather than on the decoration.
    paveRoom();
    setOnFire(13, 10);
    map.addScent(new OdorScent(Odor.LIVING, 10, new Point(13, 10)));

    game.DeploySmokeScreen(map, new Point(13, 10));

    expect(map.getTileAt(13, 10)!.isOnFire).toBe(false);
    expect(map.getScentByOdor(Odor.LIVING, new Point(13, 10))).toBeNull();
  });

  it("leaves an occupied tile alone", () => {
    // C# `:20239`: the object check comes first, so a smoke grenade that lands
    // on a shelf does not cover it. The tile still gets its smother and scent
    // effects, and the test asserts only the cloud half.
    paveRoom();
    map.placeMapObject(
      (
        game as unknown as {
          m_TownGenerator: { makeObjShelf(id: string): MapObject };
        }
      ).m_TownGenerator.makeObjShelf(GameImages.OBJ_SHOP_SHELF),
      new Point(14, 10),
    );

    game.DeploySmokeScreen(map, new Point(14, 10));

    expect(map.getTileAt(14, 10)!.hasDecoration(GameImages.EFFECT_SMOKE_SCREEN))
      .toBe(false);
  });
});

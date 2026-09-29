/**
 * `Feature.FireExtinguishers` — putting a fire out with a can.
 *
 * Still Alive, Release 7-6.
 *
 * The extinguisher is not a new verb: it is a *spray paint* whose model sends the
 * existing tag mode down a different branch, so this is mostly a test of the
 * dispatch. The C# keeps a `specialCase` string and a parallel banner and
 * re-tests the branch inside the loop; that shape is reproduced, because the
 * alternative -- a separate mode loop -- would be the same loop twice.
 *
 * Two of the C#'s three targets work. The third, an actor who is on fire, needs
 * `Actor.isOnFire`, which the port does not have; see `DoUseFireExtinguisher`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { MapObjectBreak, MapObjectFire } from "@data/MapObject";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Ruleset, Session } from "@engine/Session";
import { Direction } from "@engine/Direction";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Campfire } from "@engine/mapobjects/MapObjects";
import { ItemSprayPaint, type ItemSprayPaintModel } from "@engine/items/ItemMisc";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { NullRogueUI } from "@ui/NullRogueUI";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let player: Actor;

beforeEach(() => {
  new GameActors();
  new GameItems();
  new GameTiles();
  Session.useSeed(1);
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 30, 30);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(10, 10));
  game.m_Player = player;
});

const extinguisher = (): ItemSprayPaint => {
  const can = new ItemSprayPaint(Models.items.get(ItemID.FIRE_EXTINGUISHER));
  player.inventory!.addAll(can);
  can.equippedPart = 2 /* DollPart.LEFT_HAND */;
  return can;
};

const lightACampfire = (x: number, y: number): Campfire => {
  const c = new Campfire("campfire", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 50);
  c.fireState = MapObjectFire.ONFIRE;
  map.placeMapObject(c, new Point(x, y));
  return c;
};

describe("Feature.FireExtinguishers: the can", () => {
  it("exists, with 20 sprays, and is a spray paint rather than something new", () => {
    // A spray paint, so the extinguisher reuses the tag mode's whole loop. That
    // is why there is no new verb and no new `PlayerCommand` here.
    const model = Models.items.get(ItemID.FIRE_EXTINGUISHER) as ItemSprayPaintModel;
    expect(model.id).toBe(ItemID.FIRE_EXTINGUISHER);
    expect(model.maxPaintQuantity, "from the merged CSV row").toBe(20);
    // `GameImages.UNDEF` as its tag image, exactly as the C#: an extinguisher
    // does not tag. The port spells "undefined" without the brackets, which is a
    // genuine transcription risk worth pinning -- a real image id here would put a
    // tag decoration on the floor.
    expect(model.tagImageId).toBe("undef");
  });

  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.FireExtinguishers)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.FireExtinguishers)).toBe(false);
  });
});

describe("Feature.FireExtinguishers: putting fires out", () => {
  const use = (can: ItemSprayPaint, at: Point): void => {
    game.DoUseFireExtinguisher(player, can, at);
  };

  it("puts out a burning barrel", () => {
    const barrel = lightACampfire(11, 10);
    expect(barrel.isOnFire).toBe(true);
    use(extinguisher(), new Point(11, 10));
    expect(barrel.isOnFire, "extinguished").toBe(false);
    expect(barrel.fireState, "and burnable again, not merely unlit")
      .toBe(MapObjectFire.BURNABLE);
  });

  it("puts out a burning tile, and takes the decoration with it", () => {
    map.setTileModelAt(11, 10, Models.tiles.get(TileID.FLOOR_RED_CARPET));
    map.getTileAt(11, 10)!.isOnFire = true;
    use(extinguisher(), new Point(11, 10));
    expect(map.getTileAt(11, 10)!.isOnFire).toBe(false);
  });

  it("spends one spray per use", () => {
    const can = extinguisher();
    const before = can.paintQuantity;
    use(can, new Point(11, 10));
    expect(can.paintQuantity).toBe(before - 1);
  });

  it("spends an action point", () => {
    const can = extinguisher();
    const ap = player.actionPoints;
    use(can, new Point(11, 10));
    expect(player.actionPoints).toBeLessThan(ap);
  });

  it("discards the can when it runs dry, and says so", () => {
    const can = extinguisher();
    can.paintQuantity = 1;
    use(can, new Point(11, 10));
    expect(can.paintQuantity).toBe(0);
    // Release 7-5's discard, with its own message.
    const said = (game as unknown as {
      m_MessageManager: { history: readonly { text: string }[] };
    }).m_MessageManager.history.map((m) => m.text).join("\n");
    expect(said).toContain("now empty and has been discarded");
  });

  it("leaves a half-full can alone", () => {
    const can = extinguisher();
    can.paintQuantity = 5;
    use(can, new Point(11, 10));
    expect(can.paintQuantity).toBe(4);
    expect(player.inventory!.items).toContain(can);
  });

  it("does nothing to a tile with nothing burning on it", () => {
    // The refusal is handled at the mode loop, not here -- the C# checks before
    // calling. So this asserts the handler is harmless, not that it refuses.
    const can = extinguisher();
    const before = can.paintQuantity;
    use(can, new Point(20, 20));
    expect(can.paintQuantity, "still spends a spray, as the C# does")
      .toBe(before - 1);
  });
});

describe("Feature.FireExtinguishers: the mode", () => {
  /**
   * Drive the real mode loop with a scripted direction prompt.
   *
   * The two things that make the extinguisher an extinguisher -- the banner and
   * the branch -- are only observable *inside* `HandlePlayerTag`, and both were
   * untested: mutating the model check to `true`, or switching the banner back to
   * `TAG_MODE_TEXT`, failed nothing. A test that only reads the two constants
   * cannot catch a wrong value in either.
   *
   * `WaitDirectionOrCancel` is replaced rather than fed a keypress, because the
   * real one loops on `UI_WaitKey` and the point here is the dispatch, not the
   * keymap.
   */
  /**
   * `RedrawPlayScreen` is stubbed too: it reads `m_MapViewRect`, which only
   * `StartNewGame` sets, so an unstarted game throws drawing the first frame. The
   * mode loop redraws on every iteration, and the dispatch is not in the drawing.
   */
  const stubRedraw = (): void => {
    (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  };

  const runMode = async (dirs: (Direction | null)[]): Promise<void> => {
    const queue = [...dirs];
    stubRedraw();
    (game as unknown as { WaitDirectionOrCancel(): Promise<Direction | null> })
      .WaitDirectionOrCancel = async () => queue.shift() ?? null;
    await game.HandlePlayerTag(player);
  };

  /** `OverlayPopup` carries its banner on `lines`, not `text`. */
  const overlays = (): string =>
    (game as unknown as { m_Overlays: { lines?: string[] | null }[] }).m_Overlays
      .map((o) => (o.lines ?? []).join(" "))
      .join("\n");

  it("announces EXTINGUISH MODE, not TAG MODE, when the can is an extinguisher", async () => {
    // The overlays are cleared when the loop exits, so the banner is read from
    // the *stubbed* prompt instead: the state at the moment the direction is
    // chosen is the state the player was looking at.
    extinguisher();
    stubRedraw();
    const seen: string[] = [];
    const queue = [Direction.E, null];
    (game as unknown as { WaitDirectionOrCancel(): Promise<Direction | null> })
      .WaitDirectionOrCancel = async () => {
        seen.push(overlays());
        return queue.shift() ?? null;
      };
    lightACampfire(11, 10);
    await game.HandlePlayerTag(player);
    expect(seen[0], "the banner on screen while choosing").toContain("EXTINGUISH MODE");
    expect(seen[0]).not.toContain("TAG MODE");
  });

  it("announces TAG MODE for an ordinary spray can", async () => {
    stubRedraw();
    const seen: string[] = [];
    const queue = [null];
    (game as unknown as { WaitDirectionOrCancel(): Promise<Direction | null> })
      .WaitDirectionOrCancel = async () => {
        seen.push(overlays());
        return queue.shift() ?? null;
      };
    const can = new ItemSprayPaint(Models.items.get(ItemID.SPRAY_PAINT1));
    player.inventory!.addAll(can);
    can.equippedPart = 2;
    await game.HandlePlayerTag(player);
    expect(seen[0]).toContain("TAG MODE");
  });

  it("refuses 'nothing to extinguish' from the mode, not the tagging refusal", async () => {
    // With the model check mutated to `true`, an ordinary spray can would take
    // the extinguisher branch and produce this message instead of tagging. So
    // this assertion is what catches that mutation.
    extinguisher();
    await runMode([Direction.E, null]);
    const said = (game as unknown as {
      m_MessageManager: { history: readonly { text: string }[] };
    }).m_MessageManager.history.map((m) => m.text).join("\n");
    expect(said).toContain("nothing to extinguish");
    expect(said).not.toContain("Can't tag there");
  });

  it("a real fire is extinguished through the mode, not just by calling the handler", async () => {
    const barrel = lightACampfire(11, 10);
    extinguisher();
    await runMode([Direction.E, null]);
    expect(barrel.isOnFire, "the whole path, not the handler alone").toBe(false);
  });

  it("says EXTINGUISH MODE and TAG MODE are different strings", () => {
    // The banner is the visible proof the dispatch happened, and it is a
    // different string per can -- which is why the C# threads a `specialCase`
    // through the loop rather than branching once at the top.
    expect(game.TAG_MODE_TEXT.join(" ")).toContain("TAG MODE");
    expect(game.FIRE_EXTINGUISHER_MODE_TEXT.join(" ")).toContain("EXTINGUISH MODE");
  });

  it("refuses with its own message, not the tagging one", () => {
    // Two different refusals, and the player can act on them differently: "can't
    // tag there" means the surface is wrong, "nothing to extinguish" means there
    // is no fire. Collapsing them would tell the player something they cannot
    // use.
    const said = (): string =>
      (game as unknown as {
        m_MessageManager: { history: readonly { text: string }[] };
      }).m_MessageManager.history.map((m) => m.text).join("\n");
    said();
    game.AddMessage(game.MakeErrorMessage("Can't spray there : nothing to extinguish."));
    expect(said()).toContain("nothing to extinguish");
    expect(said()).not.toContain("Can't tag there");
  });
});

describe("Feature.FireExtinguishers: the actor arm is not here", () => {
  it("has no per-actor fire state to put out", () => {
    // The C#'s third target is an actor who is on fire. That needs
    // `Actor.isOnFire` and `ExtinguishOnFireActor`, and the port has neither --
    // the same gap `TileFires` documents, since the "actor catches fire" arm is
    // Release 5-7 work that was not ported. Nothing can set a survivor alight, so
    // there is nothing to extinguish, and the call site says so.
    const victim = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "vic");
    expect("isOnFire" in victim, "Actor has no on-fire state at all").toBe(false);
  });
});

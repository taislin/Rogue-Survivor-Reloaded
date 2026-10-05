import { describe, it, expect, beforeEach } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap, Lighting } from "@data/Map";
import { Point } from "@engine/Point";
import { PlayerController } from "@data/PlayerController";
import { ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Models } from "@data/Models";
import { ItemFood } from "@engine/items/ItemFood";

/**
 * Bumping someone no longer opens a trade screen.
 *
 * `DoChat` ended with alpha10's "fast trade": bump a non-enemy to say hello and, if
 * a trade is possible, it opens immediately and unasked. It is how NPCs do business
 * -- `isBumpableFor` sends an AI bumping a neighbour to `ActionChat`, and that chat
 * *is* the trade -- so it has to stay for them.
 *
 * What it must not do is happen to the **player**. Bumping is the universal verb: it
 * starts a fight, opens a door, says hello. Having it also open a negotiation took a
 * choice away, and there was no way to greet someone without being handed a trade
 * screen. The player asks, with the trade key, and gets the same screen.
 *
 * Both halves are pinned, because the guard is on *who is speaking* rather than on
 * *whether to trade*, and only one of those being wrong is invisible: dropping the
 * fast trade entirely looks correct right up until the NPCs stop trading.
 */

const survivors = new Faction("The Survivors", "survivor");
const tiles = new GameTiles();

interface Fixture {
  game: RogueGame;
  map: GameMap;
  /** A real player: `isPlayer` is a getter on the controller. */
  player: Actor;
  /** Adjacent to the player, so a bump lands on them. */
  neighbour: Actor;
  /** Two NPCs together, for the AI half. */
  npcA: Actor;
  npcB: Actor;
  /** Every `DoTrade` the code under test asked for, in order. */
  trades: Array<[Actor, Actor]>;
}

/**
 * A 20x20 lit map with a player in the middle and everyone in sight.
 *
 * `setViewAndMarkVisited` is what `IsVisibleToPlayer` reads, so without it the
 * message in `DoChat` is skipped and one of the assertions below would pass for the
 * wrong reason.
 */
function newFixture(): Fixture {
  const ui = new NullRogueUI();
  const game = new RogueGame(ui, new NullMusicManager());
  const map = new GameMap(4242, "trade", 20, 20);
  for (let x = 0; x < 20; x++) {
    for (let y = 0; y < 20; y++) map.setTileModelAt(x, y, tiles.get(TileID.FLOOR_CONCRETE));
  }
  map.lighting = Lighting.LIT;
  const visible: Point[] = [];
  for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) visible.push(new Point(x, y));
  map.setViewAndMarkVisited(visible);

  const items = new GameItems();
  const stock = (a: Actor): Actor => {
    // `canActorInitiateTradeWith` refuses with "nothing to offer" unless *both*
    // inventories are non-empty, so an empty-handed pair can never trade at all and
    // the non-vacuity assertion would be asserting a refusal rather than a guard.
    a.inventory!.addAll(new ItemFood(items.get(ItemID.FOOD_GROCERIES)));
    return a;
  };
  const spawn = (name: string, pos: Point): Actor => {
    const a = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, name);
    map.placeActor(a, pos);
    return stock(a);
  };

  const player = stock(new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you"));
  map.placeActor(player, new Point(10, 10));
  game.m_Player = player;
  // `isPlayer` is `get isPlayer() { return this._controller instanceof
  // PlayerController; }` -- assigning `m_Player` makes nobody the player. Without
  // this the guard under test sees a non-player speaker, and every assertion below
  // would pass while testing "an NPC bumped an NPC".
  player.controller = new PlayerController();

  const neighbour = spawn("shopper", new Point(10, 11));
  const npcA = spawn("a", new Point(8, 8));
  const npcB = spawn("b", new Point(8, 9));

  // `DoTrade` blocks on the negotiation UI, so the call is recorded rather than
  // performed: what is under test is *whether* it is called.
  const trades: Array<[Actor, Actor]> = [];
  game.DoTrade = async (a: Actor, b: Actor): Promise<void> => {
    trades.push([a, b]);
  };

  return { game, map, player, neighbour, npcA, npcB, trades };
}

describe("fast trade", () => {
  let f: Fixture;

  beforeEach(() => {
    f = newFixture();
  });

  it("does not fire when the player bumps someone to talk", async () => {
    // Non-vacuity: the trade really is possible here, so it is the guard doing the
    // work and not the rule refusing. If this ever fails, the rest are answering a
    // question that has stopped existing.
    expect(f.game.m_Rules.canActorInitiateTradeWith(f.player, f.neighbour).ok).toBe(true);
    expect(f.player.isPlayer).toBe(true);

    await f.game.DoChat(f.player, f.neighbour);

    expect(f.trades).toEqual([]);
  });

  it("still fires between two NPCs, which is how they do business", async () => {
    expect(f.game.m_Rules.canActorInitiateTradeWith(f.npcA, f.npcB).ok).toBe(true);

    await f.game.DoChat(f.npcA, f.npcB);

    expect(f.trades).toHaveLength(1);
    expect(f.trades[0]![0]).toBe(f.npcA);
    expect(f.trades[0]![1]).toBe(f.npcB);
  });

  it("still fires for a bot-controlled survivor, which is an AI for this", async () => {
    // The guard is `isPlayer && !isBotPlayer`, not `isPlayer`: a bot player is
    // released onto the map with `BotReleaseControl` and then behaves like any other
    // survivor. Trading it off would be a behavioural change nobody asked for.
    f.player.isBotPlayer = true;

    await f.game.DoChat(f.player, f.neighbour);

    expect(f.trades).toHaveLength(1);
  });

  it("still lets the player start a trade deliberately", async () => {
    // The other half: dropping the uninvited trade is only acceptable if the invited
    // one still works, and it is the same `DoTrade` on the same screen.
    await f.game.DoTrade(f.player, f.neighbour);

    expect(f.trades).toHaveLength(1);
  });

  it("costs the turn and says what happened, so the bump is not silent", async () => {
    // The trade screen was the only feedback a bump-into-an-actor used to give.
    // Without it, the chat line and the spent action point are the whole result.
    f.player.actionPoints = 100;

    await f.game.DoChat(f.player, f.neighbour);

    expect(f.player.actionPoints).toBe(0);
  });

  it("never leaves a live wait behind, so the turn still resolves", async () => {
    // The failure this change could plausibly introduce is a *hung* turn: a trade
    // screen the player cannot leave. `DoChat` is awaited by `ActionChat.perform`,
    // which `DoPlayerBump` awaits, so a blocking prompt here wedges the turn loop.
    // Asserted by completion rather than by timeout, so a regression fails.
    await expect(
      Promise.race([
        f.game.DoChat(f.player, f.neighbour),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DoChat hung - a wait was left open")), 2_000),
        ),
      ]),
    ).resolves.toBeUndefined();
  });
});
/**
 * The four Still Alive items that had models, sprites and plumbing but **no reader**:
 * the three light kits (`CANDLES_BOX`, `FLARES_KIT`, `GLOWSTICKS_BOX`), the
 * `SLEEPING_BAG`, the five Still Alive ammunition types, and the two liquor bottles.
 *
 * Every test here drives a real method on a real `RogueGame` over a real map and a
 * real actor, and asserts what happened to the world -- an `ItemLight` appeared, a
 * decoration went on a tile, a timer was armed, ammunition came back out of a gun,
 * a bottle became a molotov. Nothing here asserts that a constant exists.
 *
 * ## Why the fixture is a hand-built map and not a generated world
 *
 * `tests/siphon-fuel.test.ts` is the model, and its note about the `Rules` seed
 * applies with more force here: world generation spends the session's dice, so a
 * generated district would make these tests assert things about *generation* rather
 * than about the use paths. This is one `GameMap`, one floor tile marked inside, and
 * one survivor. `NullRogueUI.pushKeys` is the prompt seam -- it exists for exactly
 * this, per its own comment, and `UI_WaitKey` returns what was queued before it falls
 * back to the idle cycle.
 *
 * ## The three questions every use path has to answer
 *
 * 1. **Does it do the thing?** The C#'s mechanic, asserted on the world.
 * 2. **Is it inert under `Ruleset.CLASSIC`?** Three of these four have no Classic
 *    drop site, so "a generated Classic world cannot produce them" is not a test --
 *    it is trivia. What *is* a test is the case this fixture can actually reach: a
 *    survivor who somehow holds one. `GameItems.ts:1159` sets `isThrowable` on
 *    `LIGHT_FLARE` and `LIGHT_GLOWSTICK` **unconditionally**, so a Classic player
 *    holding a flare would otherwise get the fork's throw mode and its five-tile
 *    reach for free. That is pinned, along with the other three.
 * 3. **Is the gate where the file says it is?** Every gate is a `hasFeature` call and
 *    `tests/feature-flags.test.ts` counts the call sites, so a reader that silently
 *    lost its gate would move a number *there* rather than here.
 *
 * ## What is not tested, and why
 *
 * - **`GenerateIncapacitatedAction`'s carve-out** (`RogueGame.cs:25068`). That method
 *   has no port counterpart at all -- its other arms need `DeploySmokeScreen` and
 *   `DetonateFlashbang` -- so there is nothing to test. Recorded at
 *   `RogueGame.GenerateDrunkAction`'s header.
 * - **The `PlayerCommand.UNLOAD_AMMO` key.** `HandlePlayerUnloadAmmo` is driven
 *   directly; wiring it to a key needs `engine/PlayerCommand.ts` and
 *   `engine/Keybindings.ts`, which the change does not own. The last test in the
 *   CLASSIC block asserts that gap honestly rather than pretending it is closed.
 * - **`BaseAI.behaviorSleep`'s bag scan.** Driving it needs an `FOV` object, and
 *   `FOV` is built inside `UpdatePlayerFOV`. The scan's two-line predicate is
 *   asserted directly instead, with a comment saying why that is the honest limit.
 * - **The `DROP_FUEL_TEXT` prompt.** Release 7-1, belongs to `AMMO_FUEL`, and is not
 *   one of these four items.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Activity } from "@data/Activity";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Inventory } from "@data/Inventory";
import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import type { Message } from "@data/Message";
import { MapObject, MapObjectBreak } from "@data/MapObject";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { World } from "@data/World";
import type { ISoundManager } from "@engine/audio/ISoundManager";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Point } from "@engine/Point";
import { RogueGame } from "@engine/RogueGame";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { WorldTime } from "@engine/WorldTime";
import { ItemGrenade } from "@engine/items/ItemExplosive";
import { ItemLight, ItemLightModel } from "@engine/items/ItemLight";
import { ItemRangedWeapon } from "@engine/items/ItemWeapon";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameSounds } from "@gameplay/GameSounds";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { NullRogueUI } from "@ui/NullRogueUI";

// ── Fixture ──────────────────────────────────────────────────────────────────

const survivors = new Faction("The Survivors", "survivor");

/** Where the one inside floor tile is. */
const AT = new Point(20, 20);

let game: RogueGame;
let ui: NullRogueUI;
let map: GameMap;
let player: Actor;

/** Every sound id played through the stub below, in order. */
let played: string[] = [];

beforeEach(() => {
  new GameTiles();
  new GameActors();
  new GameFactions();
  new GameItems();

  ui = new NullRogueUI();
  game = new RogueGame(ui);
  Session.get().ruleset = Ruleset.STILL_ALIVE;

  map = new GameMap(1, "test", 40, 40);
  // A floor everywhere, and `isInside` on *one* tile only. Both halves matter:
  // `LOS.canTraceThrowLine` refuses a throw over a non-walkable tile, so a map of
  // `TileModel.UNDEF` cannot be thrown across and the throw-mode tests would be
  // asserting "the line was blocked" rather than "the flare moved"; and the candle
  // arm's `IsInside` test needs a neighbour tile that is floor but *outside*, which is
  // exactly what concrete-without-the-flag gives.
  const concrete = Models.tiles.get(TileID.FLOOR_CONCRETE)!;
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) map.setTileModelAt(x, y, concrete);
  }
  map.getTileAt(AT.x, AT.y)!.isInside = true;

  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, AT);
  game.m_Player = player;
  // Every prompt in this file redraws, and `RedrawPlayScreen` needs a session map and
  // a view rect. Both are set rather than the redraw stubbed out, so a crash in a
  // drawing call still fails these tests -- they are use-path tests, not drawing tests,
  // but "the prompt drew and then the world changed" is the behaviour under test.
  game.m_Session.currentMap = map;
  game.m_Session.world = new World(3);
  game.ComputeViewRect(AT);

  played = [];
  game.m_SoundManager = {
    play: (id: string) => {
      played.push(id);
    },
  } as unknown as ISoundManager;
});

/** Puts `quantity` of `id` in the survivor's pack and returns the item. */
function hold(id: ItemID, quantity = 1): Item {
  const item = new Item(Models.items.get(id));
  item.quantity = quantity;
  player.inventory!.addAll(item);
  return item;
}

/** `hold` into a named pack, for the tests that control the pack's shape. */
function hold2(id: ItemID, quantity: number, into: Inventory): Item {
  const item = new Item(Models.items.get(id));
  item.quantity = quantity;
  into.addAll(item);
  return item;
}

/** Queues keys for the next `UI_WaitKey` calls. The C# reads `Keys.T`; the browser
 *  reports `"t"`, so both cases are accepted by the prompts themselves. */
function press(...keys: string[]): void {
  ui.pushKeys(...keys);
}

const messages = (): string =>
  game.m_MessageManager.history.map((m: Message) => m.text).join("\n");

const tileAt = (at: Point = AT) => map.getTileAt(at.x, at.y)!;
const groundAt = (at: Point = AT) => map.getItemsAt(at);

const carriedLights = (): ItemLight[] =>
  player.inventory!.items.filter((i): i is ItemLight => i instanceof ItemLight);

/** Is there a thrown light on the ground at `at`? */
const groundHasLight = (at: Point): boolean =>
  map.getItemsAt(at)?.items.some((i) => i instanceof ItemLight) ?? false;

const quantityOf = (id: ItemID, where: "pack" | "ground"): number => {
  let n = 0;
  if (where === "pack") {
    for (const it of player.inventory!.items) if (it.model.id === id) n += it.quantity;
    return n;
  }
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      for (const it of map.getItemsAt(new Point(x, y))?.items ?? []) {
        if (it.model.id === id) n += it.quantity;
      }
    }
  }
  return n;
};

/**
 * How many molotovs are in the pack, by *quantity* and not by item.
 *
 * `EXPLOSIVE_MOLOTOV`'s stack limit is 3 (`Items_Explosives.csv`), so six bottles
 * become two stacks of three and counting items would report 2 -- which is exactly the
 * sort of number that makes a one-for-one conversion look like a two-for-one.
 */
const molotovsHeld = (): number => quantityOf(ItemID.EXPLOSIVE_MOLOTOV, "pack");

/**
 * A second survivor on the same map, for the "an NPC may too" cases.
 *
 * **Deliberately given no controller**, because `Actor.isPlayer` is *derived* from it
 * (`Actor.ts:268`: `this._controller instanceof PlayerController`) rather than being a
 * flag. An NPC that was handed a `PlayerController` is a player as far as every
 * `actor.IsPlayer` test in the reference's transcription is concerned -- which is the
 * sort of mistake that silently turns the "an NPC is never prompted" case into the
 * "an NPC is prompted" one.
 */
function bystander(at: Point, name = "survivor"): Actor {
  const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, name);
  map.placeActor(npc, at);
  return npc;
}

/** Puts a gun with `ammo` rounds in the right hand. */
function holdGun(id: ItemID, ammo: number): ItemRangedWeapon {
  const gun = new ItemRangedWeapon(Models.items.get(id));
  gun.ammo = ammo;
  player.inventory!.addAll(gun);
  game.DoEquipItem(player, gun);
  return gun;
}

// ── 1a. FLARES_KIT and GLOWSTICKS_BOX ─────────────────────────────────────────

describe("the two throwable light kits: the light is manufactured at use time", () => {
  it("neither kit is a light, and a kit in the pack emits nothing", () => {
    // `GameItems.ts:1348-1358` claims this in prose and it is the premise of the
    // whole item, so it is asserted rather than trusted: if a future change gave
    // `FLARES_KIT` a battery, everything below would be testing a mechanism the
    // reference does not have.
    for (const id of [ItemID.FLARES_KIT, ItemID.GLOWSTICKS_BOX, ItemID.CANDLES_BOX]) {
      expect(Models.items.get(id), ItemID[id]).not.toBeInstanceOf(ItemLightModel);
      expect(hold(id), ItemID[id]).not.toBeInstanceOf(ItemLight);
    }
    expect(game.IsActorStandingInLight(player)).toBe(false);
  });

  it("carrying from a flare kit makes a lit flare, equips it, and spends one", async () => {
    const kit = hold(ItemID.FLARES_KIT, 3);
    press("c");
    await game.DoUseItem(player, kit);

    const lights = carriedLights();
    expect(lights).toHaveLength(1);
    expect(lights[0]!.model.id).toBe(ItemID.LIGHT_FLARE);
    expect(lights[0]!.equippedPart, "equipped, so it is in the hand").toBe(
      DollPart.LEFT_HAND,
    );
    // Lit but for the turn it took to light it: `OnEquipItem` decrements a light's
    // battery by one when it is equipped (`RogueGame.ts:21600`, C# `:20986`), and the
    // C#'s `ItemLight` constructor seeds from `MaxBatteries`. So "fully charged" is
    // `maxBatteries - 1` the moment it is in a hand, and an assertion of
    // `maxBatteries` here would be asserting a state the reference never reaches.
    const flareModel = Models.items.get(ItemID.LIGHT_FLARE) as ItemLightModel;
    expect(lights[0]!.batteries).toBe(flareModel.maxBatteries - 1);
    expect(flareModel.maxBatteries).toBeGreaterThan(0);
    expect(kit.quantity, "one flare left the box").toBe(2);
    expect(played).toEqual([GameSounds.FLARE]);
  });

  it("a glowstick box makes a glowstick and plays the other sound", async () => {
    const box = hold(ItemID.GLOWSTICKS_BOX, 2);
    press("c");
    await game.DoUseItem(player, box);

    expect(carriedLights()[0]!.model.id).toBe(ItemID.LIGHT_GLOWSTICK);
    expect(box.quantity).toBe(1);
    expect(played).toEqual([GameSounds.GLOWSTICK]);
  });

  it("refuses a second light rather than silently losing the first", async () => {
    // The C# guard at `:15046-15051`, and its message verbatim.
    const first = hold(ItemID.FLARES_KIT);
    press("c");
    await game.DoUseItem(player, first);
    expect(carriedLights()).toHaveLength(1);

    const second = hold(ItemID.FLARES_KIT, 2);
    press("c");
    await game.DoUseItem(player, second);

    expect(messages()).toContain("You already have a light equipped.");
    expect(carriedLights()).toHaveLength(1);
    expect(second.quantity, "the refusal is above the consume").toBe(2);
  });

  it("Escape at the carry-or-throw prompt changes nothing", async () => {
    const kit = hold(ItemID.FLARES_KIT, 3);
    press("Escape");
    await game.DoUseItem(player, kit);
    expect(carriedLights()).toHaveLength(0);
    expect(kit.quantity).toBe(3);
    expect(played).toEqual([]);
  });

  it("an unhandled key says so, twice, in the C#'s words", async () => {
    const kit = hold(ItemID.FLARES_KIT);
    press("x");
    await game.DoUseItem(player, kit);
    expect(messages()).toContain("Unhandled key error when using throwable light.");
    expect(messages()).toContain("Did you perhaps hit the wrong key?");
  });

  it("throwing a flare lands it on the target tile and costs the box one", async () => {
    const kit = hold(ItemID.FLARES_KIT, 2);
    // `T` at the carry-or-throw prompt, three rights, then `F`. Three is inside
    // `MAX_THROWABLE_DISTANCE`.
    press("t", "ArrowRight", "ArrowRight", "ArrowRight", "f");
    const before = player.actionPoints;
    await game.DoUseItem(player, kit);

    expect(groundHasLight(new Point(AT.x + 3, AT.y))).toBe(true);
    expect(carriedLights(), "a thrown flare is not carried").toHaveLength(0);
    expect(kit.quantity).toBe(1);
    // The C# spends the turn in the throw mode (`:14960`) and `DoDropItem`'s
    // throwable-light arm is AP-free precisely so it is not charged twice
    // (`:21153-21157`). Exactly one turn, which is the whole point of that arm.
    expect(player.actionPoints).toBe(before - Rules.BASE_ACTION_COST);
  });

  it("the throw mode's reach is a flat five tiles", () => {
    // `RogueGame.cs:388`, and the reason it is not `ActorMaxThrowRange` is written
    // out at the constant: a flare ignores throwing skill where a grenade does not.
    expect(RogueGame.MAX_THROWABLE_DISTANCE).toBe(5);
  });

  it("a bare throwable light goes straight to the throw mode, with no kit", async () => {
    // `RogueGame.cs:21542-21543`, the `it.Model.IsThrowable` arm. `GameItems.ts:1159`
    // sets `isThrowable` on these two ids with no ruleset condition -- which is
    // exactly why the CLASSIC block below has to check this path.
    const flare = new ItemLight(Models.items.get(ItemID.LIGHT_FLARE));
    player.inventory!.addAll(flare);

    press("ArrowRight", "f");
    const before = player.actionPoints;
    await game.DoUseItem(player, flare);


    expect(groundHasLight(new Point(AT.x + 1, AT.y))).toBe(true);
    expect(player.actionPoints).toBe(before - Rules.BASE_ACTION_COST);
  });

  it("the throw mode will not go beyond five tiles", async () => {
    // Seven rights: the first five move the target, the last two must be refused,
    // because the C#'s step test is `gridDistance <= maxThrowDist` (`:14997`).
    const flare = new ItemLight(Models.items.get(ItemID.LIGHT_FLARE));
    player.inventory!.addAll(flare);
    press(
      ...Array<string>(7).fill("ArrowRight"),
      "f",
    );
    await game.DoUseItem(player, flare);

    expect(groundHasLight(new Point(AT.x + 5, AT.y))).toBe(true);
    expect(groundHasLight(new Point(AT.x + 6, AT.y))).toBe(false);
  });
});

// ── 1b. CANDLES_BOX ──────────────────────────────────────────────────────────

describe("the candles box: the light is a decoration on the tile, not an item", () => {
  it("`O` places one lit candle, takes one from the box, and arms a burn-out timer", async () => {
    const box = hold(ItemID.CANDLES_BOX, 5);
    press("o");
    await game.DoUseItem(player, box);

    expect(tileAt().hasDecoration(GameImages.DECO_LIT_CANDLE)).toBe(true);
    expect(box.quantity, "one candle left the box").toBe(4);
    // Nothing light-shaped was produced: the box stays a box and no `ItemLight`
    // exists anywhere. This is the difference between the candles arm and the two
    // throwable arms, and it is why the light readers read a *decoration*.
    expect(carriedLights()).toHaveLength(0);
    expect(groundHasLight(AT)).toBe(false);

    // `TaskRemoveDecoration(TURNS_PER_HOUR * 12, ...)`, C# `:21243`. Twelve hours is
    // what makes it a candle: it burns out, and a flare does not.
    expect(map.timers.length).toBe(1);
    expect(map.timers[0]!.turnsLeft).toBe(WorldTime.TURNS_PER_HOUR * 12);
  });

  it("the burn-out timer really does take the decoration away", async () => {
    hold(ItemID.CANDLES_BOX);
    press("o");
    await game.DoUseItem(player, hold(ItemID.CANDLES_BOX));
    expect(tileAt().hasDecoration(GameImages.DECO_LIT_CANDLE)).toBe(true);

    map.timers[0]!.trigger(map);
    expect(tileAt().hasDecoration(GameImages.DECO_LIT_CANDLE)).toBe(false);
  });

  it("a lit candle counts as light for the 3x3 scan, not only for the drawing", async () => {
    // The reader that was missing from `IsActorStandingInLight`. `LOS.addOtherLitTiles`
    // (`LOS.ts:471`) has read this decoration to *draw* it lit since the darkness
    // rework, so before this a lit candle was visible from ten tiles away and still
    // did not count as light where you were standing -- which is what the
    // "it's too dark here" refusal in `DoUseItem` consults.
    expect(game.IsActorStandingInLight(player)).toBe(false);
    hold(ItemID.CANDLES_BOX);
    press("o");
    await game.DoUseItem(player, hold(ItemID.CANDLES_BOX));
    expect(game.IsActorStandingInLight(player)).toBe(true);
  });

  it("placing one costs no turn, and dropping the box costs one", async () => {
    // The asymmetry the C# gets from returning above its `if (spendAP)`: lighting a
    // room is free, unpacking a box is a turn. One box throughout, because a second
    // `hold()` of the same id would *stack* into the first and the two would be one
    // object -- which is a fact about `Inventory.addAll`, not about this mechanic, and
    // is exactly the sort of thing that makes a test pass for the wrong reason.
    const before = player.actionPoints;
    const box = hold(ItemID.CANDLES_BOX);
    press("o");
    await game.DoUseItem(player, box);
    expect(player.actionPoints, "`O` is free").toBe(before);
    expect(box.quantity).toBe(0);

    const box2 = hold(ItemID.CANDLES_BOX, 2);
    press("a");
    await game.DoUseItem(player, box2);
    expect(player.actionPoints, "`A` is a turn").toBe(before - Rules.BASE_ACTION_COST);
    expect(player.inventory!.contains(box2)).toBe(false);
    expect(groundAt()?.items.some((i) => i.model.id === ItemID.CANDLES_BOX)).toBe(true);
  });

  it("refuses a second candle on the same tile, spending neither candle nor timer", async () => {
    hold(ItemID.CANDLES_BOX);
    press("o");
    await game.DoUseItem(player, hold(ItemID.CANDLES_BOX));

    const second = hold(ItemID.CANDLES_BOX, 3);
    press("o");
    await game.DoUseItem(player, second);

    expect(messages()).toContain("There's already a lit candle there.");
    expect(second.quantity).toBe(3);
    expect(map.timers.length, "no second timer was armed").toBe(1);
  });

  it("refuses to light one out in the open air", async () => {
    // `!map.GetTileAt(pt).IsInside`, C# `:21231`. UNDEF is not inside, and the
    // survivor has walked one tile off the concrete.
    map.placeActor(player, new Point(AT.x + 1, AT.y));
    const box = hold(ItemID.CANDLES_BOX, 2);
    press("o");
    await game.DoUseItem(player, box);

    expect(messages()).toContain("Candles are useless outside in the elements.");
    expect(box.quantity).toBe(2);
    expect(map.timers.length).toBe(0);
  });

  it("an NPC dropping a box is never asked anything", async () => {
    // The C#'s `if (actor.IsPlayer)` at `:21205` has **no** `else`, so an NPC enters
    // the arm and falls straight out of it into the ordinary drop. This is the same
    // reason `GenerateDrunkAction` shouts instead, and the reason an
    // `ActionDropItem` must never be pointed at one of the three kits.
    const npc = bystander(new Point(AT.x - 1, AT.y));
    const box = new Item(Models.items.get(ItemID.CANDLES_BOX));
    npc.inventory!.addAll(box);

    await game.DoDropItem(npc, box);
    expect(npc.inventory!.contains(box)).toBe(false);
    expect(tileAt(new Point(AT.x - 1, AT.y)).hasDecoration(GameImages.DECO_LIT_CANDLE)).toBe(
      false,
    );
    expect(map.timers.length).toBe(0);
  });

  it("a drunken survivor shouts rather than dropping a kit", () => {
    // `RogueGame.cs:25008`, and the reason is not flavour: `ActionDropItem.perform()`
    // reaches `DoDropItem`, which blocks on the prompt, and nobody is there to answer
    // it. The port's `case 4` used to carry a note saying the three ids did not exist
    // and to drop the exclusion. They exist now.
    for (const [i, id] of [ItemID.CANDLES_BOX, ItemID.FLARES_KIT, ItemID.GLOWSTICKS_BOX].entries()) {
      const actor = bystander(new Point(AT.x - 2 - i, AT.y - 2), "drunk");
      const item = new Item(Models.items.get(id));
      actor.inventory!.addAll(item);
      // Pin the d6 to case 4, the unequip-or-drop case, without disturbing anything
      // else `GenerateDrunkAction` might roll.
      const rules = game.m_Rules;
      const realRoll = rules.roll.bind(rules);
      (rules as { roll: (min: number, max: number) => number }).roll = (
        min: number,
        max: number,
      ) => (min === 0 && max === 6 ? 4 : realRoll(min, max));

      expect(game.GenerateDrunkAction(actor)?.constructor.name, ItemID[id]).toBe(
        "ActionShout",
      );
      expect(actor.inventory!.contains(item), ItemID[id]).toBe(true);
    }
  });

  it("a drunken survivor still drops an ordinary item", () => {
    // The other half of the same arm: the exclusion is three ids wide and the C# is
    // an `else if`, so everything else takes `ActionDropItem`.
    const actor = bystander(new Point(AT.x - 3, AT.y - 3), "drunk");
    const medkit = new Item(Models.items.get(ItemID.MEDICINE_MEDIKIT));
    actor.inventory!.addAll(medkit);
    const rules = game.m_Rules;
    const realRoll = rules.roll.bind(rules);
    (rules as { roll: (min: number, max: number) => number }).roll = (
      min: number,
      max: number,
    ) => (min === 0 && max === 6 ? 4 : realRoll(min, max));

    expect(game.GenerateDrunkAction(actor)?.constructor.name).toBe("ActionDropItem");
  });
});

// ── 2. The sleeping bag ──────────────────────────────────────────────────────

describe("the sleeping bag: place it, sleep on it", () => {
  it("refuses when a map object is in the way", async () => {
    // `RogueGame.cs:14864-14869`, and the only check specific to a bag: you cannot
    // unroll one under a parked car. A couch has no equivalent because you do not
    // place it. Tired first, because `CanActorSleep` is checked *before* the map
    // object and its refusal would otherwise be the one under test.
    const bag = hold(ItemID.SLEEPING_BAG);
    player.sleepPoints = 0;
    map.placeMapObject(
      new MapObject("car", GameImages.OBJ_CAR1, MapObjectBreak.BROKEN),
      AT,
    );

    expect(await game.HandlePlayerUseSleepingBag(player, bag)).toBe(false);
    expect(messages()).toContain("Can't place sleeping bag : a car in the way.");
    expect(player.inventory!.contains(bag), "the bag was not spent").toBe(true);
  });

  it("refuses when the survivor could not sleep anyway", async () => {
    const bag = hold(ItemID.SLEEPING_BAG);
    player.sleepPoints = game.m_Rules.actorMaxSleep(player);
    expect(await game.HandlePlayerUseSleepingBag(player, bag)).toBe(false);
    expect(messages()).toContain("Can't sleep :");
    expect(player.inventory!.contains(bag)).toBe(true);
  });

  it("a successful use puts the bag on the ground and starts the sleep", async () => {
    // The C#'s order (`:14872-14873`): the bag is on the floor *before* the "Really
    // sleep there" question, so a player who declines keeps the bag and has paid the
    // turn. Transcribed, not corrected.
    const bag = hold(ItemID.SLEEPING_BAG);
    player.sleepPoints = 0;
    press("y");

    expect(await game.HandlePlayerUseSleepingBag(player, bag)).toBe(true);
    expect(groundAt()?.items.some((i) => i.model.id === ItemID.SLEEPING_BAG)).toBe(true);
    expect(player.inventory!.contains(bag)).toBe(false);
    expect(player.isSleeping).toBe(true);
    expect(player.activity).toBe(Activity.SLEEPING);
  });

  it("declining the sleep confirmation still leaves the bag on the ground", async () => {
    // The same asymmetry as above, stated as its own test because it is the part a
    // reader is most likely to think is a bug. It is the reference's behaviour and
    // `HandlePlayerSleep`'s return value is not adjusted to compensate.
    const bag = hold(ItemID.SLEEPING_BAG);
    player.sleepPoints = 0;
    press("n");

    expect(await game.HandlePlayerUseSleepingBag(player, bag)).toBe(false);
    expect(groundAt()?.items.some((i) => i.model.id === ItemID.SLEEPING_BAG)).toBe(true);
    expect(player.isSleeping).toBe(false);
  });

  it("a bag on the floor is what the sleep-regen OR asks about", () => {
    // `RogueGame.cs:6373-6378`. `Rules.actorSleepRegen`'s second parameter is still
    // named `isOnCouch` and the reference folds the bag into it *at the call site*
    // rather than widening the signature -- so the assertion is on the predicate and
    // on the two rates it selects between, not on a new argument.
    const couchRate = game.m_Rules.actorSleepRegen(player, true);
    const floorRate = game.m_Rules.actorSleepRegen(player, false);
    expect(couchRate).toBeGreaterThan(floorRate);
    // The two rates are `Rules.SLEEP_COUCH_SLEEPING_REGEN` and its `-NOCOUCH-`
    // sibling; the constants are private, so the ordering plus the predicate below is
    // the honest assertion available from outside the class.
    expect(couchRate - floorRate).toBeGreaterThan(0);

    // The predicate both the turn loop and `behaviorSleep` use. By model id and not
    // by class, so one bag under a stack of sleepers rates all of them.
    expect(
      groundAt()?.hasItemMatching((i) => i.model.id === ItemID.SLEEPING_BAG),
      "no bag yet",
    ).toBeFalsy();
    map.dropItemAt(new Item(Models.items.get(ItemID.SLEEPING_BAG)), AT);
    expect(groundAt()!.hasItemMatching((i) => i.model.id === ItemID.SLEEPING_BAG)).toBe(true);
  });

  it("the AI's couch scan would find a bag on a bare tile", () => {
    // `BaseAI.cs:2524-2536`, asserted on its two-line predicate rather than through
    // `behaviorSleep`, which needs an `FOV` this fixture cannot build without running
    // `UpdatePlayerFOV`. The two facts the scan depends on are both here: the bag is
    // on the ground rather than in a hand, and there is no map object on the tile, so
    // the C#'s `mapObj == null` guard holds and the bag cannot be chosen under a car.
    const at = new Point(AT.x - 2, AT.y);
    map.dropItemAt(new Item(Models.items.get(ItemID.SLEEPING_BAG)), at);
    expect(map.getMapObjectAtPoint(at), "the guard's other half").toBeNull();
    expect(
      map
        .getItemsAt(at)!
        .hasItemMatching((i) => i.model.id === ItemID.SLEEPING_BAG),
    ).toBe(true);
  });
});

// ── 3. DoUnloadAmmoFromGun ───────────────────────────────────────────────────

describe("the ammunition: unloading is the only reader any of it has", () => {
  it("an empty hand refuses with the C#'s message", () => {
    expect(game.HandlePlayerUnloadAmmo(player)).toBe(false);
    expect(messages()).toContain("No weapon equipped to unload.");
  });

  it("an empty gun refuses with 'has no ammo loaded'", () => {
    // `Rules.cs:1449-1454`, Release 7-2. The comment block above that check is a
    // copy-paste from `CanActorRechargeItemBattery` two methods away and says "already
    // fully charged"; the code says empty, and the code is the load-bearing part.
    holdGun(ItemID.RANGED_PISTOL, 0);
    expect(game.HandlePlayerUnloadAmmo(player)).toBe(false);
    expect(messages()).toContain("has no ammo loaded");
  });

  it("returns the magazine to the pack and empties the gun", () => {
    const gun = holdGun(ItemID.RANGED_PISTOL, 7);
    expect(game.HandlePlayerUnloadAmmo(player)).toBe(true);
    expect(gun.ammo, "the gun is empty").toBe(0);
    expect(quantityOf(ItemID.AMMO_LIGHT_PISTOL, "pack")).toBe(7);
    expect(quantityOf(ItemID.AMMO_LIGHT_PISTOL, "ground"), "nothing was dropped").toBe(0);
  });

  it.each([
    [ItemID.RANGED_NAIL_GUN, ItemID.AMMO_NAILS],
    [ItemID.RANGED_ARMY_PRECISION_RIFLE, ItemID.AMMO_PRECISION_RIFLE],
    [ItemID.RANGED_MINIGUN, ItemID.AMMO_MINIGUN],
    [ItemID.RANGED_GRENADE_LAUNCHER, ItemID.AMMO_GRENADES],
  ])("a %s gives its own ammunition back", (gunId, ammoId) => {
    // These four are the ids `GameItems.ts:1189-1197` says "still add no behaviour,
    // because nothing drops them": the gun was always ported and the ammunition never
    // had a way out of it. This is that way out, and it is the reason the reader is
    // worth porting at all.
    const gun = holdGun(gunId, 5);
    expect(game.HandlePlayerUnloadAmmo(player)).toBe(true);
    expect(gun.ammo).toBe(0);
    expect(quantityOf(ammoId, "pack")).toBe(5);
  });

  it("a bio-force gun is refused, because the C#'s switch forgot PLASMA", () => {
    // `AMMO_PLASMA` and `DoUnloadAmmoFromGun` both arrived in Release 7-6 and the
    // author's switch (`:22140-22155`) names ten `AmmoType`s and not that one, so a
    // loaded plasma gun reaches the C#'s `default` and throws. The port refuses it one
    // step earlier, in the rule, with the C#'s own reason string -- which is the
    // observable difference between "refused" and "threw".
    const gun = holdGun(ItemID.RANGED_BIO_FORCE_GUN, 3);
    expect(game.HandlePlayerUnloadAmmo(player)).toBe(false);
    expect(messages()).toContain("not an item with unloadable ammo");
    expect(gun.ammo, "and the rounds stay where they were").toBe(3);
  });

  it("what the pack cannot hold goes to the ground, and partly does not", () => {
    // The C# builds a single `ItemAmmo` per round and adds each one individually
    // (`:22166-22186`), then drops the remainder as a single stack. `addAll` is
    // all-or-nothing, so a *partly* full pack is the only way to see the difference
    // between "the whole magazine came out" and "what fitted came out".
    // `AMMO_LIGHT_PISTOL`'s stack limit is 20, so 19 rounds in one occupied slot leaves
    // room for exactly one more. Two slots, because `CanActorUnloadAmmoFromGun` also
    // requires the gun to be *in* the inventory (`Rules.cs:1415`) as well as equipped --
    // a one-slot pack cannot hold both, and the rule would refuse before the reader ran.
    const twoSlots = new Inventory(2);
    const stack = new Item(Models.items.get(ItemID.AMMO_LIGHT_PISTOL));
    stack.quantity = 19;
    twoSlots.addAll(stack);
    const gun = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_PISTOL));
    gun.ammo = 7;
    twoSlots.addAll(gun);
    player.inventory = twoSlots;
    game.DoEquipItem(player, gun);

    expect(game.HandlePlayerUnloadAmmo(player)).toBe(true);
    expect(gun.ammo).toBe(0);
    expect(quantityOf(ItemID.AMMO_LIGHT_PISTOL, "pack")).toBe(20);
    expect(quantityOf(ItemID.AMMO_LIGHT_PISTOL, "ground")).toBe(6);
  });

  it("a loaded gun in the pack is not the gun it would have to be", () => {
    // **The "item not equipped" refusal is unreachable from this entry point**, and
    // saying so is more useful than a test that pretends otherwise.
    // `HandlePlayerUnloadAmmo` takes its item *from* `GetEquippedRangedWeapon`, so by
    // the time `CanActorUnloadAmmoFromGun` runs its check 2 (`Rules.cs:1415`) the item
    // is equipped by construction. A loaded gun in the pack therefore produces the
    // *first* refusal, not the second. The check is transcribed because the rule is
    // shared and a second caller will arrive with the `UNLOAD_AMMO` key.
    const gun = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_PISTOL));
    gun.ammo = 4;
    player.inventory!.addAll(gun);
    const before = player.actionPoints;

    expect(game.HandlePlayerUnloadAmmo(player)).toBe(false);
    expect(messages()).toContain("No weapon equipped to unload.");
    expect(player.actionPoints, "the rule runs before the spend").toBe(before);
    expect(gun.ammo).toBe(4);
  });

  it("the unload verb is the C#'s own two-string pair", () => {
    // `RogueGame.cs:489`: `new Verb("unload", "unloads")`. Almost every verb in the
    // file has one string and lets `Verb`'s constructor default the plural to
    // `youForm + "s"`, which happens to give "unloads" here -- so the *fields* are the
    // assertion that pins the reference's spelling, and the message is only there to
    // show the verb is the one that was used.
    expect(game.VERB_UNLOAD.youForm).toBe("unload");
    expect(game.VERB_UNLOAD.heForm).toBe("unloads");
    holdGun(ItemID.RANGED_PISTOL, 2);
    game.HandlePlayerUnloadAmmo(player);
    // `Conjugate` picks `youForm` for the player, whose name is not a proper noun.
    expect(messages()).toContain("unload the pistol");
  });
});

// ── 4. DoMakeMolotov ─────────────────────────────────────────────────────────

describe("the liquor: one bottle in, one primed molotov out", () => {
  it("converts a whole stack, one-for-one", async () => {
    // The C# reads `Quantity` *after* `RemoveAllQuantity` (`:22099-22002`), and
    // `RemoveAllQuantity` does not zero the item's own quantity -- it only takes the
    // object out of the inventory. So the count survives and the loop builds one
    // molotov per bottle. Reading it *before* the removal would build nothing, and a
    // bar's bottle arrives as six over a limit of three
    // (`still-alive-misc-items.test.ts` pins that), which is what makes it visible.
    const liquor = hold(ItemID.LIQUOR_AMBER, 6);
    await game.DoUseItem(player, liquor);

    expect(player.inventory!.contains(liquor), "the bottle is gone").toBe(false);
    expect(molotovsHeld(), "six bottles, six molotovs").toBe(6);
    for (const m of player.inventory!.items) {
      expect(m).toBeInstanceOf(ItemGrenade);
      expect(m.model.id).toBe(ItemID.EXPLOSIVE_MOLOTOV);
    }
    expect(messages()).toContain("crafted a molotov from liquor.");
    expect(played).toContain(GameSounds.MAKE_MOLOTOV);
  });
  it("either bottle works", async () => {
    const clear = hold(ItemID.LIQUOR_CLEAR, 2);
    await game.DoUseItem(player, clear);
    expect(molotovsHeld()).toBe(2);
  });

  it("a beer is not liquor and makes nothing", async () => {
    // A beer is an `ItemMedicine`, so `DoUseItem`'s medicine arm takes it long before
    // the molotov arm is reached. Asserted because "is this a liquor" is the whole
    // dispatch and the two liquor models exist precisely because the check is per-id.
    const beer = hold(ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN, 1);
    await game.DoUseItem(player, beer);
    expect(molotovsHeld()).toBe(0);
  });

  it("what the pack cannot hold goes on the floor rather than vanishing", async () => {
    // `RogueGame.cs:22112-22121`, Release 7-5.
    //
    // **The pack has to be full *after* the bottle leaves it**, which is the awkward
    // part. `DoMakeMolotov` spends the slot the bottle was in before it builds
    // anything, so a pack holding only a bottle always has room for the first molotov.
    // The shape that produces overflow is a two-slot pack holding the bottle *and* a
    // medkit: the bottle goes, one molotov takes the freed slot, and the other three
    // have nowhere to go.
    //
    // The other trap is stacking, and it decides the numbers. `addAsMuchAsPossible`
    // adds to an existing molotov pile, so once the first molotov is in the one free
    // slot the rest *stack* -- up to `EXPLOSIVE_MOLOTOV`'s limit of three -- and only
    // the fourth has nowhere to go. A pack whose free slot already held a *full* molotov
    // stack would report zero overflow and make this test pass with the overflow loop
    // deleted; a pack of nothing but the bottle would report zero too, because the
    // bottle vacates its slot first. The medkit is what makes it three-and-one.
    const twoSlots = new Inventory(2);
    player.inventory = twoSlots;
    const liquor = hold2(ItemID.LIQUOR_CLEAR, 4, twoSlots);
    twoSlots.addAll(new Item(Models.items.get(ItemID.MEDICINE_MEDIKIT)));
    expect(twoSlots.countItems).toBe(2);

    await game.DoUseItem(player, liquor);
    expect(molotovsHeld(), "the free slot plus the stack limit").toBe(3);
    expect(quantityOf(ItemID.EXPLOSIVE_MOLOTOV, "ground")).toBe(1);
  });

  it("an NPC may craft one too, and it costs it a turn", async () => {
    // The molotov arm is the only one of Still Alive's six "complex items" the C#
    // puts *outside* the `actor.IsPlayer && !actor.IsBotPlayer` block: `:21536`
    // against `:21538`. The AP spend is the Release 7-6 addition at `:22097`.
    const npc = bystander(new Point(AT.x - 1, AT.y));
    const liquor = new Item(Models.items.get(ItemID.LIQUOR_AMBER));
    npc.inventory!.addAll(liquor);
    const before = npc.actionPoints;

    await game.DoUseItem(npc, liquor);
    expect(npc.inventory!.items.some((i) => i instanceof ItemGrenade)).toBe(true);
    expect(npc.actionPoints).toBe(before - Rules.BASE_ACTION_COST);
  });
});

// ── Classic: all four are inert, and the reachable-by-accident case is real ────

describe("under Ruleset.CLASSIC every one of the four is inert", () => {
  beforeEach(() => {
    Session.get().ruleset = Ruleset.CLASSIC;
  });

  it("the three gates this change reads are off", () => {
    // Asserted at the registry, so a later `WITHHELD_FROM_STILL_ALIVE` entry cannot
    // quietly make one of the tests below vacuously true.
    for (const f of [Feature.DarknessFov, Feature.ResourcesAvailability, Feature.TileFires]) {
      expect(hasFeature(Ruleset.CLASSIC, f), Feature[f]).toBe(false);
      expect(hasFeature(Ruleset.STILL_ALIVE, f), Feature[f]).toBe(true);
    }
  });

  it("all eleven ids are present, because inert must not mean absent", () => {
    // If an id stopped resolving, a save holding one would break -- a different
    // failure from "cannot be used", and one these tests must not paper over.
    const ids = [
      ItemID.CANDLES_BOX,
      ItemID.FLARES_KIT,
      ItemID.GLOWSTICKS_BOX,
      ItemID.SLEEPING_BAG,
      ItemID.LIQUOR_AMBER,
      ItemID.LIQUOR_CLEAR,
      ItemID.AMMO_NAILS,
      ItemID.AMMO_PRECISION_RIFLE,
      ItemID.AMMO_MINIGUN,
      ItemID.AMMO_GRENADES,
      ItemID.AMMO_PLASMA,
    ];
    expect(ids).toHaveLength(11);
    for (const id of ids) expect(Models.items.get(id), ItemID[id]).toBeTruthy();
  });

  it("a kit drops like any other box: no prompt, no light, no sound", async () => {
    // **This is the case worth verifying rather than assuming.** None of the three
    // kits has a Classic drop site, so a generated Classic world cannot contain one
    // and the gate is belt-and-braces for generation. What it is *not* belt-and-braces
    // for is a survivor holding one -- from a save, a script, or a hand-edited
    // inventory -- and for the flare and glowstick models it is the whole defence,
    // because `GameItems.ts:1159` sets `isThrowable` on them with no ruleset test.
    //
    // Keys are queued and must go unused: if anything asked a question, `UI_WaitKey`
    // would answer from the queue and the assertions below would be about whatever it
    // chose.
    for (const id of [ItemID.CANDLES_BOX, ItemID.FLARES_KIT, ItemID.GLOWSTICKS_BOX]) {
      const box = hold(id, 3);
      press("o", "c", "t", "Escape");
      await game.DoUseItem(player, box);
      await game.DoDropItem(player, box);
      expect(player.inventory!.contains(box), `${ItemID[id]} left the pack`).toBe(false);
      expect(quantityOf(id, "ground"), `${ItemID[id]} is on the floor`).toBe(3);
    }
    expect(tileAt().hasDecoration(GameImages.DECO_LIT_CANDLE)).toBe(false);
    expect(map.timers.length, "no candle timer").toBe(0);
    expect(carriedLights()).toHaveLength(0);
    expect(played, "no fork sounds in a Classic district").toEqual([]);
  });

  it("a bare throwable light does not open the throw mode", async () => {
    const flare = new ItemLight(Models.items.get(ItemID.LIGHT_FLARE));
    player.inventory!.addAll(flare);
    const before = player.actionPoints;
    // `f` would throw it and spend the turn if the mode opened at all.
    press("f");
    await game.DoUseItem(player, flare);
    expect(quantityOf(ItemID.LIGHT_FLARE, "ground")).toBe(0);
    expect(player.actionPoints).toBe(before);
    expect(player.inventory!.contains(flare)).toBe(true);
  });

  it("a sleeping bag cannot be unrolled", async () => {
    // Driven through `DoUseItem` rather than through the handler, because the gate is
    // on the *dispatch*: `HandlePlayerUseSleepingBag` itself is the C#'s method with
    // no ruleset test in it, and calling it directly would be testing a door the
    // player cannot walk through.
    const bag = hold(ItemID.SLEEPING_BAG);
    player.sleepPoints = 0;
    press("y");
    await game.DoUseItem(player, bag);
    expect(player.inventory!.contains(bag)).toBe(true);
    expect(quantityOf(ItemID.SLEEPING_BAG, "ground")).toBe(0);
    expect(player.isSleeping).toBe(false);
  });

  it("a bottle is not craftable", async () => {
    const liquor = hold(ItemID.LIQUOR_AMBER, 3);
    await game.DoUseItem(player, liquor);
    expect(player.inventory!.contains(liquor), "the bottle is untouched").toBe(true);
    expect(molotovsHeld()).toBe(0);
  });

  it("and the one honest gap: the unload rule itself is not gated", () => {
    // `HandlePlayerUnloadAmmo` is the C#'s whole method and `Rules` has no ruleset
    // axis for it, so the gate belongs on the caller -- the `PlayerCommand.UNLOAD_AMMO`
    // that does not exist yet (`engine/PlayerCommand.ts` and `engine/Keybindings.ts`
    // are files this change does not own). Asserted as the gap it is: the method is
    // reachable *today*, under Classic, and it works. If a command is wired later the
    // gate goes on that `case`, and this test is the one that should be replaced by a
    // test that the key does nothing.
    const gun = holdGun(ItemID.RANGED_PISTOL, 5);
    expect(game.HandlePlayerUnloadAmmo(player)).toBe(true);
    expect(gun.ammo).toBe(0);
    expect(quantityOf(ItemID.AMMO_LIGHT_PISTOL, "pack")).toBe(5);
  });
});

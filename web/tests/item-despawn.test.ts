/**
 * `Feature.ItemDespawn` — NPC litter rots away.
 *
 * Still Alive, Release 7-6.
 *
 * The feature is a whitelist read upside down: `ApplyItemTurnTracker` exempts
 * everything worth keeping and timestamps whatever falls off the end, and
 * `DeleteItemsSittingIdle` later deletes what has aged past the option. So both
 * halves have to agree, and the tests check both — the exemption list (a bug
 * surface, since a mistake there makes something the player wants disappear from
 * a map they are looking at) and the sweep's two guards.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { District, DistrictKind } from "@data/District";
import { Faction } from "@data/Faction";
import type { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { GameOptions } from "@engine/GameOptions";
import { LOS } from "@engine/LOS";
import { DiceRoller } from "@engine/DiceRoller";
import { Weather } from "@data/Weather";
import { Rules } from "@engine/Rules";
import { WorldTime } from "@engine/WorldTime";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { ItemGrenade } from "@engine/items/ItemExplosive";
import { ItemFood, type ItemFoodModel } from "@engine/items/ItemFood";
import { ItemEntertainment } from "@engine/items/ItemMisc";
import { ItemMedicine, type ItemMedicineModel } from "@engine/items/ItemMedicine";
import { ItemTrap, type ItemTrapModel } from "@engine/items/ItemTrap";
import {
  ItemAmmo,
  type ItemAmmoModel,
  ItemMeleeWeapon,
  type ItemMeleeWeaponModel,
} from "@engine/items/ItemWeapon";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { NullRogueUI } from "@ui/NullRogueUI";

let game: RogueGame;
let map: GameMap;
let nextTile: number;
let player: Actor;

beforeEach(() => {
  new GameActors();
  new GameItems();
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  nextTile = 30;
  RogueGame.Options().daysBeforeDiscardedItemDespawns = 4;

  // Three of these tests are about the *player's* exclusion, and `m_Player` is a
  // plain public field that `StartNewGame` would normally fill. Standing up a
  // `HeadlessRunner` to get one costs three minutes of world generation for what
  // is a single assignment, so a real Actor is placed and handed over instead.
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  map.placeActor(player, new Point(1, 1));
  game.m_Player = player;
});

const survivors = new Faction("The Survivors", "survivor");

const opt = () => RogueGame.Options().daysBeforeDiscardedItemDespawns;

/** A fresh, empty tile. Nothing is ever visible, so the sweep may look. */
const spot = (): Point => new Point(nextTile++, 30);

/** An NPC standing on its own tile, so two drops never collide. */
let nextActor = 2;
const npc = (): Actor => {
  const a = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
  map.placeActor(a, new Point(nextActor++, 2));
  return a;
};

const med = (id: ItemID): ItemMedicine =>
  new ItemMedicine(Models.items.get(id) as ItemMedicineModel);

/**
 * Real models from the data tables, not fabricated ones.
 *
 * A hand-built `ItemAmmoModel("ammo", "ammo", "img", ammoType, 20)` would prove
 * the whitelist reads `ammoType` correctly, but it would *not* prove that
 * `AMMO_BOLTS` is the item the whitelist thinks it is, and that second question
 * is the one that bites. The one place this could not be followed is the NAIL
 * and FUEL exemption branches: those two ammo types have no item in the port
 * yet, so they are covered by the constant assertion at the bottom instead.
 */
const ammo = (id: ItemID): ItemAmmo =>
  new ItemAmmo(Models.items.get(id) as ItemAmmoModel);

const food = (): ItemFood =>
  new ItemFood(Models.items.get(ItemID.FOOD_GROCERIES) as ItemFoodModel);
const grenade = (): ItemGrenade =>
  new ItemGrenade(
    Models.items.get(ItemID.EXPLOSIVE_GRENADE),
    Models.items.get(ItemID.EXPLOSIVE_GRENADE_PRIMED),
  );
const trap = (id: ItemID): ItemTrap => new ItemTrap(Models.items.get(id) as ItemTrapModel);
const entertainment = (): ItemEntertainment => new ItemEntertainment(Models.items.get(ItemID.ENT_BOOK));

/** Drop it as an NPC would, and return whatever the stamp came out as. */
const dropAsNpc = (it: Item): number | null => dropAsNpcIn(npc(), it);

const dropAsNpcIn = (who: Actor, it: Item): number | null => {
  it.droppedOnTurnNumber = null;
  game.DropItem(who, it);
  return it.droppedOnTurnNumber;
};

describe("Feature.ItemDespawn: the option", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.ItemDespawn)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.ItemDespawn)).toBe(false);
  });

  it("defaults to four days", () => {
    // `RogueGame.Options()` is the live singleton, which a previous test may have
    // moved, so the default is read off a fresh instance.
    const fresh = new GameOptions();
    expect(fresh.daysBeforeDiscardedItemDespawns).toBe(4);
  });

  it("clamps at zero rather than going negative", () => {
    const o = RogueGame.Options();
    o.daysBeforeDiscardedItemDespawns = -3;
    expect(o.daysBeforeDiscardedItemDespawns).toBe(0);
  });
});

describe("Feature.ItemDespawn: what gets stamped", () => {
  it("stamps a dropped crowbar, the archetypal junk item", () => {
    const model = Models.items.get(ItemID.MELEE_CROWBAR) as ItemMeleeWeaponModel;
    expect(dropAsNpc(new ItemMeleeWeapon(model))).not.toBeNull();
  });

  it("keeps every item the fork exempts", () => {
    // Each of these is an early `return` in the whitelist. Lose one and the item
    // is stamped, then deleted from a map the player is looking at.
    const exempt: Array<[string, Item]> = [
      ["bandages", med(ItemID.MEDICINE_BANDAGES)],
      ["food", food()],
      ["grenade", grenade()],
      ["bear trap", trap(ItemID.TRAP_BEAR_TRAP)],
      ["entertainment", entertainment()],
      ["shotgun ammo", ammo(ItemID.AMMO_SHOTGUN)],
      ["light rifle ammo", ammo(ItemID.AMMO_LIGHT_RIFLE)],
      ["heavy rifle ammo", ammo(ItemID.AMMO_HEAVY_RIFLE)],
    ];
    for (const [name, it] of exempt) {
      expect(dropAsNpc(it), `${name} must not be stamped`).toBeNull();
    }
  });

  it("stamps exactly the four early-game ammo types, and no others", () => {
    // This is the one place in the whitelist where reading it as a list of what
    // is *kept* gives the opposite answer to reading it as a list of what is
    // *deleted*, so it is worth being explicit.
    //
    // The C# reads:
    //   if (AmmoType != BOLT && != LIGHT_PISTOL && != NAIL && != FUEL) return;
    // A `return` here is an *exemption*, so the four named types are the ones
    // that fall through and get stamped. That matches the comment above it --
    // "nails, crossbows and pistols are early-game weps... thus these are just
    // clutter" -- and it is the opposite of what the list looks like.
    for (const id of [ItemID.AMMO_BOLTS, ItemID.AMMO_LIGHT_PISTOL]) {
      expect(dropAsNpc(ammo(id)), `ammo ${id} is clutter`).not.toBeNull();
    }
    // NAIL and FUEL are the other two in the C#'s four, but neither has an item
    // in the port yet (they are among the fork's ammo the content pack has not
    // taken), so the branch is unexercised for them and this says so rather than
    // pretending.
    for (const id of [ItemID.AMMO_SHOTGUN, ItemID.AMMO_LIGHT_RIFLE, ItemID.AMMO_HEAVY_RIFLE]) {
      expect(dropAsNpc(ammo(id)), `ammo ${id} is kept`).toBeNull();
    }
  });

  it("stamps a beer bottle, which is the whole point of isRecreational", () => {
    // A beer is `ItemMedicine`. Without `isRecreational` the "keep all medicine"
    // exemption would preserve every dropped bottle forever, which is exactly the
    // clutter this feature exists to remove.
    const beer = med(ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN);
    expect(beer).toBeInstanceOf(ItemMedicine);
    expect(beer.model.isRecreational).toBe(true);
    expect(dropAsNpc(beer)).not.toBeNull();
  });

  it("marks exactly the five boozes and smokes recreational", () => {
    for (const id of [
      ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN,
      ItemID.MEDICINE_ALCOHOL_BEER_CAN_BLUE,
      ItemID.MEDICINE_ALCOHOL_BEER_CAN_RED,
      ItemID.MEDICINE_CIGARETTES,
      ItemID.MEDICINE_ENERGY_DRINK,
    ]) {
      expect(Models.items.get(id).isRecreational, `id ${id}`).toBe(true);
    }
    // And genuine medicine is not, or the exemption above would be dead code.
    expect(Models.items.get(ItemID.MEDICINE_BANDAGES).isRecreational).toBe(false);
  });

  it("keeps a unique item and a forbidden-to-AI item", () => {
    // `AMMO_BOLTS` rather than the shotgun shells used elsewhere: the shells are
    // exempt ammo and would never be stamped at all, so using them here would let
    // the assertion hold even with this exemption deleted.
    const unique = ammo(ItemID.AMMO_BOLTS);
    unique.isUnique = true;
    expect(dropAsNpc(unique), "unique").toBeNull();

    const forbidden = ammo(ItemID.AMMO_BOLTS);
    forbidden.isForbiddenToAI = true;
    expect(dropAsNpc(forbidden), "forbidden to AI").toBeNull();
  });

  it("stamps the empty can, which is the one trap that does rot", () => {
    expect(dropAsNpc(trap(ItemID.TRAP_EMPTY_CAN))).not.toBeNull();
  });

  it("does not stamp the player's own drop", () => {
    // The C#'s `else if (actor.Leader != m_Player)` is an exclusion, so the
    // player is the case that must *not* stamp. `DropItem` needs the real
    // player, which this test drives directly.
    const it = ammo(ItemID.AMMO_SHOTGUN);
    it.droppedOnTurnNumber = null;
    game.DropItem(player, it);
    expect(it.droppedOnTurnNumber).toBeNull();
  });

  it("does not stamp a follower's drop", () => {
    // The other half of the same exclusion: a companion handing down their last
    // bandage must not be able to lose it to the sweep.
    //
    // Two things this test needs and got wrong first time round, both of which
    // made it pass while proving nothing:
    //
    // - the item must be one the whitelist *would* stamp. `AMMO_SHOTGUN` is
    //   exempt ammo, so it was never stamped and the assertion held no matter
    //   what the follower branch did. `AMMO_BOLTS` is clutter, so it is.
    // - the leader must be the *player*. The C#'s test is
    //   `actor.Leader != m_Player`, so a follower of an NPC is still litter.
    const follower = npc();
    follower.leader = player;
    const it = ammo(ItemID.AMMO_BOLTS);
    expect(dropAsNpcIn(follower, it), "the player's follower").toBeNull();

    const gangFollower = npc();
    gangFollower.leader = npc();
    expect(dropAsNpcIn(gangFollower, ammo(ItemID.AMMO_BOLTS)), "an NPC's follower").not.toBeNull();
  });

  it("stamps nothing at all under CLASSIC", () => {
    Session.get().ruleset = Ruleset.CLASSIC;
    for (const it of [ammo(ItemID.AMMO_SHOTGUN), med(ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN)]) {
      expect(dropAsNpc(it), "classic must not stamp").toBeNull();
    }
  });
});

describe("Feature.ItemDespawn: the sweep", () => {
  // The sweep is private, so these drive it through `DespawnJunkInDistrict`,
  // which is also where the rate-limit guard lives.
  // `DespawnJunkInDistrict` is private because it is turn-loop plumbing. The
  // test needs it, so it is reached through the one-line alias below rather than
  // by widening the method's visibility for a test's benefit.
  const sweep = (d: District): void =>
    (game as unknown as { DespawnJunkInDistrict(d: District): void }).DespawnJunkInDistrict(d);

  const districtOf = (): District => {
    const d = new District(new Point(0, 0), DistrictKind.GENERAL);
    d.addMap(map);
    return d;
  };

  /**
   * Both clocks, because the sweep reads two different ones: the rate-limit
   * guard reads the *session's* world time and the ageing reads the *map's*
   * local time. Advancing only one of them is the easiest way to write a test
   * that silently exercises the early return.
   */
  const setTime = (turns: number): void => {
    map.localTime.turnCounter = turns;
    (game.m_Session as unknown as { m_WorldTime: WorldTime }).m_WorldTime = new WorldTime(turns);
  };

  /** Stamp an item, place it out of sight, and return both. */
  const litter = (it: Item, droppedOn: number): { it: Item; at: Point } => {
    it.droppedOnTurnNumber = droppedOn;
    const at = spot();
    map.dropItemAt(it, at);
    return { it, at };
  };

  const stillThere = (at: Point, it: Item): boolean =>
    map.getItemsAt(at)?.contains(it) === true;

  it("deletes litter older than the option", () => {
    const { it, at } = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    setTime(opt() * WorldTime.TURNS_PER_DAY + 1);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(false);
  });

  it("keeps litter that is younger than the option", () => {
    const { it, at } = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    setTime(WorldTime.TURNS_PER_DAY);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(true);
  });

  it("removes litter on the exact day, not the day after", () => {
    // The `>=` boundary. The two clocks are set to *different* values on purpose:
    // the session clock has to be past the window to get past the rate-limit
    // guard, while the map clock sits exactly on the window so `idleTurns` lands
    // on the boundary. With `>` instead of `>=` the item survives, and that
    // off-by-one is invisible to any other test in this file.
    const { it, at } = litter(ammo(ItemID.AMMO_BOLTS), 0);
    const window = opt() * WorldTime.TURNS_PER_DAY;
    setTime(window);
    (game.m_Session as unknown as { m_WorldTime: WorldTime }).m_WorldTime =
      new WorldTime(window + 1);
    sweep(districtOf());
    expect(stillThere(at, it), "exactly `days` idle turns is enough").toBe(false);
  });

  it("keeps anything that was never stamped", () => {
    const { it, at } = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    it.droppedOnTurnNumber = null;
    setTime(opt() * WorldTime.TURNS_PER_DAY + 1);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(true);
  });

  it("does not run until the world is older than one full window", () => {
    // The C#'s outer guard is a strict `>`, so on a short game nothing is ever
    // swept. That is a deferral rather than a bug, and it is why a default of
    // four days means "on a long game".
    const { it, at } = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    const window = opt() * WorldTime.TURNS_PER_DAY;
    setTime(window);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(true);
  });

  it("never deletes a tile the player can see", () => {
    // An item vanishing in plain sight is a bug, not cleanup, so a visible tile
    // is skipped entirely rather than judged per item.
    const { it, at } = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    map.placeActor(player, new Point(at.x, at.y - 1));
    // The guard reads `tile.isInView`, which nothing has computed in this
    // harness, so the view has to be established by hand -- otherwise the tile is
    // invisible and the test passes for the wrong reason.
    map.setViewAndMarkVisited(LOS.fovPoints(
      LOS.computeFOVFor(new Rules(new DiceRoller(1)), player, map.localTime, Weather.CLEAR),
    ));
    expect(map.getTileAt(at.x, at.y)?.isInView, "the tile really is in view").toBe(true);
    setTime(opt() * WorldTime.TURNS_PER_DAY + 1);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(true);
  });

  it("sweeps only the stamped item, leaving a bystander alone", () => {
    const junk = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    const keep = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    keep.it.droppedOnTurnNumber = null;
    setTime(opt() * WorldTime.TURNS_PER_DAY + 1);
    sweep(districtOf());
    expect(stillThere(junk.at, junk.it)).toBe(false);
    expect(stillThere(keep.at, keep.it)).toBe(true);
  });

  it("does nothing at all under CLASSIC", () => {
    // The gate sits in the method, not at the turn-loop call site, so this is a
    // real test of the flag rather than a claim about untestable plumbing.
    Session.get().ruleset = Ruleset.CLASSIC;
    const { it, at } = litter(ammo(ItemID.AMMO_BOLTS), 0);
    setTime(WorldTime.TURNS_PER_DAY * 100);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(true);
  });

  it("does nothing at all when the option is zero", () => {
    const { it, at } = litter(ammo(ItemID.AMMO_SHOTGUN), 0);
    RogueGame.Options().daysBeforeDiscardedItemDespawns = 0;
    setTime(WorldTime.TURNS_PER_DAY * 100);
    sweep(districtOf());
    expect(stillThere(at, it)).toBe(true);
  });
});

describe("Feature.ItemDespawn: pickup clears the clock", () => {
  it("rescued litter carries no stamp into a future drop", () => {
    // Asserting the field's default would prove nothing about the take path, so
    // this drives `DoTakeItem` for real. Without the clear, a player who picks a
    // stamped item up on day 30 and later dumps it keeps the *original* stamp
    // until something re-stamps it -- and the player/follower exclusion means
    // nothing ever will.
    const it = ammo(ItemID.AMMO_SHOTGUN);
    it.droppedOnTurnNumber = 17;
    const at = spot();
    map.dropItemAt(it, at);

    map.placeActor(player, at);
    game.DoTakeItem(player, at, it);

    expect(it.droppedOnTurnNumber, "picked up is no longer litter").toBeNull();
  });
});

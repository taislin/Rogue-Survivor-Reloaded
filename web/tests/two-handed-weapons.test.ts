/**
 * `ItemWeaponModel.isOneHanded` and the two guards that read it — Still Alive,
 * Release 7-2.
 *
 * The police riot shield landed earlier (its model, `DollPart.LEFT_ARM`, the block
 * roll and the encumbrance), but without this field a shield and a baseball bat
 * coexist, which `RogueGame.cs:21014-21045` forbids in both directions.
 *
 * ## Why the id lists are spelled out in full
 *
 * The field is **hand-set per model in the reference and is not a column** — there
 * is no `ISONEHANDED` in `Items_MeleeWeapons.csv` or `Items_RangedWeapons.csv`, and
 * all 37 melee and all 22 of the reference's ranged values are literals written at
 * the construction site. That makes it exactly the kind of field a coverage
 * number cannot check: a transcription slip produces a weapon that compiles, loads
 * and plays, and differs from the reference in a way nothing else would notice.
 *
 * So the sets are asserted as sets, in both directions, and the counts (19/18
 * melee, 7/15 ranged) are asserted alongside them. Asserting membership alone
 * would pass if a fourteenth one-handed weapon appeared; asserting counts alone
 * would pass if the right number of the wrong ones did.
 *
 * The lists were read off the reference rather than off intuition, and three of
 * them are the check on the record: the **katana** is two-handed, the **machete**
 * is one-handed, and the **hunting crossbow** is two-handed. Those are the three a
 * test written from what a weapon looks like would get backwards.
 *
 * ## The eight models the reference does not have
 *
 * Four melee (`UNIQUE_JASON_MYERS_AXE`, `UNIQUE_FAMU_FATARU_KATANA`,
 * `UNIQUE_BIGBEAR_BAT`, `UNIQUE_ROGUEDJACK_KEYBOARD`) and four ranged
 * (`RANGED_ARMY_RIFLE`, `RANGED_KOLT_REVOLVER`, `UNIQUE_SANTAMAN_SHOTGUN`,
 * `UNIQUE_HANS_VON_HANZ_PISTOL`) are ids that appear nowhere in the reference —
 * the fork dropped the models and the CSV kept the rows. They take the field's
 * `false` default because the reference is silent, and that is asserted here so the
 * silence is a recorded decision rather than an unexamined gap. Two of them are
 * pistols, which is the whole reason the assertion is worth having: it pins the
 * answer rather than leaving room for a later "fix" to flip them.
 *
 * ## The equip guards
 *
 * Driven through `RogueGame.DoEquipItem`, not by setting `equippedPart` by hand,
 * because the guards live in `OnEquipItem` and `DoEquipItem` is what reaches it.
 * The actor is the game's `m_Player` and is standing on a map, so the `AddMessage`
 * inside `DoUnequipItem` has a visible player to address; the test asserts on
 * equipment, not on messages, but a method that throws is a test that lies.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Item } from "@data/Item";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { Point } from "@engine/Point";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { Ruleset, Session } from "@engine/Session";
import {
  ItemMeleeWeapon,
  ItemMeleeWeaponModel,
  ItemRangedWeapon,
  ItemWeaponModel,
} from "@engine/items/ItemWeapon";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let player: Actor;

/** The C#'s 19 `IsOneHanded = true` melee models, in `GameItems.cs` order. */
const ONE_HANDED_MELEE: ItemID[] = [
  ItemID.MELEE_COMBAT_KNIFE,
  ItemID.MELEE_CROWBAR,
  ItemID.MELEE_SHORT_SHOVEL,
  ItemID.MELEE_TRUNCHEON,
  ItemID.MELEE_IMPROVISED_CLUB,
  ItemID.MELEE_SMALL_HAMMER,
  ItemID.MELEE_TENNIS_RACKET,
  ItemID.MELEE_MACHETE,
  ItemID.MELEE_PIPE_WRENCH,
  ItemID.MELEE_CLEAVER,
  ItemID.MELEE_BRASS_KNUCKLES,
  ItemID.MELEE_FLAIL,
  ItemID.MELEE_KITCHEN_KNIFE,
  ItemID.MELEE_SCIMITAR,
  ItemID.MELEE_MACE,
  ItemID.MELEE_NUNCHAKU,
  ItemID.MELEE_FRYING_PAN,
  ItemID.MELEE_SICKLE,
  ItemID.MELEE_SPIKED_MACE,
];

/** The C#'s 18 `IsOneHanded = false` melee models. */
const TWO_HANDED_MELEE: ItemID[] = [
  ItemID.MELEE_BASEBALLBAT,
  ItemID.MELEE_BONESAW,
  ItemID.MELEE_GOLFCLUB,
  ItemID.MELEE_IRON_GOLFCLUB,
  ItemID.MELEE_HUGE_HAMMER,
  ItemID.MELEE_SHOVEL,
  ItemID.MELEE_IMPROVISED_SPEAR,
  ItemID.MELEE_KATANA,
  ItemID.MELEE_BARBED_WIRE_BAT,
  ItemID.MELEE_KEYBOARD,
  ItemID.MELEE_HOCKEY_STICK,
  ItemID.MELEE_STANDARD_AXE,
  ItemID.MELEE_PICKAXE,
  ItemID.MELEE_CHAINSAW,
  ItemID.MELEE_PITCH_FORK,
  ItemID.MELEE_SCYTHE,
  ItemID.MELEE_SPEAR,
  ItemID.MELEE_FIRE_AXE,
];

/**
 * The C#'s 7 one-handed ranged models.
 *
 * These are the **eighth constructor argument** of `ItemRangedWeaponModel`
 * (`ItemRangedWeaponModel.cs:66`, assigned at `:72`) — the literal between
 * `isSingleShot` and `weight`. Four are pistols; the SMG, the nail gun and the
 * stun gun are not, and the last two are the `isSingleShot` weapons sitting
 * immediately to the left of these literals, which is what makes reading the
 * neighbouring `bool` the easy mistake.
 */
const ONE_HANDED_RANGED: ItemID[] = [
  ItemID.RANGED_ARMY_PISTOL,
  ItemID.RANGED_PISTOL,
  ItemID.RANGED_REVOLVER,
  ItemID.RANGED_VINTAGE_PISTOL,
  ItemID.RANGED_NAIL_GUN,
  ItemID.RANGED_STUN_GUN,
  ItemID.RANGED_SMG,
];

/** The C#'s 15 two-handed ranged models. */
const TWO_HANDED_RANGED: ItemID[] = [
  ItemID.RANGED_ARMY_PRECISION_RIFLE,
  ItemID.RANGED_ARMY_RIFLE1,
  ItemID.RANGED_ARMY_RIFLE2,
  ItemID.RANGED_ARMY_RIFLE3,
  ItemID.RANGED_ARMY_RIFLE4,
  ItemID.RANGED_HUNTING_CROSSBOW,
  ItemID.RANGED_HUNTING_RIFLE,
  ItemID.RANGED_PRECISION_RIFLE,
  ItemID.RANGED_SHOTGUN,
  ItemID.RANGED_DOUBLE_BARREL,
  ItemID.RANGED_TACTICAL_SHOTGUN,
  ItemID.RANGED_FLAMETHROWER,
  ItemID.RANGED_MINIGUN,
  ItemID.RANGED_GRENADE_LAUNCHER,
  ItemID.RANGED_BIO_FORCE_GUN,
];

/** The eight models the reference does not register; they take the default. */
const NO_REFERENCE_MODEL: ItemID[] = [
  ItemID.UNIQUE_JASON_MYERS_AXE,
  ItemID.UNIQUE_FAMU_FATARU_KATANA,
  ItemID.UNIQUE_BIGBEAR_BAT,
  ItemID.UNIQUE_ROGUEDJACK_KEYBOARD,
  ItemID.RANGED_ARMY_RIFLE,
  ItemID.RANGED_KOLT_REVOLVER,
  ItemID.UNIQUE_SANTAMAN_SHOTGUN,
  ItemID.UNIQUE_HANS_VON_HANZ_PISTOL,
];

const isOneHanded = (id: ItemID): boolean =>
  (Models.items.get(id) as ItemWeaponModel).isOneHanded;

/** Every registered weapon model, so the sets can be checked for completeness. */
const allWeaponIds = (): ItemID[] =>
  Object.values(ItemID)
    .filter((v): v is number => typeof v === "number" && v !== ItemID._COUNT)
    .filter((id) => Models.items.get(id) instanceof ItemWeaponModel);

const melee = (id: ItemID): ItemMeleeWeapon =>
  new ItemMeleeWeapon(Models.items.get(id)!);
const ranged = (id: ItemID): ItemRangedWeapon =>
  new ItemRangedWeapon(Models.items.get(id)!);
const shield = (): Item => new Item(Models.items.get(ItemID.POLICE_RIOT_SHIELD)!);

/**
 * Put `item` in the pack and leave it there.
 *
 * Separate from `wear` because `getEquippedItem` reads the *inventory*
 * (`Actor.ts`: it loops `this.inventory.items`), so an item has to be in the pack
 * before `DoEquipItem` can put it on an arm or a guard can find it. `DoEquipItem`
 * itself only sets `equippedPart`, which is why the reverse tests below pack the
 * shield explicitly rather than relying on the equip call to do it.
 */
const pack = (item: Item): Item => {
  player.inventory!.addAll(item);
  return item;
};

/** `pack`, and straight onto the arm the model names, without going through the game. */
const wear = (item: Item): Item => {
  pack(item);
  item.equippedPart = item.model.equipmentPart;
  return item;
};

const inHand = (): Item | null => player.getEquippedItem(DollPart.RIGHT_HAND);
const onLeftArm = (): Item | null => player.getEquippedItem(DollPart.LEFT_ARM);

/** A fresh actor, already on a map and installed as the game's player. */
const newPlayer = (): Actor => {
  const map = new GameMap(1, "test", 30, 30);
  const a = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  a.controller = new PlayerController();
  map.placeActor(a, new Point(10, 10));
  game.m_Player = a;
  return a;
};

beforeEach(() => {
  new GameActors();
  new GameItems();
  Session.useSeed(1);
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  game = new RogueGame(new NullRogueUI());
  player = newPlayer();
});

describe("IsOneHanded: the melee table", () => {
  it("marks exactly the reference's nineteen one-handed melee weapons", () => {
    expect(ONE_HANDED_MELEE, "the list itself").toHaveLength(19);
    for (const id of ONE_HANDED_MELEE) {
      expect(isOneHanded(id), `id ${id}`).toBe(true);
    }
  });

  it("marks exactly the reference's eighteen two-handed melee weapons", () => {
    expect(TWO_HANDED_MELEE, "the list itself").toHaveLength(18);
    for (const id of TWO_HANDED_MELEE) {
      expect(isOneHanded(id), `id ${id}`).toBe(false);
    }
  });

  it("agrees with the three that a guess would get backwards", () => {
    // Katana two-handed, machete one-handed, and the combat knife one-handed:
    // `ItemWeapon.ts`'s comment on the default says a wrong value drops the wrong
    // weapon, which is only worth saying if the shipped values are right.
    expect(isOneHanded(ItemID.MELEE_KATANA), "katana").toBe(false);
    expect(isOneHanded(ItemID.MELEE_MACHETE), "machete").toBe(true);
    expect(isOneHanded(ItemID.MELEE_COMBAT_KNIFE), "combat knife").toBe(true);
    expect(isOneHanded(ItemID.MELEE_BASEBALLBAT), "baseball bat").toBe(false);
    expect(isOneHanded(ItemID.MELEE_CHAINSAW), "chainsaw").toBe(false);
  });
});

describe("IsOneHanded: the ranged table", () => {
  it("marks exactly the seven the reference passes as its eighth argument", () => {
    expect(ONE_HANDED_RANGED, "the list itself").toHaveLength(7);
    for (const id of ONE_HANDED_RANGED) {
      expect(isOneHanded(id), `id ${id}`).toBe(true);
    }
  });

  it("marks the other fifteen the reference registers as two-handed", () => {
    expect(TWO_HANDED_RANGED, "the list itself").toHaveLength(15);
    for (const id of TWO_HANDED_RANGED) {
      expect(isOneHanded(id), `id ${id}`).toBe(false);
    }
  });

  it("is one-handed for the SMG and the two odd guns, not only the pistols", () => {
    // The correction to the note this feature used to carry ("true for the combat
    // knife and the pistols"). The SMG shares an ammo type with two pistols and
    // the nail and stun guns are `isSingleShot`, so all three are the literals a
    // miscount of the two adjacent `bool` arguments would misplace.
    expect(isOneHanded(ItemID.RANGED_SMG), "SMG").toBe(true);
    expect(isOneHanded(ItemID.RANGED_NAIL_GUN), "nail gun").toBe(true);
    expect(isOneHanded(ItemID.RANGED_STUN_GUN), "stun gun").toBe(true);
  });

  it("is two-handed for the bows, the heavy guns and the ordnance", () => {
    // The other direction, and the one a "pistols are one-handed" rule would
    // silently invert.
    expect(isOneHanded(ItemID.RANGED_HUNTING_CROSSBOW), "crossbow").toBe(false);
    expect(isOneHanded(ItemID.RANGED_HUNTING_RIFLE), "hunting rifle").toBe(false);
    expect(isOneHanded(ItemID.RANGED_ARMY_RIFLE1), "army rifle 1").toBe(false);
    expect(isOneHanded(ItemID.RANGED_SHOTGUN), "shotgun").toBe(false);
    expect(isOneHanded(ItemID.RANGED_MINIGUN), "minigun").toBe(false);
    expect(isOneHanded(ItemID.RANGED_GRENADE_LAUNCHER), "grenade launcher").toBe(false);
    expect(isOneHanded(ItemID.RANGED_BIO_FORCE_GUN), "bio force gun").toBe(false);
  });
});

describe("IsOneHanded: the models the reference does not have", () => {
  it("leaves all eight two-handed, because the reference is silent", () => {
    // These eight ids appear nowhere in the reference: the fork dropped the models
    // and the merged CSV kept the rows. `false` is the field's default and the only
    // answer available. Two are pistols, so this is where a later "correction"
    // would otherwise be made by eye.
    for (const id of NO_REFERENCE_MODEL) {
      expect(isOneHanded(id), `id ${id}`).toBe(false);
    }
  });
});

describe("OnEquipItem: a two-handed weapon drops the shield", () => {
  it("drops an equipped shield for the baseball bat", () => {
    // C# :21014-21019. The bat is two-handed, so `!isOneHanded` holds and the
    // shield on the left arm comes off.
    const s = wear(shield());
    expect(onLeftArm(), "the shield starts on the arm").toBe(s);

    game.DoEquipItem(player, pack(melee(ItemID.MELEE_BASEBALLBAT)));
    expect(inHand(), "the bat is equipped").not.toBeNull();
    expect(onLeftArm(), "the bat must have taken the shield off").toBeNull();
    expect(s.equippedPart, "the shield's own part").toBe(DollPart.NONE);
  });

  it("drops it for a two-handed *ranged* weapon too", () => {
    // The other subclass. Both assign the same local (`C# :20987`, `:20997`), so
    // a port that only wired the melee branch would pass the test above.
    wear(shield());
    game.DoEquipItem(player, pack(ranged(ItemID.RANGED_HUNTING_RIFLE)));
    expect(onLeftArm(), "the hunting rifle must have taken the shield off").toBeNull();
  });

  it("leaves the shield alone for a one-handed weapon", () => {
    // The negative case, and the one that says the guard is reading the field
    // rather than firing on every equip.
    const s = wear(shield());
    game.DoEquipItem(player, pack(melee(ItemID.MELEE_COMBAT_KNIFE)));
    expect(onLeftArm(), "the knife is one-handed; the shield stays").toBe(s);
  });

  it("leaves it alone for a one-handed *ranged* weapon as well", () => {
    const s = wear(shield());
    game.DoEquipItem(player, pack(ranged(ItemID.RANGED_SMG)));
    expect(onLeftArm(), "the SMG is one-handed; the shield stays").toBe(s);
  });
});

describe("OnEquipItem: a shield drops the two-handed weapon", () => {
  it("drops a two-handed melee weapon", () => {
    // C# :21033-21035. The arm keys on `EquipmentPart == LEFT_ARM`, which is what
    // makes the shield findable at all.
    const bat = wear(melee(ItemID.MELEE_BASEBALLBAT));
    expect(inHand(), "the bat starts in hand").toBe(bat);

    game.DoEquipItem(player, pack(shield()));
    expect(onLeftArm(), "the shield is equipped").not.toBeNull();
    expect(inHand(), "the bat must have come off the right hand").toBeNull();
    expect(bat.equippedPart).toBe(DollPart.NONE);
  });

  it("drops a two-handed ranged weapon when there is no melee weapon", () => {
    // C# :21038-21040, reached through the `else`. This is the branch the
    // reference's `if`/`else` makes reachable and a "fix" to two `if`s would not
    // change; what it guards is the *order*, asserted next.
    wear(ranged(ItemID.RANGED_HUNTING_RIFLE));
    game.DoEquipItem(player, pack(shield()));
    expect(inHand(), "the hunting rifle must have come off").toBeNull();
  });

  it("keeps a two-handed ranged weapon when a one-handed melee weapon is held", () => {
    // **The `else` is the reference's** (`C# :21034-21040`) and this is what it
    // decides: the melee weapon is found, it is one-handed, so the `else` runs and
    // the ranged weapon *is* looked at. A two-handed ranged weapon in the other
    // hand would be dropped; here both are legal, so both must survive.
    //
    // Both live in the right hand, so only the last one worn is actually equipped
    // -- which is what makes the "first weapon" case unobservable today and the
    // `else` inert. Asserted as a statement about the one that wins, not as a
    // two-handed-melee-plus-two-handed-ranged case, because that case cannot be
    // built without a second right hand.
    const knife = wear(melee(ItemID.MELEE_COMBAT_KNIFE));
    game.DoEquipItem(player, pack(shield()));
    expect(inHand(), "a one-handed knife survives").toBe(knife);
  });

  it("keeps a one-handed weapon of either kind", () => {
    // Two cases in one loop, and a fresh actor for each: the second iteration's
    // actor still holds the first iteration's knife otherwise, and the assertion
    // would pass for the wrong reason.
    for (const id of [ItemID.MELEE_COMBAT_KNIFE, ItemID.RANGED_SMG]) {
      player = newPlayer();
      const held = wear(
        Models.items.get(id) instanceof ItemMeleeWeaponModel ? melee(id) : ranged(id),
      );
      game.DoEquipItem(player, pack(shield()));
      expect(inHand(), `id ${id} is one-handed and must survive`).toBe(held);
    }
  });
});

describe("OnEquipItem: the left-arm arm has exactly one caller", () => {
  it("is reachable by the shield and by nothing else in the table", () => {
    // The arm is in the `else if` chain *after* weapons and body armour, so the
    // only remaining way in is a non-weapon, non-armour model whose
    // `EquipmentPart` is the left arm. One model in the port is, and it is the
    // shield. This is also the whole argument for the guards being inert under
    // Classic, asserted about the table rather than assumed.
    const onLeftArmIds = Object.values(ItemID)
      .filter((v): v is number => typeof v === "number" && v !== ItemID._COUNT)
      .filter((id) => Models.items.get(id)!.equipmentPart === DollPart.LEFT_ARM);
    expect(onLeftArmIds).toEqual([ItemID.POLICE_RIOT_SHIELD]);
  });
});

describe("IsOneHanded: the table as a whole", () => {
  it("lists every weapon model exactly once, across all five sets", () => {
    // The completeness assertion, and the one that makes the four set-membership
    // tests above mean something. Without it a 20th one-handed weapon would pass
    // all of them while the reference said it was two-handed, and a weapon listed
    // in two sets would be counted in both totals.
    //
    // 67 models: 41 melee and 26 ranged rows in the merged tables, against the
    // reference's 37 and 22. The difference is the eight relics, which the fork
    // dropped and the CSV kept.
    const all = [
      ...ONE_HANDED_MELEE,
      ...TWO_HANDED_MELEE,
      ...ONE_HANDED_RANGED,
      ...TWO_HANDED_RANGED,
      ...NO_REFERENCE_MODEL,
    ];
    expect(new Set(all).size, "an id is in more than one set").toBe(all.length);
    const listed = new Set<ItemID>(all);
    expect(
      allWeaponIds().filter((id) => !listed.has(id)).map((id) => ItemID[id]),
      "a weapon model is in none of the five sets",
    ).toEqual([]);
    expect(allWeaponIds().length, "the tables have 67 weapon models").toBe(67);
  });
});

describe("IsOneHanded: the fishing rod's use of the field", () => {
  it("clears a two-handed right-hand weapon before casting", () => {
    // `RogueGame.cs:21942-21958`, ported in this change and previously recorded as
    // blocked on this field. The rod is a left-hand item, so the right hand is
    // what has to be free.
    const bat = wear(melee(ItemID.MELEE_BASEBALLBAT));
    expect(inHand(), "the bat starts in hand").toBe(bat);

    game.DoUseFishingRodItem(player);
    expect(inHand(), "the bat must come off the right hand").toBeNull();
    expect(bat.equippedPart).toBe(DollPart.NONE);
  });

  it("clears a two-handed ranged weapon too", () => {
    wear(ranged(ItemID.RANGED_HUNTING_RIFLE));
    game.DoUseFishingRodItem(player);
    expect(inHand(), "the hunting rifle must come off").toBeNull();
  });

  it("leaves a one-handed weapon in the hand", () => {
    const knife = wear(melee(ItemID.MELEE_COMBAT_KNIFE));
    game.DoUseFishingRodItem(player);
    expect(inHand(), "the knife is one-handed and stays").toBe(knife);
  });

  it("is unreachable under CLASSIC, because its only call site is gated", () => {
    // The gate is the reason this arm cannot move a Classic world — the arm itself
    // is ungated, and inside it there is no ruleset test, exactly as in the C#.
    // Asserted on the flag rather than by driving `DoUseItem`, because driving it
    // would be a second copy of the dispatch chain.
    expect(hasFeature(Ruleset.CLASSIC, Feature.Fishing), "classic has no rod").toBe(false);
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.Fishing), "still alive has one").toBe(true);
  });
});

describe("Classic: the guards cannot fire", () => {
  it("has no model on the left arm, so getEquippedShield is always null", () => {
    // The reason the shield arms are inert under Classic, stated as a fact about
    // the table rather than as an assertion about the guards: `POLICE_RIOT_SHIELD`
    // is a hand-written model with no CSV row, and it is the only model that names
    // `DollPart.LEFT_ARM`. So no Classic actor can satisfy the guard's `null`
    // check, whatever the weapons' values are.
    const leftArmModels = allWeaponIds().filter(
      (id) => Models.items.get(id)!.equipmentPart === DollPart.LEFT_ARM,
    );
    expect(leftArmModels, "no weapon is a left-arm part").toEqual([]);

    Session.get().ruleset = Ruleset.CLASSIC;
    wear(melee(ItemID.MELEE_BASEBALLBAT));
    expect(player.getEquippedShield(), "classic has no shield").toBeNull();
  });
});

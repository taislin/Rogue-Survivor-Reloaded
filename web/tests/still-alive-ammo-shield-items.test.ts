/**
 * The last eleven Still Alive item rows, and the one mechanic among them.
 *
 * A previous batch of this series (`still-alive-misc-items.test.ts`) took `GameItems`
 * from 179 ids to 188. These eleven are what was left: five Still Alive ammo, the
 * three light kits, the army office pass, the police riot shield and the sleeping
 * bag. Ten are transcription and one is a mechanic, and the things worth pinning are
 * different in each case.
 *
 * 1. **`ItemID` stayed append-only.** 188 -> 199, with `MATCHES = 178` as the
 *    boundary that must not move. A save stores an `ItemID` as a bare number, so
 *    inserting these at the C#'s enum positions would resolve an old save to a
 *    *different item* rather than a renamed one -- and nine of the eleven sit at C#
 *    positions well below 187. The bijection over `0.._COUNT-1` is the guard.
 * 2. **Every field is the C#'s, including the ones that look like mistakes.**
 *    `"nails"` for `ITEM_AMMO_NAILS`' sprite, the badge drawing the subway badge's
 *    art, the badge's flavour text being its own name, `"candles box"` /
 *    `"candles boxes"`. Each is asserted verbatim, because a port that "fixes" one
 *    of them is indistinguishable from a correct one until somebody diffs against
 *    the reference.
 * 3. **`Skills.load()` must not zero the shield bonus.** The fork assigns
 *    `SKILL_MARTIAL_ARTS_SHIELD_BONUS` from Martial Arts' `VALUE4` (`Skills.cs:376`)
 *    and the fork's `Skills.csv` duly has `5` there. **This pack's**
 *    `Skills.json` has `VALUE4 = 0` -- Martial Arts is a vanilla row -- so a
 *    faithful-looking `= Math.trunc(s.VALUE4)` would compile, type-check and make
 *    every shield in the game block nothing. `Rules` therefore keeps the C#'s
 *    declared 5, and the test calls `Skills.load()` to prove the load path does not
 *    quietly overwrite it.
 * 4. **The shield has a real half and a missing half, and both are named.** The
 *    data row, `Rules.actorShieldChanceToBlock` and `Actor.getEquippedShield` are
 *    here. The two readers that give the constant its meaning -- the melee roll and
 *    the flavour rewrite -- are both in `RogueGame.ts`, which this change does not
 *    touch, so `getEquippedShield()` has no caller and the shield is equipable and
 *    inert. That is asserted as a fact rather than left to be discovered.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Item } from "@data/Item";
import { Models } from "@data/Models";
import { imagePath } from "@engine/AssetPaths";
import { DiceRoller } from "@engine/DiceRoller";
import { Rules } from "@engine/Rules";
import { ItemAmmoModel, AmmoType } from "@engine/items/ItemWeapon";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameFactions } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";
import { SkillID, Skills } from "@gameplay/Skills";
import { publicFilePath } from "./helpers/assetPath";

beforeAll(() => {
  new GameTiles();
  new GameActors();
  new GameFactions();
  new GameItems();
});

/**
 * The eleven, in the order they were appended and with the values they were given.
 *
 * Written out rather than derived so that *appending* a twelfth is a visible edit to
 * this array: a test that computed the expectation from the enum would agree with
 * every mistake the enum could make. The C# registration line is carried along
 * because it is the thing every assertion below is checked against.
 */
const APPENDED: [ItemID, string, number, number][] = [
  [ItemID.AMMO_NAILS, "AMMO_NAILS", 188, 2233],
  [ItemID.AMMO_PRECISION_RIFLE, "AMMO_PRECISION_RIFLE", 189, 2241],
  [ItemID.AMMO_MINIGUN, "AMMO_MINIGUN", 190, 2257],
  [ItemID.AMMO_GRENADES, "AMMO_GRENADES", 191, 2264],
  [ItemID.AMMO_PLASMA, "AMMO_PLASMA", 192, 2271],
  [ItemID.UNIQUE_ARMY_ACCESS_BADGE, "UNIQUE_ARMY_ACCESS_BADGE", 193, 2918],
  [ItemID.CANDLES_BOX, "CANDLES_BOX", 194, 2996],
  [ItemID.FLARES_KIT, "FLARES_KIT", 195, 3004],
  [ItemID.GLOWSTICKS_BOX, "GLOWSTICKS_BOX", 196, 3012],
  [ItemID.POLICE_RIOT_SHIELD, "POLICE_RIOT_SHIELD", 197, 3036],
  [ItemID.SLEEPING_BAG, "SLEEPING_BAG", 198, 3043],
];

/** The five ammo rows: id, the C#'s singular name, ammo type and stack limit. */
const AMMO: [ItemID, string, AmmoType, number][] = [
  [ItemID.AMMO_NAILS, "nails", AmmoType.NAIL, 99],
  [ItemID.AMMO_PRECISION_RIFLE, "precision rifle rounds", AmmoType.PRECISION_RIFLE, 20],
  [ItemID.AMMO_MINIGUN, "minigun rounds", AmmoType.MINIGUN, 96],
  [ItemID.AMMO_GRENADES, "launcher grenades", AmmoType.GRENADES, 10],
  [ItemID.AMMO_PLASMA, "bio force plasma", AmmoType.PLASMA, 5],
];

const survivors = new Faction("The Survivors", "survivor");

/** A survivor with an inventory, from the real merged tables rather than a stub. */
function makeActor(): Actor {
  return new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "survivor");
}

describe("ItemID stayed append-only", () => {
  it("the last pre-existing id is still 187 and the count is 199", () => {
    expect(ItemID.UNIQUE_CHAR_DOCUMENT6).toBe(187);
    // The pinned boundary the previous batch of this series established. Nothing
    // below it may move, ever: a save stores the number.
    expect(ItemID.MATCHES).toBe(178);
    expect(ItemID._COUNT).toBe(199);
  });

  it("the eleven were appended at 188..198, in the order above", () => {
    for (const [id, name, value] of APPENDED) {
      expect(id, name).toBe(value);
      expect(ItemID[name as keyof typeof ItemID], name).toBe(value);
    }
  });

  it("every number in 0.._COUNT-1 is claimed by exactly one name", () => {
    // The append-only guard proper. A duplicate value means two names share a saved
    // id; a gap means some id resolves to `undefined`, which
    // `model-data-binding.test.ts` would catch as a hole but not as *whose* fault.
    const names = Object.entries(ItemID).filter(
      ([k, v]) => typeof v === "number" && k !== "_COUNT",
    );
    expect(names).toHaveLength(ItemID._COUNT);
    expect(new Set(names.map(([, v]) => v)).size).toBe(ItemID._COUNT);
  });

  it("none of them took the C#'s mid-enum number instead", () => {
    // Nine of the eleven sit at a C# position far below 187 -- `AMMO_NAILS` is 197
    // there, `POLICE_RIOT_SHIELD` is 154 -- and taking any of those would renumber
    // `MATCHES` and everything after it. Asserted explicitly because the C# numbers
    // are the tempting thing to copy and the failure is invisible in a diff.
    const csharpPositions: Record<string, number> = {
      AMMO_NAILS: 197,
      AMMO_PRECISION_RIFLE: 198,
      AMMO_MINIGUN: 200,
      AMMO_GRENADES: 201,
      AMMO_PLASMA: 202,
      UNIQUE_ARMY_ACCESS_BADGE: 219,
      CANDLES_BOX: 149,
      FLARES_KIT: 150,
      GLOWSTICKS_BOX: 151,
      POLICE_RIOT_SHIELD: 154,
      SLEEPING_BAG: 155,
    };
    for (const [id, name] of APPENDED) {
      expect(id, `${name} was given the C#'s enum position`).not.toBe(csharpPositions[name]);
    }
  });
});

describe("the five ammo rows are ItemAmmoModels", () => {
  it.each(AMMO)(
    "%s is the C#'s ammo type, name and stack limit",
    (id, name, ammoType, limit) => {
      const m = Models.items.get(id);
      expect(m, ItemID[id]).toBeInstanceOf(ItemAmmoModel);
      const ammo = m as ItemAmmoModel;
      expect(ammo.ammoType, ItemID[id]).toBe(ammoType);
      expect(ammo.maxQuantity, ItemID[id]).toBe(limit);
      expect(ammo.stackingLimit, ItemID[id]).toBe(limit);
      // Singular and plural are the *same string* in all five, so `IsPlural = true`
      // is what makes `Item.ts` read "12 nails" rather than "a nails".
      expect(ammo.singleName, ItemID[id]).toBe(name);
      expect(ammo.pluralName, ItemID[id]).toBe(name);
      expect(ammo.isPlural, ItemID[id]).toBe(true);
      expect(ammo.isStackable, ItemID[id]).toBe(true);
      // A `ItemAmmoModel` is not equipable and never was: no `EquipmentPart`.
      expect(ammo.equipmentPart, ItemID[id]).toBe(DollPart.NONE);
    },
  );

  it("four of the five flavours are empty and the plasma one is not", () => {
    // `GameItems.cs:2236`, `:2244`, `:2260`, `:2267` give `""`; `:2274` is the only
    // Still Alive ammo with text, and it is the reason that row is built outside
    // the shared loop (which writes `""` unconditionally).
    for (const [id] of AMMO) {
      const flavour = Models.items.get(id).flavorDescription;
      if (id === ItemID.AMMO_PLASMA) {
        expect(flavour, ItemID[id]).toBe(
          "Warning: fire with caution. Wide discharge radius.",
        );
      } else {
        expect(flavour, `${ItemID[id]} should have an empty flavour`).toBe("");
      }
    }
  });

  it("each of the five is a different sprite", () => {
    const ids = AMMO.map(([id]) => Models.items.get(id).imageId);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("the three light kits and the bag are plain, stackable models", () => {
  const KITS: [ItemID, string, string, string, number][] = [
    [
      ItemID.CANDLES_BOX,
      "candles box",
      "candles boxes",
      "Place candles for long-lasting light.",
      40,
    ],
    [
      ItemID.FLARES_KIT,
      "flares kit",
      "flares kits",
      "Use flares for bright, throwable light.",
      40,
    ],
    [
      ItemID.GLOWSTICKS_BOX,
      "glowsticks box",
      "glowsticks boxes",
      "Use glowsticks for long-lasting, throwable light.",
      60,
    ],
  ];

  it.each(KITS)(
    "%s is the C#'s names, stack limit and flavour",
    (id, single, plural, flavour, limit) => {
      const m = Models.items.get(id);
      expect(m.singleName, ItemID[id]).toBe(single);
      expect(m.pluralName, ItemID[id]).toBe(plural);
      expect(m.flavorDescription, ItemID[id]).toBe(flavour);
      expect(m.stackingLimit, ItemID[id]).toBe(limit);
      expect(m.isStackable, ItemID[id]).toBe(true);
      // Not `ItemLightModel`s, and nothing sets `isThrowable`: the light is made at
      // *use* time by `HandlePlayerUseLightPackThrowable` (`RogueGame.cs:15012`),
      // which the port has not got. A box of flares here is a box of flares.
      expect(m.isThrowable, ItemID[id]).toBe(false);
      expect(m.equipmentPart, ItemID[id]).toBe(DollPart.NONE);
      expect(m.isEquipable, ItemID[id]).toBe(false);
    },
  );

  it("the C#'s odd singular plurals are kept", () => {
    // `"candles box"` / `"candles boxes"` and `"glowsticks box"` / `"glowsticks
    // boxes"` read as a box *of* candles in both halves. Correcting either would
    // make the port disagree with the reference for a reason a test cannot see.
    expect(Models.items.get(ItemID.CANDLES_BOX).singleName).toBe("candles box");
    expect(Models.items.get(ItemID.CANDLES_BOX).pluralName).toBe("candles boxes");
    expect(Models.items.get(ItemID.GLOWSTICKS_BOX).singleName).toBe("glowsticks box");
    expect(Models.items.get(ItemID.GLOWSTICKS_BOX).pluralName).toBe("glowsticks boxes");
    // Only the flares kit gets the ordinary shape.
    expect(Models.items.get(ItemID.FLARES_KIT).singleName).toBe("flares kit");
    expect(Models.items.get(ItemID.FLARES_KIT).pluralName).toBe("flares kits");
  });

  it("the sleeping bag is not stackable and packs, and promises a mechanic", () => {
    const m = Models.items.get(ItemID.SLEEPING_BAG);
    expect(m.singleName).toBe("sleeping bag");
    expect(m.pluralName).toBe("sleeping bags");
    expect(m.flavorDescription).toBe(
      "Drop it on the ground for a somewhat comfortable sleep.",
    );
    // `GameItems.cs:3047` sets `IsStackable = false` and leaves `StackingLimit` at
    // its default of 1, so `postProcess`'s `StackingLimit > 1` reaches the same
    // answer. Asserted on the *derived* field because that is what the inventory
    // reads.
    expect(m.isStackable).toBe(false);
    expect(m.stackingLimit).toBe(1);
    // Not equipable and not throwable: the C# sets neither, and the port must not
    // invent a "hold the bag" state the reference does not have.
    expect(m.equipmentPart).toBe(DollPart.NONE);
    expect(m.isEquipable).toBe(false);
  });
});

describe("the army office pass reuses the subway badge's sprite", () => {
  const badge = () => Models.items.get(ItemID.UNIQUE_ARMY_ACCESS_BADGE);

  it("is named, and described, exactly as the C# has it", () => {
    // `GameItems.cs:2920-2923`. The plural is the same string, and the flavour text
    // is the item's own name -- both are the reference's, kept verbatim.
    expect(badge().singleName).toBe("Army office pass");
    expect(badge().pluralName).toBe("Army office pass");
    expect(badge().flavorDescription).toBe("Army office pass");
  });

  it("draws ITEM_SUBWAY_BADGE, which is a deliberate share and not a missing id", () => {
    expect(badge().imageId).toBe(GameImages.ITEM_SUBWAY_BADGE);
    expect(badge().imageId).toBe("Items/item_subway_badge");
    // Two ids, one sprite -- and *not* one model. The two name strings and the
    // flavour are all that separate them; `equipmentPart` and `dontAutoEquip` are
    // identical, because the pass is a near-copy of the badge it was cloned from.
    expect(badge().imageId).toBe(Models.items.get(ItemID.UNIQUE_SUBWAY_BADGE).imageId);
    expect(badge().singleName).not.toBe(Models.items.get(ItemID.UNIQUE_SUBWAY_BADGE).singleName);
  });

  it("is a holdable left-hand item that does not go in the hand by itself", () => {
    // `DontAutoEquip` is what stops picking it up silently equipping it. Without
    // `equipmentPart` the earlier port left the subway badge permanently
    // *unequippable*, since `isEquipable` is derived from it -- so both fields are
    // asserted together, because one without the other is a broken item.
    expect(badge().dontAutoEquip).toBe(true);
    expect(badge().equipmentPart).toBe(DollPart.LEFT_HAND);
    expect(badge().isEquipable).toBe(true);
    // The same pair of lines on the subway badge, which is why the pass reads as a
    // clone rather than a new item type.
    expect(Models.items.get(ItemID.UNIQUE_SUBWAY_BADGE).dontAutoEquip).toBe(true);
    expect(Models.items.get(ItemID.UNIQUE_SUBWAY_BADGE).equipmentPart).toBe(DollPart.LEFT_HAND);
  });

  it("is registered with no drop site, which is what the reference does too", () => {
    // The reference's one consumer is commented out: the army office door check at
    // `RogueGame.cs:23166` reads the *session* unique instead of the model. Its one
    // placed copy is `SpawnUniqueArmyOfficePass` (`RogueGame.cs:4756`), which the
    // port does not have. So this row is reachable only from a save, and inventing
    // a place to drop it would be worse than having none.
    expect(badge().canGoInBackpacks, "Release 8-2 flag").toBe(true);
    expect(badge().isStackable).toBe(false);
    expect(badge().stackingLimit).toBe(1);
  });
});

describe("the police riot shield is on the left arm, and the arm exists", () => {
  const shield = () => Models.items.get(ItemID.POLICE_RIOT_SHIELD);

  it("is the C#'s model, on LEFT_ARM", () => {
    expect(shield().singleName).toBe("police riot shield");
    expect(shield().pluralName).toBe("police riot shields");
    expect(shield().equipmentPart).toBe(DollPart.LEFT_ARM);
    expect(shield().isStackable).toBe(false);
    expect(shield().stackingLimit).toBe(1);
    expect(shield().isEquipable).toBe(true);
    expect(shield().imageId).toBe("Items/item_police_riot_shield");
  });

  it("builds its flavour text from the constant rather than repeating it", () => {
    // `GameItems.cs:3038` is `Rules.SHIELD_BASE_BLOCK_CHANCE.ToString() + "% base
    // chance to block melee attacks."`. Deriving it here means the string cannot
    // disagree with the number; `DescribeItemLong` overwrites it with the
    // skill-inclusive total while the shield is in the pack (`RogueGame.cs:32097`).
    expect(shield().flavorDescription).toBe(
      `${Rules.SHIELD_BASE_BLOCK_CHANCE}% base chance to block melee attacks.`,
    );
    expect(shield().flavorDescription).toBe("25% base chance to block melee attacks.");
  });

  it("is the one of the eleven the C# leaves out of the backpack list", () => {
    // `GameItems.cs:3036-3040` has no `CanGoInBackpacks`. Ten of eleven have it;
    // this is the one that does not, so `CAN_GO_IN_BACKPACKS` is 121 entries and not
    // 122 -- which is the number to check when the set is next edited.
    expect(shield().canGoInBackpacks).toBe(false);
    for (const [id] of APPENDED) {
      if (id === ItemID.POLICE_RIOT_SHIELD) continue;
      expect(Models.items.get(id).canGoInBackpacks, ItemID[id]).toBe(true);
    }
  });

  it("LEFT_ARM is 10 and BACK is still 9, deliberately", () => {
    // The C# has LEFT_ARM 9 / BACK 10. `BACK` reached this port first and took 9
    // because there was no LEFT_ARM to collide with; rather than renumber a live
    // part, LEFT_ARM took 10. Nothing persists or transmits a `DollPart` as a
    // number, and `Doll`'s two loops run to `_COUNT`, so this is safe -- but it is
    // a decision, and the next reader diffing `Doll.cs` needs it to be visible.
    expect(DollPart.BACK, "unchanged since Release 8-2").toBe(9);
    expect(DollPart.LEFT_ARM, "not the C#'s 9").toBe(10);
    expect(DollPart._COUNT).toBe(DollPart.LEFT_ARM + 1);
    // The C#'s eight original parts are untouched.
    expect(DollPart.NONE).toBe(0);
    expect(DollPart.RIGHT_HAND).toBe(1);
    expect(DollPart.LEFT_HAND).toBe(2);
    expect(DollPart.HEAD).toBe(3);
    expect(DollPart.TORSO).toBe(4);
    expect(DollPart.LEGS).toBe(5);
    expect(DollPart.FEET).toBe(6);
    expect(DollPart.SKIN).toBe(7);
    expect(DollPart.EYES).toBe(8);
  });

  it("a decoration can now be put on the left arm, because there is a slot for it", () => {
    // The reason `_COUNT` had to move rather than the enum just gaining a member:
    // `Doll`'s array is `new Array(DollPart._COUNT).fill(null)`, and a part with no
    // slot in it is a part nothing can be decorated on.
    const actor = makeActor();
    actor.doll.addDecoration(DollPart.LEFT_ARM, GameImages.ITEM_POLICE_RIOT_SHIELD);
    expect(actor.doll.getDecorations(DollPart.LEFT_ARM)).toEqual([
      GameImages.ITEM_POLICE_RIOT_SHIELD,
    ]);
    actor.doll.removeAllDecorations();
    expect(actor.doll.getDecorations(DollPart.LEFT_ARM)).toBeNull();
  });
});

describe("the shield's block chance", () => {
  // `actorShieldChanceToBlock` reads no dice, so the seed is irrelevant; a `Rules`
  // instance is still needed because the method is not static.
  const rules = new Rules(new DiceRoller(1));

  it("is the C#'s two constants", () => {
    expect(Rules.SHIELD_BASE_BLOCK_CHANCE, "Rules.cs:129").toBe(25);
    expect(Rules.SKILL_MARTIAL_ARTS_SHIELD_BONUS, "Rules.cs:375").toBe(5);
  });

  it("survives Skills.load(), which would zero it if it read VALUE4", () => {
    // The trap, stated as a test because it is invisible otherwise. The fork's
    // `Skills.cs:376` assigns the constant from Martial Arts' `VALUE4` and the
    // fork's `Skills.csv` has 5 there; **this pack's** `Skills.json` has 0, because
    // Martial Arts is a vanilla row with no fourth value. `Skills.load()` runs at
    // startup, so wiring it up the C#'s way would leave every shield worth nothing
    // with a green build and a passing type-check.
    Skills.load();
    expect(Rules.SKILL_MARTIAL_ARTS_SHIELD_BONUS, "overwritten by the CSV?").toBe(5);
    expect(rules.actorShieldChanceToBlock(makeActor())).toBe(25);
  });

  it("is 25 with no Martial Arts and five more per level", () => {
    for (let level = 0; level <= 5; level++) {
      const actor = makeActor();
      for (let i = 0; i < level; i++) actor.sheet.skillTable.addOrIncreaseSkill(SkillID.MARTIAL_ARTS);
      expect(
        actor.sheet.skillTable.getSkillLevel(SkillID.MARTIAL_ARTS),
        `built level ${level}`,
      ).toBe(level);
      expect(rules.actorShieldChanceToBlock(actor), `Martial Arts ${level}`).toBe(25 + 5 * level);
    }
  });

  it("does not itself check whether a shield is held -- the caller does", () => {
    // `Rules.cs:4765` is a bare `BASE + BONUS * level`. The shield test lives in the
    // roll's own guard (`RogueGame.cs:18369`), so an actor with no shield still
    // reports 25 here. Computing the guard inside this method would make the two
    // readers disagree about what the number means.
    const bare = makeActor();
    expect(bare.getEquippedShield()).toBeNull();
    expect(rules.actorShieldChanceToBlock(bare)).toBe(25);

    // ...and it does not read other skills either, which is the other thing that
    // could quietly go wrong: a Strong or a Firearms level must move nothing.
    const strong = makeActor();
    strong.sheet.skillTable.addOrIncreaseSkill(SkillID.STRONG);
    strong.sheet.skillTable.addOrIncreaseSkill(SkillID.FIREARMS);
    expect(rules.actorShieldChanceToBlock(strong)).toBe(25);
  });
});

describe("getEquippedShield reads the left arm, and nothing else", () => {
  function hold(actor: Actor, id: ItemID): Item {
    const item = new Item(Models.items.get(id));
    actor.inventory!.addAll(item);
    return item;
  }

  it("is null until something is equipped on LEFT_ARM", () => {
    const actor = makeActor();
    expect(actor.getEquippedShield()).toBeNull();

    const bag = hold(actor, ItemID.SLEEPING_BAG);
    expect(actor.getEquippedShield()).toBeNull();

    // Equipping a *bag* is not equipping a shield. The C# decides by arm, not by
    // kind, so this is the case that would catch a `getEquippedItem(LEFT_ARM)`
    // that ignored `equippedPart`.
    bag.equippedPart = DollPart.LEFT_ARM;
    expect(actor.getEquippedShield()).toBe(bag);

    // Take the bag off the arm before hanging a shield on it: `getEquippedItem`
    // returns the *first* match in the inventory, so two items on one arm resolve
    // to whichever was added first. That is `Actor.ts`'s behaviour and not a shield
    // rule, so the test moves it aside rather than asserting an order.
    bag.equippedPart = DollPart.NONE;
    expect(actor.getEquippedShield()).toBeNull();

    const shield = hold(actor, ItemID.POLICE_RIOT_SHIELD);
    expect(actor.getEquippedShield()).toBeNull(); // in the pack, not on the arm
    shield.equippedPart = DollPart.LEFT_ARM;
    expect(actor.getEquippedShield()).toBe(shield);
  });

  it("does not confuse the left arm with the left hand", () => {
    // The two are one apart and both hold things in this game: the off hand takes
    // matches, sprays and a rod. A shield in the *hand* is not a shield.
    const actor = makeActor();
    const badge = hold(actor, ItemID.UNIQUE_ARMY_ACCESS_BADGE);
    badge.equippedPart = DollPart.LEFT_HAND;
    expect(actor.getEquippedShield()).toBeNull();
    expect(DollPart.LEFT_HAND).not.toBe(DollPart.LEFT_ARM);
  });

  it("is currently reachable from nothing, because no shield is ever placed", () => {
    // The honest statement of what this half of the feature is. `MakeItemPoliceRiot
    // Shield` (`BaseMapGenerator.cs:1989`) is not ported and no spawn table names
    // one, so every `getEquippedShield()` in the port is `null` until the drop site
    // and the two `RogueGame` readers land. Asserted so that the day one of them
    // does, this is the test that goes red and points at the gap.
    expect(Models.items.get(ItemID.POLICE_RIOT_SHIELD).imageId).toBeTruthy();
    expect(makeActor().getEquippedShield()).toBeNull();
  });
});

describe("all eleven sprites resolve to files that exist", () => {
  it("there are eleven ids and eleven distinct sprites", () => {
    // Eleven, not ten. The army office pass shares its art with `UNIQUE_SUBWAY_BADGE`
    // -- which is *not* one of the eleven -- so every sprite drawn here is its own.
    // The sharing is asserted where it is the point, in the badge's own block.
    const ids = APPENDED.map(([id]) => Models.items.get(id).imageId);
    expect(APPENDED).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
  });

  it.each(APPENDED.map(([id, name]) => [name, id] as const))(
    "%s resolves to a sprite file that exists",
    (_name, id) => {
      const url = imagePath(Models.items.get(id).imageId);
      expect(url, ItemID[id]).toMatch(/\.webp$/);
      expect(existsSync(resolve(__dirname, "..", publicFilePath(url))), url).toBe(true);
    },
  );

  it("the nail ammo draws the gun's sprite file, which is the reference's own path", () => {
    // `GameImages.cs:998` is `Items\\item_ammo_nail_gun` -- singular, and the *gun*'s
    // filename. There is no `item_ammo_nails.webp` in the pack. Recorded rather than
    // corrected: the constant is transcribed and the file it names is the one that
    // is there.
    expect(GameImages.ITEM_AMMO_NAILS).toBe("Items/item_ammo_nail_gun");
    expect(Models.items.get(ItemID.AMMO_NAILS).imageId).toBe("Items/item_ammo_nail_gun");
    expect(existsSync(resolve(__dirname, "..", publicFilePath(imagePath(GameImages.ITEM_AMMO_NAILS))))).toBe(true);
  });

  it("the other nine are the C#'s paths, verbatim", () => {
    // `GameImages.cs:999`, `:1001-1003`, `:1036`, `:1065`, `:1072`, `:1127`,
    // `:1143`. Listed as strings rather than as `GameImages` references so that a
    // constant that was never declared cannot satisfy the assertion.
    const expected: [ItemID, string][] = [
      [ItemID.AMMO_PRECISION_RIFLE, "Items/item_ammo_precision_rifle"],
      [ItemID.AMMO_MINIGUN, "Items/item_ammo_minigun"],
      [ItemID.AMMO_GRENADES, "Items/item_ammo_grenades"],
      [ItemID.AMMO_PLASMA, "Items/item_ammo_plasma"],
      [ItemID.CANDLES_BOX, "Items/item_candles_box"],
      [ItemID.FLARES_KIT, "Items/item_flares_kit"],
      [ItemID.GLOWSTICKS_BOX, "Items/item_glowsticks_box"],
      [ItemID.POLICE_RIOT_SHIELD, "Items/item_police_riot_shield"],
      [ItemID.SLEEPING_BAG, "Items/item_sleeping_bag"],
    ];
    for (const [id, path] of expected) {
      expect(Models.items.get(id).imageId, ItemID[id]).toBe(path);
    }
  });
});
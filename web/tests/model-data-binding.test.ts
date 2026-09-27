import { describe, it, expect, beforeAll } from "vitest";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import actorsData from "@gameplay/data/Actors.json";
import { ItemMeleeWeaponModel, ItemRangedWeaponModel } from "@engine/items/ItemWeapon";
import { ItemLightModel } from "@engine/items/ItemLight";

/**
 * Each model must be bound to its own CSV row.
 *
 * The bug: `GameActors` read `dataArr[i]` and stored it at `ActorID[i]`,
 * assuming row *n* is model *n*. That holds for `Actors.csv` rows 0-17 and
 * then breaks, because the CSV lists `FERAL_DOG` **last** (row 26) while the
 * enum has it at 18. **9 of 27 actors were reading someone else's entire stat
 * block.**
 *
 * Consequences, all silent — no error, no type error, and the per-model
 * abilities/sprite/controller tables are keyed by ID and were correct, so the
 * result still looked plausible:
 *   - the Sewers Thing, a unique boss, spawned with 30 HP instead of 400
 *   - Jason Myers had the feral dog's 15 HP
 *   - BlackOps soldiers had the boss's 400 HP and STA 99
 *   - every name and score value from CHAR guard onward was off by one, so
 *     killing a cop scored 60 and killing a biker scored 0
 *
 * The C# never had this problem: it makes 27 explicit
 * `GetDataFromCSVTable(ui, table, IDs.X)` calls (GameActors.cs:1017-1056), each
 * resolving its row through `FindLineForModel`, which matches the ID *string*.
 *
 * Row 0 is labelled `_FIRST` rather than `UNDEAD_SKELETON`, so a strict by-ID
 * lookup needs that alias — and the C# would throw "actor UNDEAD_SKELETON not
 * found" on this file. Second instance of the same upstream data defect, after
 * `Skills.csv`'s `_FIRST_LIVING`.
 */

const rows = actorsData as any[];

/** Enum member name -> its numeric ID, excluding TS's reverse-mapped keys. */
const ID_BY_NAME: Record<string, ActorID> = {};
for (const [k, v] of Object.entries(ActorID)) {
  if (typeof v === "number" && k !== "_COUNT") ID_BY_NAME[k] = v as ActorID;
}

let actors: GameActors;
let items: GameItems;

beforeAll(() => {
  actors = new GameActors();
  items = new GameItems();
});

describe("actor models bind to their own CSV row", () => {
  it("Actors.csv is NOT in ActorID order -- the reason this bug existed", () => {
    // Guards the premise. If a future CSV edit puts these in enum order this
    // test starts failing, which is the signal to simplify the lookup.
    const order = rows.map((r) => (r.ID === "_FIRST" ? "UNDEAD_SKELETON" : r.ID));
    const enumOrder = Object.keys(ID_BY_NAME).sort((a, b) => ID_BY_NAME[a] - ID_BY_NAME[b]);
    expect(order).not.toEqual(enumOrder);
  });

  it.each(Object.keys(ID_BY_NAME))("%s reads its own row", (name) => {
    const id = ID_BY_NAME[name];
    const row = rows.find((r) => (r.ID === "_FIRST" ? "UNDEAD_SKELETON" : r.ID) === name);
    expect(row, `Actors.csv has no row for ${name}`).toBeDefined();

    const model = actors.get(id);
    const sheet = model.startingSheet;
    expect(sheet.baseHitPoints, `${name} HP`).toBe(row.HP);
    expect(sheet.baseStaminaPoints, `${name} STA`).toBe(row.STA);
    expect(sheet.baseDefence.value, `${name} DEF`).toBe(row.DEF);
    expect(sheet.baseViewRange, `${name} FOV`).toBe(row.FOV);
    expect(sheet.baseAudioRange, `${name} AUDIO`).toBe(row.AUDIO ?? 0);
    // ActorSheet normalises smell by /100 in both C# and the port
    // (ActorSheet.cs:56, ActorSheet.ts:48), so compare against the scaled form.
    expect(sheet.baseSmellRating, `${name} SMELL`).toBe((row.SMELL ?? 0) / 100);
    expect(sheet.unarmedAttack.damageValue, `${name} DMG`).toBe(row.DMG);
    expect(model.scoreValue, `${name} SCORE`).toBe(row.SCORE ?? 0);
  });

  it("the three stats that were visibly wrong", () => {
    // Sewers Thing 400 HP, Jason Myers 30, feral dog 15. These are the numbers
    // a player would notice: a boss that dies in one hit.
    expect(actors.get(ActorID.SEWERS_THING).startingSheet.baseHitPoints).toBe(400);
    expect(actors.get(ActorID.JASON_MYERS).startingSheet.baseHitPoints).toBe(30);
    expect(actors.get(ActorID.FERAL_DOG).startingSheet.baseHitPoints).toBe(15);
  });

  it("score values follow the model, not the CSV row", () => {
    // Cop 0, biker 50, gangsta 60, CHAR guard 100, sewers thing 300.
    expect(actors.get(ActorID.POLICEMAN).scoreValue).toBe(0);
    expect(actors.get(ActorID.BIKER_MAN).scoreValue).toBe(50);
    expect(actors.get(ActorID.GANGSTA_MAN).scoreValue).toBe(60);
    expect(actors.get(ActorID.CHAR_GUARD).scoreValue).toBe(100);
    expect(actors.get(ActorID.SEWERS_THING).scoreValue).toBe(300);
  });

  it("the feral dog's unarmed verb is bite, every other living actor's is punch", () => {
    expect(actors.get(ActorID.FERAL_DOG).startingSheet.unarmedAttack.verb.youForm).toBe("bite");
    expect(actors.get(ActorID.MALE_CIVILIAN).startingSheet.unarmedAttack.verb.youForm).toBe("punch");
    expect(actors.get(ActorID.FEMALE_CIVILIAN).startingSheet.unarmedAttack.verb.youForm).toBe("punch");
  });

  it("only the female civilian has a female doll body", () => {
    // C# passes DollBody(false, …) once, for FEMALE_CIVILIAN.
    expect(actors.get(ActorID.FEMALE_CIVILIAN).dollBody.isMale).toBe(false);
    for (const id of [ActorID.UNDEAD_FEMALE_ZOMBIFIED, ActorID.UNDEAD_FEMALE_NEOPHYTE, ActorID.UNDEAD_FEMALE_DISCIPLE]) {
      expect(actors.get(id).dollBody.isMale, `${ActorID[id]}`).toBe(true);
    }
  });
});

describe("unique weapons keep the C# per-model flags", () => {
  const UNIQUES: ItemID[] = [
    ItemID.UNIQUE_JASON_MYERS_AXE,
    ItemID.UNIQUE_FAMU_FATARU_KATANA,
    ItemID.UNIQUE_BIGBEAR_BAT,
    ItemID.UNIQUE_ROGUEDJACK_KEYBOARD,
    ItemID.UNIQUE_SANTAMAN_SHOTGUN,
    ItemID.UNIQUE_HANS_VON_HANZ_PISTOL,
  ];

  it.each(UNIQUES)("%s is unbreakable", (id) => {
    // Without IsUnbreakable these roll MELEE_WEAPON_BREAK_CHANCE on every
    // landed hit and are lost forever -- the reward for four unique NPCs.
    const m = items.get(id) as ItemMeleeWeaponModel | ItemRangedWeaponModel;
    expect(m.isUnbreakable, `${ItemID[id]}`).toBe(true);
    expect(m.isProper, `${ItemID[id]}`).toBe(true);
  });

  it("ordinary weapons are still breakable", () => {
    expect((items.get(ItemID.MELEE_CROWBAR) as ItemMeleeWeaponModel).isUnbreakable).toBe(false);
    expect((items.get(ItemID.RANGED_PISTOL) as ItemRangedWeaponModel).isUnbreakable).toBe(false);
  });
});

describe("lights and the subway badge keep their C# flags", () => {
  it("lights do not auto-equip", () => {
    // C# ItemLightModel ctor sets DontAutoEquip = true. Without it, picking up
    // a flashlight swaps out whatever was in your left hand.
    for (const id of [ItemID.LIGHT_FLASHLIGHT, ItemID.LIGHT_BIG_FLASHLIGHT]) {
      expect((items.get(id) as ItemLightModel).dontAutoEquip, `${ItemID[id]}`).toBe(true);
    }
  });

  it("the subway badge is a holdable left-hand item that does not auto-equip", () => {
    const badge = items.get(ItemID.UNIQUE_SUBWAY_BADGE);
    expect(badge.isEquipable).toBe(true);
    expect(badge.dontAutoEquip).toBe(true);
    expect(badge.singleName).toBe("Subway Worker Badge");
  });
});

describe("medicine binds by ID, not by row position", () => {
  it("each medicine has the right image and IsPlural", () => {
    // The medikit is the only one that is not plural (GameItems.cs:703-743).
    expect(items.get(ItemID.MEDICINE_MEDIKIT).isPlural).toBe(false);
    expect(items.get(ItemID.MEDICINE_BANDAGES).isPlural).toBe(true);
    expect(items.get(ItemID.MEDICINE_PILLS_ANTIVIRAL).isPlural).toBe(true);
  });

  it("image ids are distinct across the six medicines", () => {
    const ids = [
      ItemID.MEDICINE_BANDAGES, ItemID.MEDICINE_MEDIKIT, ItemID.MEDICINE_PILLS_STA,
      ItemID.MEDICINE_PILLS_SLP, ItemID.MEDICINE_PILLS_SAN, ItemID.MEDICINE_PILLS_ANTIVIRAL,
    ].map((id) => items.get(id).imageId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { GameActors, ActorID } from "@gameplay/GameActors";
import type { Abilities } from "@data/Abilities";

/**
 * Per-actor abilities must match the C# model-for-model.
 *
 * The bug: `GameActors` inferred abilities from `isLiving` / `isUndead` in one
 * blanket loop, setting 9 of the 23 flags. `Abilities` defaults every flag to
 * `false`, so everything unlisted was **off** — including eight the C# grants
 * the player:
 *
 *   canUseMapObjects, canBashDoors, canBreakObjects, canJump,
 *   canBarricade, canPush, isIntelligent, aiCanUseAIExits
 *
 * The reported symptom was doors. `Rules.isBumpableFor` tries move → fight →
 * open → bash → container → break and returns the *last* failure reason, so
 * with opening and bashing both disabled it fell through to breaking and told
 * the player "cannot break objects" while they stood at an ordinary door.
 *
 * It was wrong in the other direction too: the old loop gave skeletons and the
 * rat zombie `canBashDoors` / `canBreakObjects` / `isRotting` /
 * `canZombifyKilled`, none of which the C# grants them, and never set
 * `isUndeadMaster` on the zombie master, lord or prince despite `Rules` and the
 * AI testing it. `isRotting` drives the rot meter, so skeletons were rotting on
 * a sheet the C# gives NO_FOOD.
 *
 * The expected sets below are transcribed from the `new Abilities() { … }`
 * block of each model in `src/Gameplay/GameActors.cs` (`#region Init`).
 * `canDisarm` is excluded: the C# `Abilities` constructor sets it, and so does
 * the port's.
 */

/** Every Abilities key except the constructor-defaulted `canDisarm`. */
const GRANTED_KEYS: Array<keyof Abilities> = [
  "isUndead", "isUndeadMaster", "canZombifyKilled", "canTire", "hasToEat",
  "hasToSleep", "hasSanity", "canRun", "canTalk", "canUseMapObjects",
  "canBashDoors", "canBreakObjects", "canJump", "isSmall", "hasInventory",
  "canUseItems", "canTrade", "canBarricade", "canPush", "canJumpStumble",
  "isLawEnforcer", "isIntelligent", "isRotting", "aiCanUseAIExits",
  "aiNotInterestedInRangedWeapons", "zombieAIExplore",
];

function granted(a: Abilities): string[] {
  return GRANTED_KEYS.filter((k) => a[k] === true).sort();
}

const SKELETON = ["aiCanUseAIExits", "isUndead"];
const ROTTING = [
  "aiCanUseAIExits", "canBashDoors", "canBreakObjects", "canZombifyKilled",
  "isRotting", "isUndead", "zombieAIExplore",
];
const ROTTING_PUSH = [...ROTTING, "canPush"].sort();
const MASTER = [
  "aiCanUseAIExits", "canBashDoors", "canBreakObjects", "canJump",
  "canJumpStumble", "canPush", "canUseMapObjects", "canZombifyKilled",
  "isRotting", "isUndead", "isUndeadMaster", "zombieAIExplore",
].sort();
const CIVILIAN = [
  "aiCanUseAIExits", "canBashDoors", "canBarricade", "canBreakObjects",
  "canJump", "canPush", "canRun", "canTalk", "canTire", "canTrade",
  "canUseItems", "canUseMapObjects", "hasInventory", "hasSanity", "hasToEat",
  "hasToSleep", "isIntelligent",
].sort();

/** ActorID -> the exact set the C# grants it. */
const EXPECTED: Array<[string, ActorID, string[]]> = [
  ["UNDEAD_SKELETON", ActorID.UNDEAD_SKELETON, SKELETON],
  ["UNDEAD_RED_EYED_SKELETON", ActorID.UNDEAD_RED_EYED_SKELETON, SKELETON],
  ["UNDEAD_RED_SKELETON", ActorID.UNDEAD_RED_SKELETON, SKELETON],

  ["UNDEAD_ZOMBIE", ActorID.UNDEAD_ZOMBIE, ROTTING],
  ["UNDEAD_DARK_EYED_ZOMBIE", ActorID.UNDEAD_DARK_EYED_ZOMBIE, ROTTING],
  ["UNDEAD_DARK_ZOMBIE", ActorID.UNDEAD_DARK_ZOMBIE, ROTTING],
  ["UNDEAD_MALE_ZOMBIFIED", ActorID.UNDEAD_MALE_ZOMBIFIED, ROTTING],
  ["UNDEAD_FEMALE_ZOMBIFIED", ActorID.UNDEAD_FEMALE_ZOMBIFIED, ROTTING],

  ["UNDEAD_MALE_NEOPHYTE", ActorID.UNDEAD_MALE_NEOPHYTE, ROTTING_PUSH],
  ["UNDEAD_FEMALE_NEOPHYTE", ActorID.UNDEAD_FEMALE_NEOPHYTE, ROTTING_PUSH],
  ["UNDEAD_MALE_DISCIPLE", ActorID.UNDEAD_MALE_DISCIPLE, ROTTING_PUSH],
  ["UNDEAD_FEMALE_DISCIPLE", ActorID.UNDEAD_FEMALE_DISCIPLE, ROTTING_PUSH],

  ["UNDEAD_ZOMBIE_MASTER", ActorID.UNDEAD_ZOMBIE_MASTER, MASTER],
  ["UNDEAD_ZOMBIE_LORD", ActorID.UNDEAD_ZOMBIE_LORD, MASTER],
  ["UNDEAD_ZOMBIE_PRINCE", ActorID.UNDEAD_ZOMBIE_PRINCE, MASTER],

  // Small, so it slips past closed doors; and notably NOT rotting.
  ["UNDEAD_RAT_ZOMBIE", ActorID.UNDEAD_RAT_ZOMBIE, ["aiCanUseAIExits", "isSmall", "isUndead"]],
  // No aiCanUseAIExits, unlike everything else undead.
  ["SEWERS_THING", ActorID.SEWERS_THING, ["canBashDoors", "canBreakObjects", "isUndead"]],

  ["MALE_CIVILIAN", ActorID.MALE_CIVILIAN, CIVILIAN],
  ["FEMALE_CIVILIAN", ActorID.FEMALE_CIVILIAN, CIVILIAN],

  // No hasToEat, unlike every other living actor.
  ["CHAR_GUARD", ActorID.CHAR_GUARD, [
    "canBarricade", "canBreakObjects", "canJump", "canPush", "canRun",
    "canTalk", "canTire", "canUseItems", "canUseMapObjects", "hasInventory",
    "hasSanity", "hasToSleep", "isIntelligent",
  ]],
  ["ARMY_NATIONAL_GUARD", ActorID.ARMY_NATIONAL_GUARD, [
    "canBarricade", "canBreakObjects", "canJump", "canPush", "canRun",
    "canTalk", "canTire", "canUseItems", "canUseMapObjects", "hasInventory",
    "hasSanity", "hasToSleep", "isIntelligent",
  ]],
  // The only actor that ignores ranged weapons.
  ["BIKER_MAN", ActorID.BIKER_MAN, [
    "aiNotInterestedInRangedWeapons", "canBarricade", "canBreakObjects",
    "canJump", "canPush", "canRun", "canTalk", "canTire", "canTrade",
    "canUseItems", "canUseMapObjects", "hasInventory", "hasSanity",
    "hasToEat", "hasToSleep", "isIntelligent",
  ]],
  ["GANGSTA_MAN", ActorID.GANGSTA_MAN, [
    "canBarricade", "canBreakObjects", "canJump", "canPush", "canRun",
    "canTalk", "canTire", "canTrade", "canUseItems", "canUseMapObjects",
    "hasInventory", "hasSanity", "hasToEat", "hasToSleep", "isIntelligent",
  ]],
  ["POLICEMAN", ActorID.POLICEMAN, [
    "aiCanUseAIExits", "canBarricade", "canBreakObjects", "canJump",
    "canPush", "canRun", "canTalk", "canTire", "canTrade", "canUseItems",
    "canUseMapObjects", "hasInventory", "hasSanity", "hasToEat",
    "hasToSleep", "isIntelligent", "isLawEnforcer",
  ]],
  // No hasToEat.
  ["BLACKOPS_MAN", ActorID.BLACKOPS_MAN, [
    "canBarricade", "canBreakObjects", "canJump", "canPush", "canRun",
    "canTalk", "canTire", "canUseItems", "canUseMapObjects", "hasInventory",
    "hasSanity", "hasToSleep", "isIntelligent",
  ]],
  // No sanity, no talking, no trading, no barricading.
  ["FERAL_DOG", ActorID.FERAL_DOG, [
    "aiCanUseAIExits", "canBreakObjects", "canJump", "canRun", "canTire",
    "hasInventory", "hasToEat", "hasToSleep",
  ]],
  // RAGE: no eating, no sleeping, no sanity.
  ["JASON_MYERS", ActorID.JASON_MYERS, [
    "aiCanUseAIExits", "canBarricade", "canBreakObjects", "canJump",
    "canPush", "canRun", "canTalk", "canTire", "canUseItems",
    "canUseMapObjects", "hasInventory",
  ]],
  // Still Alive's deranged patient, commented "was Jason Myers" upstream
  // (GameActors.cs:1045-1062) and given the identical fourteen flags: RAGE
  // again, so still no eating and no sleeping.
  ["DERANGED_PATIENT", ActorID.DERANGED_PATIENT, [
    "aiCanUseAIExits", "canBarricade", "canBreakObjects", "canJump",
    "canPush", "canRun", "canTalk", "canTire", "canUseItems",
    "canUseMapObjects", "hasInventory",
  ]],
  // Still Alive's CHAR scientist: a second CHAR guard (GameActors.cs:766-782),
  // so the CHAR quirk of no `hasToEat` comes with it.
  ["CHAR_SCIENTIST", ActorID.CHAR_SCIENTIST, [
    "canBarricade", "canBreakObjects", "canJump", "canPush", "canRun",
    "canTalk", "canTire", "canUseItems", "canUseMapObjects", "hasInventory",
    "hasSanity", "hasToSleep", "isIntelligent",
  ]],
];

let actors: GameActors;

beforeAll(() => {
  actors = new GameActors();
});

describe("per-actor abilities match the C#", () => {
  it("covers every actor in the enum", () => {
    expect(EXPECTED).toHaveLength(ActorID._COUNT);
  });

  it.each(EXPECTED)("%s", (_name, id, expected) => {
    expect(granted(actors.get(id).abilities)).toEqual(expected);
  });

  it("the player can open doors -- the reported symptom", () => {
    const player = actors.get(ActorID.MALE_CIVILIAN).abilities;
    expect(player.canUseMapObjects).toBe(true);
    expect(player.canBashDoors).toBe(true);
    expect(player.canBreakObjects).toBe(true);
    expect(player.canBarricade).toBe(true);
    expect(player.canPush).toBe(true);
    expect(player.canJump).toBe(true);
    expect(player.isIntelligent).toBe(true);
  });

  it("skeletons and the rat zombie do not rot, and have no bash/break", () => {
    // The old loop gave all of these isRotting/canBashDoors/canBreakObjects,
    // and isRotting drives the rot meter on a sheet the C# gives NO_FOOD.
    for (const id of [ActorID.UNDEAD_SKELETON, ActorID.UNDEAD_RED_EYED_SKELETON, ActorID.UNDEAD_RED_SKELETON, ActorID.UNDEAD_RAT_ZOMBIE]) {
      const a = actors.get(id).abilities;
      expect(a.isRotting, `${ActorID[id]} must not rot`).toBe(false);
      expect(a.canBashDoors, `${ActorID[id]} must not bash`).toBe(false);
      expect(a.canBreakObjects, `${ActorID[id]} must not break`).toBe(false);
      expect(a.canZombifyKilled, `${ActorID[id]} must not zombify`).toBe(false);
    }
  });

  it("only the zombie master, lord and prince are flagged isUndeadMaster", () => {
    const masters = [ActorID.UNDEAD_ZOMBIE_MASTER, ActorID.UNDEAD_ZOMBIE_LORD, ActorID.UNDEAD_ZOMBIE_PRINCE];
    for (let i = 0; i < ActorID._COUNT; i++) {
      const expectMaster = masters.includes(i as ActorID);
      expect(actors.get(i).abilities.isUndeadMaster, `${ActorID[i]}`).toBe(expectMaster);
    }
  });
});

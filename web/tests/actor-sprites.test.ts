import { describe, it, expect } from "vitest";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { DiceRoller } from "@engine/DiceRoller";

/**
 * Actor sprites: null vs. a whole-body image.
 *
 * The bug: `GameActors` built its models from CSV in one loop, and every living
 * actor — civilians, the dog, the gangs — was mapped to
 * `GameImages.ACTOR_ZOMBIE`, with `actorImageMap[i] ?? ACTOR_ZOMBIE` as a
 * backstop that also swallowed the legitimate `null`s. C# passes `null` as the
 * `ActorModel` image for exactly those actors (src/Gameplay/GameActors.cs:659
 * onward), because the generator skins and dresses them instead.
 *
 * The failure is subtle on screen: the sprite draws *under* the doll layers, so
 * the player still looked like a person, just wearing a zombie's torso. Living
 * NPCs had no doll at all, so they rendered as a bare zombie with no head, hair
 * or clothes — which is what "the human sprite doesn't draw" was.
 */

const actors = new GameActors();
const faction = new Faction("Testers", "tester");

/** Every actor C# passes a non-null `ActorModel` image for. */
const SPRITE_OWNED: Array<[ActorID, string]> = [
  [ActorID.UNDEAD_SKELETON, GameImages.ACTOR_SKELETON],
  [ActorID.UNDEAD_RED_EYED_SKELETON, GameImages.ACTOR_RED_EYED_SKELETON],
  [ActorID.UNDEAD_RED_SKELETON, GameImages.ACTOR_RED_SKELETON],
  [ActorID.UNDEAD_ZOMBIE, GameImages.ACTOR_ZOMBIE],
  [ActorID.UNDEAD_DARK_EYED_ZOMBIE, GameImages.ACTOR_DARK_EYED_ZOMBIE],
  [ActorID.UNDEAD_DARK_ZOMBIE, GameImages.ACTOR_DARK_ZOMBIE],
  [ActorID.UNDEAD_MALE_NEOPHYTE, GameImages.ACTOR_MALE_NEOPHYTE],
  [ActorID.UNDEAD_FEMALE_NEOPHYTE, GameImages.ACTOR_FEMALE_NEOPHYTE],
  [ActorID.UNDEAD_MALE_DISCIPLE, GameImages.ACTOR_MALE_DISCIPLE],
  [ActorID.UNDEAD_FEMALE_DISCIPLE, GameImages.ACTOR_FEMALE_DISCIPLE],
  [ActorID.UNDEAD_ZOMBIE_MASTER, GameImages.ACTOR_ZOMBIE_MASTER],
  [ActorID.UNDEAD_ZOMBIE_LORD, GameImages.ACTOR_ZOMBIE_LORD],
  [ActorID.UNDEAD_ZOMBIE_PRINCE, GameImages.ACTOR_ZOMBIE_PRINCE],
  [ActorID.UNDEAD_RAT_ZOMBIE, GameImages.ACTOR_RAT_ZOMBIE],
  [ActorID.SEWERS_THING, GameImages.ACTOR_SEWERS_THING],
];

/** Every actor C# passes `null` for — drawn purely from the doll. */
const DOLL_OWNED: ActorID[] = [
  ActorID.MALE_CIVILIAN,
  ActorID.FEMALE_CIVILIAN,
  ActorID.FERAL_DOG,
  ActorID.CHAR_GUARD,
  ActorID.ARMY_NATIONAL_GUARD,
  ActorID.BIKER_MAN,
  ActorID.GANGSTA_MAN,
  ActorID.POLICEMAN,
  ActorID.BLACKOPS_MAN,
  ActorID.JASON_MYERS,
  // Still Alive: both passed `null` in the fork too -- "skinned. // skinned &
  // dressed" -- so they are doll-driven like Jason Myers and the CHAR guard.
  ActorID.DERANGED_PATIENT,
  ActorID.CHAR_SCIENTIST,
  // Still Alive's two food animals. Both are doll-drawn: the body is the sheet,
  // and the east/west facing comes from a decoration pair the AI picks
  // (`UnintelligentAnimalAI.faceSpriteForDirection`). Neither has a single actor
  // graphic, which is why they belong in this list and not in the sprite map.
  ActorID.RABBIT,
  ActorID.CHICKEN,
  // Zombified: dressed as a civilian, then zombified, so still doll-driven.
  ActorID.UNDEAD_MALE_ZOMBIFIED,
  ActorID.UNDEAD_FEMALE_ZOMBIFIED,
];

describe("GameActors sprite mapping", () => {
  it.each(SPRITE_OWNED)("%s carries its own whole-body sprite", (id, expected) => {
    expect(actors.get(id).imageId).toBe(expected);
  });

  it.each(DOLL_OWNED)("%s has no sprite and is drawn from its doll", (id) => {
    // The `?? ACTOR_ZOMBIE` backstop turned every one of these into a zombie.
    expect(actors.get(id).imageId).toBeNull();
  });

  it("gives no living actor a sprite at all", () => {
    // The specific regression, stated as a property rather than a list: nothing
    // that has been skinned and dressed may carry a whole-body image.
    const leaked = DOLL_OWNED.filter((id) => actors.get(id).imageId !== null);
    expect(leaked).toEqual([]);
  });

  it("covers every actor id exactly once", () => {
    // A typo in the enum would silently fall through to null and render an
    // actor as an undecorated body, so the two lists must partition the enum.
    const covered = new Set([...SPRITE_OWNED.map(([id]) => id), ...DOLL_OWNED]);
    const missing: ActorID[] = [];
    for (let i = 0; i < ActorID._COUNT; i++) {
      const id = i as ActorID;
      if (!covered.has(id)) missing.push(id);
    }
    expect(missing).toEqual([]);
    expect(covered.size).toBe(SPRITE_OWNED.length + DOLL_OWNED.length);
  });
});

describe("dressed actors are actually dressable", () => {
  it("dresses a civilian with a sprite for every doll layer", () => {
    // A null imageId is only safe if the doll is fully populated; otherwise the
    // actor renders as nothing at all.
    const roller = new DiceRoller(7);
    const a = actors.get(ActorID.MALE_CIVILIAN).createAnonymous(faction, 0);
    // Mirrors BaseMapGenerator.dressCivilian for a male.
    const decos = {
      [DollPart.EYES]: [GameImages.MALE_EYES1],
      [DollPart.SKIN]: [GameImages.MALE_SKIN1],
      [DollPart.HEAD]: [GameImages.MALE_HAIR1],
      [DollPart.TORSO]: [GameImages.MALE_SHIRT1],
      [DollPart.LEGS]: [GameImages.MALE_PANTS1],
      [DollPart.FEET]: [GameImages.MALE_SHOES1],
    };
    for (const [part, list] of Object.entries(decos)) {
      for (const imageId of list) a.doll.addDecoration(Number(part) as DollPart, imageId);
    }
    void roller;

    for (const part of [
      DollPart.EYES,
      DollPart.SKIN,
      DollPart.HEAD,
      DollPart.TORSO,
      DollPart.LEGS,
      DollPart.FEET,
    ]) {
      expect(a.doll.getDecorations(part), `part ${part} undressed`).not.toBeNull();
      expect(a.doll.getDecorations(part)!.length).toBeGreaterThan(0);
    }
  });
});

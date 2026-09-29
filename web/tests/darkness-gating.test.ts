/**
 * `Feature.DarknessGating` — you cannot read or patch yourself in the dark.
 *
 * Still Alive, Release 6-2, with the Release 7-5 light-source exceptions.
 *
 * This is the feature that was parked at Stage 2 as "needs `DarknessFov` to be
 * coherent", and it is now live because `DarknessFov` 2a landed. The dependency
 * was real and it is worth being precise about why: every check here is
 * `actorFOV(...) == 0`, and under vanilla the floor is 2, so the condition is
 * *unreachable*. Porting it before the floor changed would have produced five
 * branches no test could ever enter — which is a worse state than not porting,
 * because the code looks done.
 *
 * The two behaviours are asymmetric in an easily-missed way: reading is refused
 * with no exception, but medicine has a carve-out for cigarettes and booze.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Lighting, Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { PlayerController } from "@data/PlayerController";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Campfire } from "@engine/mapobjects/MapObjects";
import { MapObjectBreak } from "@data/MapObject";
import { ItemLight } from "@engine/items/ItemLight";
import { DollPart } from "@data/Doll";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { DoorWindow, Fortification } from "@engine/mapobjects/MapObjects";
import { ItemBarricadeMaterial } from "@engine/items/ItemMisc";
import { DiceRoller } from "@engine/DiceRoller";
import { Weather } from "@data/Weather";
import type { Message } from "@data/Message";
import { ItemMedicine } from "@engine/items/ItemMedicine";
import { ItemEntertainment } from "@engine/items/ItemMisc";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let rules: Rules;
let player: Actor;
let tileX: number;

beforeEach(() => {
  new GameActors();
  new GameItems();
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  rules = new Rules(new DiceRoller(1));
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  tileX = 20;
  player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  player.controller = new PlayerController();
  map.placeActor(player, new Point(tileX++, 20));
  game.m_Player = player;
});

const plank = (): ItemBarricadeMaterial =>
  new ItemBarricadeMaterial(Models.items.get(ItemID.BAR_WOODEN_PLANK));

const dark = (): void => {
  map.lighting = Lighting.DARKNESS;
};
const lit = (): void => {
  map.lighting = Lighting.LIT;
};

describe("Feature.DarknessGating: the one predicate", () => {
  it("is true for the player in the dark and false in the light", () => {
    dark();
    expect(rules.isActorInAbsoluteDarkness(player)).toBe(true);
    lit();
    expect(rules.isActorInAbsoluteDarkness(player)).toBe(false);
  });

  it("is never true under CLASSIC, where FOV cannot reach 0", () => {
    // The whole feature is unreachable on vanilla. If this ever goes true, the
    // floor has moved and the "too dark" strings would start appearing in a
    // ruleset that never had darkness.
    Session.get().ruleset = Ruleset.CLASSIC;
    dark();
    expect(rules.isActorInAbsoluteDarkness(player)).toBe(false);
  });

  it("is false for an NPC in the dark, because the NPC floor is 1", () => {
    // Worth stating: the gate is a de facto *player* check. If the NPC floor
    // ever moves to 0, NPCs would start refusing to read in basements, and the
    // simulation would quietly stop having anyone do anything down there.
    dark();
    const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "npc");
    map.placeActor(npc, new Point(tileX++, 20));
    expect(rules.isActorInAbsoluteDarkness(npc)).toBe(false);
  });

  it("is false for an actor with no map at all", () => {
    // `actorFOV` dereferences `location.map`, and an off-map actor is reachable
    // from inventory-management paths. A throw here would be a crash in a rule
    // predicate, which is the worst place for one.
    const orphan = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "x");
    expect(rules.isActorInAbsoluteDarkness(orphan)).toBe(false);
  });
});

describe("Feature.DarknessGating: the building checks", () => {
  // The C# writes *two different* strings across these four checks — "it's too
  // dark too see" on the door checks, "it's too dark to see" on the
  // fortifications. That is the text the player sees, so it is reproduced rather
  // than tidied, and pinned here so a later "obvious" fix is a deliberate act.
  // Placed on the map, because `canActorBarricadeDoor` reaches a check that
  // dereferences `door.location.map` -- and in the dark test the new darkness
  // check returns first and hides the missing placement. An unplaced door is a
  // latent null-deref in the rule itself; the test just trips over it.
  const door = (): DoorWindow => {
    const d = new DoorWindow("door", "a", "b", "c", DoorWindow.BASE_HITPOINTS);
    map.placeMapObject(d, new Point(tileX++, 24));
    return d;
  };

  it("refuses to barricade a door in the dark", () => {
    dark();
    player.inventory!.addAll(plank());
    const res = rules.canActorBarricadeDoor(player, door());
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("it's too dark too see");
  });

  it("allows it in the light", () => {
    lit();
    player.inventory!.addAll(plank());
    const res = rules.canActorBarricadeDoor(player, door());
    expect(res.ok, res.reason).toBe(true);
  });

  it("refuses to repair a fortification in the dark, with the other spelling", () => {
    dark();
    const fort = new Fortification("fort", "img", Fortification.LARGE_BASE_HITPOINTS);
    const res = rules.canActorRepairFortification(player, fort);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("it's too dark to see");
  });

  it("does not reach the darkness check before the cheap ability checks", () => {
    // Order matters for the *message* the player gets. An actor with no carpentry
    // should hear about carpentry, not about the dark, even in a pitch-black
    // basement -- otherwise the feature masks the real problem.
    dark();
    const noSkill = new Actor(Models.actors.get(ActorID.UNDEAD_SKELETON), survivors, "skel");
    map.placeActor(noSkill, new Point(tileX++, 20));
    const res = rules.canActorBuildFortification(noSkill, new Point(tileX, 22), false);
    expect(res.ok).toBe(false);
    expect(res.reason, "the ability check wins").not.toMatch(/too dark/);
  });
});

describe("Feature.DarknessGating: refusing, and the two exceptions", () => {
  // These drive `DoUseItem`, so they observe the *refusal message* rather than
  // an item effect. The message is the only thing the C# produces when it
  // refuses, and it is the only thing the player sees.

  const messages = (): string => {
    const mgr = (game as unknown as {
      m_MessageManager: { history: readonly Message[] };
    }).m_MessageManager;
    return mgr.history.map((m) => m.text).join("\n");
  };
  const saidTooDark = (): boolean => messages().includes("too dark");

  const use = (id: ItemID): void => {
    game.DoUseItem(player, new ItemMedicine(Models.items.get(id)));
  };

  it("refuses to use a bandage in the dark", () => {
    dark();
    use(ItemID.MEDICINE_BANDAGES);
    expect(saidTooDark()).toBe(true);
  });

  it("uses a bandage in the light", () => {
    lit();
    use(ItemID.MEDICINE_BANDAGES);
    expect(saidTooDark()).toBe(false);
  });

  it("allows a cigarette in the dark", () => {
    // The Release 7-5 exception. Neither a cigarette nor a beer is really
    // medicine; both are `ItemMedicine` only so they can restore sanity, which is
    // what `isRecreational` records and why this carve-out exists at all.
    dark();
    use(ItemID.MEDICINE_CIGARETTES);
    expect(saidTooDark(), "cigarettes are exempt").toBe(false);
  });

  it("allows a beer in the dark", () => {
    dark();
    use(ItemID.MEDICINE_ALCOHOL_BEER_BOTTLE_GREEN);
    expect(saidTooDark(), "booze is exempt").toBe(false);
  });

  it("refuses to read a book in the dark, with no exception at all", () => {
    // Unlike medicine. There is no "but you can smoke while reading".
    dark();
    game.DoUseItem(player, new ItemEntertainment(Models.items.get(ItemID.ENT_BOOK)));
    expect(saidTooDark()).toBe(true);
  });

  it("lets you read a book in the dark by a burning barrel", () => {
    dark();
    map.placeMapObject(
      new Campfire("barrel", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 10),
      player.location.position,
    );
    game.ApplyOnFire(map.getMapObjectAtPoint(player.location.position)!);
    game.DoUseItem(player, new ItemEntertainment(Models.items.get(ItemID.ENT_BOOK)));
    expect(saidTooDark(), "lit by the barrel").toBe(false);
  });

  it("never refuses under CLASSIC, even in a basement", () => {
    // The gate is not redundant, but the *profile* is what makes it redundant:
    // vanilla's floor is 2, so FOV 0 is unreachable... except for a sleeping
    // actor, which `actorFOV` returns 0 for before consulting the profile at all.
    // So the flag really is load-bearing, and this is the case that proves it.
    Session.get().ruleset = Ruleset.CLASSIC;
    dark();
    player.isSleeping = true;
    expect(rules.actorFOV(player, map.localTime, Weather.CLEAR), "asleep means FOV 0").toBe(0);
    expect(rules.isActorInAbsoluteDarkness(player), "and so the gate has work to do").toBe(false);
  });
});

describe("Feature.DarknessGating: standing in light", () => {
  // The 3x3 scan. Every one of these is a case where a player who is told
  // "it's too dark" would reasonably protest.
  const nearby = (): Point => player.location.position;

  it("sees nothing in a genuinely dark map", () => {
    dark();
    expect(game.IsActorStandingInLight(player)).toBe(false);
  });

  it("sees a burning object on the actor's own tile", () => {
    dark();
    map.placeMapObject(
      new Campfire("barrel", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 10),
      nearby(),
    );
    game.ApplyOnFire(map.getMapObjectAtPoint(nearby())!);
    expect(game.IsActorStandingInLight(player)).toBe(true);
  });

  it("sees a burning object one tile away, and two tiles away it does not", () => {
    // The C# assumes ambient light is "always only 3x3 tiles", so a brazier two
    // tiles off is genuinely not counted. That is a limitation, not a bug, and
    // the second assertion pins it so nobody "fixes" it into a radius scan.
    dark();
    map.placeMapObject(
      new Campfire("barrel", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 10),
      new Point(nearby().x + 1, nearby().y),
    );
    game.ApplyOnFire(map.getMapObjectAtPoint(new Point(nearby().x + 1, nearby().y))!);
    expect(game.IsActorStandingInLight(player), "one tile").toBe(true);

    map.placeMapObject(
      new Campfire("barrel2", "MapObjects/campfire", MapObjectBreak.BREAKABLE, 10),
      new Point(nearby().x + 2, nearby().y),
    );
    game.ApplyOnFire(map.getMapObjectAtPoint(new Point(nearby().x + 2, nearby().y))!);
    const far = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "far");
    map.placeActor(far, new Point(nearby().x - 1, nearby().y));
    // The actor two tiles from the fire is three tiles from it, so the 3x3 scan
    // misses it. Asserted from the actor's own position, not the player's.
    expect(game.IsActorStandingInLight(far), "three tiles").toBe(false);
  });

  it("sees an actor holding a working light", () => {
    dark();
    const other = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "lit");
    map.placeActor(other, new Point(nearby().x + 1, nearby().y));
    const torch = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
    other.inventory!.addAll(torch);
    torch.equippedPart = DollPart.LEFT_HAND;
    expect(game.IsActorStandingInLight(player)).toBe(true);
  });

  it("ignores an actor whose light has no batteries", () => {
    dark();
    const other = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "dark");
    map.placeActor(other, new Point(nearby().x + 1, nearby().y));
    const torch = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
    other.inventory!.addAll(torch);
    torch.equippedPart = DollPart.LEFT_HAND;
    torch.batteries = 0;
    expect(game.IsActorStandingInLight(player), "a dead torch is not light").toBe(false);
  });

  it("sees a dropped light, equipped or not", () => {
    dark();
    map.dropItemAt(
      new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT)),
      new Point(nearby().x, nearby().y + 1),
    );
    expect(game.IsActorStandingInLight(player)).toBe(true);
  });

  it("is not fooled by an ordinary item on the ground", () => {
    dark();
    map.dropItemAt(plank(), new Point(nearby().x, nearby().y + 1));
    expect(game.IsActorStandingInLight(player)).toBe(false);
  });
});

describe("Feature.DarknessGating: the registry", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.DarknessGating)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.DarknessGating)).toBe(false);
  });
});

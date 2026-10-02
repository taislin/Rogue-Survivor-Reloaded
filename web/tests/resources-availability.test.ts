/**
 * `Feature.ResourcesAvailability` — one knob, six readers.
 *
 * Still Alive, Release 7-4.
 *
 * The feature is easy to describe and easy to get half-right, because the name
 * suggests loot tables and in fact it reaches the starting kit, the survival
 * score, and how much meat a corpse is worth. What makes it worth testing is
 * that **all six readers are behind one gate**, and that the option outlives
 * the ruleset: it lives in `localStorage`, so a player who set HIGH under Still
 * Alive and then starts a CLASSIC game still has HIGH in the blob. Hiding the
 * options row is therefore not sufficient — every reader has to ask.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Rules } from "@engine/Rules";
import { Ruleset, Session } from "@engine/Session";
import { ItemFood } from "@engine/items/ItemFood";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { GameOptions, OptionIDs, Options, Resources } from "@engine/GameOptions";
import { DifficultySide, Scoring } from "@engine/Scoring";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { RogueGame } from "@engine/RogueGame";
import { OptionsScreen } from "@ui/OptionsScreen";
import { NullRogueUI } from "@ui/NullRogueUI";
import type { IMusicManager } from "@engine/audio/IMusicManager";

const survivors = new Faction("The Survivors", "survivor");

beforeEach(() => {
  new GameActors();
  new GameItems();
  Session.get().ruleset = Ruleset.STILL_ALIVE;
  Session.get().reset();
});

describe("the option itself", () => {
  it("defaults to MED", () => {
    // It matters that the *default* is MED: the difficulty rating multiplies by
    // 1.5 on LOW and 0.5 on HIGH, so MED is the only setting that leaves a
    // score alone.
    expect(new GameOptions().resourcesAvailability).toBe(Resources.MED);
    expect(GameOptions.DEFAULT_RESOURCES_AVAILABILITY).toBe(Resources.MED);
  });

  it("projects to 33/54/75, not evenly spaced thirds", () => {
    // 33 / 50 / 66 would be the "obvious" choice and is wrong. HIGH is 75 and
    // not 100 so that even the most plentiful world leaves the occasional cache
    // bare, which is what makes scavenging a search rather than a formality.
    expect(GameOptions.resourcesAvailabilityToInt(Resources.LOW)).toBe(33);
    expect(GameOptions.resourcesAvailabilityToInt(Resources.MED)).toBe(54);
    expect(GameOptions.resourcesAvailabilityToInt(Resources.HIGH)).toBe(75);
  });

  it("numbers LOW as 0, because the difficulty screen steps the value", () => {
    // The C# clamps with `if (!= LOW) --` and `if (!= HIGH) ++`. A UI that wraps
    // instead of clamping, or an enum numbered the other way, makes Left and
    // Right do the opposite of what they say.
    expect(Resources.LOW).toBe(0);
    expect(Resources.MED).toBe(1);
    expect(Resources.HIGH).toBe(2);
  });

  it("throws rather than defaulting on a value it does not know", () => {
    expect(() => GameOptions.resourcesAvailabilityToInt(99 as Resources)).toThrow();
    expect(() => GameOptions.resourcesAvailabilityName(99 as Resources)).toThrow();
  });
});

describe("the survival difficulty rating", () => {
  const rating = (availability: Resources, side = DifficultySide.FOR_SURVIVOR): number => {
    const o = Options.clone();
    o.resourcesAvailability = availability;
    return Scoring.computeDifficultyRating(o, side, 0);
  };

  const withDefault = (): number =>
    Scoring.computeDifficultyRating(Options.clone(), DifficultySide.FOR_SURVIVOR, 0);

  it("multiplies the survivor's rating by 1.5 on LOW and 0.5 on HIGH", () => {
    const base = withDefault();
    expect(rating(Resources.LOW)).toBeCloseTo(base * 1.5, 5);
    expect(rating(Resources.HIGH)).toBeCloseTo(base * 0.5, 5);
  });

  it("leaves MED alone, because it is the default", () => {
    expect(rating(Resources.MED)).toBe(withDefault());
  });

  it("does not adjust the zombie side at all", () => {
    // A plentiful world is not easier or harder to conquer, only a different
    // kind of game, and the C# declines to score that.
    const base = Scoring.computeDifficultyRating(
      Options.clone(),
      DifficultySide.FOR_UNDEAD,
      0,
    );
    for (const a of [Resources.LOW, Resources.MED, Resources.HIGH]) {
      expect(rating(a, DifficultySide.FOR_UNDEAD)).toBe(base);
    }
  });

  it("is inert under CLASSIC, even with a hostile value still in storage", () => {
    // The option lives in `localStorage` and survives a ruleset switch, so a
    // player who set HIGH under Still Alive and then starts a classic game has
    // HIGH in the blob. Hiding the options row does not stop the reader.
    // What CLASSIC owes is simply "the same rating MED would give", since MED is
    // the default and the multiplier is the only thing in question. Hardcoding an
    // absolute number here would break the next time an unrelated factor moves.
    Options.resourcesAvailability = Resources.MED;
    const medRating = withDefault();
    Options.resourcesAvailability = Resources.HIGH;
    const stillAliveHigh = Scoring.computeDifficultyRating(
      Options.clone(),
      DifficultySide.FOR_SURVIVOR,
      0,
    );
    Session.get().ruleset = Ruleset.CLASSIC;
    expect(withDefault(), "the HIGH multiplier must not apply").toBe(medRating);
    expect(withDefault()).not.toBeCloseTo(stillAliveHigh, 5);
    Options.resourcesAvailability = Resources.MED;
  });
});

describe("meat per corpse", () => {
  it("is 3 / 2 / 1", () => {
    expect(Rules.meatQuantityPerCorpse(Resources.HIGH)).toBe(3);
    expect(Rules.meatQuantityPerCorpse(Resources.MED)).toBe(2);
    expect(Rules.meatQuantityPerCorpse(Resources.LOW)).toBe(1);
  });

  it("falls back to 2 on a value it does not know, as the C#'s default does", () => {
    // The C#'s switch has `default: 2`. A bad cast into this function should
    // not silently double a LOW world's yield.
    expect(Rules.meatQuantityPerCorpse(99 as Resources)).toBe(2);
  });
});

describe("the registry", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.ResourcesAvailability)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.ResourcesAvailability)).toBe(false);
  });
});

describe("the starting kit", () => {
  /** Call the private grant the way `StartNewGame` does. */
  const kit = (availability: Resources, ruleset = Ruleset.STILL_ALIVE): ItemFood[] => {
    Session.get().ruleset = ruleset;
    Options.resourcesAvailability = availability;
    const map = new GameMap(1, "test", 20, 20);
    const player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
    map.placeActor(player, new Point(5, 5));
    // The method only touches the session, the player and the options, so a
    // stand-in `this` is enough and this stays a unit test -- no world
    // generation. Called off the prototype because a fresh RogueGame would drag
    // in a generator, a session and a UI to grant three items.
    const self = { m_Session: Session.get(), m_Player: player, m_GameItems: new GameItems() };
    RogueGame.prototype.GiveStartingKitForResources.call(self);
    return player.inventory!.items.filter((i): i is ItemFood => i instanceof ItemFood);
  };

  it("gives nothing on LOW", () => {
    expect(kit(Resources.LOW), "you start with your hands").toHaveLength(0);
  });

  it("gives two snack bars on MED", () => {
    const food = kit(Resources.MED);
    expect(food.map((f) => f.model.id)).toEqual([ItemID.FOOD_SNACK_BAR]);
    expect(food[0].quantity, "two, not one").toBe(2);
  });

  it("gives groceries on HIGH, and no club", () => {
    // The C# builds an improvised club in the HIGH arm and never adds it to the
    // inventory -- `Item melee = ...` with no `AddAll`. Preserved on purpose: a
    // free club in a scavenged world is a balance change, not a typo fix.
    const food = kit(Resources.HIGH);
    expect(food.map((f) => f.model.id)).toEqual([ItemID.FOOD_GROCERIES]);
  });

  it("gives CLASSIC nothing at any setting", () => {
    for (const a of [Resources.LOW, Resources.MED, Resources.HIGH]) {
      expect(kit(a, Ruleset.CLASSIC), `classic on ${Resources[a]}`).toHaveLength(0);
    }
    Options.resourcesAvailability = Resources.MED;
  });
});

describe("the options row", () => {
  const screen = (): OptionsScreen => {
    const ui = new NullRogueUI();
    return new OptionsScreen(ui, {
      playMusic: () => {},
      stopMusic: () => {},
      playSfx: () => {},
      stopAllSfx: () => {},
      playMusicFile: () => {},
      setMusicPriority: () => {},
      isMusicPlaying: () => false,
      changeVolume: () => {},
    } as unknown as IMusicManager);
  };

  const listOf = (s: OptionsScreen): OptionIDs[] =>
    (s as unknown as { list: OptionIDs[] }).list;
  const adjust = (s: OptionsScreen, dir: -1 | 1): void =>
    (s as unknown as { adjust(o: OptionIDs, d: -1 | 1): void }).adjust(
      OptionIDs.GAME_RESOURCES_AVAILABILITY,
      dir,
    );

  beforeEach(() => {
    Options.resourcesAvailability = Resources.MED;
  });

  it("is off the mid-game options screen, because it moved to character creation", () => {
    // This assertion used to be "listed under Still Alive, absent under
    // classic". It is now absent under *both*, and the reason is
    // `Feature.DifficultyAtCreation`: the fork deletes every difficulty row from
    // the mid-game list (`RogueGame.cs:1557-1582`, under a
    // `//MOVED TO CHARACTER CREATION` comment) and puts them on a screen in
    // character creation instead. Resources Availability is one of them.
    //
    // Worth reading as a change of premise rather than a bug: an option that is
    // *only* configurable at character creation is strictly harder to change
    // than one that is also in the options screen, and this one is the sharpest
    // example in the fork — it decides your starting kit.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    expect(listOf(screen())).not.toContain(OptionIDs.GAME_RESOURCES_AVAILABILITY);
    Session.get().ruleset = Ruleset.CLASSIC;
    expect(listOf(screen())).not.toContain(OptionIDs.GAME_RESOURCES_AVAILABILITY);
  });

  it("steps with the arrow keys", () => {
    // The step is shared with the creation screen now (`stepGameOption`), so
    // this is the same code path the difficulty menu drives; what the arrow keys
    // do is a property of the option, not of the screen it is shown on.
    const s = screen();
    adjust(s, 1);
    expect(Options.resourcesAvailability).toBe(Resources.HIGH);
    adjust(s, -1);
    expect(Options.resourcesAvailability).toBe(Resources.MED);
  });

  it("clamps at both ends rather than wrapping", () => {
    // The C# does `if (!= LOW) --` and `if (!= HIGH) ++`, so Left at LOW and
    // Right at HIGH are no-ops. Wrapping would make Right at HIGH jump to LOW,
    // which reads as the screen having eaten your keypress.
    const s = screen();
    adjust(s, 1);
    adjust(s, 1);
    expect(Options.resourcesAvailability, "already HIGH").toBe(Resources.HIGH);
    adjust(s, -1);
    adjust(s, -1);
    adjust(s, -1);
    expect(Options.resourcesAvailability, "already LOW").toBe(Resources.LOW);
  });
});

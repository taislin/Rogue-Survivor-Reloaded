/**
 * `Feature.LightPriority` — the AI keeps its torch and drops the cell phone.
 *
 * Still Alive, Release 6-1.
 *
 * The second and last of the two Stage 2 features parked until `DarknessFov` 2a
 * made darkness real. The fix is a reordering of the left-hand equipment blocks,
 * and the parked dependency was real for a concrete reason: with only one left
 * hand, vanilla's order is **cellphone -> light**, so an NPC holding both drops
 * the torch. Before the darkness rework that was a cosmetic oddity. After it —
 * with the player's floor dropped to 0 — an NPC walking into a basement is holding
 * a cell phone it will never switch on.
 *
 * The C#'s comment is the whole justification: "lights are now more important than
 * cellphones now that darkness is revamped".
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Faction } from "@data/Faction";
import { Lighting, Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { Point } from "@engine/Point";
import { Ruleset } from "@engine/Session";
import { ActionUnequipItem } from "@engine/actions/Actions";
import { ItemLight } from "@engine/items/ItemLight";
import { ItemTracker } from "@engine/items/ItemTracker";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { RogueGame } from "@engine/RogueGame";
import { BaseAI } from "@gameplay/ai/BaseAI";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems, ItemID } from "@gameplay/GameItems";
import { GameTiles } from "@gameplay/GameTiles";
import { NullRogueUI } from "@ui/NullRogueUI";

const survivors = new Faction("The Survivors", "survivor");

let game: RogueGame;
let map: GameMap;
let npc: Actor;
let ai: TestableAI;

/**
 * Opens the one protected seam the feature sits behind. `behaviorEquipBestItems`
 * is `protected` because it is a behaviour step, and reaching it through a
 * subclass is the sanctioned way rather than casting the AI to `any`.
 *
 * The three abstract members are sensors and the action selector; the feature
 * under test runs before any of them, and stubbing them is what lets a test
 * exercise one behaviour step without standing up a whole survivor AI.
 */
class TestableAI extends BaseAI {
  equipBestItems(): ReturnType<BaseAI["behaviorEquipBestItems"]> {
    return this.behaviorEquipBestItems(game, true, true);
  }
  createSensors(): void {}
  updateSensors(): never[] {
    return [];
  }
  selectAction(): null {
    return null;
  }
}

/** The item an `ActionUnequipItem` is about; the field is private. */
const unequipped = (a: ActionUnequipItem): unknown =>
  (a as unknown as { item: unknown }).item;

beforeEach(() => {
  new GameActors();
  new GameItems();
  new GameTiles();
  game = new RogueGame(new NullRogueUI());
  map = new GameMap(1, "test", 40, 40);
  map.lighting = Lighting.DARKNESS; // the AI wants a light in here
  npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "npc");
  map.placeActor(npc, new Point(20, 20));
  ai = new TestableAI();
  // The actor is attached with `takeControl`, not passed to the constructor --
  // `AIController` owns that lifecycle, and `takeControl` is also what builds the
  // sensors. Constructing with the actor (as a first reading suggests) silently
  // leaves `controlledActor` null.
  ai.takeControl(npc);
});

/** A cell phone and a working torch, both marked as being in the left hand. */
function holdBoth(): { phone: ItemTracker; light: ItemLight } {
  const phone = new ItemTracker(Models.items.get(ItemID.TRACKER_CELL_PHONE));
  const light = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
  npc.inventory!.addAll(phone);
  npc.inventory!.addAll(light);
  phone.equippedPart = DollPart.LEFT_HAND;
  light.equippedPart = DollPart.LEFT_HAND;
  return { phone, light };
}

describe("Feature.LightPriority: one left hand, two things to hold", () => {
  it("throws the cell phone away to keep the light", () => {
    // The assertion that separates the fork from vanilla. Vanilla *prefers* the
    // phone; the fork's `eqLight == null` guard fails, its `else` arm fires, and
    // the AI actively drops the phone to free the hand. So this is not "prefer
    // light" -- it is "prefer light enough to throw the phone away".
    const { phone } = holdBoth();
    const action = ai.equipBestItems();
    expect(action, "an action is produced").not.toBeNull();
    expect(action).toBeInstanceOf(ActionUnequipItem);
    expect(unequipped(action as ActionUnequipItem)).toBe(phone);
  });


  it("does not touch either when the light is already alone in the hand", () => {
    // With no phone at all, the light step succeeds and the phone step has
    // nothing to do. Guards against a version of the guard that drops a light the
    // AI is happy with.
    const light = new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
    npc.inventory!.addAll(light);
    light.equippedPart = DollPart.LEFT_HAND;
    const action = ai.equipBestItems();
    if (action instanceof ActionUnequipItem) {
      expect(unequipped(action as ActionUnequipItem), "never drops the light").not.toBe(light);
    }
  });
});

describe("Feature.LightPriority: ordering", () => {
  it("is one implementation with a chosen order, not two copies", () => {
    /**
     * The order is asserted **structurally, not behaviourally**, and that is a
     * deliberate choice worth stating.
     *
     * The obvious behavioural test -- an NPC in the dark with both a torch and a
     * phone -- does not distinguish the two rulesets, and two attempts to make it
     * do so failed for the same underlying reason. Only one item can be in the
     * left hand, and whenever a light *is* equipped the phone step can only
     * return "unequip phone" or nothing (there is no phone to unequip, because the
     * hand is full), so both orders return the same thing. The orders diverge
     * only when no light is equipped *and* the light step can produce an action,
     * and reaching that state needs `getBestLight` to select a specific light,
     * which turned out to depend on taboo state and battery levels deep in the
     * AI -- more scaffolding than the two-line ternary is worth.
     *
     * So the ternary itself is the assertion, and it is asserted exactly: the
     * flag selects `[stepLight, stepPhone]` under Still Alive and the reverse
     * under CLASSIC. The user-visible consequence -- dropping the phone -- is
     * covered behaviourally above.
     *
     * The second half of this test is the part most likely to rot for a different
     * reason: the two rulesets must not each get their own copy of the block, or
     * adding a third left-hand item means remembering to add it twice and the two
     * drift apart silently.
     */
    const src = readFileSync(join(__dirname, "../src/gameplay/ai/BaseAI.ts"), "utf8");
    expect(src, "the order is selected by the flag").toContain("const lightsFirst =");
    const start = src.indexOf("const lightsFirst =");
    const window = src.slice(start, start + 2500);
    expect(window.match(/const stepLight =/g) ?? [], "one stepLight").toHaveLength(1);
    expect(window.match(/const stepPhone =/g) ?? [], "one stepPhone").toHaveLength(1);
    expect(window).toContain("lightsFirst ? [stepLight, stepPhone] : [stepPhone, stepLight]");

    // The flag itself, and the `!eqLight` guard, are pinned here for the same
    // reason the order is: neither is behaviourally decidable in a test, because
    // only one item fits in the left hand. Dropping the guard changes nothing
    // observable -- when a light is equipped there is no phone equipped to
    // replace it with -- and dropping the gate changes nothing in the one
    // reachable setup. Both mutations pass the behavioural tests, so the only
    // place they can be caught is here, and pretending otherwise would leave two
    // silent holes in the feature.
    expect(window).toContain("hasFeature(Session.get().ruleset, Feature.LightPriority)");
    expect(window).toContain("if (!eqLight && allowCellPhones && this.wantsCellPhoneEquipped(game))");
  });
});

describe("Feature.LightPriority: the registry", () => {
  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.LightPriority)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.LightPriority)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

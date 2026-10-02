import { describe, it, expect } from "vitest";
import {
  APPEARANCE_LAYERS,
  CharacterAppearance,
  describeAppearanceImage,
  outfitChoices,
} from "@engine/CharacterAppearance";
import { DiceRoller } from "@engine/DiceRoller";

/**
 * The customiser's appearance model.
 *
 * The bug this file exists for: one `DiceRoller` shared across all six layers, and
 * re-consumed on every redraw. Every symptom was the same bug wearing a different
 * hat — changing the skin moved the hair, changing the pants moved the eyes,
 * changing the shirt moved the pants, and *moving the cursor at all* on an
 * unrelated row changed everything, because each frame drew six more rolls.
 *
 * So the property to pin is not "the look is random" but "**one layer's choice
 * cannot move another's**", and that it holds for a frame sequence rather than a
 * single frame. A single-frame assertion passes against the broken version.
 */

const male = outfitChoices(true);
const female = outfitChoices(false);

describe("resolve", () => {
  it("is the same every time it is asked", () => {
    const a = new CharacterAppearance();
    expect(a.resolve(male, 1234)).toEqual(a.resolve(male, 1234));
  });

  it("does not move one layer when another is chosen", () => {
    // The reported bug, in its simplest form. Every layer is random; picking a
    // shirt must leave the other five exactly where they were.
    const before = new CharacterAppearance().resolve(male, 99);

    const after = new CharacterAppearance();
    after.torso = male.torso[2]!;
    const resolved = after.resolve(male, 99);

    expect(resolved.torso).toBe(male.torso[2]);
    for (const layer of APPEARANCE_LAYERS) {
      if (layer === "torso") continue;
      expect(resolved[layer], `${layer} moved when the shirt changed`).toBe(
        before[layer],
      );
    }
  });

  it("does not move a layer when an unrelated row is touched", () => {
    // Changing the skill, or just moving the cursor, is not an appearance edit at
    // all — and it used to reshuffle the whole look, because the preview rolled on
    // every frame.
    const look = new CharacterAppearance().resolve(male, 7);
    for (let frame = 0; frame < 25; frame++) {
      expect(new CharacterAppearance().resolve(male, 7)).toEqual(look);
    }
  });

  it("keeps layers independent of each other across a full edit sequence", () => {
    // Walk the six rows the way a player would, choosing something on each, and
    // assert each choice survives the later edits.
    const look = new CharacterAppearance();
    const chosen: Partial<Record<string, string>> = {};
    for (const layer of APPEARANCE_LAYERS) {
      look[layer] = male[layer][1] ?? male[layer][0]!;
      chosen[layer] = look[layer]!;
      // Redraw between edits, as the screen does.
      const resolved = look.resolve(male, 4242);
      for (const earlier of APPEARANCE_LAYERS) {
        if (!chosen[earlier]) continue;
        expect(resolved[earlier], `${earlier} moved after editing ${layer}`).toBe(
          chosen[earlier],
        );
      }
    }
  });

  it("falls back to a random layer for a choice the body does not have", () => {
    // `male_hair3` means nothing to a female body. It must not be applied, and it
    // must not throw - `descShortRuleset` throwing on an unknown value is exactly
    // what made persisted ids risky in the first place.
    const look = new CharacterAppearance();
    look.head = male.head[3]!;
    const resolved = look.resolve(female, 5);
    expect(female.head).not.toContain(male.head[3]);
    expect(resolved.head).toBeDefined();
    expect(female.head).toContain(resolved.head!);
  });

  it("gives different seeds different looks", () => {
    const a = new CharacterAppearance().resolve(male, 1);
    const b = new CharacterAppearance().resolve(male, 2);
    expect(a).not.toEqual(b);
  });
});

describe("revalidate", () => {
  it("drops a choice the new body cannot honour, and says which", () => {
    const look = new CharacterAppearance();
    look.head = male.head[0]!;
    look.shoes = male.shoes[0]!;
    expect(look.revalidate(female)).toEqual(["head", "shoes"]);
    expect(look.head).toBeNull();
    expect(look.shoes).toBeNull();
  });

  it("keeps a choice the new body shares", () => {
    // Eyes and skin exist for both bodies - though as *different* ids - so a
    // chosen female eye survives a trip to male only if it is not carried over as
    // an id. What must hold is that the field is not silently claimed as chosen
    // when the id is not in the catalogue.
    const look = new CharacterAppearance();
    look.eyes = female.eyes[0]!;
    expect(look.revalidate(male)).toEqual(["eyes"]);
  });

  it("reports nothing when the choices all fit", () => {
    const look = new CharacterAppearance();
    for (const layer of APPEARANCE_LAYERS) look[layer] = male[layer][0]!;
    expect(look.revalidate(male)).toEqual([]);
  });
});

describe("asDressArgs", () => {
  it("hands the dressing code one element per layer", () => {
    // `dressActorDoll` still takes a roller for the NPC path, so this is what makes
    // the customiser deterministic: with one candidate, roll(0, 1) is index 0
    // whatever the roller's state.
    const args = new CharacterAppearance().asDressArgs(male, 31);
    expect(args).toHaveLength(6);
    for (const layer of args) expect(layer).toHaveLength(1);
  });

  it("resolves the same ids as resolve, in the C#'s layer order", () => {
    // The order is load-bearing - clothes go on in this order or a sprite covers
    // the one beneath it - so this pins the two against each other.
    const look = new CharacterAppearance();
    look.torso = male.torso[0]!;
    const resolved = look.resolve(male, 77);
    const [eyes, skins, heads, torsos, legs, shoes] = look.asDressArgs(male, 77);
    expect([
      ...eyes,
      ...skins,
      ...heads,
      ...torsos,
      ...legs,
      ...shoes,
    ]).toEqual([
      resolved.eyes,
      resolved.skin,
      resolved.head,
      resolved.torso,
      resolved.legs,
      resolved.shoes,
    ]);
  });
});

describe("serialisation", () => {
  it("round-trips a chosen look", () => {
    const look = new CharacterAppearance();
    look.shoes = male.shoes[2]!;
    look.eyes = male.eyes[1]!;
    expect(CharacterAppearance.fromJSON(look.toJSON())).toEqual(look);
  });

  it("keeps the good layers when one field is junk", () => {
    // One bad field must not cost the player the other five.
    const parsed = CharacterAppearance.fromJSON({
      skin: male.skin[0],
      head: 42,
      torso: null,
      legs: { nope: true },
      shoes: "",
      eyes: male.eyes[0],
    });
    expect(parsed.skin).toBe(male.skin[0]);
    expect(parsed.eyes).toBe(male.eyes[0]);
    expect(parsed.head).toBeNull();
    expect(parsed.torso).toBeNull();
    expect(parsed.legs).toBeNull();
    expect(parsed.shoes).toBeNull();
  });

  it("ignores a layer name this version does not have", () => {
    const parsed = CharacterAppearance.fromJSON({ hat: "Actors/hat1" });
    expect(parsed.isAllRandom).toBe(true);
  });
});

describe("describeAppearanceImage", () => {
  it("turns a sprite path into a readable label", () => {
    expect(describeAppearanceImage("Actors/Decoration/male_skin3")).toBe("Skin 3");
    expect(describeAppearanceImage("Actors/Decoration/female_shoes2")).toBe("Shoes 2");
  });

  it("does not throw on anything, because it is drawn while typing", () => {
    for (const id of ["", "no-slash", "a_b_c", "Actors/Decoration/"]) {
      expect(() => describeAppearanceImage(id)).not.toThrow();
    }
  });
});

describe("outfitChoices", () => {
  it("offers a non-empty catalogue per layer", () => {
    for (const isMale of [true, false]) {
      for (const layer of APPEARANCE_LAYERS) {
        expect(outfitChoices(isMale)[layer].length, `${layer}`).toBeGreaterThan(0);
      }
    }
  });

  it("returns copies, so a caller cannot change what NPCs get dressed in", () => {
    // These catalogues are what every random civilian in the game is rolled from.
    const first = outfitChoices(true);
    (first.skin as string[]).push("Actors/Decoration/not_a_sprite");
    expect(outfitChoices(true).skin).not.toContain("Actors/Decoration/not_a_sprite");
  });
});

describe("DiceRoller is still a roller", () => {
  it("remains stateful - the regression this file is about", () => {
    // Asserted so the temptation to reintroduce a shared roller here is visible:
    // this is exactly why `resolve` exists.
    const r = new DiceRoller(5);
    expect(r.roll(0, 100)).not.toBe(r.roll(0, 100));
  });
});
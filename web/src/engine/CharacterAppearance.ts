import { BaseMapGenerator } from "@gameplay/generators/BaseMapGenerator";
import { DollPart } from "@data/Doll";

/**
 * The player's chosen appearance: one sprite per doll layer, or `null` for "roll
 * it", which is the default and the only value a first run has.
 *
 * **A module, not fields on `CharGen` or `RogueGame`.** It is a self-contained
 * value with its own validation and serialisation, and §6 of the port plan is
 * about taking members *off* `RogueGame` — measured, the persistence work
 * already cost that class ten private members before it moved out.
 *
 * Stored as **image ids rather than catalogue indices** on purpose. An index is
 * only meaningful against one specific catalogue, and the catalogues are
 * per-sex: a `male_hair3` chosen and then switched to a female body would either
 * throw or silently mean `female_hair3`. An id is checked against the catalogue
 * that is actually on offer and simply falls back to random when it is not there.
 */
export type AppearanceLayer = "eyes" | "skin" | "head" | "torso" | "legs" | "shoes";

/** The six layers, in the order the character screen lists them. */
export const APPEARANCE_LAYERS: readonly AppearanceLayer[] = [
  "skin",
  "head",
  "torso",
  "legs",
  "shoes",
  "eyes",
];

/** Row label per layer. `head` is the C#'s `HEAD` layer: hair, not a body shape. */
export const APPEARANCE_LAYER_LABELS: Readonly<Record<AppearanceLayer, string>> = {
  skin: "Skin ",
  head: "Hair ",
  torso: "Shirt",
  legs: "Pants",
  shoes: "Shoes",
  eyes: "Eyes ",
};

/** Which `DollPart` each layer draws into, for preview and for tests. */
export const APPEARANCE_LAYER_PARTS: Readonly<Record<AppearanceLayer, DollPart>> = {
  skin: DollPart.SKIN,
  head: DollPart.HEAD,
  torso: DollPart.TORSO,
  legs: DollPart.LEGS,
  shoes: DollPart.FEET,
  eyes: DollPart.EYES,
};

/** The layers available to one body, as the choices on offer. */
export type OutfitChoices = Readonly<Record<AppearanceLayer, readonly string[]>>;

/**
 * A readable label for an image id, derived rather than tabulated.
 *
 * `Actors/Decoration/male_skin3` becomes `Skin 3`, and `female_shoes2` becomes
 * `Shoes 2`. A parallel table of labels would be a second thing to keep in step
 * with the catalogue, and this way adding a sprite adds an option rather than
 * needing a string written for it.
 */
export function describeAppearanceImage(imageId: string): string {
  const leaf = imageId.slice(imageId.lastIndexOf("/") + 1);
  // `male_skin3` -> ["male", "skin", "3"]. The leading token is the body, which
  // the row already says, so it is dropped.
  const parts = leaf.split("_");
  const body = parts[0] ?? "";
  const rest = parts.slice(1);
  const words: string[] = [];
  for (const word of rest) {
    if (/^\d+$/.test(word)) {
      words.push(word);
      continue;
    }
    words.push(word.charAt(0).toUpperCase() + word.slice(1));
  }
  const label = words.join(" ");
  return label === "" ? body : label;
}

export class CharacterAppearance {
  eyes: string | null = null;
  skin: string | null = null;
  head: string | null = null;
  torso: string | null = null;
  legs: string | null = null;
  shoes: string | null = null;

  /** True when every layer is still "roll it", which is a first run. */
  get isAllRandom(): boolean {
    return APPEARANCE_LAYERS.every((l) => this[l] === null);
  }

  clone(): CharacterAppearance {
    const out = new CharacterAppearance();
    for (const l of APPEARANCE_LAYERS) out[l] = this[l];
    return out;
  }

  /**
   * Clears every layer whose choice is not on offer for this body.
   *
   * Called when the player switches sex, because the catalogues are per-sex and
   * `male_hair3` means nothing to a female body. Left in place it would either be
   * ignored or, worse, be reported as chosen while the preview showed something
   * else.
   *
   * Returns the layers it cleared, so the caller can say so rather than having
   * the player's hair quietly change.
   */
  revalidate(choices: OutfitChoices): AppearanceLayer[] {
    const cleared: AppearanceLayer[] = [];
    for (const l of APPEARANCE_LAYERS) {
      const chosen = this[l];
      if (chosen !== null && !choices[l].includes(chosen)) {
        this[l] = null;
        cleared.push(l);
      }
    }
    return cleared;
  }

  /**
   * The six arrays `dressCivilian` wants: a chosen layer becomes a
   * single-element array, an unchosen one becomes the whole catalogue so the
   * roller still picks from it.
   *
   * **All six or none.** `dressCivilian` falls back to a fully random dress if
   * any layer is missing, so passing a mix would discard the specific choices
   * along with the random ones. Expanding here keeps that contract intact.
   */
  asDressArgs(choices: OutfitChoices): [string[], string[], string[], string[], string[], string[]] {
    const arg = (l: AppearanceLayer): string[] => {
      const chosen = this[l];
      if (chosen !== null && choices[l].includes(chosen)) return [chosen];
      return [...choices[l]];
    };
    return [
      arg("eyes"),
      arg("skin"),
      arg("head"),
      arg("torso"),
      arg("legs"),
      arg("shoes"),
    ];
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const l of APPEARANCE_LAYERS) {
      const v = this[l];
      if (v !== null) out[l] = v;
    }
    return out;
  }

  /**
   * Reads a stored record, keeping only layers that are a non-empty string.
   *
   * Everything else — a number, a nested object, a layer name this version does
   * not have — is dropped rather than rejected, so one bad field cannot cost the
   * player the other five. An id that is no longer in the catalogue is caught
   * later by `revalidate`.
   */
  static fromJSON(raw: unknown): CharacterAppearance {
    const out = new CharacterAppearance();
    if (typeof raw !== "object" || raw === null) return out;
    const rec = raw as Record<string, unknown>;
    for (const l of APPEARANCE_LAYERS) {
      const v = rec[l];
      if (typeof v === "string" && v !== "") out[l] = v;
    }
    return out;
  }
}

/** The layers on offer for a body. */
export function outfitChoices(isMale: boolean): OutfitChoices {
  return BaseMapGenerator.civilianOutfitChoices(isMale);
}
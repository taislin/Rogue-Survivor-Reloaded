import { describe, it, expect } from "vitest";
import {
  DEFAULT_IMAGE_SET,
  IMAGE_SETS,
  imagePathIn,
  imageRoutes,
  setImageSet,
  getImageSet,
  spriteChainFor,
} from "@engine/AssetPaths";
import { GameOptions } from "@engine/GameOptions";

/**
 * Sprite-style routing.
 *
 * The fallback used to be hardcoded to `classic`, so a style could only say "this
 * set, else the original". The combination people actually want — Genesis actors
 * over a Deonapocalypse world — needs two sets in an order *and* a way to say
 * which sprites the first one applies to.
 *
 * That second half is the part that is easy to get wrong, and getting it wrong
 * fails quietly. Genesis is a *variant of the classic set*, not an actors-only
 * pack: it ships all seven categories, and 336 of its 339 sprites also exist in
 * Deonapocalypse, with **zero** Genesis-only. So a plain ordered chain would have
 * answered "Genesis first" for every sprite and produced Genesis tiles, items and
 * icons as well — the option would have looked right and been wrong.
 *
 * Hence routes: a list of `{prefix, chain}` per style, first match wins, catch-all
 * last. The assertions below are per *sprite* for that reason; a per-style
 * assertion would pass against the broken version.
 */

const ACTOR = "Actors/Decoration/male_skin1";
const WALL = "Tiles/Decoration/scorched_inner_floor";

describe("spriteChainFor", () => {
  it("sends actors to Genesis and everything else to Deonapocalypse", () => {
    // The request, stated as the two assertions that matter.
    const set = "genesis_actors_on_deonapocalypse" as const;
    expect(spriteChainFor(set, ACTOR)[0]).toBe("genesis_classic_1.4");
    expect(spriteChainFor(set, WALL)[0]).toBe("deonapocalypse_v9_r1");
  });

  it("does not let Genesis supply art beyond actors", () => {
    // Every category Genesis actually ships, checked explicitly. A route list with
    // the catch-all first, or with the Actors prefix written as `Actors` and
    // missing the separator, would pass the test above for one sprite and fail
    // quietly for the rest of the game.
    const set = "genesis_actors_on_deonapocalypse" as const;
    for (const prefix of [
      "Tiles/",
      "Items/",
      "Icons/",
      "MapObjects/",
      "Activities/",
      "Effects/",
    ]) {
      expect(spriteChainFor(set, `${prefix}anything`)[0], prefix).toBe(
        "deonapocalypse_v9_r1",
      );
    }
  });

  it("routes the doll layers too, since they live under Actors", () => {
    // Customiser sprites are what a player compares side by side, so a route that
    // missed these would be the most visible possible miss.
    const set = "genesis_actors_on_deonapocalypse" as const;
    for (const id of [
      "Actors/skeleton",
      "Actors/zombie",
      "Actors/Decoration/female_hair3",
      "Actors/Decoration/male_shoes2",
    ]) {
      expect(spriteChainFor(set, id)[0], id).toBe("genesis_classic_1.4");
    }
  });

  it("matches on backslashes as well as slashes", () => {
    // Ids are written both ways in `GameImages`, and a prefix that only matched
    // one of them would drop half the actors back to Deonapocalypse.
    const set = "genesis_actors_on_deonapocalypse" as const;
    expect(spriteChainFor(set, "Actors\\Decoration\\male_skin1")[0]).toBe(
      "genesis_classic_1.4",
    );
  });

  it("ends every chain at classic, the complete set", () => {
    // An id missing from a variant must still draw, from the original game, rather
    // than leaving a hole in the world.
    for (const set of IMAGE_SETS) {
      for (const id of [ACTOR, WALL, "Actors/Decoration/male_eyes1"]) {
        const chain = spriteChainFor(set, id);
        expect(chain[chain.length - 1], `${set} / ${id}`).toBe(DEFAULT_IMAGE_SET);
      }
    }
  });

  it("never repeats a set within a chain", () => {
    // A repeat is a wasted failed request per frame for every sprite that misses.
    for (const set of IMAGE_SETS) {
      for (const id of [ACTOR, WALL]) {
        const chain = spriteChainFor(set, id);
        expect(new Set(chain).size, `${set} / ${id}`).toBe(chain.length);
      }
    }
  });

  it("leaves the ordinary styles exactly as they were", () => {
    // One catch-all, own directory first: the behaviour the hardcoded fallback gave.
    expect(spriteChainFor("classic", ACTOR)).toEqual(["classic"]);
    expect(spriteChainFor("deonapocalypse_v9_r1", WALL)).toEqual([
      "deonapocalypse_v9_r1",
      "classic",
    ]);
    expect(spriteChainFor("genesis_classic_1.4", ACTOR)).toEqual([
      "genesis_classic_1.4",
      "classic",
    ]);
  });
});

describe("imageRoutes", () => {
  it("gives a routed style a catch-all last, and only one catch-all", () => {
    // Order is the whole mechanism, and a catch-all in the middle would shadow
    // every route after it.
    for (const set of IMAGE_SETS) {
      const routes = imageRoutes(set);
      const catchAlls = routes.filter((r) => r.prefix === "");
      expect(catchAlls.length, `${set} has ${catchAlls.length} catch-alls`).toBe(1);
      expect(routes[routes.length - 1]!.prefix, `${set}`).toBe("");
    }
  });

  it("names only real styles, so no route points at a folder that is not there", () => {
    // A typo would fail *silently*: every sprite in that route 404s and the next
    // one answers, so the game looks fine and the style is quietly not applied.
    for (const set of IMAGE_SETS) {
      for (const route of imageRoutes(set)) {
        for (const entry of route.chain) {
          expect(IMAGE_SETS, `${set} route names ${entry}`).toContain(entry);
        }
      }
    }
  });

  it("orders the combined style's routes before its catch-all", () => {
    const routes = imageRoutes("genesis_actors_on_deonapocalypse");
    expect(routes[0]!.prefix).toBe("Actors/");
    expect(routes[routes.length - 1]!.prefix).toBe("");
  });
});

describe("the option", () => {
  it("names the combined style after where the art comes from", () => {
    // It is not a folder, so the folder-name prettifier renders it as a path.
    expect(GameOptions.spriteStyleName("genesis_actors_on_deonapocalypse")).toBe(
      "Genesis actors, Deonapocalypse world",
    );
    expect(GameOptions.spriteStyleName("deonapocalypse_v9_r1")).toBe(
      "deonapocalypse v9 r1",
    );
    expect(GameOptions.spriteStyleName(DEFAULT_IMAGE_SET)).toContain("(complete set)");
  });

  it("is reachable, because IMAGE_SETS is what the options screen bounds against", () => {
    expect(IMAGE_SETS).toContain("genesis_actors_on_deonapocalypse");
  });

  it("can be selected, and an unknown name still falls back to classic", () => {
    // An unknown name silently becoming `classic` is what keeps a stale saved
    // options file from pointing at art that is not there.
    try {
      setImageSet("genesis_actors_on_deonapocalypse");
      expect(getImageSet()).toBe("genesis_actors_on_deonapocalypse");
      setImageSet("no_such_sprite_set");
      expect(getImageSet()).toBe(DEFAULT_IMAGE_SET);
    } finally {
      setImageSet(DEFAULT_IMAGE_SET);
    }
  });
});

describe("imagePathIn", () => {
  it("resolves against the set the sprite was found in", () => {
    // The fallback asks for each set by name, so the path is per-set: by the time a
    // fallback is tried, the current style is still the selected one.
    expect(imagePathIn("genesis_classic_1.4", ACTOR)).toMatch(
      /assets\/images\/genesis_classic_1\.4\/Actors\/Decoration\/male_skin1\.webp$/,
    );
    expect(imagePathIn("deonapocalypse_v9_r1", "Tiles\\Decoration\\wall")).toMatch(
      /assets\/images\/deonapocalypse_v9_r1\/Tiles\/Decoration\/wall\.webp$/,
    );
  });
});

import { describe, it, expect } from "vitest";
import {
  DEFAULT_IMAGE_SET,
  IMAGE_SETS,
  imagePathIn,
  imageRoutes,
  setImageSet,
  getImageSet,
  spriteChainFor,
  isFolderBacked,
} from "@engine/AssetPaths";
import { GameOptions } from "@engine/GameOptions";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const IMAGES_DIR = join(__dirname, "../public/assets/images");

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
    expect(IMAGE_SETS).toContain("civ13");
    // And selecting it resolves through it, falling back to classic for the one
    // sprite it does not ship.
    try {
      setImageSet("civ13");
      expect(getImageSet()).toBe("civ13");
      expect(imagePathIn("civ13", "Actors/zombie")).toContain("/images/civ13/");
      expect(spriteChainFor("civ13", "menu_title")).toEqual(["civ13", "classic"]);
    } finally {
      setImageSet(DEFAULT_IMAGE_SET);
    }
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

describe("civ13", () => {
  /**
   * The measurements behind civ13 being a *complete* set rather than a variant.
   *
   * Recorded because the decision is not obvious from the folder: Genesis shipped
   * all seven categories and turned out to be a variant of the classic set, which
   * is what made this a routing system at all. A set that looks like a pack can be
   * a variant, and getting that wrong produces an option that looks right and is
   * quietly wrong. So the numbers are pinned rather than assumed.
   */
  const idsIn = (set: string): Set<string> => {
    const out = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".db")) continue;
        else out.add(relative(join(IMAGES_DIR, set), p).replace(/\\/g, "/").replace(/\.[^.]+$/, ""));
      }
    };
    walk(join(IMAGES_DIR, set));
    return out;
  };

it("is a folder, so the ordinary single-chain shape applies", () => {
expect(imageRoutes("civ13")).toEqual([{ prefix: "", chain: ["civ13", "classic"] }]);
});

  it("ships all seven categories, so it needs no per-category routing", () => {
    const civ = idsIn("civ13");
    const categories = new Set([...civ].map((id) => id.split("/")[0]));
    for (const cat of ["Activities", "Actors", "Effects", "Icons", "Items", "MapObjects", "Tiles"]) {
      expect(categories.has(cat), `civ13 ships no ${cat}`).toBe(true);
    }
  });

  it("shares 1 107 of its 1 113 ids with classic", () => {
    const civ = idsIn("civ13");
    const classic = idsIn("classic");
    expect(civ.size).toBe(1113);
    expect(classic.size).toBe(1108);

    // The six civ13 has and classic does not. Three are referenced by the code
    // (`scent_living_supressor`, `crate`, `wall_char_office`) and three are not
    // (`personal_enemy_*`), so they are extras rather than a compatibility gap.
    const civOnly = [...civ].filter((id) => !classic.has(id)).sort();
    expect(civOnly).toEqual([
      "Icons/personal_enemy_mutual",
      "Icons/personal_enemy_other",
      "Icons/personal_enemy_self",
      "Icons/scent_living_supressor",
      "MapObjects/crate",
      "Tiles/Decoration/wall_char_office",
    ]);

    // And the one classic has that civ13 does not, which is the single sprite a
    // civ13 player borrows from the fallback.
    const borrowed = [...classic].filter((id) => !civ.has(id)).sort();
    expect(borrowed).toEqual(["menu_title"]);
  });

  it("has no filename whose case differs from the id the code asks for", () => {
    // This project has shipped two assets whose id did not match their filename's
    // capitalisation - `farm_fence_ew` vs `farm_fence_EW`, and
    // `ITEM_BIO_FORCE_GUN` - which 404 on a case-sensitive filesystem and work
    // perfectly on macOS and Windows. Two of this project's own defects were that.
    const civ = [...idsIn("civ13")];
    const classic = idsIn("classic");
    const classicLower = new Map([...classic].map((id) => [id.toLowerCase(), id]));
    const wrongCase = civ.filter(
      (id) => !classic.has(id) && classicLower.has(id.toLowerCase()),
    );
    expect(wrongCase, "these files differ from the classic id only in case").toEqual([]);
  });

  it("has a folder, and is folder-backed", () => {
    expect(existsSync(join(IMAGES_DIR, "civ13"))).toBe(true);
    expect(isFolderBacked("civ13")).toBe(true);
  });
});
/**
 * `Feature.CHARResearchRaid` — the factories and constants the raid calls.
 *
 * Still Alive, Release 8-1 (the black-ops and shopping-mall tracks are 6-1/7-3).
 *
 * The encounter itself lives in `RogueGame`, which is not what this file covers.
 * What it covers is everything the encounter reaches for and that nothing else
 * exercises: `createNewCHARScientist` is called only by the CHAR underground
 * generator and by the raid, `makeItemCHARLaptop` only by that factory, and the
 * `CHAR_LAPTOP` model only by that maker. Without this file all three sit in the
 * build passing `tsc` — the enum members are real, the classes are imported — and
 * the first thing that would catch a mistake is a CHAR scientist spawning with no
 * laptop in a generated map.
 *
 * The loot list and the decoration set are asserted **against the C# text**, not
 * against "whatever the factory happens to do". A factory that silently lost its
 * third army ration would pass every other kind of test here; it would not pass
 * this one.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { Actor } from "@data/Actor";
import { DollPart } from "@data/Doll";
import { Models } from "@data/Models";
import { Item } from "@data/Item";
import { DiceRoller } from "@engine/DiceRoller";
import { ActorID } from "@gameplay/GameActors";
import { FactionID } from "@gameplay/GameFactions";
import { GameImages } from "@gameplay/GameImages";
import { ItemID } from "@gameplay/GameItems";
import { SkillID } from "@gameplay/Skills";
import { GameMusics, MUSIC_FILES } from "@gameplay/GameSounds";
import { GameMode, RaidType, Session } from "@engine/Session";
import { imagePath } from "@engine/AssetPaths";
import { publicFilePath } from "./helpers/assetPath";

/**
 * One game for the whole file, for the reason every other suite says it:
 * `Session.get()` is a process-wide singleton and the model databases self-register
 * into `Models` on construction. The generator needs a `Game` and a `Parameters`,
 * which the C# passes by struct copy and TS cannot.
 */
const runner = new HeadlessRunner(4242);
const gen = new StdTownGenerator(runner.rogueGame, new TownParameters());

/** A fixed spawn turn, so nothing here depends on the session clock. */
const SPAWN_TIME = 0;

/** The generator's own roller, so `dressCHARScientist` is exercised as written. */
const roller = (): DiceRoller => new DiceRoller(4242);

/** An undressed CHAR scientist, straight off the model row. */
const rawScientist = (): Actor =>
  Models.actors.get(ActorID.CHAR_SCIENTIST)!.createNumberedName(
    Models.factions.get(FactionID.TheCHARCorporation)!,
    SPAWN_TIME,
  );

// ── createNewCHARScientist ───────────────────────────────────────────────────

describe("createNewCHARScientist", () => {
  const make = (): Actor => gen.createNewCHARScientist(SPAWN_TIME);

  it("builds one CHAR scientist in the CHAR faction", () => {
    // C# BaseTownGenerator.cs:11757-11760: `m_Game.GameActors.CHARScientist`,
    // created numbered into `TheCHARCorporation`.
    const a = make();
    expect(a.model.id).toBe(ActorID.CHAR_SCIENTIST);
    expect(a.faction.id).toBe(FactionID.TheCHARCorporation);
  });

  it("is the CHAR scientist, not the guard", () => {
    // Guards the substitution this factory replaced: the underground generator used
    // to call `createNewCHARGuard` here, so a copy-paste that reverted the model
    // would look identical from the outside except for the name.
    const scientist = make();
    const guard = gen.createNewCHARGuard(SPAWN_TIME);
    expect(scientist.model.id).not.toBe(guard.model.id);
    expect(scientist.name.startsWith("Dr. ")).toBe(true);
    expect(guard.name.startsWith("Gd. ")).toBe(true);
  });

  it("prefixes every name with 'Dr. '", () => {
    // C# :11765 — `newScientist.Name = "Dr. " + newScientist.Name`. The prefix is
    // the *only* thing separating the raid's leader from its colleagues, since
    // the C# has one factory for both.
    const names: string[] = [];
    for (let i = 0; i < 8; i++) names.push(make().name);
    for (const n of names) expect(n.startsWith("Dr. "), `name was "${n}"`).toBe(true);
  });

  it("gives a leader plus exactly three colleagues the same shape", () => {
    // C# RogueGame.cs:28740-28750 spawns `SCIENTISTS_TEAM_SCIENTISTS` (4)
    // scientists: one leader, then three colleagues that all call this same factory.
    // Built the way the raid builds it rather than read off the constant, so the
    // assertion stays about the factory.
    const team = [make(), make(), make(), make()];
    expect(team.length).toBe(4);

    const shapes = team.map((a) => ({
      model: a.model.id,
      prefix: a.name.slice(0, 4),
      items: a.inventory!.items.map((i) => i.model.id).sort((x, y) => x - y),
    }));
    for (const s of shapes) {
      expect(s.model).toBe(shapes[0].model);
      expect(s.prefix).toBe("Dr. ");
      expect(s.items).toEqual(shapes[0].items);
    }
  });

  it("has no names colliding within a team", () => {
    // `createNumberedName` is what stops four "Dr. " actors sharing one name; if
    // the model row lost its numbered-name support the raid would have four
    // indistinguishable leaders.
    const names = new Set([make().name, make().name, make().name, make().name]);
    expect(names.size).toBe(4);
  });

  it("wears the scientist decorations, not the guard's", () => {
    const a = make();
    // The C# adds SKIN, TORSO, HEAD, LEGS and stops (:174-177).
    expect(a.doll.getDecorations(DollPart.TORSO)).not.toBeNull();
    expect(a.doll.getDecorations(DollPart.HEAD)).not.toBeNull();
    expect(a.doll.getDecorations(DollPart.LEGS)).not.toBeNull();
    expect(a.doll.getDecorations(DollPart.EYES)).toBeNull();
  });

  it("has the starting skills the C# spells out one call at a time", () => {
    // C# :11768-11777 — HAULER x3, NECROLOGY x5, STRONG_PSYCHE x2.
    const level = (id: SkillID): number => make().sheet.skillTable.getSkillLevel(id);
    expect(level(SkillID.HAULER)).toBe(3);
    expect(level(SkillID.NECROLOGY)).toBe(5);
    expect(level(SkillID.STRONG_PSYCHE)).toBe(2);
  });

  it("carries exactly the C# loot list", () => {
    // C# :11780-11792, in order. Three army rations because there are three
    // `MakeItemArmyRation()` calls, not a quantity of 3 — transcribing it as one
    // call with `quantity = 3` would be a different inventory.
    const ids = make().inventory!.items.map((i) => i.model.id);

    const has = (factory: () => Item): boolean =>
      ids.includes(factory().model.id);
    expect(has(() => gen.makeItemCHARLaptop()), "no CHAR laptop").toBe(true);
    expect(has(() => gen.makeItemZTracker()), "no Z tracker").toBe(true);
    expect(has(() => gen.makeItemPistol()), "no pistol").toBe(true);
    expect(has(() => gen.makeItemLightPistolAmmo()), "no light pistol ammo").toBe(true);
    expect(has(() => gen.makeItemBiohazardSuit()), "no biohazard suit").toBe(true);
    expect(has(() => gen.makeItemBigFlashlight()), "no big flashlight").toBe(true);

    // Exactly three rations, not "at least one".
    const rationId = gen.makeItemArmyRation().model.id;
    expect(ids.filter((id) => id === rationId).length).toBe(3);

    // Antiviral pills OR a large medikit: `Rules.hasAntiviralPills` decides, and
    // the port has no `AntiviralPills` option, so GM_STANDARD takes the medikit.
    const medikitId = gen.makeItemLargeMedikit().model.id;
    const pillsId = gen.makeItemPillsAntiviral().model.id;
    expect(ids.filter((id) => id === pillsId || id === medikitId).length).toBe(1);

    // And nothing beyond the list above: 9 distinct items, 10 slots.
    expect(ids.length).toBe(10);
  });

  it("holds the laptop it exists to be identified by", () => {
    // The laptop is what makes a scientist a *research* raid target rather than a
    // CHAR guard, so its absence is the failure that matters.
    const a = make();
    expect(a.inventory!.items.some((i) => i.model.id === ItemID.CHAR_LAPTOP)).toBe(true);
  });
});

// ── dressCHARScientist ───────────────────────────────────────────────────────

describe("dressCHARScientist", () => {
  it("produces the three decoration parts from the three CHARSCIENTIST arrays", () => {
    // C# BaseMapGenerator.cs:171-178 — SKIN (rolled from MALE_SKINS), TORSO, HEAD,
    // LEGS. One sprite per part, so unlike dressCHARGuard there is nothing to roll.
    const a = rawScientist();
    gen.dressCHARScientist(roller(), a);

    expect(a.doll.getDecorations(DollPart.TORSO)).toEqual([GameImages.CHARSCIENTIST_SHIRT]);
    expect(a.doll.getDecorations(DollPart.HEAD)).toEqual([GameImages.CHARSCIENTIST_HEAD]);
    expect(a.doll.getDecorations(DollPart.LEGS)).toEqual([GameImages.CHARSCIENTIST_PANTS]);
  });

  it("adds a male skin and no eyes decoration", () => {
    // The C# adds SKIN, TORSO, HEAD, LEGS and stops. `dressCHARGuard` adds EYES
    // first; porting that line would change how every scientist is drawn.
    const a = rawScientist();
    gen.dressCHARScientist(roller(), a);
    expect(a.doll.countDecorations(DollPart.SKIN)).toBeGreaterThan(0);
    expect(a.doll.getDecorations(DollPart.EYES)).toBeNull();
  });

  it("clears anything the actor already wore", () => {
    const a = rawScientist();
    gen.dressCHARGuard(roller(), a);
    expect(a.doll.getDecorations(DollPart.EYES)).not.toBeNull();

    gen.dressCHARScientist(roller(), a);
    expect(a.doll.getDecorations(DollPart.EYES)).toBeNull();
    expect(a.doll.getDecorations(DollPart.HEAD)).toEqual([GameImages.CHARSCIENTIST_HEAD]);
  });

  it("differs from the CHAR guard it used to be stood in for", () => {
    const guard = rawScientist();
    gen.dressCHARGuard(roller(), guard);
    expect(guard.doll.getDecorations(DollPart.HEAD)).toEqual([GameImages.CHARGUARD_HAIR]);
    expect(guard.doll.getDecorations(DollPart.HEAD))
      .not.toEqual([GameImages.CHARSCIENTIST_HEAD]);
  });
});

// ── makeItemCHARLaptop and the CHAR_LAPTOP model ─────────────────────────────

describe("makeItemCHARLaptop", () => {
  it("yields an item with the CHAR_LAPTOP id", () => {
    const item = gen.makeItemCHARLaptop();
    expect(item).toBeInstanceOf(Item);
    expect(item.model.id).toBe(ItemID.CHAR_LAPTOP);
  });

  it("is a plain item with no behaviour of its own", () => {
    // C# :2370-2373 is `new Item(model)`, not a subclass. If this became an
    // `ItemEntertainment` or similar, the raid's trade refusal would still work but
    // the item would start scoring in `rateItem`.
    expect(gen.makeItemCHARLaptop().constructor).toBe(Item);
  });

  it("has a registered model with the C#'s names and flavour text", () => {
    // C# GameItems.cs:3068-3073.
    const model = Models.items.get(ItemID.CHAR_LAPTOP)!;
    expect(model).toBeTruthy();
    expect(model.singleName).toBe("CHAR laptop");
    expect(model.pluralName).toBe("CHAR laptops");
    expect(model.imageId).toBe(GameImages.ITEM_CHAR_LAPTOP);
    expect(model.flavorDescription).toBe("It looks like they were doing some sort of research...");
  });

  it("picks up the backpack flag from postProcess", () => {
    // C# sets `CanGoInBackpacks = true` in the initialiser (Release 8-2); the port
    // applies it in one pass over the finished models, so this asserts the set
    // gained the id rather than the row setting it directly.
    expect(Models.items.get(ItemID.CHAR_LAPTOP)!.canGoInBackpacks).toBe(true);
  });

  it("uses a sprite that exists on disk", () => {
    const p = resolve(__dirname, "..", "public", publicFilePath(imagePath(GameImages.ITEM_CHAR_LAPTOP)));
    expect(existsSync(p), `${GameImages.ITEM_CHAR_LAPTOP} has no file`).toBe(true);
  });
});

// ── the four new sprite ids ──────────────────────────────────────────────────

describe("CHAR research sprites", () => {
  const IDS: Array<[string, string]> = [
    ["CHARSCIENTIST_HEAD", GameImages.CHARSCIENTIST_HEAD],
    ["CHARSCIENTIST_SHIRT", GameImages.CHARSCIENTIST_SHIRT],
    ["CHARSCIENTIST_PANTS", GameImages.CHARSCIENTIST_PANTS],
    ["ITEM_CHAR_LAPTOP", GameImages.ITEM_CHAR_LAPTOP],
  ];

  it.each(IDS)("%s resolves to a file on disk", (_name, id) => {
    // `sprite-assets.test.ts` resolves *every* GameImages id, so this is partly
    // redundant — but a failure there names the id without saying which feature
    // wanted it, and this is the file that would be read first.
    expect(id).toBeTruthy();
    const p = resolve(__dirname, "..", "public", publicFilePath(imagePath(id)));
    expect(existsSync(p), `${id} has no file`).toBe(true);
  });

  it("uses forward slashes, as the port's paths do", () => {
    // The C# spells these with backslashes; `imagePath` normalises, but the port's
    // own convention is the forward-slash form.
    for (const [, id] of IDS) expect(id).not.toContain("\\");
  });

  it("does not collide with the CHAR guard's decorations", () => {
    // Same actor family, different uniform: reusing charguard_hair here would make
    // a scientist and a guard indistinguishable on screen.
    expect(GameImages.CHARSCIENTIST_HEAD).not.toBe(GameImages.CHARGUARD_HAIR);
    expect(GameImages.CHARSCIENTIST_PANTS).not.toBe(GameImages.CHARGUARD_PANTS);
  });
});

// ── RaidType.CHAR_SCIENTISTS ─────────────────────────────────────────────────

describe("RaidType.CHAR_SCIENTISTS", () => {
  it("exists", () => {
    expect(RaidType.CHAR_SCIENTISTS).toBeTypeOf("number");
  });

  /**
   * The load-bearing assertion of this file for the enum. A raid type is a *slot
   * index* into `Session.m_Event_Raids`, sized `[RaidType._COUNT, x, y]` and written
   * by number. Inserting rather than appending shifts every member after the
   * insertion point, so a save written before the change would read its last-raid
   * turn for the wrong faction — silently, since the values stay in range.
   *
   * These numbers are the port's, asserted literally so a renumber shows up as a
   * failing test rather than as subtly wrong raid timing in a loaded save.
   */
  it("leaves every pre-existing member's value unchanged", () => {
    expect({
      _FIRST: RaidType._FIRST,
      BIKERS: RaidType.BIKERS,
      GANGSTA: RaidType.GANGSTA,
      BLACKOPS: RaidType.BLACKOPS,
      SURVIVORS: RaidType.SURVIVORS,
      NATGUARD: RaidType.NATGUARD,
      ARMY_SUPLLIES: RaidType.ARMY_SUPLLIES,
      HELICOPTER_RESCUE: RaidType.HELICOPTER_RESCUE,
    }).toEqual({
      _FIRST: 0,
      BIKERS: 0,
      GANGSTA: 1,
      BLACKOPS: 2,
      SURVIVORS: 3,
      NATGUARD: 4,
      ARMY_SUPLLIES: 5,
      HELICOPTER_RESCUE: 6,
    });
  });

  it("was appended, so it takes the last slot before _COUNT", () => {
    expect(RaidType.CHAR_SCIENTISTS).toBe(RaidType.HELICOPTER_RESCUE + 1);
    expect(RaidType.CHAR_SCIENTISTS).toBe(RaidType._COUNT - 1);
  });

  it("grows _COUNT by exactly one", () => {
    // 8 members now (the 7 above plus CHAR_SCIENTISTS); _COUNT was 7 before.
    expect(RaidType._COUNT).toBe(8);
  });
});

// ── ItemID.CHAR_LAPTOP is append-only ────────────────────────────────────────

describe("ItemID.CHAR_LAPTOP", () => {
  it("sits at the end of the enum, before _COUNT", () => {
    expect(ItemID.CHAR_LAPTOP).toBe(ItemID._COUNT - 1);
  });

  it("did not renumber the backpack rows above it", () => {
    // The five `Items_Backpacks.csv` rows landed at 172-176 and the sentinel was
    // 177; inserting the laptop mid-enum would have moved all six.
    expect(ItemID.BACKPACK_WAIST_POUCH).toBe(172);
    expect(ItemID.BACKPACK_SATCHEL).toBe(173);
    expect(ItemID.BACKPACK_DAYPACK).toBe(174);
    expect(ItemID.BACKPACK_HIKING_PACK).toBe(175);
    expect(ItemID.BACKPACK_ARMY_RUCKSACK).toBe(176);
    expect(ItemID.CHAR_LAPTOP).toBe(177);
    expect(ItemID._COUNT).toBe(178);
  });

  it("did not renumber the siphon kit, fishing rod or book either", () => {
    // The `FISHING_ROD` comment in GameItems.ts names the laptop as one of the ids
    // that mid-enum insertion would have shifted.
    expect(ItemID.SIPHON_KIT).toBe(169);
    expect(ItemID.FISHING_ROD).toBe(170);
    expect(ItemID.UNIQUE_BOOK_OF_ARMAMENTS).toBe(171);
  });

  it("has a model slot inside the array the db allocates", () => {
    // `new Array(ItemID._COUNT)` backs `GameItems.models`, so an id at or past
    // _COUNT would write outside it.
    expect(ItemID.CHAR_LAPTOP).toBeLessThan(ItemID._COUNT);
    expect(Models.items.get(ItemID.CHAR_LAPTOP)).toBeTruthy();
  });
});

// ── the three music tracks ───────────────────────────────────────────────────

describe("CHAR research raid music", () => {
  const TRACKS: Array<[string, string, string]> = [
    ["BLACK_OPS", GameMusics.BLACK_OPS, GameMusics.BLACK_OPS_FILE],
    ["CHAR_RESEARCHERS", GameMusics.CHAR_RESEARCHERS, GameMusics.CHAR_RESEARCHERS_FILE],
    ["SHOPPING_MALL", GameMusics.SHOPPING_MALL, GameMusics.SHOPPING_MALL_FILE],
  ];

  it("has a distinct id for each track", () => {
    const ids = TRACKS.map(([, id]) => id);
    expect(new Set(ids).size).toBe(3);
    for (const [, id] of TRACKS) expect(id).toBeTruthy();
  });

  it("points each _FILE at the music folder", () => {
    for (const [name, , file] of TRACKS) {
      expect(file.startsWith(GameMusics.PATH), `${name}_FILE is not under PATH`).toBe(true);
    }
  });

  it("maps every id through MUSIC_FILES to the file its _FILE names", () => {
    // The web port resolves the file at play time from this map rather than
    // pre-loading it, so an id missing here plays nothing at all — and only when
    // the raid fires, in the one game mode that reaches it.
    for (const [name, id, file] of TRACKS) {
      const base = file.slice(GameMusics.PATH.length);
      expect(MUSIC_FILES[id], `${name} is missing from MUSIC_FILES`).toBe(base);
    }
  });

  it.each(TRACKS)("%s resolves to an ogg that exists on disk", (_name, id) => {
    const base = MUSIC_FILES[id];
    const p = resolve(__dirname, "..", "public", "assets", "music", `${base}.ogg`);
    expect(existsSync(p), `assets/music/${base}.ogg has no file`).toBe(true);
  });
});

// ── the session the factories ran against ────────────────────────────────────

describe("test session", () => {
  it("is not the mode that selects antiviral pills", () => {
    // Named so a failure in the loot test above is not mistaken for a factory bug:
    // the medikit-versus-pills assertion depends on this being false.
    expect(Session.get().gameMode).not.toBe(GameMode.GM_CORPSES_INFECTION);
  });
});

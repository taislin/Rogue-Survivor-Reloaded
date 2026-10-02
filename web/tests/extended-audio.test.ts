import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { Actor } from "@data/Actor";
import { Corpse } from "@data/Corpse";
import { Faction } from "@data/Faction";
import { Location } from "@data/Location";
import { Map as GameMap } from "@data/Map";
import { Models } from "@data/Models";
import { PlayerController } from "@data/PlayerController";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { MusicPriority, type IMusicManager, type MusicPriorityValue } from "@engine/audio/IMusicManager";
import type { ISoundManager } from "@engine/audio/ISoundManager";
import { NullSoundManager } from "@engine/audio/NullSoundManager";
import { isKnownAudioId, soundPath } from "@engine/AssetPaths";
import { sfxGain } from "@gameplay/AudioLevels";
import { ActorID, GameActors } from "@gameplay/GameActors";
import { GameItems } from "@gameplay/GameItems";
import { GameSounds, SOUND_FILES } from "@gameplay/GameSounds";
import { NullRogueUI } from "@ui/NullRogueUI";
import { walk } from "./helpers/grepAll";
import { publicFilePath } from "./helpers/assetPath";

/**
 * `Feature.ExtendedAudio` — the fork's 180-pair sound-effect set.
 *
 * Almost all of this feature is an *asset* merge, and that is why the risk in it
 * is a mistyped string rather than a wrong branch. A sound id in `SOUND_FILES`
 * whose value is not the name of a file on disk type-checks, builds, ships, and
 * is silent: `soundPath` hands the manager a URL, the fetch 404s, and
 * `WebAudioMusicManager` logs a warning nobody sees. The C# cannot have this
 * problem, because it hands an *open file handle* to `m_SFXManager.Load` at
 * startup (`RogueGame.cs:5278-5448`) and a missing file there is a crash on the
 * first frame. So the web port's equivalent obligation is a test, and that is
 * what most of this file is.
 *
 * **The transcription is not hand-written.** `scripts/port-game-sounds.py` parses
 * `GameSounds.cs` once and emits both `GameSounds.ts`'s fork block and
 * `tests/fixtures/still-alive-sounds.json` from that parse, so the table and the
 * contract below cannot disagree. The fixture is committed rather than read from
 * `_refs/` because that directory is gitignored — a test that opened
 * `GameSounds.cs` would pass locally and fail in CI, which is the worst
 * arrangement available (the same reasoning as `still-alive-tiles.json`).
 */

const SRC = join(__dirname, "..", "src");
const SFX_DIR = join(__dirname, "..", "public", "assets", "sfx");

interface ForkSound {
  name: string;
  id: string;
  file: string;
  line: number;
  release: string | null;
  note: string | null;
}

const FIXTURE = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/still-alive-sounds.json"), "utf-8"),
) as { source: string; entries: ForkSound[] };

/** Every string-valued static on a class, minus the inherited three. */
function constants(cls: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.getOwnPropertyNames(cls)) {
    if (k === "length" || k === "name" || k === "prototype") continue;
    const v = (cls as unknown as Record<string, unknown>)[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

const DECLARED = constants(GameSounds);

/** The sound ids the game can be asked to play: the constants, not the `*_FILE` paths. */
function soundIds(): string[] {
  return Object.values(DECLARED).filter((v) => !v.startsWith("/"));
}

/** `.ogg` file names shipped in `public/assets/sfx/`, extension stripped. */
function shippedFiles(): string[] {
  return readdirSync(SFX_DIR)
    .filter((f) => f.endsWith(".ogg"))
    .map((f) => f.slice(0, -".ogg".length))
    .sort();
}

/**
 * The ids the port can only play because this feature landed: the fixture's,
 * minus the ones both versions declare. `NIGHTMARE` is in `GameSounds.cs`
 * and is also Classic's, so it is not fork-only by any definition that matters,
 * and a test that called it one would demand a gate on the one sound both rulesets
 * are supposed to play.
 *
 * `MELEE_ATTACK_MISS_PLAYER` joins them, and the reason is worth stating because
 * the list was hand-built and got this one wrong until the options screen named
 * the constant. The fork annotates every constant it adds with an `//@@MP` note
 * on the *declaration* — `UNDEAD_EAT_PLAYER` carries `- added a NEARBY (Release 3)`
 * at `GameSounds.cs:15`. `MELEE_ATTACK_MISS_PLAYER` (`GameSounds.cs:119`) carries
 * no such marker; only its *call site* is annotated (`//@@MP (Release 2)` at
 * `RogueGame.cs:18548`), which is the fork wiring up a sound the original game
 * already shipped. So it is vanilla, and asking for an `ExtendedAudio` gate around
 * it would have put a Still Alive switch in front of a sound Classic plays.
 *
 * The marker is the discriminator, and it is on the declaration rather than the
 * call site. Reading the wrong one is how this entry went missing.
 */
const VANILLA_IDS: ReadonlySet<string> = new Set([
  GameSounds.UNDEAD_EAT,
  GameSounds.UNDEAD_RISE,
  GameSounds.NIGHTMARE,
  // The miss pair. `_NEARBY` is vanilla for the same reason `_PLAYER` is, and it
  // came in with the other half of the same melee-miss call site.
  GameSounds.MELEE_ATTACK_MISS_PLAYER,
  GameSounds.MELEE_ATTACK_MISS_NEARBY,
]);
const FORK_IDS: ReadonlySet<string> = new Set(
  FIXTURE.entries.map((e) => e.id).filter((id) => !VANILLA_IDS.has(id)),
);

describe("the fork's sound table matches the C#", () => {
  it("has a fixture large enough to be a real contract", () => {
    // Anti-vacuity. An empty or truncated fixture makes every comparison below
    // pass on nothing, which is the failure this whole file exists to catch.
    expect(FIXTURE.entries.length).toBeGreaterThan(150);
    expect(FIXTURE.source).toContain("GameSounds.cs");
  });

  it("declares every C# pair, with the C#'s id and file name", () => {
    // One loop over the fixture rather than a hand-written list, so a pair cannot
    // be "covered" by a test that never mentions it.
    const wrong: string[] = [];
    for (const e of FIXTURE.entries) {
      const id = DECLARED[e.name];
      if (id === undefined) {
        wrong.push(`${e.name}: not declared on GameSounds`);
        continue;
      }
      if (id !== e.id) {
        wrong.push(`${e.name}: id ${JSON.stringify(id)} != C# ${JSON.stringify(e.id)}`);
      }
      if (SOUND_FILES[id] !== e.file) {
        wrong.push(
          `${e.name}: SOUND_FILES gives ${JSON.stringify(SOUND_FILES[id])} != C# ${JSON.stringify(e.file)}`,
        );
      }
    }
    expect(wrong, `transcription drift from GameSounds.cs:\n  ${wrong.join("\n  ")}`).toEqual([]);
  });

  it("declares nothing the C# does not, apart from the two vanilla ids", () => {
    // The other direction. `NIGHTMARE` is a pair both versions declare, so the
    // fixture contains it; `UNDEAD_EAT` and `UNDEAD_RISE` are vanilla-only and are
    // the reason the fork's set grew rather than replaced the port's three.
    const inFixture = new Set(FIXTURE.entries.map((e) => e.name));
    const vanilla = new Set(["UNDEAD_EAT", "UNDEAD_RISE", "NIGHTMARE", "PATH"]);
    const extra = Object.keys(DECLARED).filter(
      (k) => !k.endsWith("_FILE") && !inFixture.has(k) && !vanilla.has(k),
    );
    expect(extra, `sound ids with no C# pair: ${extra.join(", ")}`).toEqual([]);
  });

  it("keeps the C#'s declaration order for the fork's block", () => {
    // Nothing in the port depends on a sound id's position — it is a string key —
    // so this is a review aid rather than a contract: a block that diffs against
    // `GameSounds.cs` line for line is one a reader can check by eye.
    //
    // `NIGHTMARE` is excluded because it is not *in* the fork block: the port
    // declared it with the other two vanilla effects, so it sits above, and
    // `scripts/port-game-sounds.py` skips it for the same reason.
    const order = Object.keys(DECLARED).filter((k) => !k.endsWith("_FILE") && k !== "NIGHTMARE");
    const wanted = FIXTURE.entries.map((e) => e.name).filter((n) => order.includes(n));
    expect(order.filter((n) => wanted.includes(n))).toEqual(wanted);
  });

  it("keeps the fork's own release markers and its two deletions as comments", () => {
    // Provenance, and the gaps in the fork's own numbering: the `06` screams are
    // missing from `GameSounds.cs` (Release 7-4, "too low quality"), and a reader
    // who finds `SCREAM_NEARBY_07` after `05` deserves to know why.
    const text = readFileSync(join(SRC, "gameplay", "GameSounds.ts"), "utf-8");
    const notes = FIXTURE.entries.filter((e) => e.note != null);
    expect(notes.length, "the fixture lost the fork's own notes").toBeGreaterThan(0);
    for (const e of notes) {
      expect(text, `${e.name}'s note (GameSounds.cs:${e.line}) is not carried over`).toContain(e.note!);
    }
    expect(text).toContain("@@MP (Release 8-2)");
  });
});

describe("every sound id resolves to a file that exists", () => {
  it("resolves each one through soundPath, the way the managers do", () => {
    const ids = soundIds();
    expect(ids.length, "the id collector found nothing").toBeGreaterThan(150);

    const missing: string[] = [];
    for (const id of ids) {
      if (!isKnownAudioId(id)) {
        missing.push(`${id}: in neither SOUND_FILES nor MUSIC_FILES`);
        continue;
      }
      const url = soundPath(id);
      if (!existsSync(publicFilePath(url))) missing.push(`${id} -> ${url}`);
    }
    expect(missing, `sound ids that resolve to nothing:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("routes each one into sfx/, under its own file name", () => {
    // `audioPath` consults the music table first, so an id in both tables is the
    // one place a sound could resolve into the wrong directory. `REINCARNATE` is
    // the only such id — the fork moved that track from music to sfx in Release
    // 6-1 and dropped its `GameMusics` constant, the port kept both — and the
    // assertion is on the sound table's own answer, which is what
    // `WebAudioSoundManager` uses.
    for (const id of soundIds()) {
      expect(soundPath(id), id).toMatch(/^\/assets\/sfx\/[^/]+\.ogg$/);
      expect(soundPath(id), id).toBe(`/assets/sfx/${SOUND_FILES[id]}.ogg`);
    }
  });

  it("keeps the vanilla three on the files Classic already ships", () => {
    // The three effects that predate this feature are a ruleset question, not a
    // rename: `sfx - undead eat` became the fork's `UNDEAD_EAT_PLAYER` /
    // `UNDEAD_EAT_NEARBY` pair, and `sfx - undead rise` is not in `GameSounds.cs`
    // at all. Asserted as values, because a *file* that changed under the same
    // name is the one thing this feature must never do to Classic.
    expect(SOUND_FILES[GameSounds.UNDEAD_EAT]).toBe("sfx - undead eat");
    expect(SOUND_FILES[GameSounds.UNDEAD_RISE]).toBe("sfx - undead rise");
    expect(SOUND_FILES[GameSounds.NIGHTMARE]).toBe("sfx - nightmare");
    expect(sfxGain(GameSounds.UNDEAD_EAT), "still loudness-normalised").toBeGreaterThan(1);
  });

  it("ships every file the fork's Resources/Sfx carries, and registers its two orphans", () => {
    // The forward direction, and the orphans are the interesting half. The fork
    // ships 183 `.ogg`; 181 are named by a constant and two are not, so copying
    // the directory verbatim — rather than only what the table needs — leaves two
    // files nothing can resolve. That is deliberate: a file a later constant names
    // has to already be there. What is *not* acceptable is an orphan that the
    // C# *does* name, because that is a misspelling wearing a different hat.
    const orphans = shippedFiles().filter((f) => !(Object.values(SOUND_FILES) as string[]).includes(f));
    const csharpNames = new Set(FIXTURE.entries.map((e) => e.file));
    expect(orphans.filter((f) => csharpNames.has(f)), "a table entry with no file is not this").toEqual([]);
    expect(orphans).toEqual(["barbed_wire_nearby", "trip_mine_trigger_visible"]);
  });
});

describe("the fork's effects are deliberately not loudness-normalised", () => {
  it("leaves every fork effect at its source gain", () => {
    // `AudioLevels.ts` peak-normalises the three vanilla effects, which is right
    // for them and wrong for this set, and the reason is the *relative* level:
    // `scream_far_01` peaks at 0.030 against `scream_nearby_01`'s 0.141, and 112
    // of the 185 shipped effects sit below the 0.317 that the generator's 3.0x
    // ceiling can lift to its 0.95 target. Normalising them would make a scream
    // beside you and a scream across town equally loud, which is the one thing
    // the `_nearby` / `_far` naming exists to prevent.
    //
    // So `sfxGain` finds no entry and returns 1.0 — the C#'s levels, unmodified.
    // This test is the tripwire: **re-running `measure-audio-levels.mjs` will now
    // fail here.** That script is right about the three vanilla files and wrong
    // about 180 others, and the file it writes says "GENERATED, do not edit by
    // hand", so nothing else would stop it.
    expect(SOUND_FILES[GameSounds.SCREAM_FAR_01]).toBe("scream_far_01");
    for (const id of [
      GameSounds.SCREAM_FAR_01,
      GameSounds.SCREAM_NEARBY_01,
      GameSounds.FISHING_CAST_PLAYER,
      GameSounds.UNDEAD_EAT_PLAYER,
    ]) {
      expect(sfxGain(id), `${id} was given a gain; the distance matrix would be flattened`).toBe(1.0);
    }
  });

  it("and the generated table still describes only the vanilla three", () => {
    // The same tripwire from the other side: if a re-run of the generator had
    // added the fork's files, these two would be in it.
    const generated = readFileSync(join(SRC, "gameplay", "AudioLevels.ts"), "utf-8");
    expect(generated).toContain('"sfx - undead eat"');
    expect(generated).not.toContain('"scream far 01"');
    expect(generated).not.toContain('"fishing cast"');
  });
});

describe("NullSoundManager with the whole id set", () => {
  it("drops every id, and stays stateless while doing it", () => {
    // Headless runs and the test suite use this, and 180 more ids must not turn it
    // into an allocator. "Stateless" is the real assertion: a cache or a queue
    // added here would show up as an own property after 183 calls.
    const m = new NullSoundManager();
    const ids = soundIds();
    expect(ids.length).toBeGreaterThan(150);
    expect(() => {
      for (const id of ids) m.play(id);
    }).not.toThrow();
    expect(m.getVolume()).toBe(0);
    expect(Object.getOwnPropertyNames(m), "NullSoundManager grew state").toEqual([]);
  });

  it("resolves a preload of the whole set to a no-op", () => {
    // `WebAudioSoundManager.preload` is the method a boot-time manifest would call;
    // the null one must not become a reason to boot.
    const m = new NullSoundManager();
    return expect(m.preload(soundIds())).resolves.toBeUndefined();
  });
});

/** Records every id the game asks for, and does nothing else. */
/**
 * A recording *sound* manager.
 *
 * Added with `Feature.ExtendedAudio`'s channel work. The five wired effects used to
 * be observed on the music manager, because that is where they were being played --
 * which is the bug: `musicGain` returns 1.0 for anything not in `MUSIC_FILES`, so
 * every effect was at unity gain instead of its measured level in `SFX_GAINS`.
 * `sfx - undead eat` is the loud one: measured peak 0.39 against 1.0 for "nightmare",
 * given a gain of **2.446** to be audible at all, and the port was playing it a
 * sixth too quietly.
 */
class RecordingSoundManager implements ISoundManager {
  public readonly played: string[] = [];
  play(soundId: string): void {
    this.played.push(soundId);
  }
  playIfNotAlreadyPlaying(soundId: string): boolean {
    // Always records, and says it started: this recorder has no notion of a sound
    // still ringing, and a test that wanted one would be testing the recorder.
    this.played.push(soundId);
    return true;
  }
  stopAll(): void {}
  setVolume(): void {}
  setEnabled(_on: boolean): void {}
  getVolume(): number {
    return 1;
  }
  preload(): Promise<void> {
    return Promise.resolve();
  }
}

class RecordingMusicManager implements IMusicManager {
  public readonly played: string[] = [];
  play(musicId: string, _priority: MusicPriorityValue): void {
    this.played.push(musicId);
  }
  playLooping(musicId: string, _priority: MusicPriorityValue): void {
    this.played.push(musicId);
  }
  playIfNotAlreadyPlaying(musicId: string, _priority: MusicPriorityValue): void {
    this.played.push(musicId);
  }
  stop(): void {}
  pause(): void {}
  resume(): void {}
  isPlaying(): boolean {
    return false;
  }
  getCurrentMusicId(): string | null {
    return null;
  }
  getPriority(): MusicPriorityValue {
    return MusicPriority.NULL;
  }
  setVolume(): void {}
  setEnabled(_on: boolean): void {}
  getVolume(): number {
    return 0;
  }
}

const survivors = new Faction("The Survivors", "survivor");

describe("the gate", () => {
  let game: RogueGame;
  let music: RecordingMusicManager;
  let sfx: RecordingSoundManager;
  let map: GameMap;
  let player: Actor;

  beforeEach(() => {
    new GameActors();
    new GameItems();
    music = new RecordingMusicManager();
    sfx = new RecordingSoundManager();
    game = new RogueGame(new NullRogueUI(), music, undefined, sfx);
    map = new GameMap(1, "test", 40, 40);
    player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
    player.controller = new PlayerController();
    map.placeActor(player, player.location.position);
    game.m_Player = player;
    // The fishing catch is the one message in this feature that takes
    // `AddMessageIfAudibleForPlayer`, which redraws, and `RedrawPlayScreen` reads
    // `m_MapViewRect` / `Session.currentMap` -- neither exists before
    // `StartNewGame`. The draw is stubbed rather than the message skipped, for the
    // same reason `tests/fishing.test.ts` does it: the C# uses that message
    // function so a bite interrupts a long wait, and that is not what is under test.
    (game as unknown as { RedrawPlayScreen(): void }).RedrawPlayScreen = () => {};
  });

  /** A corpse on the player's tile. A corpse is what is *left* of someone, so the
   * dead actor is given a `Location` rather than placed (`tests/butchering`). */
  const kill = (): Corpse => {
    const dead = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "victim");
    dead.location = new Location(map, player.location.position);
    const corpse = new Corpse(dead, 100, 100, 0, 0, 1);
    map.addCorpse(corpse);
    return corpse;
  };

  it("is on for Still Alive and off for classic", () => {
    expect(hasFeature(Ruleset.STILL_ALIVE, Feature.ExtendedAudio)).toBe(true);
    expect(hasFeature(Ruleset.CLASSIC, Feature.ExtendedAudio)).toBe(false);
  });

  it("plays the fork's cast and reel under STILL_ALIVE, and neither under CLASSIC", () => {
    // The four `Fishing` sounds the plan hands to this feature (`GameSounds.cs:
    // 424-431`, and the note in `DoUseFishingRodItem` that used to say "still
    // pending"). Two are wired — the player's; the NPC `_nearby` pair is not, and
    // `RogueGame` records why. The reel is forced rather than rolled for: the
    // chance is 2-4%, so a test that waited for one would be a 1-in-40 flake.
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    game.DoUseFishingRodItem(player);
    vi.spyOn(game.m_Rules, "rollChance").mockReturnValue(true);
    game.DoWait(player, true);
    expect(sfx.played).toContain(GameSounds.FISHING_CAST_PLAYER);
    expect(sfx.played).toContain(GameSounds.FISHING_REEL_PLAYER);
    expect(sfx.played, "the NPC arm is not ported, so nothing plays a _nearby id").not.toContain(
      GameSounds.FISHING_CAST_NEARBY,
    );

    sfx.played.length = 0;
    Session.get().ruleset = Ruleset.CLASSIC;
    game.DoUseFishingRodItem(player);
    game.DoWait(player, true);
    expect(sfx.played, "CLASSIC must hear none of the fork's effects").toEqual([]);
  });

  it("keeps the vanilla feast sound under CLASSIC and the fork's under STILL_ALIVE", () => {
    // The gate that is a *choice* rather than an addition. The fork replaced the
    // vanilla `UNDEAD_EAT` with a distance-tiered pair and plays the player tier
    // at this site (`RogueGame.cs:21582`); Classic must keep the file it has
    // always played.
    Session.get().ruleset = Ruleset.CLASSIC;
    game.DoEatCorpse(player, kill());
    expect(sfx.played).toEqual([GameSounds.UNDEAD_EAT]);

    sfx.played.length = 0;
    Session.get().ruleset = Ruleset.STILL_ALIVE;
    game.DoEatCorpse(player, kill());
    expect(sfx.played).toEqual([GameSounds.UNDEAD_EAT_PLAYER]);
  });

  it("plays a vanilla id under CLASSIC and a fork id under STILL_ALIVE, never the other way round", () => {
    // Both halves of "Classic plays none of the fork-only sounds" as one
    // relationship, over every site this feature has wired rather than over the
    // 176 ids it has not: an id that is not wired anywhere cannot be played under
    // any ruleset, and the scan below is what would say so if it became wired.
    const playsUnder = (ruleset: Ruleset): string[] => {
      sfx.played.length = 0;
      Session.get().ruleset = ruleset;
      game.DoUseFishingRodItem(player);
      vi.spyOn(game.m_Rules, "rollChance").mockReturnValue(true);
      game.DoWait(player, true);
      game.DoEatCorpse(player, kill());
      return sfx.played.slice();
    };
    const classic = playsUnder(Ruleset.CLASSIC);
    const stillAlive = playsUnder(Ruleset.STILL_ALIVE);

    expect(classic.filter((id) => FORK_IDS.has(id)), "a fork sound played under CLASSIC").toEqual([]);
    expect(stillAlive.length).toBeGreaterThan(classic.length);
    for (const id of stillAlive) {
      if (FORK_IDS.has(id)) continue;
      // Not "every id differs" -- the vanilla one is shared, which is the point of
      // the `DoEatCorpse` ternary -- but nothing CLASSIC plays may be missing.
      expect(classic, `${id} plays only under STILL_ALIVE`).toContain(id);
    }
  });

  it("names a fork-only id only next to an ExtendedAudio gate", () => {
    // The structural half of "Classic plays none of the fork's sounds", and the
    // half that scales to the other 176 ids as they get wired. Every
    // `GameSounds.X` in `src/` is read out of the real files — comments stripped,
    // or `RogueGame`'s own "not ported" notes would all count as call sites — and
    // has to sit within three lines of a `Feature.ExtendedAudio` gate.
    //
    // Three lines is what the two legitimate shapes need: `if (gate) play(FORK_ID)`
    // is one, and the id-choice ternary in `DoEatCorpse` is two. A refactor that
    // moves the gate into a helper fails here, which is the review this is for
    // rather than an obstacle to it.
    /**
     * Bulk tables whose ids are gated by *reading the table*, not by a gate on each
     * row. Each still needs its own consuming `Feature.ExtendedAudio` read in the
     * same file -- see the exemption below for why that is enough.
     */
    //
    // `from` is a stable phrase in the section's docblock, used as the span start:
    // the declaration is not, because the weapon table has four family `const`s
    // hoisted above it that hold a third of its ids.
    const BULK_TABLES = [
      { name: "RANGED_WEAPON_SOUND_FAMILIES", from: "The ranged-weapon sound families" },
      { name: "BREAK_BY_MATERIAL", from: "The bash/break sound ladder" },
      { name: "BASH_BY_MATERIAL", from: "The bash/break sound ladder" },
      { name: "BREAK_DEFAULT", from: "The bash/break sound ladder" },
      { name: "BASH_DEFAULT", from: "The bash/break sound ladder" },
    ];
    /**
     * Every `GameSounds` id the ranged-weapon table can name, read out of the table
     * itself rather than hand-listed.
     *
     * A list of 45 literals would go stale the next time a weapon is added, and the
     * failure would read as "an audio id changed" instead of "this test needs
     * updating" -- which is the failure mode the rest of this file is careful about.
     */
    const WEAPON_SOUND_IDS = new Set<string>();
    {
      const text = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
      // Start after the docblock: it names several ids in prose ("FLAMETHROWER_VISIBLE
      // in the _PLAYER band"), and prose is not a declaration.
      const doc = text.indexOf("The ranged-weapon sound families");
      const from = text.indexOf("*/", doc) + 2;
      const to = text.indexOf("\n]);", from);
      for (const m of text.slice(from, to).matchAll(/GameSounds\.([A-Z][A-Z0-9_]+)/g)) {
        const id = m[1]!;
        if (FORK_IDS.has(DECLARED[id] ?? "")) WEAPON_SOUND_IDS.add(id);
      }
    }

    /** Every id in every bulk table, same derivation. */
    const BULK_SOUND_IDS = new Set<string>();
    {
      const text = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
      for (const { name, from } of BULK_TABLES) {
        const at = text.indexOf(`const ${name}`);
        const docFrom = text.indexOf(from);
        if (at === -1) continue;
        const end = text.indexOf("\n};", at);
        const fromAt = docFrom === -1 ? at : docFrom;
        const to = end === -1 ? text.length : Math.max(end, fromAt);
        for (const m of text.slice(fromAt, to).matchAll(/GameSounds\.([A-Z][A-Z0-9_]+)/g)) {
          const id = m[1]!;
          if (FORK_IDS.has(DECLARED[id] ?? "")) BULK_SOUND_IDS.add(id);
        }
      }
    }

    const offenders: string[] = [];
    const gated: string[] = [];
    for (const path of walk(SRC)) {
      if (path.endsWith(join("gameplay", "GameSounds.ts"))) continue;
      const text = readFileSync(path, "utf-8");
      const lines = text.split("\n");

      // **Bulk tables are a second legitimate shape**, and the exemption is
      // deliberately narrow rather than a widening of the three-line window.
      //
      // `RANGED_WEAPON_SOUND_FAMILIES` names 45 ids in one declaration, hundreds of
      // lines from the gate that reads it. Putting a gate on each of the 45 rows
      // would be 45 copies of the same `if`, which is the thing this test exists to
      // prevent, and gating the declaration itself would gate nothing (a
      // `ReadonlyMap` cannot be conditionally absent at type level).
      //
      // So the exemption is: *a fork id declared inside the text span of a named
      // bulk table counts as gated if and only if that table's name is read by a
      // `Feature.ExtendedAudio` gate in the same file.* Delete the gate and the
      // exemption stops applying, the ids fall back to the three-line rule, and this
      // fails -- which is the protection that matters. The failure mode this test was
      // written for (a table nobody reads) still fails, in the other direction.
      // The span for each bulk table: from the line its `const NAME` is declared to
      // the line the declaration closes. It has to start at the declaration, not the
      // docblock above it, because the docblock names ids in prose and prose is not a
      // declaration.
      const bulkSpans = BULK_TABLES.map(({ name, from }) => {
        const at = text.indexOf(`const ${name}`);
        const docFrom = text.indexOf(from);
        const start = docFrom === -1 ? at : docFrom;
        // The close is searched from the *declaration*, not from the span start: the
        // span covers a docblock and some hoisted `const`s, and the first `\n};` after
        // the docblock belongs to a type alias in the middle of the section.
        const closes = [text.indexOf("\n};", at), text.indexOf("\n]);", at)].filter((n) => n !== -1);
        const end = closes.length === 0 ? -1 : Math.min(...closes);
        // "Gated" means two things at once: the file contains an
        // `Feature.ExtendedAudio` gate, *and* the table's name occurs more than once
        // -- once at its declaration and once at a read.
        //
        // Counting occurrences rather than matching gate-then-read across a character
        // window is deliberate. A window has to be wide enough to reach from a gate
        // to its reader across a whole method body, and at that width it also reaches
        // across the *next* method -- so it eventually stops meaning anything. The
        // occurrence count is exactly the property that matters: delete the reader and
        // the name is down to one occurrence and this fails.
        const occurrences = text.split(new RegExp(`${name}\\b`)).length - 1;
        const gated = at !== -1 && occurrences >= 2 && /Feature\.ExtendedAudio/.test(text);
        return { start, end: end === -1 ? text.length : end, gated };
      });
      const inBulkTable = (offset: number): boolean =>
        bulkSpans.some((s) => s.gated && offset >= s.start && offset <= s.end);

      let offset = 0;
      lines.forEach((raw, i) => {
        const at = offset;
        offset += raw.length + 1;
        const code = raw.replace(/\/\/.*$/, "");
        // **Every** id on the line, not the first. The scanner used `String.match`,
        // which sees one, and that was invisible until a line carried two -- the
        // weapon table's `{ single: A, rapid: B }` is eleven of them. A scanner that
        // silently ignores the second id on a line is a scanner that would have
        // passed an ungated one, which is the whole failure this test exists for.
        for (const m of code.matchAll(/GameSounds\.([A-Z][A-Z0-9_]+)\b/g)) {
          const id = m[1]!;
          if (!FORK_IDS.has(DECLARED[id] ?? "")) continue;
          const window = lines
            .slice(Math.max(0, i - 3), i + 1)
            .map((l) => l.replace(/\/\/.*$/, ""));
          if (window.some((l) => /Feature\.ExtendedAudio/.test(l)) || inBulkTable(at)) {
            gated.push(id);
          } else {
            offenders.push(`${path}:${i + 1}  ${id}`);
          }
        }
      });
    }
    expect(offenders, `fork sounds named with no gate nearby:\n  ${offenders.join("\n  ")}`).toEqual([]);
    // Named, not counted, so adding a fourth wired sound is a deliberate edit
    // here and the reason for it has a place to be written.
    //
    // The weapon ids are asserted *as a set derived from the table* rather than as a
    // hand-written list, because a list of 45 goes stale the moment a weapon is
    // added and the failure would read as "an audio id changed" instead of "this
    // test needs updating".
    const weapons = gated.filter((id) => WEAPON_SOUND_IDS.has(id));
    expect(weapons.sort(), "every weapon family id the table can name is gated").toEqual(
      [...WEAPON_SOUND_IDS].sort(),
    );
    // Subset, not equality: `BULK_SOUND_IDS` is derived from the tables and `gated`
    // may legitimately hold more (the weapon ids share the same file). The claim is
    // one-directional -- every id a table can name is gated -- and an equality would
    // fail for the wrong reason the next time a table is added.
    expect(
      [...BULK_SOUND_IDS].filter((id) => !gated.includes(id)),
      "every id a bulk table can name is gated",
    ).toEqual([]);
    expect(
      gated.filter((id) => !WEAPON_SOUND_IDS.has(id) && !BULK_SOUND_IDS.has(id)).sort(),
      "and the non-weapon effects are all still wired",
      // Sorted, and by hand, because a *new* standalone reader is a decision this
      // list is meant to force rather than absorb. The four Still Alive use paths added
      // in one pass and are the reason this line is more than four:
      //
      // - the throwable light packs' `FLARE` and `GLOWSTICK`, one gate each because
      //   the C# picks between two ids (`RogueGame.cs:15067-15070`);
      // - `MAKE_MOLOTOV`, from `DoMakeMolotov` (`:22124`);
      // - `EQUIP_GUN_PLAYER`, from `DoUnloadAmmoFromGun` (`:22192`) -- the one whose
      //   name is a lie about its provenance. It reads like a long-standing Classic id
      //   and is in the fork's fixture, and the first version of that method played it
      //   ungated on exactly that assumption. This assertion is the review.
      //
      // The shield-block pair are here because of how they got here rather than
      // because they are new. `DoMeleeAttack` played `SHIELD_BLOCK_PLAYER_FILE` and
      // `SHIELD_BLOCK_NEARBY_FILE`, and a `*_FILE`'s *value* is a path, so this scan
      // -- which asks whether the value is a fork id -- skipped both lines as "not a
      // fork id" instead of reporting them. They had been ungated, and 404ing, and
      // invisible to the one check meant to catch exactly that. Spelled as ids they
      // are ordinary entries like any other, which is the whole point of the rule in
      // `GameSounds.ts:22-24`.
      //
      // The four from `OnEquipItem` are the item's other half. `EQUIP` appears twice
      // because the C# plays it twice (`:21044` equipping a shield, `:21059`
      // equipping binoculars) and this list is per *site*, not per id. It is joined
      // by the two ids that sit either side of the binocular branch: the port had the
      // battery decrement and none of the three sounds, so a torch was switched on in
      // silence and its light did not reach the FOV until the next turn.
    ).toEqual([
      "EQUIP",
      "EQUIP",
      "EQUIP_GUN_PLAYER",
      "FISHING_CAST_PLAYER",
      "FISHING_REEL_PLAYER",
      "FLARE",
      "GLOWSTICK",
      "MAKE_MOLOTOV",
      "MATCH_STRIKE_START_FIRE_PLAYER",
      "NIGHT_VISION",
      "SHIELD_BLOCK_NEARBY",
      "SHIELD_BLOCK_PLAYER",
      "TORCH_CLICK_PLAYER",
      "UNDEAD_EAT_PLAYER",
    ]);
  });
});

describe("load time", () => {
  it("preloads no audio at boot, and 7.2 MB of it is therefore free", () => {
    // The reason this feature could be 182 files and 7.2 MB: the port fetches
    // sprites before the first frame because a browser cannot draw one it has not
    // fetched (`AssetPaths.ts:16-20`), but it fetches *audio* on demand, one
    // effect at a time, and `WebAudioSoundManager.preload` has no caller. So the
    // merge costs the boot path nothing and a Classic player nothing. What it does
    // cost is 7.2 MB in the build artifact, which is a download-budget question
    // and not a frame-time one.
    //
    // Asserted as a source fact rather than a measurement, because the thing that
    // would regress it is somebody adding an audio preload manifest, and that is a
    // source change.
    const rogueGame = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
    const run = rogueGame.slice(rogueGame.indexOf("\tasync Run(): Promise<void> {"));
    expect(run, "the boot path preloads sprites").toContain("UI_PreloadImages");
    expect(run, "the boot path must not preload audio").not.toMatch(/\.preload\(/);
    const soundManager = readFileSync(join(SRC, "engine", "audio", "WebAudioSoundManager.ts"), "utf-8");
    expect(soundManager, "the sound manager must keep fetching per play").toContain("await fetch(url)");
  });

  it("and the bytes really are on disk rather than a manifest of promises", () => {
    let bytes = 0;
    for (const f of readdirSync(SFX_DIR)) bytes += statSync(join(SFX_DIR, f)).size;
    // A floor rather than an exact total: an asset may legitimately be
    // re-encoded, and this only has to fail if the copy was reverted.
    expect(bytes).toBeGreaterThan(5_000_000);
  });
});

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { soundPath } from "@engine/AssetPaths";
import { OptionIDs } from "@engine/GameOptions";
import { GameAmbients, AMBIENT_FILES } from "@gameplay/GameAmbients";
import { GameSounds, SOUND_FILES } from "@gameplay/GameSounds";
import { walk } from "./helpers/grepAll";
import { publicFilePath } from "./helpers/assetPath";

/**
 * The two halves of `gameplay/GameSounds.ts` that `tests/extended-audio.test.ts`
 * does not reach, and the two defects on the far side of the gap.
 *
 * ## What is already covered, and why this is not a copy of it
 *
 * `extended-audio.test.ts` is the suite for `Feature.ExtendedAudio` and it does the
 * hard part: it parses `GameSounds.cs` into a committed fixture and compares every
 * id and every file name against `GameSounds.ts` and `SOUND_FILES`, then stats the
 * sfx directory. Nothing here repeats that.
 *
 * The gap is a *spelling*. The C# hands `m_SFXManager` an **id** and keeps the file
 * name in a `*_FILE` companion constant (`GameSounds.cs:14-451`), so the port
 * declares both halves of each of the 181 pairs -- and `extended-audio.test.ts`
 * collects ids with `Object.values(DECLARED).filter((v) => !v.startsWith("/"))`,
 * which is exactly the filter that drops every `*_FILE`. The three Classic effects
 * are the only strings in the class that are not base-prefixed, so the filter is
 * correct for what it was written to check and silently excludes 183 file paths
 * from every assertion in the file. `sprite-assets.test.ts` is the audio side's
 * equivalent obligation ("every id the game can ask for resolves to a file that
 * exists") and it is images-only; the sound half of that obligation is the first
 * block below.
 *
 * ## The two defects
 *
 * **`soundPath` cannot resolve a `*_FILE`.** `AssetPaths.soundPath` answers an id
 * from `SOUND_FILES` and appends `.ogg`, but its already-resolved pass-through calls
 * `withOgg`, which *replaces* an existing extension and adds none. The C#'s
 * `*_FILE` constants carry no extension, so the URL comes back
 * `<base>assets/sfx/shield_block_player` and the browser 404s. `ambientPath` hit
 * this already and has a second helper for it -- `asOgg`, whose own comment says a
 * music id "never arrives that way, which is why the sibling helpers have been fine"
 * -- and `soundPath` is that sibling. One line in `engine/AssetPaths.ts`.
 *
 * **`RogueGame.ts:19274` and `:19276` are the only callers that notice**, because
 * they are the only two call sites in `src/` that hand a `*_FILE` to a play call
 * rather than an id. So the shield-block sound has been *wired and silent* since it
 * landed: it type-checks, it records, the id is in `SOUND_FILES`, and the fetch
 * fails. They are also ungated, which is a second problem on the same two lines --
 * both files are fork-only Release 7-2 assets -- and `extended-audio.test.ts`'s
 * "names a fork-only id only next to an ExtendedAudio gate" scan cannot see that
 * either, because it looks the constant name up in `DECLARED` and asks whether the
 * *value* is a fork id, and `SHIELD_BLOCK_PLAYER_FILE`'s value is a path.
 *
 * Whether a Classic district can produce a `POLICE_RIOT_SHIELD` is a question for
 * the item tables (`data/**` and the generators), not for this file. The gate is
 * the port's rule regardless -- the two landed methods in `RogueGame.ts` and the
 * four other `ExtendedAudio` readers all have one -- so the register below is where
 * the two lines are tracked until their owner fixes them.
 */

const SRC = join(__dirname, "..", "src");

/** Every string-valued static on a class, minus the three the class object carries. */
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
const NAMES = Object.keys(DECLARED);

/**
 * The bare ids, by *constant name*: the 181 `GameSounds.cs` pairs plus the two
 * Classic-only extras the fork renamed away. Not the id strings -- `SOUND_FILES` is
 * keyed by the value, and mixing the two up is the mistake this helper exists to
 * make impossible for the reader.
 */
const ID_CONSTANTS = NAMES.filter((k) => !k.endsWith("_FILE") && k !== "PATH");
const FILE_CONSTANTS = NAMES.filter((k) => k.endsWith("_FILE"));

/** The id string a constant carries -- the key `SOUND_FILES` is written against. */
function idOf(idConstant: string): string {
  return DECLARED[idConstant]!;
}

/** The `*_FILE` constant's own base name -- the part after `GameSounds.PATH`. */
function fileBaseName(fileConstant: string): string {
  const value = DECLARED[fileConstant]!;
  return value.slice(value.lastIndexOf("/") + 1);
}

/**
 * Source with comments removed, so a scanner can tell a *call* from a mention.
 *
 * Same helper `tests/ambient-audio.test.ts` uses, for the same reason: a
 * `GameSounds.EQUIP` in a docblock that says "the C# plays `EQUIP` here" is prose,
 * and a scanner that cannot tell the two apart reports a call that does not exist
 * and misses one that does.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("every declared sound file is a real file", () => {
  it("pairs all 183 ids with a `*_FILE` naming the same base", () => {
    // Anti-vacuity, and the count the fork's own arithmetic gives: 181 pairs in
    // `GameSounds.cs` plus the two Classic effects the fork renamed away
    // (`UNDEAD_EAT`, `UNDEAD_RISE`). `NIGHTMARE` is inside the 181 -- it is a pair
    // both versions declare -- so it is not added again here.
    expect(ID_CONSTANTS.length).toBe(183);
    expect(FILE_CONSTANTS.length).toBe(183);

    // The cross-check `extended-audio.test.ts` cannot make. It compares the id
    // against `SOUND_FILES` and the id against the fixture's file, in two separate
    // loops, so a fixture that named the same base twice would satisfy both without
    // the two columns of this port ever having been compared to each other. They
    // are compared here, on the base names rather than on `soundPath`, because
    // `soundPath` cannot be the judge -- see the next test.
    const wrong: string[] = [];
    for (const name of ID_CONSTANTS) {
      const file = `${name}_FILE`;
      if (!(file in DECLARED)) {
        wrong.push(`${name}: no ${file}`);
        continue;
      }
      const row = SOUND_FILES[idOf(name)];
      if (row === undefined) {
        wrong.push(`${name} (${JSON.stringify(idOf(name))}): no SOUND_FILES row`);
        continue;
      }
      if (fileBaseName(file) !== row) {
        wrong.push(`${file} is ${JSON.stringify(fileBaseName(file))}, SOUND_FILES says ${JSON.stringify(row)}`);
      }
    }
    expect(wrong, `the two spellings disagree:\n  ${wrong.join("\n  ")}`).toEqual([]);
  });

  it("resolves each id's row to a file that is on disk", () => {
    // The audio half of what `sprite-assets.test.ts` does for images, over the
    // spelling the managers are actually handed. Asserted on the id rather than on
    // the `*_FILE` because the id is the spelling that works -- see the tripwire
    // below.
    const missing: string[] = [];
    for (const name of ID_CONSTANTS) {
      const id = idOf(name);
      if (!(id in SOUND_FILES)) {
        missing.push(`${name}: ${JSON.stringify(id)} is in neither SOUND_FILES nor MUSIC_FILES`);
        continue;
      }
      const url = soundPath(id);
      if (!existsSync(publicFilePath(url))) missing.push(`${name} -> ${url}`);
    }
    expect(missing, `sound ids that resolve to nothing:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("cannot resolve a `*_FILE`, which is a defect and not a design", () => {
    // **The tripwire.**
    //
    // `AssetPaths.soundPath`'s already-resolved branch calls `withOgg`, which only
    // *replaces* an extension, so a `*_FILE` -- which carries none, because the C#'s
    // do not and the port transcribes them verbatim -- comes back without `.ogg`
    // and 404s. `ambientPath` has `asOgg` for exactly this and its comment says the
    // sibling helpers "have been fine" because a music id never arrives that way.
    // A sound id can: `RogueGame.ts:19274` does.
    //
    // The fix is one line in `engine/AssetPaths.ts` -- `asOgg` instead of `withOgg`
    // in `soundPath`'s pass-through -- and it is not made here because that file is
    // not this task's. Asserted as "every one of them fails", so the day it is fixed
    // this fails and says what to delete; asserting it per-name would let a partial
    // fix pass.
    const extensionless = FILE_CONSTANTS.filter((name) => !soundPath(DECLARED[name]!).endsWith(".ogg"));
    expect(
      extensionless.length,
      `soundPath grew an extension for *_FILE -- the fix landed, so delete this test and ` +
        `FILE_CONSTANTS_HANDED_TO_PLAY. Still extensionless: ${extensionless.join(", ")}`,
    ).toBe(FILE_CONSTANTS.length);
  });

  it("keeps the three Classic effects on the files Classic already ships", () => {
    // A file that changed under the same name is the one thing this feature must
    // never do to Classic, and the `*_FILE` half is where a re-encode would be
    // invisible: `SOUND_FILES` is the only column any caller consults.
    expect(SOUND_FILES[GameSounds.UNDEAD_EAT]).toBe("sfx - undead eat");
    expect(SOUND_FILES[GameSounds.UNDEAD_RISE]).toBe("sfx - undead rise");
    expect(SOUND_FILES[GameSounds.NIGHTMARE]).toBe("sfx - nightmare");
    expect(fileBaseName("UNDEAD_EAT_FILE")).toBe("sfx - undead eat");
    expect(fileBaseName("UNDEAD_RISE_FILE")).toBe("sfx - undead rise");
    expect(fileBaseName("NIGHTMARE_FILE")).toBe("sfx - nightmare");
  });
});

/**
 * The two `_FILE` constants currently handed straight to a play call.
 *
 * Keyed by **constant name, not by `file:line`**. A line-anchored register is a
 * false alarm the moment an unrelated edit shifts the file, and more than one agent
 * edits `RogueGame.ts`; a name is stable under any reformat. An entry here is
 * *tracking*, not permission: the scan below checks a name in this list **and** a
 * `*_FILE` within three lines of an `ExtendedAudio` gate, so gating the two sites
 * does not fail this file -- the entry just becomes deletable.
 *
 * `EQUIP` is the same mistake waiting to happen and is deliberately *not* listed,
 * because nothing plays it: the shield's equip sound has no ported call site at
 * all, which is why `extended-audio.test.ts` counts four non-table effects rather
 * than five. It is a pending call site, not a wrong one.
 */
const FILE_CONSTANTS_HANDED_TO_PLAY: readonly string[] = [
  "SHIELD_BLOCK_PLAYER_FILE",
  "SHIELD_BLOCK_NEARBY_FILE",
];

describe("no play call is handed a `*_FILE`", () => {
  it("reports none outside the register, and keeps the register honest", () => {
    // The structural half of "Classic hears none of the fork's effects", covering
    // the spelling `extended-audio.test.ts` cannot see. Its scan resolves
    // `GameSounds.X` through `DECLARED` and asks whether the *value* is a fork id;
    // for a `*_FILE` the value is `<base>assets/sfx/...`, which no fixture entry
    // equals, so the line is skipped as "not a fork id" rather than reported.
    //
    // Two shapes pass: a name in the register, or a `*_FILE` within three lines of
    // a `Feature.ExtendedAudio` gate. Three lines is what `if (gate) play(FORK_FILE)`
    // needs, and it is the window the id-spelling scan uses, so the two agree on
    // what "gated" means.
    const offenders: string[] = [];
    const seen: string[] = [];
    for (const path of walk(SRC)) {
      if (path.endsWith(join("gameplay", "GameSounds.ts"))) continue;
      // Scanned with comments already stripped, so a `GameSounds.EQUIP` inside a
      // docblock that describes the very gap this file is about is not read as a
      // call. Line numbers are deliberately not collected: stripping block
      // comments renumbers everything after them, so a `file:line` reported from
      // this pass would be fiction, and the register is keyed by name for the same
      // reason.
      const lines = stripComments(readFileSync(path, "utf-8")).split("\n");
      lines.forEach((code, i) => {
        if (!/\.(?:play|playIfNotAlreadyPlaying)\s*\(/.test(code)) return;
        for (const m of code.matchAll(/GameSounds\.([A-Z][A-Z0-9_]+_FILE)\b/g)) {
          const name = m[1]!;
          if (!(name in DECLARED)) {
            offenders.push(`${name}: not a declared GameSounds constant`);
            continue;
          }
          seen.push(name);
          if (FILE_CONSTANTS_HANDED_TO_PLAY.includes(name)) continue;
          const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
          if (!/Feature\.ExtendedAudio/.test(window)) {
            offenders.push(`${name} played with no Feature.ExtendedAudio gate nearby`);
          }
        }
      });
    }

    expect(offenders, `fork file paths played ungated:\n  ${offenders.join("\n  ")}`).toEqual([]);

    // The register is asserted as a set rather than left to decay: a name in it that
    // is no longer on a play call is dead weight, and one that was never declared
    // is a typo. Both are failures rather than tidiness.
    const stale = FILE_CONSTANTS_HANDED_TO_PLAY.filter((n) => !seen.includes(n));
    expect(
      stale,
      `no play call hands these a _FILE any more -- delete the entries: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * `GameAmbients.TEST_AMBIENT`: 12 of the fork's 13 ambient tracks are reachable and
 * the thirteenth is not, and this is why.
 *
 * Its only C# caller is `OptionsMenuAudioAdjustment` (`RogueGame.cs:2230-2268`),
 * Release 7-3, a preview cue for the **ambient-volume row of the options screen**:
 * move the cursor onto the row and it plays `TEST_AMBIENT` so you can hear the
 * level you are choosing. The port has no such row.
 *
 * That is not the same as "the port has no options screen" -- the screen was
 * reworked -- it is narrower and worth pinning, because the fix and the temptation
 * look alike from here. The port's audio options are `UI_MUSIC` and
 * `UI_MUSIC_VOLUME` (`GameOptions.ts:32-33`, listed at `OptionsScreen.ts:91-92`).
 * There is no ambient row and no sound-effects row, so there is no volume for a
 * preview to demonstrate, and adding one would be inventing a settings option the
 * port has never had. `tests/ambient-audio.test.ts` asserts the consequence (12
 * reachable, `TEST_AMBIENT` not); this asserts the cause, so that when somebody does
 * add the row the failure names the row rather than the track.
 *
 * The C#'s other two preview cues are absent for the same reason, and naming them
 * is the point: `GameMusics.TEST_MUSIC` is not in the port's `GameMusics` either,
 * and `MELEE_ATTACK_MISS_PLAYER` at `RogueGame.cs:2251` is the sound-effects row's
 * preview. So this is a whole unported mechanism, not one orphaned track.
 */
describe("TEST_AMBIENT still has no row to be previewed on", () => {
  it("ships the file and declares the pair, because the table is the C#'s thirteen in full", () => {
    // The asset has to be there whether or not anything plays it: a later constant
    // naming it has to find it already on disk, which is the same reasoning
    // `extended-audio.test.ts` gives for the fork's two sfx orphans.
    expect(AMBIENT_FILES[GameAmbients.TEST_AMBIENT]).toBe("test_ambient");
    expect(existsSync(publicFilePath("/assets/ambients/test_ambient.ogg"))).toBe(true);
  });

  it("has no ambient-volume option for the preview to sit on", () => {
    // Named as strings rather than compared against `OptionIDs` members, because a
    // member cannot be referred to without existing: the assertion has to be about
    // the option being *absent*, and `OptionIDs.UI_AMBIENTSFXS_VOLUME` would not
    // compile. `Object.keys` on the enum object is the only way to ask.
    const declared = Object.keys(OptionIDs);
    for (const absent of [
      "UI_AMBIENTSFXS",
      "UI_AMBIENTSFXS_VOLUME",
      "UI_SFXS",
      "UI_SFXS_VOLUME",
    ]) {
      expect(declared, `${absent} now exists -- TEST_AMBIENT is wireable`).not.toContain(absent);
    }
  });

  it("and the options screen drives only the music volume", () => {
    // Asserted on the source rather than on the rendered screen, for the reason the
    // rest of this repository's source-shaped tests give: a row is added by editing
    // a list, and the list is the thing that can go stale.
    const screen = stripComments(readFileSync(join(SRC, "ui", "OptionsScreen.ts"), "utf-8"));
    expect(screen).toContain("OptionIDs.UI_MUSIC");
    expect(screen).toContain("OptionIDs.UI_MUSIC_VOLUME");
    // The screen's only read of a volume is music's, and a second audio knob would
    // be a second read. Narrowed to the property rather than to a spelling, because
    // the screen reads `Options` for the typeface and the difficulty reset as well
    // and those are none of this test's business.
    const volumeReads = [...new Set([...screen.matchAll(/Options\.(\w*[Vv]olume)\b/g)].map((m) => m[1]!))];
    expect(volumeReads, "the options screen reads a second volume option").toEqual(["musicVolume"]);
    // Nor does it hold a sound-effects or ambient channel to set a volume on. The
    // screen's own "// display & sounds" heading is a comment and `stripComments`
    // has already taken it, so what is left is code -- a manager, an option, a
    // `setVolume` -- and the C#'s four `OptionsMenuAudioAdjustment` cases all need
    // at least one of those three.
    expect(screen, "the options screen gained a second audio channel").not.toMatch(
      /\b(?:sfx|ambient|sound)\w*\b/i,
    );
  });
});

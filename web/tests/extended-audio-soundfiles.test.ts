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
 * does not reach, and the defect that lived on the far side of the gap.
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
 * ## The defect, which is now fixed
 *
 * **`soundPath` could not resolve a `*_FILE`.** It answered an id from `SOUND_FILES`
 * and appended `.ogg`, but its already-resolved pass-through only *replaced* an
 * extension. The C#'s `*_FILE` constants carry none — the loader appends one, at
 * `MDXSoundManager.cs:48-51` — so the URL came back
 * `<base>assets/sfx/shield_block_player` and the browser 404'd. `ambientPath` had
 * `asOgg` for exactly this and its comment said a music id "never arrives that way,
 * which is why the sibling helpers have been fine". `soundPath` was that sibling.
 *
 * **`RogueGame`'s shield-block roll was the only caller that noticed**, because it
 * was the only call site in `src/` handing a `*_FILE` to a play call rather than an
 * id. The shield-block sound was *wired and silent* from the day it landed: it
 * type-checked, it recorded, the id was in `SOUND_FILES`, the file was on disk, and
 * the fetch 404'd. The same two lines were ungated, and
 * `extended-audio.test.ts`'s gate scan could not see that either — it looks the
 * constant name up in `DECLARED` and asks whether the *value* is a fork id, and a
 * `_FILE`'s value is a path. So one wrong spelling hid both a silent sound and an
 * ungated one from the two checks meant to catch them.
 *
 * All three halves are fixed: `soundPath` and `musicPath` use `asOgg`, the sites
 * name the plain ids, and the two are now in the gate scan's allow-list where a
 * future spelling change is a failure. The test below asserts the *fix* — every one
 * of the 183 resolves to a file that exists — and the register it left behind is
 * empty and asserted empty, because a `*_FILE` is no longer tolerable on a play
 * call now that the resolver handles it.
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

  it("resolves a `*_FILE` to a real file, which it used not to", () => {
    // **This was the tripwire, and it has fired.**
    //
    // `AssetPaths.soundPath`'s already-resolved branch called `withOgg`, which only
    // *replaces* an extension, so a `*_FILE` — which carries none, because the C#'s
    // do not and the port transcribes them verbatim — came back without `.ogg` and
    // 404'd. `ambientPath` had `asOgg` for exactly this and its comment claimed the
    // sibling helpers "have been fine" because a music id never arrives that way.
    // A sound id can: `RogueGame`'s shield-block roll played
    // `SHIELD_BLOCK_PLAYER_FILE`, so the shield effect was wired, reached the sfx
    // channel, got the right gain, and was silent. `WebAudioSoundManager` dropped
    // the non-OK response without a word, so nothing said so either.
    //
    // The fix is `asOgg` in `soundPath`'s pass-through (and in `musicPath`'s, which
    // had the same defect and no caller yet). Asserted over *all* of them rather
    // than per-name, so a partial fix cannot pass: the branch is a single line, and
    // 183 constants is what proves it takes that branch for all of them.
    const unresolved = FILE_CONSTANTS.filter((name) => !soundPath(DECLARED[name]!).endsWith(".ogg"));
    expect(
      unresolved,
      `a *_FILE still does not resolve to an .ogg, so it will 404:\n  ${unresolved.join("\n  ")}`,
    ).toEqual([]);

    // And not merely ends in `.ogg` — a file that exists. This is the half that
    // catches a pass-through that invented an extension for a name that is not on
    // disk, which is what "it ends in .ogg" would let through.
    const missing: string[] = [];
    for (const name of FILE_CONSTANTS) {
      const url = soundPath(DECLARED[name]!);
      if (!existsSync(publicFilePath(url))) missing.push(`${name} -> ${url}`);
    }
    expect(missing, `*_FILE values resolving to nothing:\n  ${missing.join("\n  ")}`).toEqual([]);
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
 * The `_FILE` constants handed straight to a play call.
 *
 * **Empty, and asserted empty.**
 *
 * It used to hold the shield-block pair, keyed by constant name rather than
 * `file:line` so that an unrelated edit could not falsify it. Both entries are
 * gone: the sites now name the plain ids, which is what the C# plays
 * (`RogueGame.cs:18372`, `:18374`) and what `GameSounds.ts:22-24` makes the rule.
 *
 * The empty list is the point, not a leftover. The register existed to *excuse* a
 * wrong spelling while a file it did not own was fixed; with `soundPath` able to
 * resolve a `_FILE` there is no longer a reason to tolerate one, and the stale-entry
 * assertion below means a new arrival fails rather than being registered.
 *
 * It also notes what a `*_FILE` did to the *other* scan. `extended-audio.test.ts`
 * resolves `GameSounds.X` through `DECLARED` and asks whether the value is a fork
 * id; a `_FILE`'s value is a path, no fixture entry equals it, and the line was
 * **skipped as "not a fork id" rather than reported**. So the two ungated sound
 * lines in the tree were invisible to the id-spelling gate scan for as long as
 * they were spelled wrong. Spelling them as ids is what puts them back under it.
 */
const FILE_CONSTANTS_HANDED_TO_PLAY: readonly string[] = [];

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
/**
 * The option rows `TEST_AMBIENT` was waiting for.
 *
 * This block used to assert that the four sound options were *absent* and that
 * the options screen drove only the music volume. Both were true, both were the
 * reason the track could not be previewed, and both were written to fail loudly
 * if the rows appeared — which they have now (`GameOptions.cs:16-19`, Still Alive
 * Release 2 / 6-1). The assertions below are the inversions, kept in the same
 * place so the next reader finds the reason rather than the residue.
 */
describe("the rows TEST_AMBIENT is previewed from", () => {
  it("ships the file and declares the pair, because the table is the C#'s thirteen in full", () => {
    // The asset has to be there whether or not anything plays it: a later constant
    // naming it has to find it already on disk, which is the same reasoning
    // `extended-audio.test.ts` gives for the fork's two sfx orphans.
    expect(AMBIENT_FILES[GameAmbients.TEST_AMBIENT]).toBe("test_ambient");
    expect(existsSync(publicFilePath("/assets/ambients/test_ambient.ogg"))).toBe(true);
  });

  it("are all four declared, and declared as one contiguous run", () => {
    // Named as strings rather than as `OptionIDs` members, so this file keeps
    // compiling on the older enum and so the assertion is about the enum object
    // rather than about a symbol that only exists once the row does.
    const declared = Object.keys(OptionIDs);
    const AUDIO_ROWS = [
      "UI_SFXS",
      "UI_SFXS_VOLUME",
      "UI_AMBIENTSFXS",
      "UI_AMBIENTSFXS_VOLUME",
    ];
    for (const present of AUDIO_ROWS) {
      expect(declared, `${present} is still missing`).toContain(present);
    }
    // Consecutive and in this order, and this is the load-bearing part. The C# has
    // them at ids 2-5, wedged between `UI_MUSIC_VOLUME` and `UI_ANIM_DELAY`
    // (`GameOptions.cs:16-19`), but a stored options blob carries the *number*, so
    // inserting them there would silently re-point every saved value at the wrong
    // row. Appended instead — the same rule as `GAME_RESCUE_DAY` and the other
    // rows that arrived after the vanilla set.
    //
    // *Contiguity* is the assertion, not "the last four". Contiguity is what pins
    // these four to four consecutive numbers and leaves every id before them where
    // it was, which is the property a stored options blob actually depends on.
    // Being the final four was only a side effect of having been the most recent
    // append; the first row added afterwards — `UI_SHOW_SPEECH_BUBBLES` — ended
    // that without moving a single number. So this finds the run wherever it sits.
    const start = AUDIO_ROWS.map((row) => declared.indexOf(row));
    expect(start, "the four rows must all be declared").not.toContain(-1);
    expect(start[1]).toBe(start[0]! + 1);
    expect(start[2]).toBe(start[0]! + 2);
    expect(start[3]).toBe(start[0]! + 3);
  });

  it("and the options screen drives all three buses", () => {
    // Asserted on the source rather than on the rendered screen, for the reason the
    // rest of this repository's source-shaped tests give: a row is added by editing
    // a list, and the list is the thing that can go stale.
    const screen = stripComments(readFileSync(join(SRC, "ui", "OptionsScreen.ts"), "utf-8"));
    expect(screen).toContain("OptionIDs.UI_MUSIC");
    expect(screen).toContain("OptionIDs.UI_MUSIC_VOLUME");
    // One volume read per bus. This was `["musicVolume"]` and the assertion said
    // the screen "reads a second volume option" was a failure — which is exactly
    // right, and is why the failure was worth taking as a signal rather than
    // weakening the test to fit.
    const volumeReads = [...new Set([...screen.matchAll(/Options\.(\w*[Vv]olume)\b/g)].map((m) => m[1]!))];
    expect(volumeReads.sort(), "the options screen drives the wrong set of buses").toEqual([
      "ambientSFXVolume",
      "musicVolume",
      "sfxVolume",
    ]);
    // And it holds the other two channels, which is what the last assertion below
    // used to forbid. The C#'s `OptionsMenuAudioAdjustment` has four cases and each
    // one needs at least one of a manager, an option or a `setVolume`.
    expect(screen, "the options screen lost a channel").toMatch(/\bsfx\b/);
    expect(screen, "the options screen lost a channel").toMatch(/\bambient\b/);
  });

  it("previews each bus from the row that adjusts it", () => {
    // The pairing is the whole point of `OptionsMenuAudioAdjustment` and it is
    // invisible from the row list alone: four rows and four buses, and nothing
    // connects them except the arms of that switch. A row list that grew without
    // the switch would look right and play nothing.
    //
    // Read from the one module that owns the switch, plus the screen's mapping.
    // `engine/RogueGame.ts` is deliberately *not* in that list, and used to be
    // expected in it: an earlier version of this change put a copy of the switch
    // there as well, which compiled, passed, and was dead on arrival -- because
    // `HandleOptions` builds the screen and never calls the method itself. A dead
    // copy on the class the split is meant to shrink is the wrong direction.
    const preview = stripComments(
      readFileSync(join(SRC, "engine", "audio", "OptionsAudioPreview.ts"), "utf-8"),
    );
    for (const cue of [
      "GameMusics.TEST_MUSIC",
      "GameAmbients.TEST_AMBIENT",
      "GameSounds.MELEE_ATTACK_MISS_PLAYER",
    ]) {
      expect(preview, `the preview lost ${cue}`).toContain(cue);
    }
    // The screen maps rows onto the four preview actions.
    const screen = stripComments(readFileSync(join(SRC, "ui", "OptionsScreen.ts"), "utf-8"));
    for (const row of ["UI_MUSIC_VOLUME", "UI_SFXS_VOLUME", "UI_AMBIENTSFXS_VOLUME"]) {
      expect(screen, `the screen no longer maps ${row} to a preview`).toContain(row);
    }
    expect(screen, "the screen stopped calling the preview").toContain("previewAudioAdjustment");
    // And nothing else owns a copy of the switch.
    expect(
      stripComments(readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8")),
      "RogueGame grew a second copy of the preview switch",
    ).not.toMatch(/TEST_MUSIC|TEST_AMBIENT/);
  });
});

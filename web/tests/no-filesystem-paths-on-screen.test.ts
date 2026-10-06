/**
 * Nothing on screen promises the player a file on disk, because there isn't one.
 *
 * ## The class of bug this guards
 *
 * `d34cde2` fixed the worst instance of it. The hi-scores screen drew its own
 * storage key as a line under the rules — `saves/hiscores.txt` — which was
 * `getUserHiScorePath()` plus a filename. So it named a file this port never wrote
 * anywhere near, in a directory that does not exist either. The port stores the
 * table in `localStorage` under `rogue-survivor-hiscores` and always did.
 *
 * The defect was never the write. There was no write: `TextFile.save` puts bytes in
 * `localStorage` and `CanvasUI.UI_SaveScreenshot` hands a data URL to an anchor's
 * `download`. The defect was that the game *told the player* about a filesystem the
 * player cannot see, so every screenshot-related instruction in the port was a small
 * lie and the player had no way to tell which parts were real.
 *
 * Two more survived that commit, both found by auditing rather than by a failing
 * test:
 *
 *   - `GAME_DEATH_SCREENSHOT`'s description, which named `Config\Screenshot`, a
 *     directory that has never existed here — and did not even match the port's own
 *     `Paths.ts`, which says `Screenshots/`. It was reachable by arrowing onto the
 *     option, so it was the most reachable instance of the whole bug. The option has
 *     since been removed outright (see `screenshot-naming.test.ts`), so there is no
 *     longer a description to check — but the *screenshot* feature it belonged to
 *     survives as the Shift-N key, and that is still a browser download, so this file
 *     still has a job.
 *   - The post-mortem screen, which drew `grave_000.txt` under "Grave saved to :".
 *     `graveFile` is only the name half of a `textfile:` storage key.
 *
 * ## Why a source scan, and what this scan is *not*
 *
 * The hiscores string was assembled from a computed path, so no import-level
 * assertion could see it: `Paths.ts` had nothing to assert about while the screen
 * printed something. What is checkable is that no source file contains the shape of
 * a filesystem claim at all, which is the stronger statement anyway.
 *
 * Comment lines are stripped, because these files *explain* the removals and naming
 * the removed thing in the explanation is the point. That exclusion has a cost, and
 * it is the real limit of this test: a path rebuilt at runtime from fragments — as
 * the hiscores one was, from a helper plus a filename — can pass it. This is a
 * tripwire against the literal coming back, not a proof. The d34cde2 scan is the
 * half that closes that gap for the score table, and it does so by asserting the
 * *helpers* are gone too; the equivalent assertion for screenshots is
 * `screenshot-naming.test.ts`.
 *
 * ## The two manuals, which are not the same document
 *
 * `web/public/assets/manual.txt` is the port's own copy: what the in-game manual
 * screen pages to the player. It starts from the author's text and diverges where
 * the browser diverges — it has an alpha10 banner the original lacks, and a section
 * list the original does not have. Divergences are *correct* there, and this file
 * asserts the screenshot one has been made.
 *
 * `docs/manual.html` is a transcription of the original manual for the website, and
 * it is meant to stay word-for-word: `docs/README.md` says the generator "rewrites
 * no words", and a reader comparing this port against the C# build needs the two to
 * agree. So it keeps "your game installation folder", which is a true statement
 * about the C# and simply does not describe this port. That is the transcription
 * doing its job, and `docs/controls.html` — the port's own page, not a transcription
 * — is where the browser's behaviour belongs.
 *
 * Both are read from disk because neither is importable, and reading them is the only
 * way to see the prose a player actually reads.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { GameOptions, OptionIDs } from "@engine/GameOptions";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * A `.ts` source file's *executable* code: both comment syntaxes removed.
 *
 * `//` alone is not enough, and the miss is not hypothetical. `CanvasUI.downloadName`
 * has a block comment explaining that the engine hands it Windows-shaped paths, and it
 * quotes one: `Config\Screenshot\screenshot_000.png`. That is exactly the string this
 * test exists to catch, in exactly the file that discards it a line later — so a
 * `//`-only strip reported it as an offender and the scan was unusable.
 *
 * Block comments are blanked rather than deleted, keeping one newline per line removed
 * so a reported `file:line` still points at the right line.
 */
function stripComments(text: string): string {
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, " "),
  );
  return withoutBlocks
    .split("\n")
    .map((l) => l.split("//")[0]!)
    .join("\n");
}

/** `stripComments` over a file, as one string. */
function code(path: string): string {
  return stripComments(readFileSync(path, "utf8"));
}

/**
 * A C#-shaped *directory path*: a C# directory name, then a separator, then more
 * path. Backslash or forward slash, because the port carries both.
 *
 * Deliberately not a bare word list. `Config`, `Saves` and `Docs` are ordinary words
 * that this codebase uses constantly and legitimately — `save/reload`,
 * `save/load`, `SaveBin`, `save/restore` — and a scan that fired on those would have
 * reported seven false positives on the first run, which is the fastest way to make a
 * test that gets deleted rather than fixed.
 *
 * Requiring the trailing separator is what makes it a path claim: it is the difference
 * between `Config\Screenshot\foo.png`, which names a directory that has never existed
 * here, and a sentence that happens to contain the word. `Screenshots/` and
 * `Graveyard/` keep the separator requirement for the same reason.
 *
 * `docs/manual.txt` is a *directory name on its own* in the C# (`GetUserDocsPath`
 * returns `"Docs/"`), so `Docs` is in the list. `\b` after each alternative stops it
 * matching inside a longer word.
 */
const C_SHAPED_DIRECTORY_PATH =
  /\b(?:Config|Screenshots?|Graveyard|Docs|Saves|Documents)\s*[\\/]/i;

describe("no filesystem paths are shown to the player", () => {
  it("keeps C#-shaped directory paths out of executable source", () => {
    // The hiscores scan in `hiscores-storage.test.ts` is the same shape, for one
    // filename. This is the general version: any `Config/`, `Screenshots/`,
    // `Graveyard/` or `Docs/` reaching a draw call or a string is the bug returning,
    // whatever feature it comes back through.
    //
    // `Paths.ts` is excluded on purpose and this is the exception worth stating: it is
    // *supposed* to contain those strings, because it is the module that documents
    // what each C# path became. Removing them from there is a different piece of work
    // (they are the module's subject matter), and it would not make this assertion
    // stronger — only different.
    const offenders: string[] = [];
    for (const file of tsFiles(SRC)) {
      if (file.endsWith(join("engine", "Paths.ts"))) continue;
      for (const [n, line] of code(file).split("\n").entries()) {
        if (C_SHAPED_DIRECTORY_PATH.test(line)) {
          offenders.push(`${file}:${n + 1}  ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      "a C#-shaped directory path is back in executable code; the port has no such directory",
    ).toEqual([]);
  });

  it("does not describe the removed death screenshot as saving anywhere", () => {
    // The option was removed rather than reworded, so this is a guard against it
    // creeping back as a description — the shape it had, a live row the player can
    // arrow onto and read. Asserted through `optionName`/`describe` on the reserved
    // slot, which throws for an unhandled id, so a re-added option with no text
    // fails loudly here instead of taking the options screen down when selected.
    //
    // `GameOptions.optionName` and `describe` are exhaustive switches, and the
    // reserved enum member is deliberately not handled by either: a name for it
    // would be a name the player could see.
    expect(() => GameOptions.optionName(OptionIDs.GAME_DEATH_SCREENSHOT_REMOVED)).toThrow();
    expect(() => GameOptions.describe(OptionIDs.GAME_DEATH_SCREENSHOT_REMOVED)).toThrow();
  });

  it("never names an installation folder in the manual the game ships", () => {
    // `public/assets/manual.txt` is what the in-game manual screen pages to the
    // player, fetched over HTTP at `RogueGame.GetUserManualFilePath`. The C# manual
    // says "your game installation folder", which is false here: there is no
    // installation, and the browser decides where a download goes.
    const manual = readFileSync(join(ROOT, "public", "assets", "manual.txt"), "utf8");
    expect(manual).not.toMatch(/installation folder/i);
    // And it has to say what actually happens instead, so the player learns where to
    // look for the file. Asserting only the absence would pass on a manual that had
    // simply deleted the sentence.
    expect(manual).toMatch(/download/i);
  });

  it("leaves the website's manual page equal to the original manual", () => {
    // `docs/manual.html` is a *transcription* of the author's manual, and it stays
    // one. `docs/README.md` is explicit that `build-manual.mjs` "rewrites no words",
    // and the page is what a reader compares against the C# build — so a browser
    // divergence belongs on `docs/controls.html`, which is the port's own page, and
    // not in the transcription.
    //
    // This is asserted as an equality rather than a list of forbidden strings,
    // because "this file must not contain X" is the shape that lets a well-meaning
    // edit accumulate: each one looks local. "Screenshots are saved in your game
    // installation folder" is *correct here* — it is what the manual says, and it
    // describes the C#, not this port. It was fixed in ddc7e03 and that was wrong:
    // the browser cannot write to an installation folder, but the sentence is not
    // the port's to change.
    //
    // `manual.html` is generated from `src/Resources/Manual/RS Manual.txt` in the
    // original C# tree, which is not in this repo, so the generator cannot be run to
    // prove this. Comparing against the vendored copy in `_refs/` is the strongest
    // check available: same text, transformed to HTML, "installation folder" and all.
    const html = readFileSync(join(ROOT, "..", "docs", "manual.html"), "utf8");
    expect(html).toMatch(/Screenshots are saved in your game installation folder\./);
    // And nothing browser-specific has leaked into it: the port's own wording lives
    // in `manual.txt`, so its phrase must not appear here.
    expect(html).not.toMatch(/downloaded by your browser/i);
  });

  it("keeps the grave screen's claim and its destination consistent", () => {
    // The post-mortem screen draws "Grave saved to :" followed by where the grave
    // went. In the C# that was a path in a real graveyard directory; here it is a
    // `localStorage` key. The heading is pinned by `endgame-exit.test.ts` as the
    // marker for this screen in the death sequence, so what is asserted here is that
    // the destination line is the storage key — the same string
    // `getUserNewGraveyardName` reads back to find a free name — rather than a bare
    // filename that implies a file.
    const game = code(join(SRC, "engine", "RogueGame.ts"));
    expect(game).toContain("Grave saved to :");
    expect(game).toContain("`textfile:${graveFile}`");
    // The bare draw of the filename is the defect: it is what told the player a file
    // had been written.
    expect(game).not.toMatch(/UI_DrawStringLarge\(\s*Color\.White,\s*graveFile\s*,/);
  });

  it("has no filesystem write outside the desktop backend and the browser download", () => {
    // The positive claim, and the one worth making explicitly: the port does not
    // write to a player's disk.
    //
    // `storage.ts` is excluded because Neutralino *is* the desktop build's storage
    // backend — one file, `storage.json`, under `os.getPath("data")` — and it is
    // intended. What must not exist is a *second* mechanism, in the engine or the
    // renderer, quietly writing somewhere else.
    //
    // `a.download` is excluded because it is not a filesystem API: it is the browser
    // asking the player where a download goes, which is the whole point of the
    // death-screenshot wording this file guards.
    const banned =
      /node:fs|\brequire\(["']fs["']\)|writeFileSync|appendFileSync|createWriteStream|FileSystemWritableFileStream|showSaveFilePicker|URL\.createObjectURL|new Blob\(/;

    const offenders: string[] = [];
    for (const file of tsFiles(SRC)) {
      if (file.endsWith(join("engine", "storage.ts"))) continue;
      for (const [n, line] of readFileSync(file, "utf8").split("\n").entries()) {
        const c = line.split("//")[0]!;
        if (banned.test(c)) offenders.push(`${file}:${n + 1}  ${line.trim()}`);
      }
    }
    expect(
      offenders,
      "a real filesystem write outside the desktop storage backend",
    ).toEqual([]);
  });
});
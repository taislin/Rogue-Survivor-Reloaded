import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { HiScoreTable } from "@engine/HiScoreTable";

/**
 * The hi-scores are in `localStorage`, and nothing says otherwise on screen.
 *
 * The score table used to draw its own storage key as a line under the rules:
 * `saves/hiscores.txt`. That string was `getUserHiScorePath()` plus a filename, so
 * it named a file this port never wrote anywhere near -- in a directory that does not
 * exist either -- and it was the most visible thing wrong with the screen, because it
 * was *on* the screen. `HiScoreTable` has always stored the table itself in
 * `localStorage` under `rogue-survivor-hiscores`, so the line was describing a
 * mechanism the game does not use.
 *
 * The text dump that produced it is gone too. The C# wrote the table out twice, a
 * binary file and a `hiscores.txt` beside it; here both landed in `localStorage`, so
 * the scores were stored twice and the second copy had no reader.
 *
 * ## Why a source scan
 *
 * The string was drawn from a computed path rather than a literal, so an import-level
 * assertion cannot see it -- `Paths.ts` had no `hiscores.txt` in it to assert about
 * while the screen printed one. What is checkable is that no source file mentions the
 * name at all, which is the stronger statement anyway: the paths are gone, so the
 * string cannot be reconstructed from them.
 */
const SRC = join(__dirname, "..", "src");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("hi-scores live in localStorage", () => {
  it("stores the table itself under a storage key, not a file path", () => {
    // The real answer to "where are my scores": one key, and it is a storage key.
    expect(HiScoreTable.STORAGE_KEY).toBe("rogue-survivor-hiscores");
    // No separator, no extension -- a localStorage key, not a path. A path here would
    // mean the C#'s directory layout had crept back in.
    expect(HiScoreTable.STORAGE_KEY).not.toMatch(/[\\/]/);
    expect(HiScoreTable.STORAGE_KEY).not.toMatch(/\.[a-z]+$/i);
  });

  it("mentions neither hiscores.txt nor hiscores.dat anywhere in src/", () => {
    // Comment lines are excluded deliberately: `Paths.ts` and `RogueGame.ts` both
    // explain *why* these paths were removed, and naming the file in that explanation
    // is the point rather than a regression.
    const offenders: string[] = [];
    for (const file of tsFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const [n, line] of text.split("\n").entries()) {
        const code = line.split("//")[0]!;
        if (/hiscores\.(txt|dat)/i.test(code)) {
          offenders.push(`${file}:${n + 1}  ${line.trim()}`);
        }
      }
    }
    expect(offenders, "the C# hiscores filenames are back in executable code").toEqual([]);
  });

  it("has no path helper that could rebuild one", () => {
    // The string used to be `getUserHiScorePath()` plus a filename, so removing the
    // literals is not enough -- the pieces that made one have to go as well. This is
    // what stops it being reintroduced by someone who only wants the table export.
    //
    // Comments are stripped for the same reason as above: both files explain the
    // removal, and a check that failed on its own explanation would be a check that
    // has to be deleted the first time someone explains themselves.
    const code = (file: string): string =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.split("//")[0]!)
        .join("\n");

    const paths = code(join(SRC, "engine", "Paths.ts"));
    expect(paths).not.toMatch(/getUserHiScore(File|TextFile)Path/);

    const game = code(join(SRC, "engine", "RogueGame.ts"));
    expect(game).not.toMatch(/GetUserHiScore(File|TextFile)Path/);
  });
});
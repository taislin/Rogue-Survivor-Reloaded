/**
 * User-facing paths and file names — C# `RogueGame.GetUser*`.
 *
 * ## Why this is a module and not a region of `RogueGame`
 *
 * `plans/BROWSER_PORT_PLAN.md` §6.5 lists this as Wave 1's first extraction, and
 * the reasoning holds up on inspection: fourteen methods, almost no inbound call
 * sites, and no outbound edge into either hub. Measured on the current file it is
 * 144 lines and reads nine members of `this`, six of which are its own siblings.
 *
 * It did not move as one block. `CreateDirectory`, `CheckDirectory` and
 * `CheckCopyOfManual` are C# siblings of this region and sit *between* its
 * members in the source, so the extraction was three separate cuts — see "What is
 * deliberately not here" below.
 *
 * The browser port makes most of these trivial — there is no filesystem, so
 * `getUserBasePath` returns `""` and the derived paths are relative keys — but
 * *trivial* is not *stateless*, and that is the part worth extracting. Three of
 * them carry real state or effects:
 *
 *   - `getUserNewGraveyardName` loops until it finds an unused name, which means
 *     reading storage. The C# asks the filesystem; the port asks `localStorage`.
 *   - `getUserNewScreenshotName` increments a counter, which was a private field
 *     on `RogueGame` and is module state here.
 *   - `getUserSave` reads the save slot.
 *
 * Leaving them on the class meant the screenshot counter stayed a private field
 * that only these methods could reach, and `screenshot-naming.test.ts` had to
 * drive it through the class to test it at all. Here it is a module-level counter
 * and `tests/paths.test.ts` states the rule directly.
 *
 * ## What is deliberately *not* here
 *
 * `CreateDirectory`, `CheckDirectory` and `CheckCopyOfManual` are C# siblings of
 * this region, but they are not paths: the first two draw to `m_UI` and the third
 * calls `logInit`. They stay on `RogueGame`. Splitting on "what the C# had in one
 * `#region`" would have moved them; splitting on what they *do* does not.
 *
 * `ScreenshotFilePath` needs `UI_ScreenshotExtension()`, so it takes the extension
 * as an argument rather than reaching for a UI. That is the one seam in this
 * module, and it is a parameter instead of a dependency.
 */

import { storage } from "@engine/storage";

/**
 * The browser port keys saves by IndexedDB slot rather than by filename.
 *
 * C# `GetUserSave` returns a filesystem path. This is the port's equivalent key.
 *
 * It was `RogueGame.CURRENT_SAVE_SLOT`, and that constant still exists and is
 * still read at `RogueGame.ts:2504`, so leaving a second copy of the same number
 * here would be two sources of truth for one value. `Paths.ts` cannot import it:
 * `RogueGame` imports this module, so importing back would be a cycle.
 *
 * The two are therefore asserted equal by `paths.test.ts` rather than kept in step
 * by convention. A duplicate constant that nothing checks is how "slot 0" and
 * "slot 1" end up meaning different things in a save and a delete.
 */
const CURRENT_SAVE_SLOT = 0;

/**
 * Monotonic counter behind `GetUserNewScreenshotName`.
 *
 * Module-level, where it was `RogueGame.m_ScreenshotCounter` (a private field).
 * Nothing outside the moved methods ever read or wrote it, so a field could only
 * be a per-*instance* counter — and the naming rule is per-*session*. Two games in
 * one page load are one session, and a browser cannot see the Downloads folder
 * either way, so sharing the counter is what makes "two shots never collide" true
 * across both.
 *
 * The cost is that a fresh `RogueGame` no longer restarts the count, which
 * `screenshot-naming.test.ts` asserted. That assertion was about the *padding*
 * rule rather than the scope, and it is now stated directly against
 * `getUserNewScreenshotName` with an explicit `resetScreenshotCounter()`.
 */
let screenshotCounter = 0;

/**
 * Resets the screenshot counter to zero.
 *
 * Exported for tests, and named for that rather than being a private detail: the
 * counter is module state now, so a test that wants to observe the first name has
 * to be able to say so. The game never calls this — a session's numbering is
 * meant to run forward.
 */
export function resetScreenshotCounter(): void {
	screenshotCounter = 0;
}

// C# GetUserBasePath — RogueGame.cs:19988
//
// Browser: no user directory — `SetupConfig.DirPath` has no equivalent, so all
// derived paths are relative keys.
export function getUserBasePath(): string {
	return "";
}

// C# GetUserSavesPath — RogueGame.cs:19997
//
// The browser port has no filesystem; `HiScoreTable` stores into localStorage and
// ignores the path, so these only matter as display/`TextFile` keys.
export function getUserSavesPath(): string {
	return "";
}

// C# GetUserSave — RogueGame.cs:20002
//
// C# returns a filesystem path; the browser port keys saves by IndexedDB slot.
export function getUserSave(): string {
	return String(CURRENT_SAVE_SLOT);
}

// C# GetUserDocsPath — RogueGame.cs:20007
export function getUserDocsPath(): string {
	return `${getUserBasePath()}Docs/`;
}

// C# GetUserGraveyardPath — RogueGame.cs:20012
export function getUserGraveyardPath(): string {
	return `${getUserBasePath()}Graveyard/`;
}

// C# GetUserNewGraveyardName — RogueGame.cs:20021
//
// C# loops until `!File.Exists(GraveFilePath(name))`; in the browser graves are
// stored in localStorage under `textfile:` (see `TextFile.save`).
export function getUserNewGraveyardName(): string {
	let name = "";
	let i = 0;
	let isFreeID = false;
	do {
		name = `grave_${String(i).padStart(3, "0")}`;
		isFreeID = storage.getItem(`textfile:${graveFilePath(name)}`) === null;
		++i;
	} while (!isFreeID);

	return name;
}

// C# GraveFilePath — RogueGame.cs:20037
//
// C# appends the user graveyard directory (a filesystem path); `TextFile.save`
// keys by file name alone, so the directory is dropped.
export function graveFilePath(graveName: string): string {
	return `${graveName}.txt`;
}

// C# GetUserConfigPath — RogueGame.cs:20042
export function getUserConfigPath(): string {
	return `${getUserBasePath()}Config/`;
}

// C# GetUserOptionsFilePath — RogueGame.cs:20047
export function getUserOptionsFilePath(): string {
	return `${getUserConfigPath()}options.dat`;
}

// C# GetUserScreenshotsPath — RogueGame.cs:20052
export function getUserScreenshotsPath(): string {
	return `${getUserBasePath()}Screenshots/`;
}

// C# GetUserNewScreenshotName — RogueGame.cs:20061
//
// Browser divergence: C# loops until it finds a filename that is not already on
// disk. A browser cannot see the Downloads folder, so the loop could never
// terminate honestly — and the port's `isFreeID = true` made it return
// "screenshot_000" every single time, so with the renderer hardcoding the
// download name too, every screenshot in the game overwrote the one before it. A
// counter is the browser's equivalent of "pick a name that is not taken": it is
// monotonic, so two shots in one session never collide.
export function getUserNewScreenshotName(): string {
	return `screenshot_${String(screenshotCounter++).padStart(3, "0")}`;
}

// C# ScreenshotFilePath — RogueGame.cs:20077
//
// The extension comes from the UI in the C#'s arrangement, because that is where
// the renderer decides it. Passed in rather than reached for, so this module does
// not depend on a UI it only needs one string from.
export function screenshotFilePath(shotname: string, extension: string): string {
	return `${getUserScreenshotsPath()}${shotname}.${extension}`;
}

// C# GetUserManualFilePath — RogueGame.cs:20127
//
// Browser: the manual ships as a static asset (web/public/assets/manual.txt).
export function getUserManualFilePath(): string {
	return "assets/manual.txt";
}

// C# GetUserHiScorePath — RogueGame.cs:20132
export function getUserHiScorePath(): string {
	return getUserSavesPath();
}

// No `GetUserHiScoreFilePath` / `GetUserHiScoreTextFilePath`.
//
// The C# has both: a binary table and a text dump beside it. Neither has a reader
// here, and neither is written any more either -- the table itself lives in
// `localStorage` under `HiScoreTable.STORAGE_KEY` ("rogue-survivor-hiscores"), via
// `HiScoreTable.save`/`load`, which is the port's equivalent of the C#'s binary
// file.
//
// What *was* still happening is the reason these are gone rather than merely unused:
// `HandleHiScores` built a `TextFile` dump and saved it under
// `textfile:hiscores.txt` in the same `localStorage`. So the scores were stored
// twice, and the second copy was a plain-text rendering nobody read -- visible to
// the player in devtools as a leftover file from a C# build that never shipped.
//
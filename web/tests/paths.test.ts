import { describe, it, expect, beforeEach } from "vitest";

import {
	getUserBasePath,
	getUserConfigPath,
	getUserDocsPath,
	getUserGraveyardPath,
getUserHiScorePath,
	getUserManualFilePath,
	getUserNewGraveyardName,
	getUserNewScreenshotName,
	getUserOptionsFilePath,
	getUserSave,
	getUserSavesPath,
	getUserScreenshotsPath,
	graveFilePath,
	resetScreenshotCounter,
	screenshotFilePath,
} from "@engine/Paths";
import { storage } from "@engine/storage";
import { RogueGame } from "@engine/RogueGame";

/**
 * The C# `GetUser*` path helpers, now a module.
 *
 * `plans/BROWSER_PORT_PLAN.md` §6.5 made this Wave 1's first extraction. The
 * interesting part is not that the paths are right — most of them are `""` in a
 * browser, because there is no filesystem — but that three of them carry real
 * state or effects, which is what made them a *field* before:
 *
 *   - `getUserNewGraveyardName` reads storage, looping until it finds a free name.
 *   - `getUserNewScreenshotName` increments a counter.
 *   - `getUserSave` reads the save slot.
 *
 * The tests below are the reason that is worth stating: each of the three was only
 * reachable before by standing up a whole `RogueGame` to observe a side effect.
 */
describe("Paths: the browser has no filesystem, so these are keys", () => {
	it("has an empty base, and the derived paths hang off it", () => {
		expect(getUserBasePath()).toBe("");
		expect(getUserSavesPath()).toBe("");
		expect(getUserDocsPath()).toBe("Docs/");
		expect(getUserGraveyardPath()).toBe("Graveyard/");
		expect(getUserConfigPath()).toBe("Config/");
		expect(getUserScreenshotsPath()).toBe("Screenshots/");
	});

	it("keys saves by slot rather than by filename", () => {
		// C# returns a filesystem path here. The browser port keys by IndexedDB
		// slot.
		expect(getUserSave()).toBe("0");
	});

	it("agrees with RogueGame.CURRENT_SAVE_SLOT, which it cannot import", () => {
		// `Paths.ts` holds its own copy of the slot number, because `RogueGame`
		// imports `Paths` and importing back would be a cycle. Two constants
		// claiming to be the same value is exactly how a save and a delete end up
		// addressing different slots, so the equality is asserted rather than left
		// to convention. This is the check `Paths.ts`'s own comment promises.
		expect(getUserSave()).toBe(String(RogueGame.CURRENT_SAVE_SLOT));
	});

	it("names the options file inside the config directory", () => {
		expect(getUserOptionsFilePath()).toBe("Config/options.dat");
	});

	it("points the manual at the bundled asset, not a user directory", () => {
		expect(getUserManualFilePath()).toBe("assets/manual.txt");
	});

	it("keys hi-scores off the saves path, as the C# does", () => {
		expect(getUserHiScorePath()).toBe(getUserSavesPath());
		// Deliberately no assertion for a hiscores *file* name. The C# has a binary
		// table and a text dump beside it; neither exists here. The table is
		// `localStorage` under `HiScoreTable.STORAGE_KEY`, written by
		// `HiScoreTable.save`, and the text dump had no reader and was removed rather
		// than left as a second copy of the scores nobody could see the point of.
	});

	it("drops the directory from a grave path, because TextFile keys by name alone", () => {
		// C# appends `GetUserGraveyardPath()`. `TextFile.save` keys by file name
		// alone, so the directory would be a lie here.
		expect(graveFilePath("grave_000")).toBe("grave_000.txt");
	});

	it("appends the UI's screenshot extension", () => {
		expect(screenshotFilePath("screenshot_007", "png")).toBe(
			"Screenshots/screenshot_007.png",
		);
	});
});

describe("Paths.getUserNewScreenshotName", () => {
	beforeEach(() => {
		resetScreenshotCounter();
	});

	it("zero-pads to three digits and counts up", () => {
		expect(getUserNewScreenshotName()).toBe("screenshot_000");
		expect(getUserNewScreenshotName()).toBe("screenshot_001");
		expect(getUserNewScreenshotName()).toBe("screenshot_002");
	});

	it("never repeats within a session", () => {
		// The bug this exists for: the port returned "screenshot_000" every time,
		// so with the renderer hardcoding the download name too, every screenshot
		// overwrote the one before it.
		const names = new Set<string>();
		for (let i = 0; i < 200; i++) names.add(getUserNewScreenshotName());
		expect(names.size).toBe(200);
	});

	it("keeps counting past three digits rather than wrapping", () => {
		// A monotonic counter, so a long session cannot collide either. `padStart`
		// is a minimum, not a maximum.
		for (let i = 0; i < 1000; i++) getUserNewScreenshotName();
		expect(getUserNewScreenshotName()).toBe("screenshot_1000");
	});
});

describe("Paths.getUserNewGraveyardName", () => {
	it("finds the first unused name", () => {
		// Nothing stored, so the very first candidate is free.
		expect(getUserNewGraveyardName()).toBe("grave_000");
	});

	it("skips names already taken, the way the C# skips existing files", () => {
		// The C# loops until `!File.Exists(...)`. In the browser a grave is a
		// `TextFile`, keyed `textfile:<name>` in storage — so the loop has to look
		// there or it will hand out a name that overwrites one.
		const take = (name: string): void => {
			storage.setItem(`textfile:${graveFilePath(name)}`, "x");
		};
		take("grave_000");
		take("grave_001");
		expect(getUserNewGraveyardName()).toBe("grave_002");

		// And it terminates rather than spinning: fill a run and check it steps
		// past all of it.
		take("grave_002");
		take("grave_003");
		expect(getUserNewGraveyardName()).toBe("grave_004");
	});

	it("reads under the same key TextFile.save writes", () => {
		// If these two ever disagree the loop hands out a name that overwrites a
		// grave, so the key is pinned rather than left to two call sites agreeing.
		storage.setItem(`textfile:${graveFilePath("grave_000")}`, "x");
		expect(getUserNewGraveyardName()).not.toBe("grave_000");
	});
});

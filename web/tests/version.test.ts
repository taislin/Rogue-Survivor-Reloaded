import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GAME_VERSION } from "@engine/GameVersion";
import { LOGICAL_W, LOGICAL_H } from "@engine/CanvasSize";

/**
 * Constants that used to be written out in more than one place, with a comment in
 * each copy saying the others must agree — and nothing checking that they did.
 *
 * ## Why this test exists
 *
 * `GAME_VERSION` was `"0.9.2"` in `RogueGame.ts`, `"0.9.2"` in
 * `ui/OptionsScreen.ts`, and `"0.9.2"` in `package.json`. Both source copies
 * carried a comment about the duplication:
 *
 *   - `RogueGame.ts`: *"Duplicated rather than shared because the C# keeps one
 *     `SetupConfig` constant and this port has no equivalent module to put it in."*
 *   - `OptionsScreen.ts`: *"Both must read the same, and both must agree with
 *     `web/package.json`'s `version`."*
 *
 * Two comments describing an invariant that no test enforced. A release could bump
 * `package.json` and ship a build whose About box still advertised the previous
 * version, with nothing red. The stated reason for the duplication — that there
 * was no module to put the constant in — is why `engine/GameVersion.ts` now exists,
 * so the invariant has something to hold.
 *
 * The canvas size had the same shape with more damage: `1366x768` appeared in
 * `RogueGame.ts`, in `OptionsScreen.ts` and as `LOGICAL_W`/`LOGICAL_H` in
 * `CanvasUI.ts`. That one had already caused a bug rather than being a latent risk
 * — `CanvasUI` documents a panel hit-test that compared a CSS mouse coordinate
 * against logical constants and only looked correct because the two spaces
 * coincide at exactly 1366x768 (`RogueGame.ts:9848`).
 *
 * ## What is asserted
 *
 * The agreement, not the values. If a future release moves to 0.10.0, this test
 * should still pass once all three are updated, and should fail loudly if only
 * some of them are — which is the case nothing caught before.
 */
describe("the version is stated once and agrees everywhere", () => {
	it("GameVersion matches package.json", () => {
		const pkg = JSON.parse(
			readFileSync(join(__dirname, "..", "package.json"), "utf8"),
		) as { version: string };
		expect(GAME_VERSION, "engine/GameVersion.ts vs package.json").toBe(pkg.version);
	});

	it("is a plausible version string, so a typo cannot satisfy the check above", () => {
		// The check above compares two literals, so it holds just as happily if both
		// are wrong in the same way. This is the part that notices "0.9.2 " or
		// "v0.9.2" or a leftover placeholder.
		expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("is not declared anywhere else in src/", () => {
		// The stronger form of the invariant: not "the copies agree" but "there is
		// one copy". A scan rather than an import, because the failure it guards is
		// someone adding a fourth `const GAME_VERSION = "..."` and having it agree
		// by luck.
		//
		// Skip `GameVersion.ts` itself, and skip this file, which names the constant
		// in its own patterns.
		const offenders: string[] = [];
		for (const file of tsFiles(join(__dirname, "..", "src"))) {
			if (file.endsWith("GameVersion.ts")) continue;
			const text = readFileSync(file, "utf8");
			for (const [n, line] of text.split("\n").entries()) {
				if (/^\s*(?:export\s+)?const\s+GAME_VERSION\s*=/.test(line))
					offenders.push(`${file}:${n + 1}`);
			}
		}
		expect(offenders, "declare the version in engine/GameVersion.ts only").toEqual([]);
	});
});

describe("the logical canvas size is declared once", () => {
	it("is the size the layout constants are derived from", () => {
		expect(LOGICAL_W).toBe(1366);
		expect(LOGICAL_H).toBe(768);
	});

	it("is not declared anywhere else in src/", () => {
		// Same reasoning as the version: `CanvasUI` used to hold `LOGICAL_W`/
		// `LOGICAL_H` because "the renderer must not depend on RogueGame", which
		// argued for duplicating the numbers instead of adding a module both could
		// import. `engine/CanvasSize.ts` is that module.
		const offenders: string[] = [];
		for (const file of tsFiles(join(__dirname, "..", "src"))) {
			if (file.endsWith("CanvasSize.ts")) continue;
			const text = readFileSync(file, "utf8");
			for (const [n, line] of text.split("\n").entries()) {
				if (
					/^\s*(?:export\s+)?const\s+(?:CANVAS_(?:WIDTH|HEIGHT)|LOGICAL_[WH])\b/.test(
						line,
					)
				)
					offenders.push(`${file}:${n + 1}  ${line.trim()}`);
			}
		}
		expect(offenders, "declare the canvas size in engine/CanvasSize.ts only").toEqual(
			[],
		);
	});
});

/** Every `.ts` file under `dir`, recursively. */
function tsFiles(dir: string): string[] {
	const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...tsFiles(full));
		else if (entry.endsWith(".ts")) out.push(full);
	}
	return out;
}
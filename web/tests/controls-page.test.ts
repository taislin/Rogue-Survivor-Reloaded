/**
 * `docs/controls.html` against the bindings it claims to document.
 *
 * The page is hand-maintained, and `scripts/build-site.mjs` only checks that it
 * exists. That is fine until a binding moves or a row goes missing, at which point
 * nothing notices and the site confidently sends a player to press a key the game
 * does not read.
 *
 * ## Why this exists rather than a generator
 *
 * `tests/manual-bindings.test.ts` already does this job for `docs/manual.html`, and
 * its header explains why generation is the wrong answer here too: the prose would
 * have to be written twice, and the two pages are deliberately not the same shape.
 * `controls.html` is a *superset* of `manual.txt` — it documents bumping, the mouse
 * actions, the action menu and the first-person keys, which the plain-text in-game
 * manual omits. So there is no single artefact to generate from.
 *
 * ## What is asserted, and what is deliberately not
 *
 * Two things, both mechanical:
 *
 *   1. Every key `manual.txt` documents also appears on the page. That catches a
 *      binding being dropped from the site entirely.
 *   2. A per-row table, because *that* is the failure a key-presence check cannot
 *      see. `manual.txt` has `BARRICADING OBJECTS => B` and `REPAIRING
 *      FORTIFICATIONS => B` as two rows; `B` was on the page for the first and
 *      nothing mentioned the second, so the page was confidently wrong about a mode
 *      the game enters as "BARRICADE/REPAIR MODE". A key that is present for the
 *      wrong reason reads as correct to any check that only asks whether the key
 *      appears.
 *
 * `manual.txt` is the reference rather than `Keybindings.ts` for the reason
 * `manual-bindings.test.ts` gives: deriving expectations from the live defaults would
 * move the expectation whenever a binding moves, and the page would follow it. That
 * is a tautology. Whether `manual.txt` itself is right stays a human question.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const TXT = readFileSync(join(ROOT, "public", "assets", "manual.txt"), "utf-8");
const HTML = readFileSync(join(ROOT, "..", "docs", "controls.html"), "utf-8");

/** `manual.txt`'s `> LABEL  (default KEYS)` rows, its whole convention. */
function textRows(): Map<string, string> {
	const rows = new Map<string, string>();
	for (const m of TXT.matchAll(/^> (.+?) {2}\(default (.+?)\)\s*$/gm)) {
		rows.set(m[1]!.replace(/\s+/g, " ").trim(), m[2]!.trim());
	}
	return rows;
}

/**
 * Every documented row on the page: a table row, or a `keylist` entry.
 *
 * Both shapes carry a key and a description, and both appear in this page, so both
 * are parsed. Anything that comes out with no key is dropped — that is what a prose
 * row in the same table would look like, and folding it in would make every
 * assertion below vacuous.
 */
interface Row {
	readonly keys: string;
	readonly label: string;
}

function rows(): Row[] {
	const out: Row[] = [];
	const text = (html: string): string =>
		html
			.replace(/<[^>]+>/g, " ")
			.replace(/&hellip;/g, "…")
			.replace(/&mdash;/g, "-")
			.replace(/&middot;/g, "·")
			.replace(/&amp;/g, "&")
			.replace(/&larr;/g, "Left")
			.replace(/&darr;/g, "Down")
			.replace(/&uarr;/g, "Up")
			.replace(/&rarr;/g, "Right")
			.replace(/&nbsp;/g, " ")
			.replace(/\s+/g, " ")
			.trim();

	for (const m of HTML.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
		const cells = [...m[1]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1]!);
		if (cells.length < 2) continue;
		out.push({ keys: text(cells[0]!), label: text(cells[1]!) });
	}
	for (const m of HTML.matchAll(/<div>([\s\S]*?)<\/div>/g)) {
		const inner = m[1]!;
		if (!/<kbd>/.test(inner)) continue;
		// A `keylist` entry is `<kbd>key</kbd><span class="h-plus">+</span><kbd>key</kbd>
		// <span>label</span>`. The `<kbd>`s and the `h-plus` spans are all part of the
		// key, and the last bare `<span>` is the label -- so the two have to be taken
		// apart here rather than flattened. Flattening made every entry's "keys" the
		// whole sentence, which then failed the length guard below and reported two
		// correctly-documented bindings as missing.
		const keys = [...inner.matchAll(/<kbd>([\s\S]*?)<\/kbd>|<span class="h-plus">([\s\S]*?)<\/span>/g)]
			.map((k) => text(k[1] ?? k[2] ?? ""))
			.join("");
		const labels = [...inner.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((l) => text(l[1]!));
		out.push({ keys, label: labels.join(" ") });
	}
	return out;
}

const ALL_ROWS = rows();
const REF = textRows();

/**
 * Every documented key on the page, folded into one comparable blob.
 *
 * Normalised with the same `loose` as the needle: the page writes `Shift+S` with a
 * plus where `manual.txt` writes `Shift-S` with a hyphen, so comparing a folded
 * needle against an unfolded blob misses every modified key on the site at once.
 */
function keyBlob(): string {
	return loose(
		ALL_ROWS.map((r) => r.keys)
			.join(" "),
	);
}

/**
 * Two spellings of one claim, folded together.
 *
 * `manual.txt` writes `Shift-W` and `Control-N`; the page writes `Shift+W` and
 * `Ctrl+N`. Neither is wrong, so the separator and the modifier's spelling are
 * normalised away rather than corrected. `Numpad5` becomes `num5` for the same
 * reason -- the page splits it into a `Num` key and a `5`.
 */
function loose(s: string): string {
	return s
		.toLowerCase()
		.replace(/\bnumpad/g, "num")
		.replace(/\bcontrol\b/g, "ctrl")
		.replace(/\s+/g, "")
		.replace(/[-+]/g, "");
}

describe("docs/controls.html documents the bindings", () => {
	it("parses, and has the rows a controls reference is made of", () => {
		// Anti-vacuity for everything below. If a markup change emptied the parser,
		// the key-presence and per-row checks would both pass on nothing.
		expect(REF.size).toBeGreaterThan(20);
		expect(ALL_ROWS.length).toBeGreaterThan(40);
	});

	it("mentions every key manual.txt documents", () => {
		// The coarse check: a binding that vanished from the site entirely.
		//
		// `manual.txt` is not one key per row. It writes "Q W E / A S D / Z C" for
		// movement and "N and Control-N" for fortifications, so the alternatives are
		// split on all three separators rather than commas alone -- otherwise the whole
		// movement row is looked for as one impossible string. Rows that name a verb
		// instead of a key ("direction key") are prose, not bindings, and are skipped:
		// the page documents those as bumping rows, which is a different shape.
		const blob = keyBlob();
		const missing: string[] = [];
		for (const [label, keys] of REF) {
			for (const key of keys
				.split(/,|\/|\band\b/i)
				.map((k) => k.trim())
				.filter((k) => k !== "")) {
				// "X, or NumPad5" and "B, or mouse" leave an "or ..." alternative behind,
				// and a leading "or" means the token is an alternative, never the key.
				if (/mouse|direction|^or\b/i.test(key)) continue;
				if (!blob.includes(loose(key))) missing.push(`${label}: "${key}"`);
			}
		}
		expect(missing).toEqual([]);
	});

	/**
	 * The per-row table.
	 *
	 * Each entry is `[keys, a word that must appear in that row]`. The label fragment
	 * is what makes this catch a *missing row* rather than merely a changed key.
	 */
	const REQUIRED: readonly (readonly [string, string])[] = [
		// The two this file exists for.
		["B", "repair"],
		["Tab", "action menu"],
		// A spread of the rest, so the table is not satisfied by two rows.
		["Q W E A S D Z C", "Move"],
		["R", "Run"],
		["X", "Wait"],
		["Shift+W", "Wait one hour"],
		["Shift+Z", "Sleep"],
		["U", "Shout"],
		[".", "Use exit"],
		["P", "Push"],
		["Ctrl+P", "Push"],
		["F", "Fire"],
		["Shift+T", "Close"],
		["Shift+E", "Eat"],
		["Shift+R", "Revive"],
		["1…0", "slot"],
		["G", "Give"],
		["K", "Break"],
		["N", "fortification"],
		["Ctrl+N", "fortification"],
		["M", "spray"],
		["Ctrl+E", "enemies"],
		["L", "trade"],
		["T", "Lead"],
		["O", "Order"],
		["Ctrl+S", "Switch place"],
		["Shift+U", "Unload"],
		["Y", "backpack"],
		["Ctrl+F", "fire"],
		["H", "manual"],
		["Shift+H", "Advisor"],
		["Ctrl+H", "hints"],
		["I", "City info"],
		["Shift+M", "Message log"],
		["Shift+O", "Options"],
		["Shift+K", "Redefine keys"],
		["Shift+F", "view"],
		["Shift+S", "Save"],
		["Shift+L", "Load"],
		["Shift+N", "Screenshot"],
		["Shift+A", "Abandon"],
		["Shift+Q", "Quit"],
	];

	it("has a row for each of them, with the key it claims", () => {
		const missing: string[] = [];
		for (const [keys, word] of REQUIRED) {
			const hit = ALL_ROWS.some(
				(r) =>
					loose(r.keys).includes(loose(keys)) && loose(r.keys).length <= loose(keys).length + 24,
			);
			if (!hit) {
				missing.push(`no row keyed "${keys}"`);
				continue;
			}
			// The row that matched must also be the one that mentions the action, or the
			// check would pass on a row that has the right key and the wrong job.
			const withWord = ALL_ROWS.filter(
				(r) =>
					loose(r.keys).includes(loose(keys)) &&
					loose(r.keys).length <= loose(keys).length + 24,
			);
			if (!withWord.some((r) => loose(r.keys + " " + r.label).includes(loose(word)))) {
				missing.push(`"${keys}" has no row mentioning "${word}"`);
			}
		}
		expect(missing).toEqual([]);
	});

	it("does not claim a save slot count the game does not have", () => {
		// `GameSaveManager` addresses ten slots, but `RogueGame.CURRENT_SAVE_SLOT` is
		// 0 and neither the save nor the load screen offers a picker -- one slot, in
		// practice. The page is right; this is here because the two facts disagree in
		// the source and the page is the one a player reads.
		expect(loose(HTML)).toContain("onesaveslot");
	});
});
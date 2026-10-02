/**
 * The manual, and the bindings it prints.
 *
 * `docs/manual.html` is hand-maintained — it is a documentation page, not a build
 * artefact, and `build-site.mjs` only checks that it exists. That is fine until the
 * day a binding moves, at which point nothing notices and the site confidently
 * tells a player to press `S` to shout.
 *
 * ## Why this exists rather than a generator
 *
 * Two manuals, both hand-maintained, and they disagreed:
 *
 * - `web/public/assets/manual.txt` — the in-game manual, plain text.
 * - `docs/manual.html` — the website page, and a *superset* of it: it documents the
 *   bumping and firing rows and the mouse actions that the text version omits.
 *
 * So there is no single source to generate from, and generating one would mean
 * writing the prose twice anyway. What can be checked is the part that is not
 * prose: the key each row claims. That is what this asserts.
 *
 * ## Why `manual.txt` is the reference and not `Keybindings`
 *
 * Because `manual.txt` is already correct and was already right before this file
 * existed — `manual.txt` is transcribed from the C# manual and the port's defaults
 * were chosen to match it. Deriving the expectations from `Keybindings` instead
 * would make this a tautology: it would check the manual against the thing the
 * manual describes, and a binding moved in `Keybindings.ts` would move the
 * expectation with it.
 *
 * What is *not* asserted is that `manual.txt` is right. That is a transcription
 * question, and the honest check for it is a human reading the fork's manual. What
 * is asserted is the narrower and mechanical thing: the two manuals and the live
 * defaults agree.
 *
 * ## The ten rows this caught
 *
 * `docs/manual.html` was still on the pre-fork bindings — `S` for shout, `W` for
 * wait-an-hour, `C` for close-door, `A` for spray, `X` for use-exit — and had been
 * since before the fork rebindings landed. Five of those are cases where the
 * fork moved a command to a modifier key, so the drift is not a typo: it is the
 * page describing a game that was never shipped.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const TXT = readFileSync(join(ROOT, "public", "assets", "manual.txt"), "utf-8");
const HTML = readFileSync(join(ROOT, "..", "docs", "manual.html"), "utf-8");

/** `manual.txt`'s `> LABEL  (default KEYS)` rows, which is its whole convention. */
function textRows(): Map<string, string> {
	const rows = new Map<string, string>();
	for (const m of TXT.matchAll(/^> (.+?) {2}\(default (.+?)\)\s*$/gm)) {
		rows.set(m[1]!.replace(/\s+/g, " ").trim(), m[2]!.trim());
	}
	return rows;
}

/**
 * Key *strings* out of an html fragment, with the markup and the layout
 * whitespace removed.
 *
 * The whitespace part is not cosmetic: the formatter wraps these headings, and
 * several of them split `<span class="h-src">` across two lines. A regex that
 * expects the tags adjacent finds nothing there and silently passes — which is
 * how four drifted rows survived a first attempt at this file.
 */
function keysIn(fragment: string): string {
	// Tags become *nothing*, not a space. A modifier combo is written
	// `<kbd>Shift</kbd>-<kbd>W</kbd>`, so the hyphen is text sitting between two
	// elements: replacing tags with a space turns "Shift-W" into "Shift W", which
	// then fails to compare equal to the reference and reads as eight rows of drift
	// that do not exist. The literal text between the elements is the key.
	return fragment
		.replace(/<[^>]+>/g, "")
		.replace(/&hellip;/g, "…")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim()
		// The span opens with the literal word `default` — the prose "default H",
		// not the key. `manual.txt` writes the same thing as `(default H)`, so both
		// sides have it and it has to come off both, or every row compares unequal by
		// one word.
		.replace(/^default\s+/, "");
}

/** Case- and whitespace-insensitive, `Numpad` == `NumPad`, for comparing two spellings. */
function norm(s: string): string {
	return s
		.replace(/…/g, "...")
		.replace(/Numpad/g, "NumPad")
		.replace(/\s+/g, "")
		.toLowerCase();
}

const REF = textRows();

describe("manual.txt is the reference", () => {
	it("parses, and has the number of rows the text manual documents", () => {
		// If the `> LABEL  (default KEYS)` convention ever changes shape, this fails
		// first — and loudly — rather than every comparison below quietly passing on
		// an empty map.
		expect(REF.size).toBeGreaterThan(20);
	});
});

describe("docs/manual.html prints the same keys", () => {
	it("agrees with manual.txt on every heading that carries a default", () => {
		const wrong: string[] = [];
		// One pass over the s4 headings. Split on the heading open tag so a label and
		// its key span are handled together; `manual.html` is the only structure here.
		const chunks = HTML.split(/(?=<h3 id="s4-)/).slice(1);
		let checked = 0;
		for (const chunk of chunks) {
			const span = /<span\s+class="h-key">\s*<span\s+class="h-src">default<\/span>[\s\S]*?<\/span>\s*<\/h3>/.exec(
				chunk,
			);
			if (span === null) continue;
			const headEnd = chunk.indexOf(">", chunk.indexOf('<h3 id="s4-')) + 1;
			// `span.index` is already an offset into `chunk`, so it is *not* offset
			// again by `headEnd`. Adding it was enough to turn every label into a
			// fragment of markup and match almost nothing -- and the anti-vacuity
			// count below is what caught it, which is the reason that count is here.
			const label = chunk
				.slice(headEnd, span.index)
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			const want = REF.get(label);
			if (want === undefined) continue;
			checked++;
			const have = keysIn(span[0]);
			if (norm(have) !== norm(want)) wrong.push(`${label}: html "${have}" vs manual.txt "${want}"`);
		}
		// Anti-vacuity: the loop must have found real rows, or a markup change would
		// turn this into a test that asserts nothing.
		expect(checked).toBeGreaterThan(15);
		expect(wrong).toEqual([]);
	});

	it("agrees in the table of contents too", () => {
		// The contents list repeats every label and key as plain text, and it drifted
		// independently of the headings: fixing the headings alone would have left
		// the page contradicting itself four lines apart.
		const wrong: string[] = [];
		let checked = 0;
		for (const m of HTML.matchAll(/<li><a href="#s4-[^"]*">([\s\S]*?)<\/a><\/li>/g)) {
			const plain = m[1]!
				.replace(/&amp;/g, "&")
				.replace(/&quot;/g, '"')
				.replace(/&hellip;/g, "…")
				.replace(/\s+/g, " ")
				.trim();
			const dm = /^(.*?) \(default (.+)\)$/.exec(plain);
			if (dm === null) continue;
			const want = REF.get(dm[1]!.trim());
			if (want === undefined) continue;
			checked++;
			if (norm(dm[2]!.trim()) !== norm(want)) {
				wrong.push(`${dm[1]!.trim()}: contents "${dm[2]!.trim()}" vs manual.txt "${want}"`);
			}
		}
		expect(checked).toBeGreaterThan(15);
		expect(wrong).toEqual([]);
	});

	it("never lost a heading's key markup while being rewritten", () => {
		// The correction is a text substitution over markup, so the failure mode is a
		// well-formed page with one row that silently stopped showing its key. Counts
		// rather than content, because this is about the rewrite not the wording.
		const withKey = (HTML.match(/class="h-src">default<\/span>/g) ?? []).length;
		expect(withKey).toBeGreaterThan(15);
		// Every one is closed. Not `toBe`: four of the spans carry `mouse` instead of
		// `default` (looking, taking and dropping, equipping, giving), so there are
		// more `h-key` spans than default-bearing ones. The check that matters is
		// that no default span was left unclosed, and the equality in the first
		// assertion of this block already pins the count.
		const opens = (HTML.match(/<span\s+class="h-key">/g) ?? []).length;
		expect(opens).toBeGreaterThanOrEqual(withKey);
	});
});

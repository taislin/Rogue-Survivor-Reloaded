/**
 * Measures the `RogueGame.ts` structure that §6 of the port plan is built on.
 *
 * Run it: `node scripts/measure-roguegame.mjs`
 *
 * ## Why this is a script and not a paragraph
 *
 * `plans/BROWSER_PORT_PLAN.md` §6 justifies a four-wave decomposition with
 * measured numbers taken on 2026-09-29, when the file was 27,722 lines. It is now
 * 35,961, and **every `file:line` in §6.2 through §6.9 is stale** — including the
 * two that carry the argument. The file did not grow at the end: ported content
 * landed in the middle, so a line range no longer identifies a region. Re-running
 * §6.2's own table against the current file classifies `DoSay` (`:21697`) as
 * render-cluster and `DoUseItem` (`:22557`) with it, which is the region the plan
 * says is a *leaf with 11 outbound edges*. Both are hub action methods.
 *
 * So this script classifies **by member name**, which is what the plan's prose
 * always described (`14008–18936` `Do*`/`On*` action primitives`), and never by
 * line. The line numbers are reported so a human can check a claim, never used to
 * decide one.
 *
 * ## The question it exists to answer
 *
 * §6.10's stop condition: *"Stop if Wave 0 turns out to require changing a public
 * signature that a test or `HeadlessRunner` depends on."* The 2024 deferral's
 * stated cost was "thread a `game` reference through ~500 call sites", and §6
 * calls that "the pessimistic one". So the number that decides whether to proceed
 * is **how many members of the class are called from outside it** — every one of
 * those is a signature the split must not break.
 *
 * Call sites are found with comments stripped, because the file's own docblocks
 * name methods constantly ("`RogueGame.DrawHeader()` — RogueGame.cs ≈ 19975") and
 * a scan that reads prose reports ~40 members that are never called at all. That
 * is not a hypothetical: `src/ui/OptionsScreen.ts` mentions `DrawMenuOrOptions`,
 * `DrawHeader` and `DrawFootnote` in three docblocks and *duplicates* all three
 * rather than calling them, so an unstripped scan credits it with three seams
 * that do not exist.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");
const SRC = join(WEB, "src");
const ROGUEGAME = join(SRC, "engine", "RogueGame.ts");

/** Block comments first: a `//` inside a `/** … *\/` must not survive. */
function stripComments(text) {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === "dist" || entry === "coverage") continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (entry.endsWith(".ts")) out.push(full);
	}
	return out;
}

const raw = readFileSync(ROGUEGAME, "utf8");
const lines = raw.split("\n");
const classStart = lines.findIndex((l) => /^export class RogueGame/.test(l));

/** Every class member, with the line its declaration is on and its visibility. */
const MEMBER = /^\t(?:(?:public|private|protected)\s+)?(?:(?:static|readonly|async|abstract|override)\s+)*(?:(?:get|set)\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*(?:\(|[:=;])/;
const members = new Map();
for (let i = classStart; i < lines.length; i++) {
	const m = MEMBER.exec(lines[i]);
	if (!m || members.has(m[1])) continue;
	const decl = lines[i];
	const visibility = /\bprivate\b/.test(decl) ? "private" : /\bprotected\b/.test(decl) ? "protected" : "public";
	members.set(m[1], {
		line: i + 1,
		visibility,
		isMethod: /\(/.test(decl),
		decl: decl.trim(),
	});
}

/**
 * Which wave, or which hub, a member belongs to — **by name**.
 *
 * The order matters: the render and describe patterns are tested before the hub
 * patterns, because a hub method can be named `RedrawPlayScreen` (it is, at
 * `:25605`) and a render method can be named `Do*` (it is: `DoSay` sits inside
 * the render cluster's line range without belonging to it). Naming is the only
 * stable key; see the header.
 */
function classify(name) {
	// The two hubs, which §6.8 says never move.
	if (/^Handle(Player|Mouse|LMB|RMB|KeyOrMouse|DirectionOrCancel)/.test(name)) return "HUB 2  HandlePlayer*/mouse command handlers";
	if (/^(Do|On)[A-Z]/.test(name) && !/^Do(Redraw|Draw)/.test(name)) return "HUB 1  Do*/On* action primitives";
	if (/^(Redraw|Draw|buildScene|drawOverlay|addOverlay)/.test(name)) return "WAVE 2  render cluster";
	if (/^(GetUser|collectPlayerTagTiles|MapToScreen|ScreenToMap|MouseToMap|MenuRowAt|WaitMenuInput)/.test(name))
		return "WAVE 1  leaves (paths, coordinates, menu chrome)";
	if (/^Describe|^GetAdvisorHintText/.test(name)) return "WAVE 1  leaves (Describe*)";
	if (/^do[A-Z]/.test(name)) return "WAVE 1  leaves (do* aliases for Actions.ts)";
	// The new-game flow is a named list, not a pattern: §6.7 names sixteen methods
	// and the rest of the file is not part of it.
	if (/^(Run|GameLoop|HandleMainMenu|HandleNewCharacter|HandleSelectRuleset|HandleNewGameMode|StartNewGame|InitDirectories|LoadData|LoadOptions|SaveOptions|LoadKeybindings|LoadHiScoreTable|SaveHiScoreTable|HandleHelpMode|HandleHintsScreen|HandleCredits)$/.test(name))
		return "WAVE 3  new-game flow";
	return "unclassified";
}

/** `game.x` / `RogueGame.x` from anywhere but the class body, comments stripped. */
const CONSUMER_DIRS = ["tests", "src/sim", "src/ui", "src/gameplay", "src/data"];
const CALL = /\b(?:game|gen|runner|rogueGame|instance|self|context|ctx)\??\.([A-Za-z_]\w*)/g;
const seen = new Map();
for (const dir of CONSUMER_DIRS) {
	const full = join(WEB, dir);
	if (!exists(full)) continue;
	for (const file of walk(full)) {
		const text = stripComments(readFileSync(file, "utf8"));
		const where = relative(WEB, file);
		for (const m of text.matchAll(CALL)) {
			if (members.has(m[1]) && !seen.has(m[1])) seen.set(m[1], where);
		}
		for (const m of text.matchAll(/RogueGame\.([A-Za-z_]\w*)/g)) {
			if (members.has(m[1]) && !seen.has(m[1])) seen.set(m[1], where);
		}
	}
}

function exists(p) {
	try {
		statSync(p);
		return true;
	} catch {
		return false;
	}
}

// ── Report ───────────────────────────────────────────────────────────────────

const visibility = { public: 0, protected: 0, private: 0 };
for (const m of members.values()) visibility[m.visibility]++;

const buckets = new Map();
for (const name of seen.keys()) {
	const bucket = classify(name);
	if (!buckets.has(bucket)) buckets.set(bucket, []);
	buckets.get(bucket).push(name);
}

const HUB = /^HUB/;
const moving = [...seen.keys()].filter((n) => !HUB.test(classify(n)));
const privateUsed = [...seen.keys()].filter((n) => members.get(n).visibility === "private");

console.log(`RogueGame.ts: ${lines.length} lines, class at ${classStart + 1}`);
console.log(`members: ${members.size}  (public ${visibility.public}, protected ${visibility.protected}, private ${visibility.private})`);
console.log(`methods: ${[...members.values()].filter((m) => m.isMethod).length}`);
console.log(`reached from outside the class: ${seen.size}`);
console.log(`  … in a region §6 moves: ${moving.length}`);
console.log(`  … in a hub (never moves):  ${seen.size - moving.length}`);
console.log(`  … private members reached from a test: ${privateUsed.length}\n`);

for (const [bucket, list] of [...buckets].sort()) {
	console.log(`${bucket} — ${list.length}`);
	for (const name of list.sort()) {
		const m = members.get(name);
		console.log(`  ${String(m.line).padStart(6)}  ${m.visibility.padEnd(7)} ${name}`);
	}
	console.log();
}

console.log("private members reached from outside (these are structural reaches today):");
for (const name of privateUsed.sort()) {
	const m = members.get(name);
	console.log(`  ${String(m.line).padStart(6)}  ${name.padEnd(28)} ${seen.get(name)}  —  ${m.decl.slice(0, 60)}`);
}

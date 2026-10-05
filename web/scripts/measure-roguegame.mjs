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
const MEMBER = /^\t(?:(?:public|private|protected)\s+)?(?:(?:static|readonly|async|override)\s+)*(?:(?:get|set)\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*(?:\(|[:=;])/;

/**
 * Whether a declaration is a method or a field — decided by the **first**
 * delimiter after the name, not by the presence of a `(` anywhere on the line.
 *
 * A field with an initialiser carries brackets of its own:
 * `m_SpeechBubbles: globalThis.Map<Actor, SpeechBubble> = new globalThis.Map();`
 * has a `(` from the `new`, and a whole-line `(` test counts that field as a
 * method — putting it in both totals and quietly inflating `methods`. The name is
 * followed by `(` in a method declaration and by `:` or `=` in a field's, so the
 * first one of those decides it, and the type parameter list of a generic
 * method (`foo<T>(`) cannot be mistaken for either.
 */
function isMethodDecl(decl, name) {
	const afterName = decl.slice(decl.indexOf(name) + name.length);
	const first = /[(:=;]/.exec(afterName);
	return first !== null && first[0] === "(";
}

const members = new Map();
for (let i = classStart; i < lines.length; i++) {
	const m = MEMBER.exec(lines[i]);
	if (!m || members.has(m[1])) continue;
	const decl = lines[i];
	const visibility = /\bprivate\b/.test(decl) ? "private" : /\bprotected\b/.test(decl) ? "protected" : "public";
	members.set(m[1], {
		line: i + 1,
		visibility,
		isMethod: isMethodDecl(decl, m[1]),
		decl: decl.trim(),
	});
}

/**
 * Which region a member belongs to — **by name**, and ordered by how hard it is to
 * move.
 *
 * The order matters. §6's original table was a list of `file:line` ranges, and the
 * file grew in the middle, so those ranges no longer identify anything. Worse, the
 * table was *incomplete*: 68 of the 110 externally-reached members fell outside every
 * region it named, and they included `AddMessage`, `KillActor`, `AdvancePlay` and
 * `UpdatePlayerFOV`. A wave plan whose residual is unclassified is not a plan, so
 * this is a taxonomy over the whole class rather than a subset of it.
 *
 * The ordering is by **extractability**, not by position in the file, because that is
 * the only thing that decides what to do first:
 *
 * - `HUB` — never moves. §6.8's reasoning survives re-measurement untouched: 27 of the
 *   110 land here and they are the reason the split is worth doing.
 * - `LEAF` — no instance state; reads its arguments or a `static`. Extractable into a
 *   module with a thin delegation left behind, which is what §6.5 called Wave 1.
 * - `VIEW` — first-person facing, map zoom, screen projection. Self-contained state,
 *   reachable through a small interface, but it is real state so it needs one.
 * - `WORLD` — actor spawning and district entry. Touches the session and the map.
 * - `ENGINE` — options, save/load, ruleset, the turn loop. The deepest state, and the
 *   last thing to move.
 *
 * A member matching none of these is reported as `STATE` — a field, a constant or a
 * `this` accessor — because those are what `GameContext` has to *carry* rather than
 * what a wave moves. That is the answer to §6.4's "which 11 service fields" question,
 * measured instead of guessed.
 */
function classify(name) {
	// ── The two hubs. Never move. §6.8. ──────────────────────────────────────
	if (/^Handle(Player|Mouse|LMB|RMB|KeyOrMouse|DirectionOrCancel)/.test(name)) {
		return { region: "HUB 2", extract: "never", note: "mouse/command handlers" };
	}
	if (/^(Do|On)[A-Z]/.test(name) && !/^Do(Redraw|Draw)/.test(name)) {
		return { region: "HUB 1", extract: "never", note: "action primitives" };
	}

	// ── Wave 3: the new-game flow. A named list, not a pattern: §6.7 names sixteen
	// methods and the rest of the file is not part of it. ─────────────────────
	//
	// `HandleSelectRuleset` and `HandleNewGameMode` were the two rows' worth of
	// pickers before they merged into one screen, and are now
	// `HandleSelectRulesetAndMode`; the three character screens became
	// `HandleNewCharacterDetails`. The list is anchored, so a rename drops the
	// method out of Wave 3 entirely and into `STATE` below — which reads as a
	// one-member wobble in a bucket it does not belong to rather than as a
	// classifier that has lost track of the file.
	if (/^(Run|GameLoop|HandleMainMenu|HandleNewCharacter|HandleSelectRulesetAndMode|HandleNewCharacterDetails|StartNewGame|InitDirectories|LoadData|LoadOptions|SaveOptions|LoadKeybindings|SaveKeybindings|LoadHiScoreTable|SaveHiScoreTable|HandleHelpMode|HandleHintsScreen|HandleCredits)$/.test(name)) {
		return { region: "WAVE 3", extract: "engine", note: "new-game flow" };
	}

	// ── Wave 2: the render cluster. Tested before the leaves because a leaf can be
	// named `Draw*` and a hub method can be named `RedrawPlayScreen` (it is, and it
	// is a hub). ───────────────────────────────────────────────────────────────
	if (/^(Redraw|Draw|buildScene|drawOverlay|addOverlay|ClearOverlays)/.test(name)) {
		return { region: "WAVE 2", extract: "view", note: "render cluster" };
	}

	// ── View state: first-person, zoom, projection, panel hit-testing. ─────────
	if (/^(FirstPersonFacing|TurnFirstPerson|ToggleViewMode|ComputeViewRect|MapZoom|SetMapZoom|StepMapZoom|InventorySlotToScreen|PanelSlotAtMouse|MouseToInventoryItem|MenuRowAt|IsVisibleToPlayer|UpdatePlayerFOV|WaitKeyOrMouse|WaitMenuInput)/.test(name)) {
		return { region: "VIEW", extract: "view", note: "first-person / zoom / projection" };
	}

	// ── World: actors and district entry. ─────────────────────────────────────
	if (/^(Spawn|BeforePlayerEnterDistrict|AfterPlayerEnterDistrict|CreateUniqueMap|IsActorStandingInLight|GenerateDrunkAction|Bot(Take|Release)Control|RefreshPlayer|PickHelicopterRescueSite|TileIsGoodForHelicopter|IsInCHAR)/.test(name)) {
		return { region: "WORLD", extract: "world", note: "actors / district entry" };
	}

	// ── Engine: the turn loop, damage, options, save and load. ────────────────
	if (/^(AdvancePlay|KillActor|InflictDamage|ApplyExplosionDamage|ApplyOnFire|SetActorOnFire|DropItem|AddMessage|MakeErrorMessage|ApplyOptions|LoadGame|SaveGame|HandleNewCharacterDifficulty|HandleReincarnation|CheckAmbientAudio|isActorLinkedToPlayer|IsAlmostHungry)/.test(name)) {
		return { region: "ENGINE", extract: "engine", note: "turn loop / damage / options / save" };
	}

	// ── Wave 1: the leaves. Stateless helpers and the `do*` aliases. ──────────
	if (/^Describe/.test(name)) return { region: "WAVE 1", extract: "leaf", note: "Describe*" };
	if (/^GetUser/.test(name)) return { region: "WAVE 1", extract: "leaf", note: "user-facing names" };
	if (/^(MapToScreen|ScreenToMap|MouseToMap)$/.test(name)) {
		return { region: "WAVE 1", extract: "leaf", note: "coordinates" };
	}
	if (/^do[A-Z]/.test(name)) return { region: "WAVE 1", extract: "leaf", note: "do* aliases for Actions.ts" };
	// C# quirk kept: `C# GetAdvisorHintText`, ported as `GetAdvisorHintText`.
	if (/^GetAdvisorHintText/.test(name)) return { region: "WAVE 1", extract: "leaf", note: "advisor hints" };

	// ── Everything else is state `GameContext` has to carry, not something a wave
	// moves. Fields, constants, and the `this` accessors over them. ───────────
	return { region: "STATE", extract: "carry", note: "field / constant" };
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
	const { region } = classify(name);
	if (!buckets.has(region)) buckets.set(region, []);
	buckets.get(region).push(name);
}

/** §6.8's rule: the two hubs stay, and everything else is a candidate to move. */
const isHub = (name) => classify(name).region.startsWith("HUB");
const moving = [...seen.keys()].filter((n) => !isHub(n));
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

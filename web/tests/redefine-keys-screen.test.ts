/**
 * The redefine-keys screen must describe the bindings the game actually reads.
 *
 * The reported bug: the key menu showed `M` for the down-stairs command, where
 * only `.` worked. Both of those are real bindings in the game's own table —
 * `M` is `USE_SPRAY` — so the menu was not inventing a key or rendering a name
 * wrong. It was rendering a *neighbour's* key.
 *
 * ## The cause
 *
 * `HandleRedefineKeys` held a `string[]` of labels beside a `PlayerCommand[]`,
 * correlated by position and checked only for equal length. `"Make fire
 * (matches)"` sat at label index 23 while `MAKE_COOKING_FIRE` sat at command
 * index 51, so every row from 23 to 51 printed the next row's binding: 29 of 54
 * rows, resynchronising exactly once the stray command was passed. The reported
 * `M` was the "Use Exit" row reading `USE_SPRAY`.
 *
 * The same wrong array indexed `addKey` and `removeLastKey`, so this was never
 * only cosmetic — rebinding "Use Exit" bound the key to spray and took `.` away
 * from the stairs.
 *
 * ## What is pinned here
 *
 * The invariant, for every row and without exception: **the string the menu
 * prints is the key the input layer compares.** Both sides are derived from
 * `Keybindings` in the test, so a row cannot pass by agreeing with a second
 * hand-written copy of the same wrong answer. The round-trip is the other half —
 * a key the menu shows must translate back to the command the row names, which
 * is what "the key that fires the command" means mechanically.
 *
 * The screen itself is not driven here. It is a `UI_WaitKey()` loop, and
 * `endgame-exit.test.ts` covers that the loop is escapable; what is worth
 * asserting is the table it draws from, and asserting it structurally is what
 * stops the two arrays from being reintroduced.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keybindings, InputTranslator } from "@engine/Keybindings";
import { PlayerCommand } from "@engine/PlayerCommand";
import { RogueGame } from "@engine/RogueGame";

// The module-global binding table, through the accessor the engine exposes it by.
const s_KeyBindings = RogueGame.keyBindings;

const webRoot = resolve(__dirname, "..");
const rogueGameSource = readFileSync(
	resolve(webRoot, "src/engine/RogueGame.ts"),
	"utf8",
);

/**
 * The `rows` table, read out of the source.
 *
 * Parsed rather than imported because `rows` is a local: it is built on every
 * call to `HandleRedefineKeys` and is not reachable from outside. Importing
 * `RogueGame` and reflecting on a function body would be the same parse with
 * more machinery, and a source scan is already the house style here — see
 * `stale-cache-and-keys.test.ts` and `silent-failures.test.ts`.
 */
function keyRows(): { label: string; command: PlayerCommand }[] {
	const start = rogueGameSource.indexOf("const rows: { label: string; command: PlayerCommand }[] = [");
	expect(start, "the {label, command} row table is gone").toBeGreaterThan(-1);
	const end = rogueGameSource.indexOf("\n\t\t];", start);
	expect(end, "the row table is unterminated").toBeGreaterThan(start);
	const body = rogueGameSource.slice(start, end);
	const out: { label: string; command: PlayerCommand }[] = [];
	// `{ label: "...", command: PlayerCommand.X },` — label and command may be
	// separated by a newline and the object may be written across several lines,
	// so both halves are matched independently within each `{ ... }` pair.
	for (const chunk of body.split("{").slice(1)) {
		const label = /label:\s*"([^"]+)"/.exec(chunk);
		const command = /command:\s*PlayerCommand\.(\w+)/.exec(chunk);
		if (label === null || command === null) continue;
		out.push({
			label: label[1]!,
			command: PlayerCommand[command[1] as keyof typeof PlayerCommand] as PlayerCommand,
		});
	}
	return out;
}

describe("the redefine-keys screen describes the bindings the game reads", () => {
	it("no longer keeps labels and commands in two parallel lists", () => {
		// The structural guard. A length check cannot see a permutation, which is
		// exactly why the bug survived one: both arrays were 54 long the whole time.
		// One array of pairs is the only shape in which the rows cannot be reordered
		// against each other.
		expect(rogueGameSource).not.toMatch(/const commands:\s*PlayerCommand\[\]\s*=\s*\[/);
		expect(rogueGameSource).not.toContain(
			"commands/menuEntries length mismatch",
		);
		// And nothing indexes a command list by row any more.
		expect(rogueGameSource).not.toMatch(/commands\[selected\]/);
	});

	it("prints the key the input layer compares, on every row", () => {
		const rows = keyRows();
		expect(rows.length).toBeGreaterThan(50);

		const mismatches: string[] = [];
		for (const { label, command } of rows) {
			const printed = s_KeyBindings.getAll(command).join(" / ");
			// What the input layer will actually resolve for each of those keys.
			const fires: string[] = [];
			for (const key of s_KeyBindings.getAll(command)) {
				const back = InputTranslator.keyToCommand(
					s_KeyBindings,
					key,
					false,
					false,
					false,
				);
				fires.push(`${key}->${PlayerCommand[back]}`);
				if (back !== command) {
					mismatches.push(
						`"${label}" prints ${printed} but ${key} fires ${PlayerCommand[back]}`,
					);
				}
			}
			if (printed === "") {
				mismatches.push(`"${label}" prints nothing at all`);
			}
		}
		expect(mismatches).toEqual([]);
	});

	it("shows . for Use Exit and M for Use Spray, which is the reported bug", () => {
		// Spelled out, because a table-wide invariant is a poor regression test for
		// a report naming one row: if the table ever drifts again, this says which
		// row the player complained about.
		const rows = keyRows();
		const byLabel = (label: string) => {
			const row = rows.find((r) => r.label === label);
			expect(row, `no row labelled "${label}"`).toBeDefined();
			return row!;
		};
		expect(byLabel("Use Exit").command).toBe(PlayerCommand.USE_EXIT);
		expect(s_KeyBindings.getAll(byLabel("Use Exit").command)).toEqual(["."]);
		expect(byLabel("Use Spray").command).toBe(PlayerCommand.USE_SPRAY);
		expect(s_KeyBindings.getAll(byLabel("Use Spray").command)).toEqual(["M"]);
	});

	it("lists every command that has a binding, so every key can be changed", () => {
		// Six commands were bound and unreachable from this screen: `EAT_CORPSE`,
		// `REVIVE_CORPSE` (the C# has rows for both), and the fork's
		// `SWAP_INVENTORY`, `LOOK_LEFT`, `LOOK_RIGHT`, `VIEW_MODE_TOGGLE`. A key the
		// game reads but the key menu does not offer is a key the player cannot
		// change, which is the one thing this screen exists to prevent.
		const listed = new Set(keyRows().map((r) => r.command));
		const unlisted: string[] = [];
		for (const [name, value] of Object.entries(PlayerCommand)) {
			if (typeof value !== "number") continue;
			if (value === PlayerCommand.NONE) continue;
			if (s_KeyBindings.getAll(value as PlayerCommand).length === 0) continue;
			if (!listed.has(value as PlayerCommand)) unlisted.push(name);
		}
		expect(unlisted).toEqual([]);
	});

	it("lists no command twice", () => {
		// A duplicated row would not have shown up as a display bug — it would show
		// the right key on both rows and quietly leave a command unrebindable.
		const seen = new Map<PlayerCommand, string>();
		const dupes: string[] = [];
		for (const { label, command } of keyRows()) {
			const first = seen.get(command);
			if (first !== undefined) dupes.push(`${PlayerCommand[command]} ("${first}" and "${label}")`);
			seen.set(command, label);
		}
		expect(dupes).toEqual([]);
	});

	it("round-trips: a displayed key resolves back to the command its row names", () => {
		// The other half of the invariant. Setting a binding and reading back what
		// the menu would show has to give the key that fires the command, and this
		// runs it on a private table so it cannot disturb the game's own.
		const keys = new Keybindings();
		const rows = keyRows();
		for (const { label, command } of rows) {
			const shown = keys.getAll(command).join(" / ");
			for (const key of keys.getAll(command)) {
				const fired = InputTranslator.keyToCommand(keys, key, false, false, false);
				expect(
					fired,
					`"${label}" shows ${shown}; ${key} fired ${PlayerCommand[fired]}`,
				).toBe(command);
			}
		}
	});
});

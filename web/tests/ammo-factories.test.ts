/**
 * Ammunition: the factories that make it, and the key that takes it back out.
 *
 * Item 3 of the port list, which recorded a half-finished state: `DoUnloadAmmoFromGun`
 * had landed with its gate, its ten-case table and its unit conversion, and there
 * was no way to *get* ammunition — neither a source in the world, nor a command
 * that reached the mechanic.
 *
 * ## What is here
 *
 * **The seven missing factories.** `BaseMapGenerator` had six of the reference's
 * thirteen ammo factories; `tests/fixtures/still-alive-item-factories.json` tracked
 * exactly those six, which is how the gap stayed invisible — the fixture is the
 * committed contract, and it agreed with a partial port. It now names twelve, and
 * the assertion below is that the fixture and the generator have not drifted apart
 * in *either* direction again.
 *
 * The thirteenth is `MakeItemRandomCommonAmmo`, a six-way roll rather than a single
 * item, so it cannot go in a fixture whose value is one id name. It gets its own
 * test, and it is named in the completeness assertion so that it is checked to exist
 * rather than quietly not being there.
 *
 * **The `UNLOAD_AMMO` command.** `PlayerCommand` is append-only by save format, so
 * it went in at the end rather than in the C#'s alphabetical slot; `Keybindings` had
 * to pick a key that was not the C#'s, because the movement grid had already given
 * the C#'s bare `U` to SHOUT; the turn loop needed a `case` beside
 * `MAKE_COOKING_FIRE`; and `HandleRedefineKeys` needed a row, or the key would be
 * live and unrebindable. All four are load-bearing and the last two are invisible
 * when missing, which is why they are asserted separately.
 *
 * The reference's own quirk is kept and pinned: `DescribeItem` assigns "to fire"
 * and then overwrites it with "to unload ammo" on the next line, with the guard that
 * would have limited the second to an equipped gun commented out. So the reference
 * never tells the player that LMB fires. Transcribed, not repaired, and asserted
 * here so the choice is on the record.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Item } from "@data/Item";
import { ItemAmmo } from "@engine/items/ItemWeapon";
import { Keybindings, InputTranslator } from "@engine/Keybindings";
import { PlayerCommand } from "@engine/PlayerCommand";
import { RogueGame } from "@engine/RogueGame";
import { ItemID } from "@gameplay/GameItems";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";

const C_SHARP_ITEMS: Record<string, string> = JSON.parse(
	readFileSync(resolve(__dirname, "fixtures/still-alive-item-factories.json"), "utf-8"),
);

const rogueGameSource = readFileSync(
	resolve(__dirname, "..", "src/engine/RogueGame.ts"),
	"utf8",
);

/** One generator, built the way `item-factories.test.ts` builds it. */
const runner = new HeadlessRunner(4242);
const gen = new StdTownGenerator(runner.rogueGame, new TownParameters());

/** Every no-argument `makeItem*` on the prototype chain, bound to one instance. */
const FACTORIES: Array<[string, () => Item]> = (() => {
	const out: Array<[string, () => Item]> = [];
	const seen = new Set<string>();
	for (let p = Object.getPrototypeOf(gen); p && p !== Object.prototype;
		p = Object.getPrototypeOf(p)) {
		for (const name of Object.getOwnPropertyNames(p)) {
			if (!/^makeItem[A-Za-z0-9]*$/.test(name) || seen.has(name)) continue;
			seen.add(name);
			const fn = (p as Record<string, unknown>)[name];
			if (typeof fn !== "function" || (fn as () => unknown).length > 0) continue;
			out.push([name, () => (fn as () => Item).call(gen)]);
		}
	}
	return out;
})();

const ammoFactories = FACTORIES.filter(([n]) => /Ammo$/.test(n));

/** The six ids the C#'s six-way common-ammo roll can return, in the C#'s order. */
const COMMON_AMMO: ItemID[] = [
	ItemID.AMMO_HEAVY_RIFLE,
	ItemID.AMMO_PRECISION_RIFLE,
	ItemID.AMMO_LIGHT_PISTOL,
	ItemID.AMMO_LIGHT_RIFLE,
	ItemID.AMMO_HEAVY_PISTOL,
	ItemID.AMMO_SHOTGUN,
];

describe("every ammo factory the reference has", () => {
	it("is on the generator, and the fixture has not drifted from it", () => {
		// The completeness contract, in both directions.
		//
		// The fixture is the committed stand-in for `_refs/`, which is gitignored, so
		// a test that opened `BaseMapGenerator.cs` would pass locally and fail in CI.
		// That also means nothing but the fixture knows what the reference has — which
		// is precisely how six of thirteen went missing without a failure. So the
		// fixture and the generator are now checked against *each other*, and the
		// thirteen is named below.
		//
		// `makeItemRandomCommonAmmo` is in neither set's half of the equality because it
		// builds no single item; it is the `+1` here and has its own test.
		const onGenerator = ammoFactories
			.map(([n]) => n)
			.filter((n) => n !== "makeItemRandomCommonAmmo")
			.sort();
		const inFixture = Object.keys(C_SHARP_ITEMS)
			.filter((n) => /Ammo$/.test(n) && n !== "makeItemRandomCommonAmmo")
			.sort();
		expect(onGenerator).toEqual(inFixture);
		// The reference's thirteen: twelve single-item factories plus the roll.
		expect(onGenerator.length + 1).toBe(13);
		expect(gen.makeItemRandomCommonAmmo).toBeTypeOf("function");
	});

	it.each(ammoFactories.map(([n]) => n))("%s builds an ammo item", (name) => {
		const item = ammoFactories.find(([n]) => n === name)![1]();
		expect(item, `${name} returned nothing`).toBeInstanceOf(ItemAmmo);
	});
});

describe("the fork's one-of-a-kind ammo", () => {
	// Four of the reference's factories carry `IsForbiddenToAI`, and one of those
	// also pins `Quantity = 1`. They are the whole reason an ammo model can exist
	// and still be unreachable: the flag is what keeps an NPC from spawning the
	// only minigun ammunition in the game, and the quantity is what stops the one
	// bio-force gun's plasma from being plentiful.
	it.each([
		["makeItemMinigunAmmo", ItemID.AMMO_MINIGUN],
		["makeItemGrenadeLauncherAmmo", ItemID.AMMO_GRENADES],
		["makeItemBioForceGunAmmo", ItemID.AMMO_PLASMA],
	] as Array<[string, ItemID]>)(
		"%s is forbidden to the AI, because there is only one of its gun",
		(name, wantId) => {
			const item = ammoFactories.find(([n]) => n === name)![1]();
			expect(item.model.id).toBe(wantId);
			expect(item.isForbiddenToAI, `${name} lets an NPC spawn it`).toBe(true);
		},
	);

	it("makeItemBioForceGunAmmo spawns exactly one, and says why", () => {
		// `Quantity = 1 //only ever spawn one at a time, to avoid it being too
		// plentiful. it must be super rare` — `BaseMapGenerator.cs:2328-2329`.
		const item = ammoFactories.find(([n]) => n === "makeItemBioForceGunAmmo")![1]();
		expect(item.quantity).toBe(1);
		// And the other one-of-a-kind factories do *not* pin a quantity, which is the
		// difference between this and the three above.
		for (const name of ["makeItemMinigunAmmo", "makeItemGrenadeLauncherAmmo"]) {
			const other = ammoFactories.find(([n]) => n === name)![1]();
			expect(other.quantity, `${name} pins a quantity the C# does not`).toBeGreaterThan(1);
		}
	});

	it("the ordinary ammo is not forbidden to the AI", () => {
		// The other half: if every ammo factory set the flag, the assertions above
		// would pass while the common ammunition had become NPC-inert.
		for (const name of ["makeItemShotgunAmmo", "makeItemBoltsAmmo", "makeItemFuelAmmo"]) {
			const item = ammoFactories.find(([n]) => n === name)![1]();
			expect(item.isForbiddenToAI, `${name} is forbidden to the AI`).toBe(false);
		}
	});
});

describe("makeItemRandomCommonAmmo", () => {
	it("only ever returns the six common types", () => {
		// Off one `Roll(0, 6)`, so the C#'s six cases cover every outcome and the
		// `default` throw is unreachable. Asserted over enough calls to be unlikely
		// to miss a wrong case, and by set membership rather than by count, because
		// the *distribution* is a property of the seed rather than of the factory.
		const seen = new Set<ItemID>();
		for (let i = 0; i < 600; i++) {
			const item = gen.makeItemRandomCommonAmmo();
			expect(item).toBeInstanceOf(ItemAmmo);
			seen.add(item.model.id as ItemID);
		}
		expect([...seen].sort()).toEqual([...COMMON_AMMO].sort());
		// Non-vacuous: a six-way roll over 600 draws should have reached all six.
		expect(seen.size).toBe(6);
	});

	it("is one roll, so the order of the six cases is the C#'s", () => {
		// The C#'s case order is `Roll(0, 6)`-indexed (`BaseMapGenerator.cs:2149-2156`),
		// so it is a seeded generator and reordering the cases would move every
		// common-ammo spawn in every run generated afterwards. Cheap to pin and
		// invisible until it is broken.
		//
		// Read from `BaseMapGenerator.ts` and not from the built item, because the
		// order is only observable in the source — the six are indistinguishable once
		// constructed, and "it returns one of six" is already asserted above.
		const src = readFileSync(
			resolve(__dirname, "..", "src/gameplay/generators/BaseMapGenerator.ts"),
			"utf8",
		);
		const at = src.indexOf("makeItemRandomCommonAmmo(): Item {");
		expect(at, "makeItemRandomCommonAmmo is gone").toBeGreaterThan(-1);
		const block = src.slice(at, src.indexOf("\n  }", at));
		const order = [...block.matchAll(/return this\.(makeItem\w+?Ammo)\(\)/g)].map(
			(m) => m[1]!,
		);
		expect(order).toEqual([
			"makeItemHeavyRifleAmmo",
			"makeItemPrecisionRifleAmmo",
			"makeItemLightPistolAmmo",
			"makeItemLightRifleAmmo",
			"makeItemHeavyPistolAmmo",
			"makeItemShotgunAmmo",
		]);
		// And it is one roll, not six: the C# rolls once and switches on it. Six
		// independent rolls would make the distribution wrong in a way no assertion
		// above could see.
		expect(block.match(/rules\.roll\(/g)).toHaveLength(1);
		expect(block).toMatch(/rules\.roll\(0, 6\)/);
		// The `default` throw is the C#'s `InvalidOperationException` and unreachable
		// for a `Roll(0, 6)`; kept because the C# keeps it, and pinned because a
		// missing `default` in a `switch` over a number is a silent fallthrough.
		expect(block).toMatch(/default:\s*\n\s*throw new Error\('unhandled roll'\)/);
	});
});

describe("PlayerCommand.UNLOAD_AMMO", () => {
	const keyBindings = RogueGame.keyBindings;

	it("is appended, not inserted, because a command's number is in the save format", () => {
		// A stored `Keybindings` pair is `[commandNumber, key]`. Inserting a member
		// re-points every binding above it, silently, for every player who has ever
		// rebound something. So the value must be the last one in the enum.
		const names = Object.keys(PlayerCommand).filter(
			(k) => typeof (PlayerCommand as unknown as Record<string, unknown>)[k] === "number",
		);
		expect(names[names.length - 1]).toBe("UNLOAD_AMMO");
		expect(PlayerCommand.UNLOAD_AMMO).toBe(names.length - 1);
	});

	it("has a binding, and the input layer resolves it", () => {
		// `keyToCommand(keybindings, key, ctrl, alt, shift, code)`, and the browser
		// reports `Shift+U` as `key: "U"` with `shiftKey: true` — so the description
		// has to be taken apart and handed back as the five arguments it is built
		// from. `makeKey` puts the key *last*, after the modifiers, so that is where
		// it is read from.
		const keys = keyBindings.getAll(PlayerCommand.UNLOAD_AMMO);
		expect(keys.length).toBeGreaterThan(0);
		for (const description of keys) {
			const parts = description.split("+");
			const key = parts[parts.length - 1]!;
			const mods = parts.slice(0, -1);
			const fired = InputTranslator.keyToCommand(
				keyBindings,
				key,
				mods.includes("Ctrl"),
				mods.includes("Alt"),
				mods.includes("Shift"),
			);
			expect(fired, `${description} does not fire UNLOAD_AMMO`).toBe(
				PlayerCommand.UNLOAD_AMMO,
			);
		}
	});

	it("is Shift+U, one chord from the C#'s U, and U is SHOUT's", () => {
		// The C# binds a bare `U` (`Keybindings.cs:90`). This port's SHOUT took the
		// bare `U` when the movement grid took `S` off it, so the chord is the
		// displacement rule applied -- the same trade `WAIT_LONG` (`Shift+W`) and
		// `LOOK_RIGHT` (`Shift+C`) made. Asserted so the choice is a decision rather
		// than whatever the next free key happened to be.
		expect(keyBindings.getAll(PlayerCommand.UNLOAD_AMMO)).toEqual(["Shift+U"]);
		expect(keyBindings.getAll(PlayerCommand.SHOUT)).toEqual(["U"]);
		// And a fresh table agrees, so this is `resetToDefaults` and not saved state.
		expect(new Keybindings().getAll(PlayerCommand.UNLOAD_AMMO)).toEqual(["Shift+U"]);
	});

	it("has a row in the key menu, or the binding is live and unrebindable", () => {
		// The screen is a `{label, command}` table in `HandleRedefineKeys`, read out
		// of the source by `redefine-keys-screen.test.ts`. What matters here is only
		// membership: a command with a default and no row can be fired but never
		// changed, which is the one thing that screen exists to prevent.
		const at = rogueGameSource.indexOf("const rows: { label: string; command: PlayerCommand }[] = [");
		const block = rogueGameSource.slice(at, rogueGameSource.indexOf("\n\t\t];", at));
		expect(block).toContain("command: PlayerCommand.UNLOAD_AMMO");
	});

	it("is dispatched in the turn loop, or the binding is inert", () => {
		// A `PlayerCommand` with no `case` here is not "unhandled", it is a
		// `TypeError` the moment the key is pressed -- the switch's `default` throws.
		const at = rogueGameSource.indexOf("case PlayerCommand.UNLOAD_AMMO:");
		expect(at, "no dispatch case for UNLOAD_AMMO").toBeGreaterThan(-1);
		const arm = rogueGameSource.slice(at, at + 400);
		expect(arm).toContain("HandlePlayerUnloadAmmo(player)");
		// Awaited like its neighbours, because `TryPlayerUnwell` is async and a
		// missing await would let the unload run while the player is unwell.
		expect(arm).toMatch(/await this\.TryPlayerUnwell\(\)/);
	});
});

describe("the reference's DescribeItem quirk is kept", () => {
	it("overwrites 'to fire' with 'to unload ammo' on every ranged weapon", () => {
		// `RogueGame.cs:32019-32023`: the second assignment is unconditional, and
		// the `//if (rwp.IsEquipped)` that would have limited it is commented out.
		// So the reference's additional description for any gun reads "to unload
		// ammo", and the "to fire" line is dead code.
		//
		// Transcribed rather than repaired, which is the port's rule for reference
		// quirks -- but it costs something a player can see, so it is pinned here
		// instead of left to be noticed. `isDefaultUse = false` is unaffected: LMB
		// still fires.
		const at = rogueGameSource.indexOf("to unload ammo : <");
		expect(at, "the unload-ammo inventory hint is gone").toBeGreaterThan(-1);
		const around = rogueGameSource.slice(at - 400, at + 120);
		// Both assignments, in that order, in the same branch.
		expect(around.indexOf("to fire : <")).toBeGreaterThan(-1);
		expect(around.indexOf("to fire : <")).toBeLessThan(around.indexOf("to unload ammo : <"));
	});
});

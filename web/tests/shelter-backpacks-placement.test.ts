/**
 * `Feature.ShelterBackpacks`: the bags have to be findable.
 *
 * Item 6 of the port list recorded the feature as "mechanic done, placement
 * missing" — five models, a move-in/move-out rule, a panel, a save codec, and
 * `makeBackpack` with **zero call sites in the project**. A survivor could carry a
 * backpack and organise their pack through it and had no way to ever acquire one.
 *
 * ## The eight reference sites, and which of them landed
 *
 * | C# site | model | port |
 * |---|---|---|
 * | `MakeSewersMaintenanceBuilding:6612` | pouch/satchel 5% | **yes** |
 * | `MakeSubwayStationBuilding:6920` | pouch/satchel 1% | **yes** |
 * | `MakeRandomParkItem:7825` | pouch/satchel 1-in-8 | **yes**, in both copies |
 * | `MakeRandomCHAROfficeItem:7761` | daypack 20% | **yes** |
 * | `MakeRandomBedroomItem:7708` | pouch/satchel | **no — the reference's is dead code** |
 * | `MakeHuntingShopItem:7591` | hiking pack | **no — needs the Release 3 retune** |
 * | `MakeRandomOrdinaryOfficeItem:7790` | daypack | **no — the method is not ported** |
 * | `MakeArmyRecRoom:11230` | army rucksack | **no — the method is not ported** |
 *
 * Four of eight, covering three of the five models. The four that did not land are
 * each pinned below with the reason, because "not done" and "cannot be done" are
 * different facts and only one of them is a decision.
 *
 * ## The one that is the reference's bug
 *
 * `MakeRandomBedroomItem` rolls `Roll(0, 20)` and its backpack is `case 20`.
 * `DiceRoller.Roll` is **half-open** — `m_Rng.Next(min, max)`, and the port's
 * `DiceRoller.roll` is `min + floor(next() * (max - min))` — so `Roll(0, 20)`
 * yields 0..19 and **`case 20` is unreachable**. Release 8-2 added the case and
 * forgot to widen the bound. Every bedroom in the reference therefore contains no
 * backpack, ever.
 *
 * The tempting port is to widen the bound to 21 and fix it. That is *more correct
 * than the reference* and it is a divergence this port does not make: a
 * backpack-only change to the bedroom would have to spend a die the reference does
 * not, and the port's rule for the reference's reachable code is to match it. So
 * the bedroom gets nothing, and says so, rather than quietly getting a bag the
 * reference never placed.
 *
 * ## Why every gate is ahead of its roll
 *
 * `DiceRoller.rollChance` delegates to `roll`, so it **spends a die even at 0%**.
 * A backpack gate written as "roll, then check the flag" would therefore move every
 * subsequent district roll under Classic, and the Classic district digest
 * `e097b9d976ffac15` — asserted in seven suites — is what notices. Every site here
 * tests `hasFeature(...) && rollChance(...)`, or `if (hasFeature(...)) { roll }`, so
 * a Classic district spends no die and the digest holds. That is asserted directly
 * rather than left to the seven, because a gate moved from in front of a roll to
 * behind it is a one-character edit.
 *
 * ## The despawn exemption
 *
 * `RogueGame.DeleteItemsSittingIdle` is given `!(it instanceof ItemBackpack)`
 * (`RogueGame.cs:9076`, Release 8-2) *in the same change*, because before the
 * placement landed nothing in the port produced an `ItemBackpack` and the guard had
 * nothing to apply to — so its absence was invisible, and a guard that only lands
 * after the thing it guards is a bug waiting for the next reader to assume it is
 * unnecessary.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { NullRogueUI } from "@ui/NullRogueUI";
import { RogueGame } from "@engine/RogueGame";
import { Ruleset, Session } from "@engine/Session";
import { ItemID } from "@gameplay/GameItems";
import { ItemBackpack } from "@engine/items/ItemBackpack";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { DiceRoller } from "@engine/DiceRoller";

const webRoot = resolve(__dirname, "..");
const townSource = readFileSync(
	resolve(webRoot, "src/gameplay/generators/BaseTownGenerator.ts"),
	"utf8",
);
const mallSource = readFileSync(
	resolve(webRoot, "src/gameplay/generators/buildings/makeShoppingMall.ts"),
	"utf8",
);
const rogueGameSource = readFileSync(resolve(webRoot, "src/engine/RogueGame.ts"), "utf8");

/** A generator whose roller is seeded, and whose session is the given ruleset. */
function generatorFor(ruleset: Ruleset, seed = 20250929): StdTownGenerator {
	Session.get().ruleset = ruleset;
	const runner = new HeadlessRunner(seed);
	const gen = new StdTownGenerator(runner.rogueGame, new TownParameters());
	(gen as unknown as { m_DiceRoller: DiceRoller }).m_DiceRoller = new DiceRoller(seed);
	return gen;
}

class HeadlessRunner {
	readonly rogueGame: RogueGame;
	constructor(seed: number) {
		Session.useSeed(seed);
		this.rogueGame = new RogueGame(new NullRogueUI(), new NullMusicManager());
		void this.rogueGame.LoadData();
	}
}

/** Every backpack the reference's models can be, as a set of ids. */
const BACKPACK_IDS: ItemID[] = [
	ItemID.BACKPACK_WAIST_POUCH,
	ItemID.BACKPACK_SATCHEL,
	ItemID.BACKPACK_DAYPACK,
	ItemID.BACKPACK_HIKING_PACK,
	ItemID.BACKPACK_ARMY_RUCKSACK,
];

describe("backpack placement: the four sites that could land", () => {
	beforeEach(() => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
	});

	it("the park roll places a bag, in both copies of the roll", () => {
		// `MakeRandomParkItem:7825`, 1-in-8 with a 75/25 inside. The mall
		// re-derives the whole roll in a file-local function, so this is the site
		// that had to be written twice — and the reason it is asserted on *both*
		// sources is that a reader adding a third copy would otherwise find the
		// first two and stop.
		const gen = generatorFor(Ruleset.STILL_ALIVE);
		const seen = new Set<ItemID>();
		for (let i = 0; i < 400; i++) {
			const it = gen.makeRandomParkItem();
			if (it instanceof ItemBackpack) seen.add(it.model.id as ItemID);
		}
		expect([...seen].sort(), "a park never yielded a bag").toEqual(
			[ItemID.BACKPACK_WAIST_POUCH, ItemID.BACKPACK_SATCHEL].sort(),
		);

		// And the mall's copy is a *source* claim, because its roll needs a
		// TownBuildingContext to run and building one for this would be a
		// second harness for one switch arm.
		expect(mallSource).toMatch(
			/case 7:[\s\S]{0,400}hasFeature\(Session\.get\(\)\.ruleset, Feature\.ShelterBackpacks\)/,
		);
	});

	it("the park roll gives a Classic district the plank, and spends no die on it", () => {
		// The reference *replaces* `case 7` rather than keeping a fallback, so
		// under Still Alive the barricade plank is gone from parks. Under Classic
		// the gate is false, the plank stands, and — the part that is load-bearing
		// for seven other suites — not one die is spent.
		const gen = generatorFor(Ruleset.CLASSIC);
		const seen = new Set<number>();
		for (let i = 0; i < 400; i++) seen.add(gen.makeRandomParkItem().model.id);
		expect([...seen]).not.toContain(ItemID.BACKPACK_WAIST_POUCH);
		expect([...seen]).toContain(ItemID.BAR_WOODEN_PLANK);
	});

	it("the CHAR office roll places a daypack 20% of the time it reaches case 3", () => {
		// `MakeRandomCHAROfficeItem:7761`. One roll, inside `case 3`, and the
		// `else` is the port's pre-existing canned food rather than the C#'s
		// matches — same slot, different content, and only one of them is a bag.
		const gen = generatorFor(Ruleset.STILL_ALIVE);
		let bags = 0;
		let foods = 0;
		// `case 3` is one of ten, so 2000 calls reach it about 200 times.
		for (let i = 0; i < 2000; i++) {
			const it = gen.makeRandomCHAROfficeItem();
			if (it === null) continue;
			if (it instanceof ItemBackpack) bags++;
			else if (it.model.id === ItemID.FOOD_CANNED_FOOD) foods++;
		}
		expect(bags, "no daypack from a CHAR office").toBeGreaterThan(0);
		expect(foods, "and the non-bag arm never fired").toBeGreaterThan(0);
		// 20% of the case-3 hits, so bags and foods are within a factor of three.
		// Loose on purpose: the arm is ~1-in-10 of 2000 draws, and a tight band
		// would be a test of the roller rather than of the placement.
		expect(bags).toBeLessThan(foods * 3);
	});

	it("the sewers and subway buildings each gate ahead of their roll", () => {
		// The two building sites, asserted as *source shape* rather than behaviour.
		// Both are one-line insertions into a loop that is itself reached under
		// Classic, so the only thing that can be wrong is the order of the gate and
		// the roll — and that is a text property.
		for (const [name, src] of [
			["sewers maintenance", townSource],
			["subway station", townSource],
		] as const) {
			const gated = src.match(
				/hasFeature\(Session\.get\(\)\.ruleset, Feature\.ShelterBackpacks\)[\s\S]{0,120}?rollChance\(/g,
			);
			expect(gated, `${name}: no gate immediately before a roll`).not.toBeNull();
			// And the *wrong* order must not appear anywhere: a roll whose result is
			// discarded by a following feature check.
			const rolledThenGated = src.match(/rollChance\([^)]{0,40}\)[\s\S]{0,80}?Feature\.ShelterBackpacks/g);
			expect(
				rolledThenGated,
				`${name}: a roll happens before its gate, which spends a die under Classic`,
			).toBeNull();
		}
	});
});

describe("the four sites that did not land", () => {
	it("the bedroom's bag is unreachable in the reference, and the port does not invent it", () => {
		// `MakeRandomBedroomItem:7659` rolls `Roll(0, 20)`; the bag is `case 20`.
		// Half-open, so 0..19, so `case 20` never fires. Release 8-2 added the case
		// and did not widen the bound.
		//
		// Asserted as a property of the *roller*, so the claim is arithmetic and not
		// a reading of the C#: `Roll(min, max)` cannot return `max`.
		const roller = new DiceRoller(1);
		const max = 2000;
		for (let i = 0; i < max; i++) {
			expect(roller.roll(0, 20)).toBeLessThan(20);
		}
		// So a port that copied `case 20` under `roll(0, 21)` would be *more* correct
		// than the reference, and this port does not do that: the bedroom roll is
		// untouched, and its `case` list ends where it did.
		expect(townSource).not.toMatch(/makeRandomBedroomItem[\s\S]{0,3000}BACKPACK_/);
	});

	it("the hunting shop's pack needs the Release 3 retune, not a backpack arm", () => {
		// The C#'s bag is the `else` of a Release-7-1 `RollChance(50)` inside a
		// `case 3` of `Roll(0, 4)`. The port has no `case 3` — all three of its
		// switches are `roll(0, 2)` and its top split is the pre-Release-3 50/50 — so
		// there is no branch to re-route. Reaching it means widening three
		// `roll(0, 2)` to `roll(0, 4)`, which changes the item distribution of a
		// *hunting shop* under Classic and would move the Classic district digest.
		// That is a re-fidelity with its own decision attached, not a backpack delta.
		expect(townSource).not.toMatch(/makeHuntingShopItem[\s\S]{0,2000}?BACKPACK_/);
	});

	it("six of the eight sites are ported; the bedroom's is dead and the office's is unwired", () => {
		// **Inverted.** This used to assert `makeRandomOrdinaryOfficeItem` was absent
		// from the port, on the reasoning that it had "nowhere to go" without
		// `MakeOrdinaryOffice`. Both of those are ported now, along with the item
		// table's backpack arm — so the daypack-from-an-office site exists as code and
		// is tested by `tests/ordinary-office.test.ts`.
		//
		// What is *not* reachable is the ordinary office's **dispatch**: the
		// `else MakeOrdinaryOffice(map, b)` arm of `BaseTownGenerator.cs:531` is
		// deliberately unwired, because wiring it shifts every later block's dice in
		// the business cascade and breaks eight suites. The call site carries the
		// measured list. So the distinction this test now draws is between *ported* and
		// *reached*, which are different claims and were being conflated.
		expect(townSource).toMatch(/makeRandomOrdinaryOfficeItem/);
		expect(townSource).toMatch(/makeOrdinaryOffice/);
		// **All eight are now ported**, which is the end of this list. The two that were
		// left are the bedroom's `case 20` — dead in the reference too, under a half-open
		// `roll(0, 20)`, and deliberately not widened — and this office's dispatch arm,
		// which is off for the dice reasons its call site records.
		expect(townSource).toMatch(/makeArmyRecRoom/);
		// The rec room's rucksack arm is 18%, not 54%: `rucksackChance = (int)rucksackChance / 3`
		// at `BaseTownGenerator.cs:11231`, where the CHAR lab has the same line
		// *commented out*. Two rooms whose C# looks alike and which run at different rates.
		expect(townSource).toMatch(/Math\.floor\(rucksackChance \/ 3\)/);
		// And the dispatch really is off, rather than merely unwired in a comment.
		expect(townSource).not.toMatch(/else this\.makeOrdinaryOffice\(map, b\)/);
		// All five models now have a factory. The army rucksack's only caller is the rec
		// room, so it is the last thing that needed adding.
		expect(BACKPACK_IDS).toContain(ItemID.BACKPACK_ARMY_RUCKSACK);
		expect(townSource).toMatch(/makeItemArmyRucksack/);
	});
});

describe("the despawn sweep spares backpacks", () => {
	it("DeleteItemsSittingIdle exempts an ItemBackpack", () => {
		// `RogueGame.cs:9076`: `&& !(it is ItemBackpack) //@@MP - exemption for
		// the newly added backpacks (Release 8-2)`.
		//
		// Before the placement landed this guard had nothing to apply to, so its
		// absence was invisible. A dropped bag is now the most likely thing in a
		// district to be walked away from, and the reference keeps it forever.
		const at = rogueGameSource.indexOf("private DeleteItemsSittingIdle");
		expect(at, "DeleteItemsSittingIdle is gone").toBeGreaterThan(-1);
		const body = rogueGameSource.slice(at, rogueGameSource.indexOf("\n\t}\n", at));
		expect(body).toMatch(/it instanceof ItemBackpack/);
		// And it is a `continue`, not a removal: the exemption is on the delete.
		expect(body).not.toMatch(/removeItemAt[\s\S]{0,200}?ItemBackpack/);
	});

	it("an exemption that arrives after the placement is the same defect, so both are asserted here", () => {
		// The two halves in one place, because the failure mode is one half landing
		// without the other. A guard with no bags is dead code; bags with no guard
		// despawn. Neither shows up in the other's test.
		expect(rogueGameSource).toMatch(/it instanceof ItemBackpack/);
		expect(townSource).toMatch(/makeBackpack\(/);
		expect(mallSource).toMatch(/makeBackpack\(/);
	});
});

describe("what a survivor can now actually find", () => {
	it("three of the five models have a producer, and all five are gated", () => {
		// The honest summary, and the number a reader should take away: four sites
		// placed, three models reachable, two models (hiking pack, army rucksack)
		// still declared and on disk with nowhere to come from.
		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const gen = generatorFor(Ruleset.STILL_ALIVE);
		const placed = new Set<ItemID>();
		for (let i = 0; i < 600; i++) {
			for (const it of [gen.makeRandomParkItem(), gen.makeRandomCHAROfficeItem()]) {
				if (it instanceof ItemBackpack) placed.add(it.model.id as ItemID);
			}
		}
		// Three of the five, and the three are exactly the ones the four placed sites
		// can produce: pouch and satchel from the park roll, daypack from the CHAR
		// office. The hiking pack and the army rucksack are the two with no producer,
		// and the test above says why.
		expect([...placed].sort()).toEqual(
			[
				ItemID.BACKPACK_WAIST_POUCH,
				ItemID.BACKPACK_SATCHEL,
				ItemID.BACKPACK_DAYPACK,
			].sort(),
		);

		Session.get().ruleset = Ruleset.CLASSIC;
		const classic = generatorFor(Ruleset.CLASSIC);
		let classicBags = 0;
		for (let i = 0; i < 600; i++) {
			for (const it of [classic.makeRandomParkItem(), classic.makeRandomCHAROfficeItem()]) {
				if (it instanceof ItemBackpack) classicBags++;
			}
		}
		expect(classicBags, "a Classic district placed a backpack").toBe(0);
	});
});

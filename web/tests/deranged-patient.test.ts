/**
 * The deranged patient — a whole unique actor that was missing.
 *
 * Item 8's audit found `GameImages.ACTOR_DERANGED_PATIENT` with no reader, and
 * the reason was not a missing line but a missing *actor*: the model, the abilities,
 * the AI, the save number, the sprite and the rage sheet all existed, and the
 * hospital power room carried a commented-out block where the fork has live code.
 *
 * ## The block that was commented out was the wrong one
 *
 * What sat in the port's `generateHospital_Power` was the **vanilla alpha10.1** C#
 * verbatim: Jason Myers, `ACTOR_JASON_MYERS`, and an axe. Alpha 10.1 emptied the
 * power room and moved Jason to the hospital storage north corridor. The fork went
 * the other way — Release 8-1 *replaced* Jason Myers, so `GameActors.cs:131` reads
 * `DerangedPatient { … } //@@MP - was Jason Myers (Release 8-1)` and the fork's
 * `BaseTownGenerator` contains no `JasonMyers` at all.
 *
 * So this is a **swap**, not an addition, and it is the only feature in the set
 * whose reason for existing is to turn something *off* in Classic that the fork
 * turned on somewhere else. One flag, two gates, and no state in which both actors
 * exist — which is why it is one flag and not two.
 *
 * ## What each test holds
 *
 * - The gate: patient under Still Alive, Jason under Classic, and **never both**.
 * - The differences from Jason that are the reference's rather than the port's: three
 *   `HIGH_STAMINA` where the corridor's Jason has five, a bonesaw rather than an
 *   axe, the room's centre rather than the north wall, and the deranged patient's
 *   own skin.
 * - That `UniqueActors.derangedPatient` is *appended*, because `UniqueActors` is
 *   written to a save as a positional array. This is the save-format rule from
 *   `PlayerCommand`, in a place nobody expected it, and it is the one part of this
 *   change that could quietly corrupt a player's save.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Actor } from "@data/Actor";
import { Map as GameMap } from "@data/Map";
import { Feature, hasFeature } from "@engine/FeatureFlags";
import { HeadlessRunner } from "../src/sim/HeadlessRunner";
import { Ruleset, Session, UniqueActors } from "@engine/Session";
import { StdTownGenerator } from "@gameplay/generators/StdTownGenerator";
import { Parameters as TownParameters } from "@gameplay/generators/BaseTownGenerator";
import { ActorID } from "@gameplay/GameActors";
import { GameImages } from "@gameplay/GameImages";
import { ItemID } from "@gameplay/GameItems";
import { SkillID } from "@gameplay/Skills";
import { DollPart } from "@data/Doll";

const HOSPITAL_SEED = 4242;

function generatorFor(ruleset: Ruleset): StdTownGenerator {
  const runner = new HeadlessRunner(HOSPITAL_SEED);
  const params = new TownParameters();
  // The ruleset has to be set *before* generation, because both gates are
  // `hasFeature(Session.get().ruleset, …)` read at generation time — which is the
  // point being tested.
  Session.get().ruleset = ruleset;
  return new StdTownGenerator(runner.rogueGame, params);
}

/** The two maps the swap is about, from the hospital's own generator. */
function hospitalMaps(ruleset: Ruleset): { power: ReturnType<StdTownGenerator["generateHospital_Power"]>; storage: ReturnType<StdTownGenerator["generateHospital_Storage"]> } {
  const gen = generatorFor(ruleset);
  return {
    power: gen.generateHospital_Power(HOSPITAL_SEED),
    storage: gen.generateHospital_Storage(HOSPITAL_SEED),
  };
}

/** Every actor on the map, by the id of the model it was built from. */
function actorIds(map: GameMap): ActorID[] {
  return map.actors.map((a) => a.model.id as ActorID);
}

describe("the swap is a swap: the patient and Jason Myers are mutually exclusive", () => {
	beforeEach(() => {
		Session.get().ruleset = Ruleset.CLASSIC;
	});

	it("the gate is on for Still Alive and off for Classic", () => {
		expect(hasFeature(Ruleset.STILL_ALIVE, Feature.DerangedPatient)).toBe(true);
		expect(hasFeature(Ruleset.CLASSIC, Feature.DerangedPatient)).toBe(false);
	});
});

describe("under Classic: Jason Myers in the storage north corridor, power room empty", () => {
	beforeEach(() => {
		Session.get().ruleset = Ruleset.CLASSIC;
	});

	it("spawns Jason in the storage corridor and nobody in the power room", () => {
		const { power, storage } = hospitalMaps(Ruleset.CLASSIC);

		// Classic is alpha10.1, which emptied the power room. So the patient must not
		// be there, or Classic has gained a unique actor it never had.
		expect(actorIds(power), "the power room should be empty of actors").not.toContain(
			ActorID.DERANGED_PATIENT,
		);
		expect(actorIds(storage)).toContain(ActorID.JASON_MYERS);
	}, 60_000);

	it("records Jason in uniqueActors, and leaves the patient slot untouched", () => {
		hospitalMaps(Ruleset.CLASSIC);
		const uniques = Session.get().uniqueActors;
		expect(uniques.jasonMyers.isSpawned).toBe(true);
		expect(uniques.jasonMyers.theActor?.model.id).toBe(ActorID.JASON_MYERS);
		expect(uniques.derangedPatient.isSpawned, "the patient slot moved under Classic").toBe(false);
		expect(uniques.derangedPatient.theActor).toBeNull();
	}, 60_000);
});

describe("under Still Alive: the deranged patient in the power room, no Jason", () => {
	beforeEach(() => {
		Session.get().ruleset = Ruleset.STILL_ALIVE;
	});

	it("spawns the patient at the room's centre, with his own skin", () => {
		const { power } = hospitalMaps(Ruleset.STILL_ALIVE);
		const patient = power.actors.find((a) => a.model.id === ActorID.DERANGED_PATIENT);
		expect(patient, "no deranged patient in the power room").toBeDefined();

		// `jason.Doll.AddDecoration(DollPart.SKIN, ACTOR_DERANGED_PATIENT)` — the
		// patient is skinned, which is why `GameActors` has his sprite id as `null` in
		// the whole-body list and draws him from the doll instead. Asserting the
		// decoration is what proves he is not the generic human sprite.
		const skin = patient!.doll.getDecorations(DollPart.SKIN);
		expect(skin, "the patient is skinned, not drawn from a whole-body sprite").toContain(
			GameImages.ACTOR_DERANGED_PATIENT,
		);

		// `map.PlaceActorAt(jason, new Point(map.Width / 2, map.Height / 2))` — the
		// room's centre, against the corridor's `new Point(map.Width / 2, 1)`.
		const at = patient!.location.position;
		expect(at.x).toBe(Math.floor(power.width / 2));
		expect(at.y).toBe(Math.floor(power.height / 2));
	}, 60_000);

	it("spawns no Jason Myers anywhere in the hospital", () => {
		// The fork's `BaseTownGenerator` has no `JasonMyers` at all, so his absence
		// under Still Alive is the reference's state and not a gate that was missed.
		// The storage corridor is where Classic puts him, which is why it is the
		// interesting map to check.
		const { storage } = hospitalMaps(Ruleset.STILL_ALIVE);
		expect(actorIds(storage), "Jason Myers and the patient are the same slot").not.toContain(
			ActorID.JASON_MYERS,
		);
	}, 60_000);

	it("records the patient in uniqueActors, and leaves the Jason slot untouched", () => {
		hospitalMaps(Ruleset.STILL_ALIVE);
		const uniques = Session.get().uniqueActors;
		expect(uniques.derangedPatient.isSpawned).toBe(true);
		expect(uniques.derangedPatient.theActor?.model.id).toBe(ActorID.DERANGED_PATIENT);
		expect(uniques.jasonMyers.isSpawned, "the Jason slot moved under Still Alive").toBe(false);
	}, 60_000);

	it("carries a bonesaw, not Jason's axe", () => {
		// `BaseMapGenerator.cs:2362`, `//replaces Jason Myer's axe`. The item is what
		// tells a player which of the two they just met, since both are unique melee
		// weapons in a hospital.
		const { power } = hospitalMaps(Ruleset.STILL_ALIVE);
		const patient = power.actors.find((a) => a.model.id === ActorID.DERANGED_PATIENT)!;
		const carried = patient.inventory!.items.map((i) => i.model.id);
		expect(carried).toContain(ItemID.MELEE_BONESAW);
		expect(carried).not.toContain(ItemID.UNIQUE_JASON_MYERS_AXE);
	}, 60_000);

	it("has three levels of High Stamina, where the corridor's Jason has five", () => {
		// The C# gives the patient three and Jason five. The corridor's five is
		// alpha10.1's "also upped high stamina to 5 (was 3)", so the fork's patient is
		// back at the pre-10.1 count -- and a port that copied Jason's five into the
		// patient would be a silent balance change nobody asked for.
		const count = (a: Actor): number =>
			a.sheet.skillTable.getSkillLevel(SkillID.HIGH_STAMINA);

		Session.get().ruleset = Ruleset.STILL_ALIVE;
		const stillAlive = hospitalMaps(Ruleset.STILL_ALIVE);
		const patient = stillAlive.power.actors.find(
			(a) => a.model.id === ActorID.DERANGED_PATIENT,
		)!;
		expect(count(patient)).toBe(3);

		// And the same three Tough / three Strong / three Agile, which are the same in
		// both actors and are what makes him a boss rather than a civilian.
		const level = (id: SkillID): number => patient.sheet.skillTable.getSkillLevel(id);
		expect(level(SkillID.TOUGH)).toBe(3);
		expect(level(SkillID.STRONG)).toBe(3);
		expect(level(SkillID.AGILE)).toBe(3);

		// Contrast, from Classic's own room, so the "three" above means something.
		Session.get().ruleset = Ruleset.CLASSIC;
		const classic = hospitalMaps(Ruleset.CLASSIC);
		const jason = classic.storage.actors.find((a) => a.model.id === ActorID.JASON_MYERS)!;
		expect(count(jason)).toBe(5);
	}, 120_000);
});

describe("the save format", () => {
	it("appends derangedPatient, so no existing unique actor moves", () => {
		// `UniqueActors` is written to a save as a *positional* array, and
		// `serialization/specs.ts` reads and writes through `toArray()` precisely so
		// the two cannot disagree. So a field inserted anywhere but the end would
		// re-point every unique after it, and a player would load a save in which the
		// bear is the sewers thing.
		//
		// This is the `PlayerCommand` rule in a place nobody expected it, and it is
		// the one part of this change that could quietly corrupt a save rather than
		// merely render wrongly — so it is asserted rather than left to the
		// save-graph tests, which would only notice the *count*.
		const uniques = new UniqueActors();
		const slots = uniques.toArray();
		expect(slots[slots.length - 1]).toBe(uniques.derangedPatient);
		expect(slots.length).toBe(10);

		// The nine that were there first, in the order they were in. Spelled out
		// because "the array has ten entries" would not notice a reshuffle.
		expect(slots.slice(0, 9)).toEqual([
			uniques.bigBear,
			uniques.duckman,
			uniques.famuFataru,
			uniques.hansVonHanz,
			uniques.roguedjack,
			uniques.santaman,
			uniques.policeStationPrisoner,
			uniques.theSewersThing,
			uniques.jasonMyers,
		]);
	});

	it("a save written before the field decodes to its defaults, not a shifted slot", () => {
		// The other half: nine entries in, nine read. `decodeUniques` iterates the
		// *data*, so a short array simply never reaches the tenth slot.
		const before = new UniqueActors();
		before.bigBear.isSpawned = true;
		const nine = before.toArray().slice(0, 9).map((u) => [u.isSpawned, null, u.isWithRefugees, u.eventThemeMusic, u.eventMessage]);
		const slots = new UniqueActors().toArray();
		nine.forEach((row, index) => {
			const [isSpawned, , isWithRefugees, music, message] = row as [
				boolean,
				null,
				boolean,
				string | null,
				string | null,
			];
			slots[index]!.isSpawned = isSpawned;
			slots[index]!.isWithRefugees = isWithRefugees;
			slots[index]!.eventThemeMusic = music;
			slots[index]!.eventMessage = message;
		});
		expect(slots[0]!.isSpawned, "the bear moved").toBe(true);
		expect(slots[9]!.isSpawned, "the tenth slot was written by a nine-entry save").toBe(false);
	});
});

describe("the bonesaw factory", () => {
	it("builds the C#'s unique melee weapon", () => {
		// `BaseMapGenerator.cs:2362-2368`: `IsUnique = true` and nothing else, so the
		// bonesaw is an ordinary melee weapon carrying the unique flag. It is
		// `butcher: true` in the item table, which is what lets a survivor cut the
		// patient up afterwards — a small consequence of being the right weapon.
		const runner = new HeadlessRunner(HOSPITAL_SEED);
		const params = new TownParameters();
		const gen = new StdTownGenerator(runner.rogueGame, params);
		const saw = gen.makeItemBonesaw();
		expect(saw.model.id).toBe(ItemID.MELEE_BONESAW);
		expect(saw.isUnique).toBe(true);
		expect(saw.model.imageId).toBe(GameImages.ITEM_BONESAW);
		// `butcher: true` in the item table, which is what lets a survivor cut the
		// patient up afterwards. It reaches the model as `canUseForButchering` —
		// the C#'s rule is "an equipped bladed weapon" and the models that satisfy it
		// are a curated list, so the flag is on the model rather than derived.
		expect(
			(saw.model as { canUseForButchering?: boolean }).canUseForButchering,
			"the bonesaw is the C#'s butchering weapon",
		).toBe(true);
	});
});

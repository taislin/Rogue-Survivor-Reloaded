/**
 * The four sound-option rows, and the three buses behind them.
 *
 * These four rows (`GameOptions.cs:16-19`) were absent, and the gap was larger than
 * it looked: with no `UI_SFXS` or `UI_SFXS_VOLUME` there was no place to turn
 * sound *effects* down, and the port's `ApplyOptions` read only
 * `Options.musicVolume`. So a player who turned the volume down was changing the
 * music and only the music, and could not silence the weather at all.
 *
 * The interesting part is not that the rows exist — it is that adding them
 * required widening two interfaces, and *that* is what the tests below are about.
 *
 * ## Why `setEnabled` had to be added
 *
 * `WebAudioSoundManager` already had a private `enabled` flag, already checked it
 * in `play` and `playIfNotAlreadyPlaying`, and had no way to set it from outside.
 * The mute was therefore implemented and unreachable. `ISoundManager.setEnabled`
 * exists because that is the seam the C# has (`IsSoundEnabled`) and the port did
 * not.
 *
 * ## Why `enabled` is separate from `volume`
 *
 * Because "off" and "quiet" are different states and the C# gives each a row.
 * Folding them together — `volume = 0` for mute — was available and is wrong: the
 * sfx manager still reports a 404 for a missing file either way, so a mute and a
 * zero-volume mix become indistinguishable exactly when you most want to tell them
 * apart.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GameOptions, OptionIDs, Options, stepGameOption } from "@engine/GameOptions";
import { GameMode } from "@engine/Session";
import { GameAmbients } from "@gameplay/GameAmbients";
import { GameMusics, GameSounds } from "@gameplay/GameSounds";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";

describe("the four sound rows the port was missing", () => {
	it("exist, with the C#'s labels", () => {
		// The C#'s `GetOptionName` strings are abbreviated in the port (it drops the
		// "(default ON)" suffixes), so these are the port's spelling and the *shape*
		// is the contract: four rows, in this order, all in the "(Sfx)" group the
		// music rows are in.
		expect(GameOptions.optionName(OptionIDs.UI_SFXS)).toContain("(Sfx)");
		expect(GameOptions.optionName(OptionIDs.UI_SFXS_VOLUME)).toContain("(Sfx)");
		expect(GameOptions.optionName(OptionIDs.UI_AMBIENTSFXS)).toContain("(Sfx)");
		expect(GameOptions.optionName(OptionIDs.UI_AMBIENTSFXS_VOLUME)).toContain("(Sfx)");
	});

	it("read back a volume as a percentage and a toggle as ON/OFF", () => {
		const o = new GameOptions();
		expect(o.describeValue(GameMode.GM_STANDARD, OptionIDs.UI_SFXS_VOLUME)).toBe(`${o.sfxVolume}%`);
		expect(o.describeValue(GameMode.GM_STANDARD, OptionIDs.UI_AMBIENTSFXS_VOLUME)).toBe(
			`${o.ambientSFXVolume}%`,
		);
		// `.trim()` on both sides: the C# pads with a trailing space so the column
		// lines up (`"ON "`, `"OFF"`), and comparing the padded form to an unpadded
		// list would fail on both entries while saying nothing about the value.
		expect(["ON", "OFF"]).toContain(
			o.describeValue(GameMode.GM_STANDARD, OptionIDs.UI_SFXS).trim(),
		);
		expect(["ON", "OFF"]).toContain(
			o.describeValue(GameMode.GM_STANDARD, OptionIDs.UI_AMBIENTSFXS).trim(),
		);
	});

	it("default to on, at the C#'s one-time 75", () => {
		// The C# sets both flags true but leaves both volumes *commented out*
		// (`GameOptions.cs:803-806`), then sets them to 75 in a block that runs only
		// when loading options fails. A player who has never saved gets 75; one who
		// has saved gets 0. The port takes 75 for both, because 0 is not a default,
		// it is a fault — a game with no sound.
		const o = new GameOptions();
		expect(o.playSFXs).toBe(true);
		expect(o.playAmbientSFXs).toBe(true);
		expect(o.sfxVolume).toBe(75);
		expect(o.ambientSFXVolume).toBe(75);
	});

	it("step both toggles and both volumes", () => {
		const o = Options;
		const before = {
			sfx: o.playSFXs,
			ambient: o.playAmbientSFXs,
			sfxVol: o.sfxVolume,
			ambientVol: o.ambientSFXVolume,
		};

		stepGameOption(OptionIDs.UI_SFXS, 1);
		expect(o.playSFXs).toBe(!before.sfx);

		stepGameOption(OptionIDs.UI_AMBIENTSFXS, 1);
		expect(o.playAmbientSFXs).toBe(!before.ambient);

		// 5 per press, as the C# does for the music volume.
		stepGameOption(OptionIDs.UI_SFXS_VOLUME, -1);
		expect(o.sfxVolume).toBe(before.sfxVol - 5);

		stepGameOption(OptionIDs.UI_AMBIENTSFXS_VOLUME, 1);
		expect(o.ambientSFXVolume).toBe(before.ambientVol + 5);

		// Clamped by the setter, not by the caller.
		for (let i = 0; i < 40; i++) stepGameOption(OptionIDs.UI_SFXS_VOLUME, -1);
		expect(o.sfxVolume).toBe(0);

		// Restore, so a later test in a shared process is not reading this one's
		// arithmetic.
		o.sfxVolume = before.sfxVol;
		o.ambientSFXVolume = before.ambientVol;
		o.playSFXs = before.sfx;
		o.playAmbientSFXs = before.ambient;
	});
});

describe("a muted bus stays distinguishable from a quiet one", () => {
	it("reports them separately, which is why they are two options", () => {
		const o = new GameOptions();
		o.playSFXs = false;
		o.sfxVolume = 0;
		expect(o.playSFXs).toBe(false);
		expect(o.sfxVolume).toBe(0);
		// And with the volume back up but the flag still off, the two still differ.
		o.sfxVolume = 100;
		expect(o.playSFXs).toBe(false);
		expect(o.sfxVolume).toBe(100);
	});
});

describe("ApplyOptions pushes all three buses", () => {
	/**
	 * Records every call, so a missing `setEnabled` is visible as a missing call.
	 *
	 * A `Proxy` rather than a literal object because the point is that the *set* of
	 * calls is what is asserted: hand-writing eleven no-op methods would keep
	 * passing if a new one were called, and would fail to compile if one were
	 * removed — the wrong way round for a test about what is being reached.
	 */
	function probe(label: string) {
		const calls: string[] = [];
		const stub = new Proxy(
			{},
			{
				get: (_t, prop: string | symbol) => {
					// Never look like a thenable, or `await`/`Promise.resolve` in the
					// code under test would try to assimilate it.
					if (typeof prop !== "string") return undefined;
					return (...args: unknown[]) => calls.push(`${label}.${prop}(${args.join(",")})`);
				},
			},
		) as never;
		return { calls, stub };
	}

	it("writes sfx and ambient volume, which it did not before", () => {
		// The regression this whole file exists to prevent: `ApplyOptions` reading
		// only `musicVolume`, so two of the three buses were unreachable from the
		// options screen.
		const game = new RogueGame(new NullRogueUI());
		const music = probe("music");
		const sfx = probe("sfx");
		const ambient = probe("ambient");
		(game as never as Record<string, unknown>).m_MusicManager = music.stub;
		(game as never as Record<string, unknown>).m_SoundManager = sfx.stub;
		(game as never as Record<string, unknown>).m_AmbientSFXManager = ambient.stub;

		const playMusicBefore = Options.playMusic;
		Options.sfxVolume = 40;
		Options.playSFXs = false;
		Options.ambientSFXVolume = 20;
		Options.playAmbientSFXs = false;
		Options.playMusic = false;

		try {
			game.ApplyOptions(false);
		} finally {
			Options.sfxVolume = 75;
			Options.playSFXs = true;
			Options.ambientSFXVolume = 75;
			Options.playAmbientSFXs = true;
			Options.playMusic = playMusicBefore;
		}

		// 0..100 in the options, 0..1 at the manager — the C#'s own conversion, and
		// the one that was missing for two of the three buses.
		expect(sfx.calls).toContain("sfx.setEnabled(false)");
		expect(sfx.calls).toContain("sfx.setVolume(0.4)");
		expect(ambient.calls).toContain("ambient.setEnabled(false)");
		expect(ambient.calls).toContain("ambient.setVolume(0.2)");
		// The music bus too, so this test fails if the new lines are added *instead*
		// of the existing one rather than alongside it.
		expect(music.calls.some((c) => c.startsWith("music.setVolume("))).toBe(true);
		// The enable flag, which is the one line the C# had and the port had
		// commented out (`RogueGame.cs:19857`). Without it `ApplyOptions` stopped
		// the track playing now and every other `play()` started a new one, so the
		// row read OFF over audible music. The stop below it is the C#'s
		// `StopAll`; it only sticks because this comes first.
		expect(music.calls).toContain("music.setEnabled(false)");
		expect(music.calls.indexOf("music.setEnabled(false)")).toBeLessThan(
			music.calls.indexOf("music.stop()"),
		);
	});
});

describe("the preview cues exist for the rows that adjust", () => {
	it("ships both test tracks", () => {
		// `test_music.ogg` was vendored with this change. Without it the music-volume
		// preview has nothing to play and the row is decorative.
		expect(GameMusics.TEST_MUSIC).toBe("test_music");
		expect(GameMusics.TEST_MUSIC_FILE).toContain("test_music");
		expect(GameAmbients.TEST_AMBIENT).toBe("test_ambient");
		// The sfx arm has no dedicated cue in the C# — it fires a real melee miss.
		expect(GameSounds.MELEE_ATTACK_MISS_PLAYER).toBe("player misses melee attack");
	});

});

describe("a melee miss is not gated on the ruleset", () => {
	// The fork annotates its additions with `//@@MP`, but not consistently in one
	// place: some constants carry it trailing on the declaration, most carry it on
	// a standalone comment line above it. The fixture records the trailing form,
	// which is the one that marks a single declaration unambiguously, and says so.
	const fixture = JSON.parse(
		readFileSync(join(__dirname, "fixtures", "gamesounds-fork-marked.json"), "utf-8"),
	) as {
		marked: { name: string; line: number }[];
		unmarkedButAsserted: { name: string; line: number }[];
	};

	it("because the constant carries no `@@MP` marker on its declaration", () => {
		// `GameSounds.cs:119`. `UNDEAD_EAT_PLAYER` *is* marked on its declaration,
		// which is what makes this a real distinction rather than a formality: only
		// its call site is marked for this one (`//@@MP (Release 2)` at
		// `RogueGame.cs:18547`), the fork wiring up a sound the original shipped.
		//
		// So the sound belongs to both rulesets and `tests/extended-audio.test.ts`
		// lists it in `VANILLA_IDS` rather than demanding an `ExtendedAudio` gate —
		// a gate there would put a Still Alive switch in front of a sound Classic
		// plays. Read the declaration, not the call site; reading the wrong one is
		// how this constant was misfiled in the first place.
		//
		// **Asserted against a committed fixture rather than the C#.** `_refs/` is
		// gitignored, so opening `GameSounds.cs` here passed locally and failed in
		// CI — the worst arrangement available, and the reason the other five
		// reference-checking tests already commit fixtures. The fixture's header
		// records how to regenerate it.
		const marked = new Set(fixture.marked.map((e) => e.name));
		const meleeMiss = fixture.unmarkedButAsserted.find(
			(e) => e.name === "MELEE_ATTACK_MISS_PLAYER",
		);
		expect(meleeMiss, "the fixture lost the entry").toBeDefined();
		expect(
			marked.has("MELEE_ATTACK_MISS_PLAYER"),
			"a marker here would make the sound fork-only",
		).toBe(false);
	});

	it("and the fixture is not vacuous", () => {
		// A committed fixture that lists nothing, or lists everything, would make the
		// assertion above pass for any input. So it is pinned against the marker the
		// C# demonstrably carries, and against being empty.
		const marked = new Set(fixture.marked.map((e) => e.name));
		expect(marked.size).toBeGreaterThan(0);
		expect(marked.has("UNDEAD_EAT_PLAYER")).toBe(true);
		expect(marked.has("BUILDING_NEARBY")).toBe(true);
	});
});
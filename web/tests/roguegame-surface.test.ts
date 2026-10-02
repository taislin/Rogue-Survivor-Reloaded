/**
 * `RogueGame`'s public surface, pinned.
 *
 * `plans/BROWSER_PORT_PLAN.md` §6 opens a four-wave decomposition of
 * `RogueGame.ts` with a stop condition: *"Stop if Wave 0 turns out to require
 * changing a public signature that a test or `HeadlessRunner` depends on."*
 * Answering it means knowing exactly which members the outside world already
 * depends on — because every one of them is a signature a wave must not break,
 * and because the 2024 deferral's stated cost ("thread a `game` reference
 * through ~500 call sites") is only a pessimistic guess until it is counted.
 *
 * So this is that count, asserted rather than written down. The pattern is
 * `feature-flags.test.ts`'s: the number is measured from the source by a
 * committed script and pinned here, so a change to the class's surface is a
 * deliberate diff in this file rather than something a refactor discovers on
 * the way past.
 *
 * ## Why the measurement is a script and not a paragraph
 *
 * §6's own numbers are from 2026-09-29, when `RogueGame.ts` was 27,722 lines. It
 * is now 35,961, and the file grew in the *middle* — ported content landed
 * between the regions. So **§6.2 through §6.9's `file:line` citations are stale,
 * including the two carrying the argument.** Re-running §6.2's line-range table
 * against the current file puts `DoSay` (`:21697`) and `DoUseItem` (`:22557`) in
 * the "render cluster" it describes as a leaf with 11 outbound edges; both are hub
 * action methods. `scripts/measure-roguegame.mjs` classifies by member name
 * instead, which is what §6's prose always described, and this test runs it.
 *
 * ## What is asserted, and what is deliberately not
 *
 * The four counts, and the *buckets* — not the member names. Names would make
 * this a churn magnet: adding one `Describe*` method would fail here for no
 * reason a reader could act on. Buckets are the decision the split turns on, so
 * they are what is pinned: how much of the outside world lands in a region that
 * moves, and how much in a hub that does not.
 *
 * Not asserted: that any particular member is private. The measurement reports
 * **zero** private members reached from outside the class, which is the finding
 * that matters — the two tests that pierce the boundary do it through
 * `prototype as any`, not through a public signature, so the missing `private`
 * boundary costs nothing at the seam. That is asserted below as an equality on
 * zero, because it is the number that decides whether §6.4's "deliberate
 * interface pass" is a large job or a small one.
 */

import { describe, expect, it } from "vitest";

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve(__dirname, "..", "scripts", "measure-roguegame.mjs");

/** Runs the committed measurement and parses its header block. */
function measure(): {
	lines: number;
	members: number;
	public: number;
	private: number;
	methods: number;
	external: number;
	moving: number;
	hubs: number;
	privateReached: number;
	buckets: Map<string, string[]>;
} {
	const out = execFileSync("node", [SCRIPT], { encoding: "utf8" });
	const num = (re: RegExp): number => {
		const m = re.exec(out);
		expect(m, `measure-roguegame.mjs did not print a match for ${re}`).toBeTruthy();
		return Number(m![1]);
	};
	const buckets = new Map<string, string[]>();
	let current: string | null = null;
	for (const line of out.split("\n")) {
		const header = /^(.+?)\s+—\s+(\d+)$/.exec(line);
		if (header) {
			current = header[1]!.trim();
			buckets.set(current, []);
			continue;
		}
		const member = /^\s+\d+\s+(?:public|private|protected)\s+([A-Za-z_]\w*)$/.exec(line);
		if (member && current) buckets.get(current)!.push(member[1]!);
	}
	return {
		lines: num(/^RogueGame\.ts: (\d+) lines/m),
		members: num(/^members: (\d+)/m),
		public: num(/^members: \d+\s+\(public (\d+)/m),
		private: num(/private (\d+)\)/m),
		methods: num(/^methods: (\d+)/m),
		external: num(/^reached from outside the class: (\d+)/m),
		moving: num(/in a region §6 moves: (\d+)/m),
		hubs: num(/in a hub \(never moves\):\s+(\d+)/m),
		privateReached: num(/private members reached from a test: (\d+)/m),
		buckets,
	};
}

describe("RogueGame's measured surface", () => {
	it("reports a class whose shape §6's own plan is measured against", () => {
		const m = measure();
		// §6.2 calls this "the god object", and the argument for splitting is the
		// ratio rather than the size. Pinned so the ratio has a history.
		//
// **843 / 757 with the character customiser**: four members, all private — the
  // note about a dropped choice, the preview, the doll drawer it uses, and
  // dressing the player from it.
  //
  // **`public` is unchanged at 752 and `external` at 113.** The customiser's first
  // public member, `DrawActorPreview`, is gone: the preview turned out not to need
  // an `Actor` at all, only a `Doll` and an image id, so it is `DrawDollPreview`
  // and private. Reaching the count by *removing* public surface is the only
  // direction §6 has ever gone on its own.
  //
  // The customiser's *state* went to `CharacterAppearance.ts` and its persistence
  // to `NewGameConfig.ts` rather than onto this class. Measured, keeping them here
  // cost ten private members for a self-contained read/validate/write of one JSON
  // record, and §6 is about taking members *off* this class. `external` is
  // unchanged at 113, which is what §6.10 actually stops on.
  //
  // The history below is why this number is worth reading rather than just
  // bumping: the last time the public count went *down*, six public picker methods
  // (`HandleSelectRuleset`, `HandleNewGameMode`, and the race / sex / skill /
  // undead-type screens) became two (`HandleSelectRulesetAndMode`,
  // `HandleNewCharacterDetails`) plus three private helpers. That happened
  // by deleting screens rather than by hiding them behind `private` — the
  // measurement cannot tell those apart, which is the caveat.
  expect(m.members).toBe(843);
  expect(m.methods).toBe(757);
  // The *reachable* surface is unchanged at 113, which is the number that matters
  // — nothing new is called from outside.
  expect(m.external).toBe(113);
  // §6.4: "567 of 584 methods are public — only 17 are `private`. The
  // `private` boundary is effectively absent." That is now *more* true, and the
  // direction is worth pinning: the public count grew, and so did the private
  // one, from 17 to 90. A naive reading of §6.4 would say the file has become
  // better encapsulated in a way it has not.
  expect(m.public).toBe(752);
  expect(m.private).toBe(91);
	});

	it("§6's stop condition is not met: nothing private is reached from outside", () => {
		// This is the answer to §6.10's "Stop if Wave 0 turns out to require changing
		// a public signature that a test or `HeadlessRunner` depends on."
		//
		// **Zero.** The two tests that need to be inside the class do it through
		// `prototype as any` (`gender-helpers.test.ts`, `minimap-cache.test.ts`) and
		// one hand-builds a structural double (`panel-hitboxes.test.ts`) — none of
		// which is a public signature, so none of which a wave can break. The absent
		// `private` boundary that §6.4 worries about costs nothing *at the seam*,
		// which is the only place it would have cost anything.
		const m = measure();
		expect(m.privateReached).toBe(0);
	});

	it("the outside world depends on 110 members, and §6 assumed far fewer", () => {
		// §6.4's `GameContext` was to name "the 11 service fields … plus `m_Player`,
		// `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`, `m_FirstPersonFacing`" —
		// about sixteen names. The measured number is nearly seven times that, and
		// it is the number §6.10's gate turns on: every one is a signature a wave
		// must not break.
		//
		// The 2024 deferral said "thread a `game` reference through ~500 call
		// sites". At 110 names the pessimistic figure is not the real one, and that
		// is the answer to the question §6.4 deferred until "the game runs and the
		// real cross-method dependencies are known".
		//
		// 112 since the inert sound tiers were wired: `DoShout` and `DoCloseDoor` were
		// reachable but untested, and the test that drives them is what made them
		// reachable *as named members* (`DoCloseDoor`'s camelCase alias was already
		// called from elsewhere).
		//
		// Note what did **not** move: `moving` is still 83, across both batches now.
		// Every new name is `Do*`,
		// so both landed in HUB 1 -- which §6.8 says never moves. Adding tests grew the
		// surface that must be kept signature-compatible without growing the surface a
		// wave has to relocate, which is the good direction for this number to go.
		const m = measure();
		expect(m.external).toBe(113);
		expect(m.external).toBeGreaterThan(83);
	});

	it("classifies all 110, with no residual", () => {
		// This is the finding that forced the re-derivation, and the number that keeps
		// it fixed. §6.2's region table left **68 of the 110** in no region at all —
		// including `AddMessage`, `KillActor`, `AdvancePlay`, `UpdatePlayerFOV` and the
		// whole map-zoom triple — which is larger than Wave 1's entire 2,079-line budget.
		// A wave plan whose residual is unclassified is not a plan.
		//
		// The taxonomy now covers the whole class and the residual is zero. Pinned as an
		// equality rather than a ceiling: a *new* unclassified member is the regression
		// this guards, and a ceiling would let one in while hiding it in a bucket that
		// happens to be large.
		const m = measure();
		const classified = [...m.buckets.values()].reduce((n, list) => n + list.length, 0);
		expect(classified).toBe(m.external);
		expect(m.buckets.get("STATE")?.length ?? 0).toBeLessThan(30);
	});

	it("splits the reachable surface into 30 hub and 83 movable, and the hubs stay", () => {
		// §6.8: the two hubs "are the reason the split is worth doing rather than the
		// reason it fails". Still true, and now measured on the current file.
		const m = measure();
		expect(m.moving).toBe(83);
		expect(m.hubs).toBe(30);
		expect(m.moving + m.hubs).toBe(m.external);
		// HUB 1 is 23 of the 30: `DoShout` and `DoCloseDoor` joined when their sound
		// tiers were wired and tested, and one more joined with the second batch.
		// HUB 2 is unchanged at 7.
		expect(m.buckets.get("HUB 1  Do*/On* action primitives")?.length ?? m.buckets.get("HUB 1")?.length).toBe(23);
	});

	it("names 23 members GameContext has to carry, not 11", () => {
		// §6.4 proposed naming "the 11 service fields (`m_UI`, `m_Rules`, `m_Session`,
		// …) plus `m_Player`, `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`,
		// `m_FirstPersonFacing`" — about sixteen. The measured figure is 23, and the
		// list is not only fields: `TAG_MODE_TEXT`, `MAX_THROWABLE_DISTANCE` and
		// `VERB_UNLOAD` are constants reached from the UI, and `simulateOneBehindDistrictTurn`
		// and `stepActorsOnFire` are *methods* reached from the sim rather than state at all.
		//
		// That last pair is why "a context of fields" is the wrong shape and the taxonomy
		// has a `carry` classification rather than assuming everything here is data.
		const m = measure();
		const carry = m.buckets.get("STATE") ?? [];
		expect(carry.length).toBe(23);
		for (const name of ["player", "session", "rules", "m_PlayerFOV", "m_CharGen", "m_IsGameRunning", "m_PlayerWasRescued", "TAG_MODE_TEXT", "simulateOneBehindDistrictTurn", "stepActorsOnFire"]) {
			expect(carry, `${name} should be classified as carried`).toContain(name);
		}
	});

	it("finds six reachable leaves, which is the whole of Wave 1's seam", () => {
		// `DescribeActorActivity`, `DescribeItemLong`, `GetUserNewScreenshotName`,
		// `MapToScreen`, `ScreenToMap`, `doEquipItem`. Six, against §6.5's 2,079-line
		// Wave 1 — the wave is much bigger than its *externally reached* part, which is
		// worth knowing before scheduling it.
		const m = measure();
		expect(m.buckets.get("WAVE 1")?.length).toBe(6);
	});

	it("routes the three regions §6 never named, by extractability", () => {
		// These are the groups that were in the 68. They are ordered by how hard they
		// are to move, which is the only thing that decides what to do first — and the
		// order runs *against* the file's layout, because the file has no layout that
		// matches.
		const m = measure();
		expect(m.buckets.get("VIEW")?.length).toBe(13);
		expect(m.buckets.get("WORLD")?.length).toBe(15);
		expect(m.buckets.get("ENGINE")?.length).toBe(17);
		// A representative from each, so a rename that silently empties a region fails.
		expect(m.buckets.get("VIEW")).toContain("UpdatePlayerFOV");
		expect(m.buckets.get("WORLD")).toContain("RefreshPlayer");
		expect(m.buckets.get("ENGINE")).toContain("KillActor");
	});

	it("keeps the hubs out of every movable bucket", () => {
		// The one invariant the whole scheme rests on. If a hub method ever matched a
		// leaf or a region pattern, it would be scheduled to move out from under the
		// render loop that calls it, and nothing else here would notice.
		const m = measure();
		const hubs = new Set(m.buckets.get("HUB 1") ?? []);
		for (const name of m.buckets.get("HUB 2") ?? []) hubs.add(name);
		expect(hubs.size).toBe(30);
		for (const [region, list] of m.buckets) {
			if (region.startsWith("HUB")) continue;
			for (const name of list) expect(hubs.has(name), `${name} is in two regions`).toBe(false);
		}
	});
});

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
 * is now 36,487, and the file grew in the *middle* — ported content landed
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
    // **846, having been 845 a moment ago and 846 before that.**
    //
    // The count went *down* twice — `m_ScreenshotCounter` left with the `GetUser*`
    // paths and `m_MenuRowBands` left with the menu chrome, both private, both
    // existing only because the methods using them had nowhere else to live. It
    // went back *up* by one for `updateAdvisorHintBanner`, the advisor banner
    // branch lifted out of the play loop so the bug where ESC never closed the
    // last hint could be tested at all.
    //
    // That trade is the honest shape of this work: a member added to the class to
    // make a defect inside it reachable. It is a method rather than a field, it
    // holds no state the class did not already have, and the alternative was a
    // defect in a ~400-line turn loop that no test could reach.
    //
    // **The latest +1 is `anyPlayerAlive`**, added by `MULTIPLAYER_PLAN.md` §8
    // Phase 1. Same shape as the last one: a public member introduced so a
    // question asked in three places (`GameLoop`, `advancePlayDistrict`,
    // `advancePlayMap`) and once more in `HeadlessRunner` can be asked once. It
    // is a getter over state the class already had, and the alternative was four
    // copies of "is the game over" drifting apart — which is exactly the defect
    // the phase exists to remove. It reaches `HeadlessRunner`, so it is external
    // by the measurement's rule and not an implementation detail.
    expect(m.members).toBe(846);
    expect(m.methods).toBe(762);
    // The *reachable* surface is 118. It did not move for either extraction — both
    // regions kept their methods on the class, which is what keeps them pure moves —
    // and then moved by one for `anyPlayerAlive`, which has to be reachable because
    // `HeadlessRunner` is not the class.
    expect(m.external).toBe(118);
// §6.4: "567 of 584 methods are public — only 17 are `private`. The
  // `private` boundary is effectively absent." That is still true, and the
  // direction is worth pinning: private has come down from 91 to 89, while public
  // moved by two. Public barely moving is the point — both extractions left
  // delegations behind rather than deleting callers' entry points, so the ratio
  // has not improved much and is not claimed to have. The additions are
  // `updateAdvisorHintBanner`, whose reason is recorded above, and
  // `anyPlayerAlive`, recorded on `members` above.
  expect(m.public).toBe(757);
  expect(m.private).toBe(89);
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

	it("the outside world depends on 118 members, and §6 assumed far fewer", () => {
		const m = measure();
		// §6.4's `GameContext` was to name "the 11 service fields … plus `m_Player`,
		// `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`, `m_FirstPersonFacing`" —
		// about sixteen names. The measured number is nearly seven times that, and
		// it is the number §6.10's gate turns on: every one is a signature a wave
		// must not break.
		//
    // The 2024 deferral said "thread a `game` reference through ~500 call
    // sites". At 118 names the pessimistic figure is not the real one, and that
    // is the answer to the question §6.4 deferred until "the game runs and the
    // real cross-method dependencies are known".
    expect(m.external).toBe(118);
    expect(m.external).toBeGreaterThan(83);
	});

  it("classifies all 118, with no residual", () => {
    // This is the finding that forced the re-derivation, and the number that keeps
    // it fixed. §6.2's region table left **68 of the 110** (as measured then) in no
    // region at all —
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

  it("splits the reachable surface into 32 hub and 86 movable, and the hubs stay", () => {
    // §6.8: the two hubs "are the reason the split is worth doing rather than the
    // reason it fails". Still true, and now measured on the current file. The
    // moving side is 86 because `anyPlayerAlive` lands in a region §6 moves —
    // it is game state, not chrome — while the hub count is untouched.
    const m = measure();
    expect(m.moving).toBe(86);
    expect(m.hubs).toBe(32);
    expect(m.moving + m.hubs).toBe(m.external);
    // HUB 1 is 24 of the 32. `DoTag` joined when the minimap tag test replaced a
    // source scan with a real call to it; HUB 2 is 8, `HandlePlayerTradeNegociation`
    // joining when the trusted-leader test drove the actual trade screen.
    expect(m.buckets.get("HUB 1  Do*/On* action primitives")?.length ?? m.buckets.get("HUB 1")?.length).toBe(24);
  });

  it("names 25 members GameContext has to carry, not 11", () => {
		// §6.4 proposed naming "the 11 service fields (`m_UI`, `m_Rules`, `m_Session`,
		// …) plus `m_Player`, `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`,
		// `m_FirstPersonFacing`" — about sixteen. The measured figure is 24, and the
		// list is not only fields: `TAG_MODE_TEXT`, `MAX_THROWABLE_DISTANCE` and
		// `VERB_UNLOAD` are constants reached from the UI, and `simulateOneBehindDistrictTurn`
		// and `stepActorsOnFire` are *methods* reached from the sim rather than state at all.
		//
		// That last pair is why "a context of fields" is the wrong shape and the taxonomy
		// has a `carry` classification rather than assuming everything here is data.
		//
		// `anyPlayerAlive` is newer still: it is the game-over question, reached from
		// `HeadlessRunner`'s turn loop, and it belongs here rather than in a method
		// bucket because it reads `m_Session.world` — carried state, asked about.
		//
		// `CURRENT_SAVE_SLOT` is the newest of the constants, and it is there because `paths.test.ts`
		// asserts the module's private copy of the slot number against the class's.
		// That is a test creating a dependency rather than code needing one — worth
		// recording, because it means this bucket counts what the *tests* reach and not
		// only what the game does.
		const m = measure();
		const carry = m.buckets.get("STATE") ?? [];
		expect(carry.length).toBe(25);
		for (const name of ["player", "session", "rules", "m_PlayerFOV", "m_CharGen", "m_IsGameRunning", "m_PlayerWasRescued", "TAG_MODE_TEXT", "simulateOneBehindDistrictTurn", "stepActorsOnFire", "CURRENT_SAVE_SLOT"]) {
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
    expect(hubs.size).toBe(32);
		for (const [region, list] of m.buckets) {
			if (region.startsWith("HUB")) continue;
			for (const name of list) expect(hubs.has(name), `${name} is in two regions`).toBe(false);
		}
	});
});

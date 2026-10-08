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
    // **848, having been 846 when this decomposition started moving code.**
    //
    // The count went *down* twice — `m_ScreenshotCounter` left with the `GetUser*`
    // paths and `m_MenuRowBands` left with the menu chrome, both private, both
    // existing only because the methods using them had nowhere else to live. It
    // went back *up* by one for `updateAdvisorHintBanner`, the advisor banner
    // branch lifted out of the play loop so the bug where ESC never closed the
    // last hint could be tested at all, and by four for `(Gfx) Speech Bubbles` —
    // three methods and one field, all of which are the cost of making the feature
    // reachable at all.
    //
    // **Down two, for the hiscores text export.** The C# wrote its score table out
    // twice -- a binary file and a `hiscores.txt` beside it -- and the port did the
    // same into `localStorage`, which also meant the score table *drew its own
    // storage key* on screen. Removing it dropped `GetUserHiScoreFilePath`,
    // `GetUserHiScoreTextFilePath`, and `HandleHiScores`'s parameter. The reachable
    // surface is unmoved: deleting members reaches nothing new from outside.
    //
    // Then by one more for `SPEECH_BUBBLE_FILLCOLOR`, when the bubbles stopped
    // sharing `POPUP_FILLCOLOR`. One public readonly field beside the one it
    // replaces, and no method: the alternative was leaving every bubble the same
    // colour as every other box on screen, which is the defect. A colour constant
    // on the class is where `POPUP_FILLCOLOR` has always lived.
    //
    // These four were added on top of a file that was already **one** behind: the
    // gender/Amo fix before it added a member without recording it here, so the
    // reachable surface measured 118 against a pinned 117. Both counts are in the
    // numbers below now, and the *reachable* counts here are the ones that had
    // drifted — `members`, `methods` and `public` were all correct.
    //
    // That trade is the honest shape of this work: a member added to the class to
    // make a defect inside it reachable. It is a method rather than a field, it
    // holds no state the class did not already have, and the alternative was a
    // defect in a ~400-line turn loop that no test could reach.
    expect(m.members).toBe(848);
    expect(m.methods).toBe(676);
    // The *reachable* surface is 124, up from 121. Both extractions had left it
    // alone -- each kept its methods on the class, which is what keeps them pure
    // moves -- and these three moved it for the opposite reason: a test reaching
    // further than it needs to. The speech-bubble appearance tests assert on the
    // *colours* the bubbles are drawn with, so they name `POPUP_FILLCOLOR` and
    // `SPEECH_BUBBLE_FILLCOLOR` from outside, and those had not been reached before.
    //
    // Which is the same caveat `CURRENT_SAVE_SLOT` carries in the STATE bucket
    // below: this count is what the *tests* touch, not only what the game needs.
    // A dependency invented to assert on a colour is a real cost of the assertion,
    // and it is cheaper than the alternative -- a bubble the same colour as every
    // other box on screen, with nothing to notice it.
    //
    // **One more, for `HandleAiActor`, and it is the same story as `DoChat` in the
    // hub below.** `b0a72c4` made it async — the post-mortem's `WaitEnter` has to
    // settle before the caller resumes, or the `n` typed at Limbo lands in a
    // background prompt — and `endgame-exit.test.ts` now awaits it directly to
    // assert that ordering. It was already public and already only reached from
    // within the class, so nothing about the game's own shape changed: a test
    // reached one further than it had before, which is exactly the caveat this
    // count exists to record.
    //
    // **One more, for `DoSaveGame`, and it is the same caveat for the third time.**
    // `load-game-controllers.test.ts` proves `LoadGame` rebuilds the NPC
    // controllers the save graph does not carry, and the only way to get a real
    // save into the game is to ask the game for one: `DoSaveGame(slot)` then
    // `LoadGame(slot)`. It is a `Do*` action primitive, so it lands in HUB 1
    // rather than in a region that moves -- a test reaching the save path, which
    // is the split classifying it the right way round.
    //
    // **Two more, for `customiser-skill-row.test.ts`.** That test drives the
    // character details screen with real keys to assert what the skill row
    // describes and what Enter commits, which reaches `HandleNewCharacterDetails`
    // (WAVE 3) and `DescribeSkillShort` (WAVE 1) from outside for the first time.
    // Both are public and both were already called from within the class; the new
    // reach is a test asserting what a screen puts on it -- the same caveat as
    // `DoSaveGame` above, moved for the same reason.
    expect(m.external).toBe(130);
// §6.4: "567 of 584 methods are public — only 17 are `private`. The
  // `private` boundary is effectively absent." That is still true, and the
  // direction is worth pinning: private has come down from 91 to 89, while public
  // moved by exactly one. Public barely moving is the point — both extractions left
  // delegations behind rather than deleting callers' entry points, so the ratio
  // has not improved much and is not claimed to have. The single addition is
  // `updateAdvisorHintBanner`, whose reason is recorded above.
  //
  // **`methods` fell from 761 to 678, and no code was deleted.** The measurement
  // decided method-or-field by asking whether the declaration line contained a `(`
  // anywhere, and a field with an initialiser has brackets of its own —
  // `m_SpeechBubbles: Map<...> = new Map()` among 83 of them — so those fields were
  // counted as methods and appeared in both totals. It now asks what follows the
  // name: `(` for a method, `:` or `=` for a field.
  expect(m.public).toBe(759);
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

	it("the outside world depends on 130 members, and §6 assumed far fewer", () => {
		const m = measure();
		// §6.4's `GameContext` was to name "the 11 service fields … plus `m_Player`,
		// `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`, `m_FirstPersonFacing`" —
		// about sixteen names. The measured number is nearly eight times that, and
		// it is the number §6.10's gate turns on: every one is a signature a wave
		// must not break.
		//
    // The 2024 deferral said "thread a `game` reference through ~500 call
    // sites". At 121 names the pessimistic figure is not the real one, and that
    // is the answer to the question §6.4 deferred until "the game runs and the
    // real cross-method dependencies are known".
    expect(m.external).toBe(130);
    expect(m.external).toBeGreaterThan(83);
	});

  it("classifies all 126, with no residual", () => {
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
		expect(m.buckets.get("STATE")?.length ?? 0).toBeLessThan(33);
	});

it("splits the reachable surface into 35 hub and 95 movable, and the hubs stay", () => {
    // §6.8: the two hubs "are the reason the split is worth doing rather than the
    // reason it fails". Still true, and now measured on the current file.
    const m = measure();
    // `HandleAiActor` is why movable is 93 rather than 92. It is not an action
    // primitive, so the test that now awaits it enlarges the half that moves rather
    // than the hubs -- the split classifying it the right way round.
    //
    // **95 now**: `DescribeSkillShort` (WAVE 1) and `HandleNewCharacterDetails`
    // (WAVE 3) joined when `customiser-skill-row.test.ts` reached them, both
    // movable leaves of a screen test -- again the split classifying the reach the
    // right way round, and again the hubs unmoved at 35.
    expect(m.moving).toBe(95);
    expect(m.hubs).toBe(35);
    expect(m.moving + m.hubs).toBe(m.external);
    // HUB 1 is 27 of the 35. `DoTag` joined when the minimap tag test replaced a
    // source scan with a real call to it; HUB 2 is 8, `HandlePlayerTradeNegociation`
    // joining when the trusted-leader test drove the actual trade screen.
    //
    // `DoChat` and `DoTrade` then joined HUB 1 from the fast-trade test, which drives
    // `DoChat` to assert that it does *not* open a trade and `DoTrade` to assert the
    // player can still open one deliberately. Both are action primitives, so they
    // route to a hub rather than to a movable region — which is the split working:
    // reaching them from a test enlarged the part that never moves rather than the
    // part that does.
    //
    // `(Gfx) Speech Bubbles` did not join HUB 1, and that is the interesting part:
    // the feature hangs off the say path and is drawn from `RedrawPlayScreen`, so
    // `DrawSpeechBubbles` routes to WAVE 2 and the two hubs are unmoved. The point
    // of the split is that a feature this size lands in a region that moves.
    //
    // `DoSaveGame` is the newest, for `load-game-controllers.test.ts`: writing a
    // save is the first half of reading one back, so that test reaches the save
    // primitive before the load primitive it is actually about.
    expect(m.buckets.get("HUB 1  Do*/On* action primitives")?.length ?? m.buckets.get("HUB 1")?.length).toBe(27);
  });

  it("names 27 members GameContext has to carry, not 11", () => {
		// §6.4 proposed naming "the 11 service fields (`m_UI`, `m_Rules`, `m_Session`,
		// …) plus `m_Player`, `m_PlayerFOV`, `m_MapViewRect`, `m_Overlays`,
		// `m_FirstPersonFacing`" — about sixteen. The measured figure is 27, and the
		// list is not only fields: `TAG_MODE_TEXT`, `MAX_THROWABLE_DISTANCE` and
		// `VERB_UNLOAD` are constants reached from the UI, and `simulateOneBehindDistrictTurn`
		// and `stepActorsOnFire` are *methods* reached from the sim rather than state at all.
		//
    // That last pair is why "a context of fields" is the wrong shape and the taxonomy
    // has a `carry` classification rather than assuming everything here is data.
    //
    // `CURRENT_SAVE_SLOT` is the newest, and it is there because `paths.test.ts`
    // asserts the module's private copy of the slot number against the class's.
    // That is a test creating a dependency rather than code needing one — worth
    // recording, because it means this bucket counts what the *tests* reach and not
    // only what the game does.
		const m = measure();
    const carry = m.buckets.get("STATE") ?? [];
    // `HandleAiActor` is the 31st, and it is a *method*, which is the point of a
    // `carry` classification rather than a list of fields. Same caveat as the two
    // above: a test reached it, so this bucket counts what the tests touch too.
    expect(carry.length).toBe(31);
		for (const name of ["player", "session", "rules", "m_PlayerFOV", "m_CharGen", "m_IsGameRunning", "m_PlayerWasRescued", "TAG_MODE_TEXT", "simulateOneBehindDistrictTurn", "stepActorsOnFire", "CURRENT_SAVE_SLOT", "POPUP_FILLCOLOR", "SPEECH_BUBBLE_FILLCOLOR"]) {
			expect(carry, `${name} should be classified as carried`).toContain(name);
		}
	});

	it("finds seven reachable leaves, which is the whole of Wave 1's seam", () => {
		// `DescribeActorActivity`, `DescribeItemLong`, `GetUserNewScreenshotName`,
		// `MapToScreen`, `ScreenToMap`, `doEquipItem`, and now `DescribeSkillShort`
		// -- reached by `customiser-skill-row.test.ts` describing the skill the
		// row's entry stands for. Seven, against §6.5's 2,079-line Wave 1 -- the
		// wave is much bigger than its *externally reached* part, which is worth
		// knowing before scheduling it.
		const m = measure();
		expect(m.buckets.get("WAVE 1")?.length).toBe(7);
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
    expect(hubs.size).toBe(35);
		for (const [region, list] of m.buckets) {
			if (region.startsWith("HUB")) continue;
			for (const name of list) expect(hubs.has(name), `${name} is in two regions`).toBe(false);
		}
	});
});

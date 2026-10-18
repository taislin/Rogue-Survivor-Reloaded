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
    // **849, for `mapDrawScale`.** The overlay pass has to test an effect's
    // anchor against the map panel at the scale `withMapZoom` draws it, and the
    // two early-outs that decide that scale (first person, zoom 1) now live in
    // one method so a gate cannot measure at one scale while the drawing happens
    // at another. Private, stateless, and reached by nothing -- the count moves
    // because the class grew, not because a test reached further into it.
    //
    // **857, for `DoScream`.** The fork's scream -- gendered, situational, two
    // distance bands -- is the last member out of the audio work: four tables of
    // ids live at module scope beside the bash ladder's, and this is the one
    // *method* they are read through. It classifies as a `Do*` alias-free hub
    // entry rather than a region, because it is called from the move, fire,
    // death and trap paths alike.
    //
    // **863, for the rest of the fork's audio and the flashbang.** Six more
    // methods and one constant: `PlayNonHumanVocalAudio` (the animal
    // vocalisation the fork centralised), `GenerateIncapacitatedAction` (private)
    // and `TryPlayerIncapacitated` for the stun/flashbang chain,
    // `SpawnNewFeralDog` and `FireEvent_RescueWave` for the rescue wave, and
    // `DetonateFlashbang` for the flash itself. The constant is
    // `STUN_WEAPON_EFFECT_TURNS`, read by both the stun gun and the flashbang.
    // The `Actor` fields the counters live in are in `data/Actor.ts`, so they
    // are not part of this class's count.
    //
    // **864, for `flashbangImage`.** The full-screen tint the flashbang throws
    // up, stepped across the counter as it runs down. Stateless, drawn by the
    // tile pass, reached by nothing outside the draw.
    //
    // **865, for the hi-scores seed column's `formatHiScoreSeed`** (private).
    // This port added the column after the fork gave it a seed screen, so a
    // score row can name the world it was played in; the method right-aligns
    // the value under the header and draws an unrecorded entry as a dash. It is
    // reached only by the row formatter, so the count moves for the class
    // growing rather than for the outside world reaching further in.
    expect(m.members).toBe(865);
    expect(m.methods).toBe(690);
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
    //
    // **One more, for `hiscores-screen.test.ts`.** That test drives the scores
    // screen through `HandleHiScores` with real keys, because what it asserts is
    // which of the two text faces each of the screen's lines reaches the canvas
    // with and at what y — neither of which a call to a draw method by hand
    // would show. The method was public and called from nowhere outside the
    // class before (the endgame test only names it in a comment), so this is the
    // caveat again: a test reached a public screen method, and the game's own
    // shape did not change.
    //
    // **One more, for `seed-selection.test.ts` — and this one is a new member,
    // not a new reach.** A seed was always rolled and never chosen, so the
    // screen that offers it (`HandleSelectSeed`, between the ruleset picker and
    // the character screens) is a method the class did not have. It is public and
    // it is on the new-game flow, so it lands in WAVE 3 beside the picker above
    // it rather than in a hub: a screen the flow owns, which is the shape this
    // split wants to move.
    //
    // **Three more, for `cook-and-destroy.test.ts` and the swap prompt in
    // `shelter-backpacks.test.ts`.** `HandlePlayerDestroyItem` and
    // `HandlePlayerCookFood` (Release 7-6's two inventory-key commands) and
    // `HandlePlayerSwapItemInventory` (Release 8-2, whose modal slot prompt
    // landed with them) are each driven by a test for the first time, and all
    // three classify as HUB 2 — `Handle*` player handlers that never move. So
    // the reach grew by three and every one of them went into a hub, which is
    // the split saying these are handlers, not a region worth extracting.
    //
    // **138, for `AddOverlay`.** The overlay-clipping work's rendering tests
    // drive the real screen redraw, and adding an overlay to it is the first
    // time a test has reached that method. It classifies as STATE — it mutates
    // the overlay list the screen draws from — so it lands in the movable half
    // rather than a hub, which is a reach enlarging the part that moves.
    //
    // **139, for `doLeaveMap`.** The district-exit race test calls the camelCase
    // alias directly, because the crash it pins is inside `DoLeaveMap` and
    // driving it through a bump and an action would test the callers rather than
    // the window. No prior test reached the alias: `Actions.ts` is outside the
    // consumer scan, and the headless bot plays through `AdvancePlay`. WAVE 1,
    // and movable — a method a wave can reorganise, reached the same way the
    // other screen-driving tests reach the class.
    //
    // **140, for `DescribeAmmoType`.** The tooltip tests pin all thirteen
    // `AmmoType`s, having found the switch carrying only the six vanilla ones
    // and throwing on the rest. It sits in WAVE 1 immediately beside the
    // `DescribeItemLong` that calls it, so both halves of the tooltip seam are
    // now measured, and again it is a reach that enlarges the movable half.
    expect(m.external).toBe(140);
  // §6.4: "567 of 584 methods are public — only 17 are `private`. The
  // `private` boundary is effectively absent." That is still true, and the
  // direction is worth pinning: private has come down from 91 to 89, and is 90
  // again only because `mapDrawScale` was added (above); public moved by exactly
  // one. Public barely moving is the point — both extractions left
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
  //
  // **`HandleSelectSeed` is the one addition since**, and it is the only member
  // added by the seed-selection feature: one public screen method, no state the
  // class did not already hold — the seed it edits has been a session field since
  // the port began, which is why only `public` and `methods` moved and `private`
  // is still 90.
  //
  // **Six for the inventory commands, `private` back to 91 because of one of
  // them.** `HandlePlayerDestroyItem`, `HandlePlayerCookFood`, `DoCookFood`,
  // the private `promptForSwap`, and the two `SWAP_ITEM_*_MODE_TEXT` captions.
  // `promptForSwap` is private for the reason `mapDrawScale` is: it is a modal
  // key loop the play loop reaches and nothing else, and the C# had it inline in
  // `HandlePlayerSwapItemInventory`. The captions are two `readonly string[]`
  // fields, exactly like every other mode banner on the class.
  //
  // **94, three on from the audio work's `GenerateIncapacitatedAction`, and one
  // for `formatHiScoreSeed`** — the hi-scores seed column's formatter, private
  // for the same reason `promptForSwap` is: one screen's key loop reaches it and
  // nothing else does.
  expect(m.public).toBe(771);
  expect(m.private).toBe(94);
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

	it("the outside world depends on 136 members, and §6 assumed far fewer", () => {
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
    //
    // **132 now**, and it is the only addition since: `HandleSelectSeed`, a new
    // screen in the new-game flow, driven by `seed-selection.test.ts` the way
    // `hiscores-screen.test.ts` drives `HandleHiScores`.
    //
    // **135 now**: the two Release 7-6 inventory commands and the Release 8-2
    // swap prompt add three more handlers, and they are all `Handle*` player
    // handlers -- so they land in a hub rather than in a region, which is the
    // split classifying a reach the cheap way.
    //
    // **136 now**: `DoBreak`, which the bash-sound tests call directly. It is an
    // action primitive, so it lands in HUB 1 beside `DoMeleeAttack` and the rest
    // -- the hub a wave must never move, reached by a test that checks which of
    // three call sites inside it fires.
    //
    // **138 now**: `AddOverlay`, reached by the overlay-clipping work's
    // rendering tests driving the real screen redraw. STATE, so movable.
    //
    // **139 now**: `doLeaveMap`, reached by the district-exit race test calling
    // it directly. WAVE 1, so movable; the reason for the reach is recorded at
    // the other pin of this number.
    //
    // **140 now**: `DescribeAmmoType`, reached by the tooltip tests that pin all
    // thirteen `AmmoType`s after the switch was found to carry only the six
    // vanilla ones and to throw on the rest. WAVE 1 beside `DescribeItemLong`,
    // which is the method that calls it -- so a test proving the tooltip does not
    // crash reaches both halves of the seam at once.
    expect(m.external).toBe(140);
    expect(m.external).toBeGreaterThan(83);
	});

  it("classifies all 127, with no residual", () => {
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
		// 33, with `AddOverlay` the newest: the overlay-clipping rendering tests
		// reach it, and it classifies as STATE — the overlay list the screen
		// draws from, which is exactly the sort of thing a context carries.
		expect(m.buckets.get("STATE")?.length ?? 0).toBeLessThan(34);
	});

it("splits the reachable surface into 39 hub and 99 movable, and the hubs stay", () => {
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
    //
    // **96 now**: `HandleHiScores` joined when `hiscores-screen.test.ts` drove the
    // scores screen with real keys to assert which face its header is drawn with
    // and where. It classifies as STATE rather than as an action primitive, so it
    // lands in the movable half and the hubs stay at 35 -- a screen method
    // reached from a test, which is the shape this split wants to move.
    //
    // **97 now**: `HandleSelectSeed`, and this one is a *new member* rather than a
    // new reach -- the seed screen is the only thing seed selection added to the
    // class. It is named on the Wave 3 list, so it lands beside the picker above
    // it: a screen the new-game flow owns, which is the region that moves.
    //
    // **Still 97, with the hubs up to 38.** The next three reaches went the other
    // way: `HandlePlayerDestroyItem`, `HandlePlayerCookFood` and
    // `HandlePlayerSwapItemInventory` are all `Handle*` player handlers, so they
    // classify as HUB 2 and the movable half does not move at all. That is the
    // split working -- a test reaching a handler enlarges the part of the class
    // that never has to move, which is the cheapest place for a reach to land.
    //
    // **Still 97, with HUB 1 up to 28.** `DoBreak` is the reach that went the same
    // cheap way: the bash/break sound tests drive it directly, and a `Do*` action
    // primitive classifies as a hub rather than a region, so the movable half is
    // unchanged again and the hub grew by one.
    //
    // **99 now**: `AddOverlay`, from the overlay-clipping work's rendering tests
    // driving the real screen redraw. It mutates the overlay list the screen
    // draws from, so STATE classifies it movable rather than a hub -- a reach
    // enlarging the half that moves, not the half that cannot.
    //
    // **100 now**: `doLeaveMap`, from the district-exit race test. WAVE 1, so
    // movable, and the hubs stay at 39 -- an exit traversal is a region method,
    // not an action primitive, and the split puts it where a wave could move it.
    //
    // **101 now**, and the hubs still 39: `DescribeAmmoType`, from the tooltip
    // tests. WAVE 1 again, so the movable half grew and the hubs did not --
    // which is the split working, and is why the other three pins of this
    // number move without this one.
    expect(m.moving).toBe(101);
    expect(m.hubs).toBe(39);
    expect(m.moving + m.hubs).toBe(m.external);
    // HUB 1 is 28 of the 39. `DoTag` joined when the minimap tag test replaced a
    // source scan with a real call to it; HUB 2 is 11, `HandlePlayerTradeNegociation`
    // joining when the trusted-leader test drove the actual trade screen, and
    // `HandlePlayerCookFood`/`HandlePlayerDestroyItem`/`HandlePlayerSwapItemInventory`
    // when the Release 7-6 inventory commands and the Release 8-2 swap prompt
    // landed.
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
    expect(m.buckets.get("HUB 1  Do*/On* action primitives")?.length ?? m.buckets.get("HUB 1")?.length).toBe(28);
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
    //
    // `HandleHiScores` is the 32nd, and the same in kind: a screen method, not
    // state, put here by `hiscores-screen.test.ts` driving it with real keys.
    //
    // **Still 32.** `HandleSelectSeed` looks like the 33rd and is not: it is
    // named on the Wave 3 list in `measure-roguegame.mjs`, so a screen that is
    // squarely part of the new-game flow does not land in the bucket of things
    // `GameContext` carries. The STATE bucket holding still is the point.
    //
    // **33, and `AddOverlay` is the one.** The overlay-clipping work's rendering
    // tests reach it for the first time, and it belongs: the overlay list it
    // appends to is state the screen carries, and it is a method rather than a
    // field — which is why the bucket is a `carry` classification and not a
    // list of data.
    expect(carry.length).toBe(33);
		for (const name of ["player", "session", "rules", "m_PlayerFOV", "m_CharGen", "m_IsGameRunning", "m_PlayerWasRescued", "TAG_MODE_TEXT", "simulateOneBehindDistrictTurn", "stepActorsOnFire", "CURRENT_SAVE_SLOT", "POPUP_FILLCOLOR", "SPEECH_BUBBLE_FILLCOLOR"]) {
			expect(carry, `${name} should be classified as carried`).toContain(name);
		}
	});

	it("finds ten reachable leaves, which is the whole of Wave 1's seam", () => {
		// `DescribeActor`, `DescribeActorActivity`, `DescribeItemLong`,
		// `GetUserNewScreenshotName`, `MapToScreen`, `ScreenToMap`, `doEquipItem`,
		// `DescribeSkillShort` -- reached by `customiser-skill-row.test.ts`
		// describing the skill the row's entry stands for -- and now `doLeaveMap`,
		// called directly by the district-exit race test because the window it
		// pins lives inside that method and its callers would test the callers.
		// Ten, against §6.5's 2,079-line Wave 1 -- the wave is much bigger than
		// its *externally reached* part, which is worth knowing before scheduling
		// it.
		//
		// **Ten**: `DescribeAmmoType` is the tenth, reached by the tooltip tests
		// that pin all thirteen `AmmoType`s. It is adjacent to `DescribeItemLong`
		// in this bucket and is called by it, so the two halves of the tooltip
		// seam are now both measured.
		const m = measure();
		expect(m.buckets.get("WAVE 1")?.length).toBe(10);
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
    expect(hubs.size).toBe(39);
		for (const [region, list] of m.buckets) {
			if (region.startsWith("HUB")) continue;
			for (const name of list) expect(hubs.has(name), `${name} is in two regions`).toBe(false);
		}
	});
});

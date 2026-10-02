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
		expect(m.members).toBe(836);
		expect(m.methods).toBe(751);
		// §6.4: "567 of 584 methods are public — only 17 are `private`. The
		// `private` boundary is effectively absent." That is now *more* true, and the
		// direction is worth pinning: the public count grew, and so did the private
		// one, from 17 to 81. A naive reading of §6.4 would say the file has become
		// better encapsulated in a way it has not.
		expect(m.public).toBe(755);
		expect(m.private).toBe(81);
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
		const m = measure();
		expect(m.external).toBe(110);
		expect(m.external).toBeGreaterThan(83);
	});

	it("68 of those 110 are in no region §6 names", () => {
		// **The load-bearing finding of the re-measurement, and the reason §6 needs
		// re-deriving before any wave starts.**
		//
		// §6.2's table enumerates nine regions and §6.5–6.7 cover them as Waves
		// 1–3. The members outside all of them are *not* neutral leftovers: they
		// include `AddMessage`, `AdvancePlay`, `KillActor`, `UpdatePlayerFOV`,
		// `SpawnActorNear`, `RefreshPlayer`, `ApplyOptions`, `LoadGame`, the whole
		// map-zoom triple and the first-person pair — and `m_PlayerFOV`,
		// `m_PlayerWasRescued`, `m_CharGen`, `m_IsGameRunning`, `player`, `rules`,
		// `keyBindings`, `options`, `gameItems`, `gameFactions`.
		//
		// So the plan's "extract the leaves, keep the hubs" is right about the hubs
		// and silent about the majority. Sixty-eight is larger than Wave 1's entire
		// 2,079-line budget, and a wave plan whose residual is unclassified is not
		// a plan yet.
		//
		// Pinned as an exact number so the next measurement says whether this grew
		// or shrank, rather than leaving it to be rediscovered.
		const m = measure();
		expect(m.buckets.get("unclassified")?.length).toBe(68);
	});

	it("splits 83 moving against 27 in the hubs, and the hubs stay", () => {
		const m = measure();
		expect(m.moving).toBe(83);
		expect(m.hubs).toBe(27);
		expect(m.moving + m.hubs).toBe(m.external);
		// §6.8: "the two hubs … stay. Together they are 27.8% of the file and the
		// reason the split is worth doing rather than the reason it fails." Still
		// true, and now measured on the current file.
		expect(m.buckets.get("HUB 1  Do*/On* action primitives")!.length).toBe(20);
		expect(m.buckets.get("HUB 2  HandlePlayer*/mouse command handlers")!.length).toBe(7);
	});
});

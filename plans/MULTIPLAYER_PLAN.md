# Multiplayer — a design and phasing plan for the browser port

> **Phase 0 is DONE and green; Phase 1 slice 1 is DONE (2026-10-04).** The save
> format now carries a player roster, mutation-checked, with **no `GRAPH_VERSION`
> bump** — a deliberate divergence from §6 item 8, argued in §8 Phase 1. Nothing
> *acts* as a second player yet; `m_Player` is still one field.
>
> **Phase 0: the gate is green.** Two `PlayerController` actors on one map
> alternate correctly, each acts exactly once, and the world advances exactly one map
> turn with no scheduler change — **so §3 through §7 are not void.**
> `web/tests/multiplayer-phase0-roundrobin.test.ts`, mutation-checked. It also
> disproved something: **§7's "`NetUI` is a drop-in" is wrong, because the play loop
> *peeks* rather than blocks.** Details in §8 Phase 0 and §7.
>
**Everything else here is still design only.** No networking code exists and
Phases 2–6 have not begun. What exists is Phase 0's test and Phase 1's save format —
both engine-side, both verifiable without a socket, and neither of which is
multiplayer yet.

> **Status: design study written 2026-09-30; first code landed 2026-10-04.** This file
> records a feasibility study and a phasing plan. It is the sibling of
> `BROWSER_PORT_PLAN.md` the same way `SUGGESTIONS.md` is: a statement
> of what a decision *is*, so the next person does not have to rediscover it.
>
> **The question asked:** could different human players be in the same world in
> the browser version, and could the real-time option added in `30c0075` be the
> lever?
>
> **The answers, up front.** Yes to the first. **No to the second** — and the
> reason is written in the commit message that added the option. But the option
> turns out to be the right primitive for the *first* thing to build, and the
> real-time half is far cheaper than it looks. Both corrections are in
> [§2](#2-two-corrections) and [§4](#4-what-real-time-actually-costs) because a
> plan whose stated cost was a guess is not a plan.
>
> **Chosen shape** (settled 2026-09-30): networked, separate machines;
> **turn-passing**, each player seeing only their own field of view; a
> **Node server on a VPS** as the authority. Real-time is Phase 5 and optional.

All `file:line` citations were read on 2026-09-30 and are marked **[v]**.
Claims that are *derived* rather than read — a call-graph walk, a cost estimate —
are marked **[d]**. Claims that are neither are marked **[?]** and are the ones
to check before trusting them. This convention is the point: §1.4a of the port
plan records that this project has shipped a green build and a green simulator
over a visibly broken game, and the durable lesson there is that *a claim which
was never checked is indistinguishable from one that was*.

> ### Currency re-check, 2026-10-03 against `master` `925bcab`
>
> Re-measured after a pull that landed 11 commits (the in-game action menu, the
> `actions/` game seam, `engine/Paths.ts`, `engine/MenuChrome.ts`,
> `engine/GameVersion.ts`, and two source scans replaced by behavioural tests).
> Baseline for all of it: **148 files / 3,072 tests passing**, `tsc` clean,
> coverage **71.07 / 58.72 / 81.40 / 72.52** against a gate of **67 / 55 / 78 / 68**.
> `RogueGame.ts` is **36,653 lines**, 845 members (756 public, 89 private), 761
> methods, **117** reachable, of which **32 sit in the two hubs that never move**.
>
> **The networking status is still true, and now qualified.** Zero networking code:
> `web/package.json` depends on `express` and nothing else (no `ws`, no
> `socket.io`); `web/server/index.ts` is **28 lines** of `express.static` plus an
> SPA fallback (re-measured 2026-10-03 — still 28); there is no `http.createServer`,
> no `NetUI`, no `PROTOCOL_VERSION`, no `?mp=` handling in `main.ts`. **Phases 2–6
> have not begun. Phase 0 and Phase 1 slice 1 have**, and between them they changed
> three things: the §7 `NetUI` premise is false (the play loop peeks, so a
> promise-returning UI cannot answer it), the two "fire-and-forget" peeks are now the
> most important methods in the interface, and §6 item 8's `players[]` shipped
> **without** the version bump. See §8.
>
> **Re-measured 2026-10-04: 150 test files / 3,079 tests passing** (was 148 /
> 3,072 — the two new files are Phase 0's test and the save-roster test).
>
> **This pass also corrected the document's body**, not just its header. §1's
> prerequisite, §2.1's primitive inventory, §4.1's guard table, §5.3, §7.3 and the
> §10 risk table all carried claims that had decayed; each correction is marked
> inline. The two that most change the plan's shape:
>
> - **§5.3's `actorSpeed === 0` soft-lock is not reachable** and the `Math.max(…, 1)`
>   this plan prescribed should **not** be applied — the reference has the identical
>   clamp, so that would be a divergence for an unreachable case. Measured, pinned by
>   `web/tests/actor-speed-floor.test.ts`, and the risk-table row is retired.
> - **§2.1's "only anti-stall primitive" was wrong.** Bot control is a second one,
>   it predates the document, and it is the better fit for an absent player — which
>   also explains the eight `isBotPlayer` guards §4.1 assumed did not exist.
>
> **The `[v]` convention has decayed, and that is the standing finding.** Of 49
> citations sampled at the previous revision, **14 resolved, 34 drifted, 1 pointed at
> a file that does not exist.** `RogueGame.ts` grew 32,753 → 36,653 lines, so the
> drift is large: `:15185` → `:5569`, `:14180` → `:23415`, `:30208` → `:36469`,
> `:28154` → `:34385`, `:16483` → `:19601`, `:26086` → `:31984`. **A `[v]` from
> 2026-09-30 is now no more reliable than a `[?]`** — the convention's own failure
> mode, worth recording as such. Line numbers have been dropped from the corrected
> passages below in favour of symbol names; that is the only form that survives a
> `RogueGame.ts` refactor, which §6 of the port plan has scheduled.
>
> **Derived counts, re-measured 2026-10-03:** 141 → **151** `IsVisibleToPlayer`
> sites; 387 → **427** `m_Player` references; `IRogueUI` 44 → **43** methods (the
> "exactly three block" count still holds); six → **44** `AddMessagePressEnter` call
> sites; "30,000-line engine" → **36,653**; "970 actors with 11 controller classes"
> unchanged; ~500 `Do*`/`On*` primitives unchanged. The `ai/` `isPlayer` count is
> still **exactly 5**, and all three of the follower-distance branches are still `1`.
>
> **Two claims that need their scope narrowed rather than their value changed:**
> - `Map.assertActorIntegrity()` "already runs every turn **[v]**" is true of the **sim
>   harness** only (`HeadlessRunner.ts:207`); there is **no call in `RogueGame.ts`**, so
>   it is not a free live invariant in a real game. §7.2 and §10 both leaned on it as
>   free, and both are corrected inline.
> - §1's exclusion of "any change to the C# in `src/`" is now **vacuous** — `src/` is
>   untracked since `cfd19ae`.
>
> **§7.3's opening claim was flatly wrong:** it said the Dockerfile "stops being *not
> the deploy path* and becomes the deploy", and `Dockerfile:3-5` says **NOT the
> deploy path** in capitals — the site ships from `.github/workflows/pages.yml`.
>
> **One structural thing worth knowing before scheduling anything.** Three of §6's
> Wave 1 target modules have now landed **outside** the wave schedule —
> `engine/Paths.ts` (the C# `GetUser*` paths), `engine/MenuChrome.ts`, and
> `engine/actions/ActionGame.ts` (the typed game seam) — while **Wave 0's own
> deliverables still do not exist** (`engine/GameContext.ts`,
> `tests/helpers/game.ts`). So the extraction is happening opportunistically rather
> than in the order §6 records, which means **§6's wave numbers should not be used
> as a schedule for anything**, including this plan's Phase 3 stop condition. The
> taxonomy (§6.2's "two hubs, everything else a leaf") is still the right mental
> model; the sequencing is not.

---

## Table of contents

1. [Scope](#1-scope)
2. [Two corrections](#2-two-corrections)
3. [The load-bearing finding](#3-the-load-bearing-finding-the-scheduler-already-round-robins)
4. [What real-time actually costs](#4-what-real-time-actually-costs)
5. [The two traps in the obvious design](#5-the-two-traps-in-the-obvious-design)
6. [What is expensive: the single-player assumptions](#6-what-is-expensive-the-single-player-assumptions)
7. [The architecture](#7-the-architecture)
8. [Phases](#8-phases)
9. [Deliberately not doing](#9-deliberately-not-doing-and-why)
10. [Risks and stop conditions](#10-risks-and-stop-conditions)
11. [Open questions](#11-open-questions)

---

## 1. Scope

**In scope:** two or more human-controlled actors sharing one simulated world,
each in their own browser, over a network, with one machine holding the
authority.

**Out of scope, deliberately:** split-screen in one process; shared fog of war;
deterministic lockstep; any change to the C# in `src/`; and — for the first
four phases — the world ticking while a human is thinking.

**Not a phase, but a prerequisite that already exists:** the engine is
DOM-free. **[corrected 2026-10-03] the rule as written here is false, and its
source never existed.** This section attributed it to
`web/.porting/CONVENTIONS.md` rule 2 ("no platform leakage"). There is no such
file and never has been — `git log --all -- '*CONVENTIONS.md'` is empty, and
`web/.porting/` holds only `assemble_roguegame.py`, `gen_stubs.py` and
`roguegame-methods.txt`, itself untracked. The rule it described ("`engine/` and
`data/` must not import from `ui/`") is also **violated in three places**:

| Site | Import |
|---|---|
| `web/src/engine/RogueGame.ts:112` | `from "@ui/BackpackPanel"` |
| `web/src/engine/RogueGame.ts:165` | `from "@ui/ActionMenu"` **[added 2026-10-03]** |
| `web/src/engine/RogueGame.ts:276` | `import { OptionsScreen } from "@ui/OptionsScreen"` |
| `web/src/engine/GameOptions.ts:23` | `from "@ui/fonts"` |

**It is four now, not three.** `@ui/ActionMenu` arrived with the in-game action menu
and nobody counted — which is the argument for amending the rule rather than
inverting the imports: the boundary is porous by accident, and each feature that
wants a UI type adds another.

**The conclusion survives anyway, and that is what matters here.** None of those
three reaches `document` or `window` — they are module-level imports of *pure*
helpers (a panel descriptor, a screen descriptor, a font-metrics table), and the
property this document actually needs is *"nothing in `engine/` or `data/` touches
the DOM directly"*, which is true. But the stated rule is false and the file
backing it is imaginary, so **this is the one thing in §1 that should not be taken
on trust.** Two ways to make it true, in order of cost: amend the rule to say "no
*DOM access*; module imports of pure `ui/` helpers are permitted" (two lines of
documentation), or invert the **four** imports (four edits, plus a re-measure of the
surface pins, since most are on the reachable surface).

`RogueGame`'s constructor takes its collaborators as arguments, which is the part
that does the work:

```
    constructor(
        UI: IRogueUI,
        music: IMusicManager = new NullMusicManager(),
        ambients: IAmbientManager = new NullAmbientManager(),
        sound: ISoundManager = ...,
    ) {
```
**[v]** `RogueGame` constructor (`RogueGame.ts:837`; cited as `:1329`, then
`:1934-1939`) — **corrected twice: the constructor has gained a fourth parameter,
`sound`, since this was written, and it has moved twice since.**

So `new RogueGame(someUI, …)` runs unchanged in Node, in a browser, or in a test.
`sim/HeadlessRunner.ts` already does exactly that with a `NullRogueUI`
**[v]**, which means *the headless simulator and a multiplayer server are the
same program with a different `IRogueUI`.* That is the single most load-bearing
fact in this document and it was already paid for.

---

## 2. Two corrections

### 2.1 The real-time option is not the lever, and `30c0075` already says so

The option added in `30c0075` is `IdleAdvance` — the game takes a turn for an
idle player after a chosen wall-clock interval. Its own commit message says
what it is not:

> The design constraint that shaped this: there is no world ticking underneath
> the player. The scheduler is a recursive descent in which the player is one of
> the actors, so "advance every X ticks" can only mean the player takes an
> automatic action — not that the world keeps living while they deliberate. That
> is what auto-play and a real wall clock would be, and neither is this.

**[v]** `git show 30c0075`, quoted verbatim.

And it is accurate. `HandlePlayerActor` parks on
`await this.WaitKeyOrMouse(…)` **[v]** in `HandlePlayerActor` (`RogueGame.ts:8125`;
cited as `:6875`), and while it parks the whole stack below it is suspended:
`NextMapTurn` cannot run, so AP regen (`NextMapTurn`, `:5595`), starvation, fire and
`++map.localTime.turnCounter` all stop; and `advancePlayDistrict`'s
`m_Session.worldTime.turnCounter++` **[v]** (`:4661`) does not run, so day and night
are frozen too.

So the option cannot be the foundation. **What it *is*, and this is the useful
part:** an existing, tested anti-stall primitive. A disconnected or AFK remote
player must not hold the scheduler forever, and
`WaitKeyOrMouse(idleAdvanceMs(s_Options.idleAutoAdvance), …)` **[v]** in
`HandlePlayerActor` already does exactly that, with 562 lines of tests behind it
(`tests/idle-auto-advance.test.ts`, re-measured 2026-10-03 — still 562). For
networked play this is not a nice-to-have; it is load-bearing.

**[corrected 2026-10-03] It was described here as "the *only* existing, tested
anti-stall primitive", and that is wrong** — bot control is another one, and it
predates this document by a commit. `BotTakeControl` / `BotReleaseControl`
(`BotTakeControl` `RogueGame.ts:7945`, `BotReleaseControl` `:7988`, toggled at
`:7940`) hand the player's turn to the AI and take it back, with
`m_botControl`, `m_isBotMode` (`:1794`) and `Actor.isBotPlayer` behind it;
`sim/cli.ts` defaults `--bot` on. **[v, re-verified 2026-10-03 — unchanged]** **That is the more useful primitive for networked play of the
two**, because it is already the shape of the problem: "a remote player who is not
here" and "a player the bot is standing in for" are the same state, and the second
one is implemented, tested, and reachable today. §4.1 item 3's eight existing
`isBotPlayer` guards (§4.1) are the same fact seen from the other side.

So the inventory should read: **`IdleAdvance` for a human who is present but
idle, bot control for a player who is absent.** Neither is a substitute for the
other, and the plan should not have to invent a third concept for a disconnected
peer when one of these already exists. **[d]** — the read is that the mechanism is
reusable; whether it is reusable *without* the UI implications of handing the actor
to an AI controller is untested, and it is a Phase 0 question.

### 2.2 Real-time is much cheaper than the first draft of this plan claimed

The first estimate given to the author of this plan was that making the
scheduler suspendable was "the single biggest cost multiplier", on the reasoning
that `HandlePlayerActor` is a 750-line `do…while` with 43 exits plus nested
blocking sub-dialogs. **That was wrong**, and the reason it was wrong is that
the scheduler does not need to be suspended at all — see [§3](#3-the-load-bearing-finding-the-scheduler-already-round-robins)
and [§4](#4-what-real-time-actually-costs). The correct figure is ~28 lines of
engine change.

This is recorded rather than quietly fixed because it is the same failure mode
`BROWSER_PORT_PLAN.md` documents: a plausible mechanism, never opened, and
a confident number attached to it. A cost estimate is a claim about code, and it
has the same failure mode as a claim about a value type.

---

## 3. The load-bearing finding: the scheduler already round-robins

**This is the reason networked play is as cheap as it is, and it is the opposite
of what the "recursive descent" framing suggests.**

The entire turn-ordering scheduler is fifteen lines:

```ts
  getNextActorToAct(map: GameMap | null, _turnCounter: number): Actor | null {
    if (!map) return null;

    const n = map.countActors;
    for (let i = map.checkNextActorIndex; i < n; i++) {
      const a = map.getActor(i);
      if (a.actionPoints > 0 && !a.isSleeping) {
        map.checkNextActorIndex = i;
        return a;
      }
    }

    return null;
  }
```
**[v]** `Rules.getNextActorToAct` — **re-read 2026-10-03, unchanged and still
fourteen lines.** It was cited as `Rules.ts:2165-2178`; it is now at `:2331`, and
that gap is the reason this section quotes symbols rather than lines.

There is no player filter, no priority queue, no turn token, no time-slicing.
It is a linear scan of `map.actors` from a cursor. The player is picked by
exactly the same `actionPoints > 0` test as a zombie, and `actor.isPlayer` is
read only *after* the pick, in `advancePlayMap` (`RogueGame.ts:4890`; cited as
`:4244`) **[v]**.

`HandlePlayerActor` then does:

```ts
		this.m_Player = player; // remember player.
```
**[v]** `RogueGame.HandlePlayerActor` (`RogueGame.ts:8016`; cited as `:6660`)

That is an assignment, not an assertion. It does not check that `player` is
*the* player.

**Therefore: give a second actor a `PlayerController` and the existing
scheduler alternates between them.** `isPlayer` is already a type test rather
than an identity field:

```ts
  get isPlayer(): boolean {
    return this._controller instanceof PlayerController;
  }
```
**[v]** `Actor.isPlayer` — **re-read 2026-10-03, still a type test and not an
identity field** (was `data/Actor.ts:256`, now `:268`). This is the second of the
two claims §3 rests on, so it was re-read rather than assumed.

Trace it, with A at list index 3 and B at index 7: call 1 picks A (cursor 3); A
spends 100 AP, so `actionPoints` is 0; call 2 scans from 3, skips A, picks B
(cursor 7); B spends 100; call 3 finds nobody, returns `null`, and
`advancePlayMap` calls `NextMapTurn`, which regrants at `RogueGame.ts:5595` and
resets the cursor to 0 at `:5601` **[v]**. One map turn, both players acted once, world
advanced once. No scheduler change.

**This is Phase 0's test and the whole feasibility claim at once.** If it is not
green in a day, everything below it is void.

### 3.1 Why the recursive descent does not block two players

`advancePlayDistrict` (`:4628`) is a `do…while`, not recursion, for the *player's own*
turn ordering **[v]**. The recursion in the call graph
is only the background-district simulation (`SimulateDistrict` →
`AdvancePlay` → `advancePlayDistrict`). Two humans in sequence is a loop, and
loops alternate cleanly.

---

## 4. What real-time actually costs

The cheap theory: a parked player has `actionPoints <= 0`, so
`getNextActorToAct` (the `actionPoints > 0` test, `Rules.ts:2337`) skips them;
`NextMapTurn` grants every non-sleeping actor `actorSpeed` (`RogueGame.ts:5595`)
and zeroes the cursor (`:5601`) **[v]**; therefore the world advances around a player who is not
acting, with no change to `HandlePlayerActor` at all.

**The theory is confirmed for the scheduler and is the whole of the win.** The
driver already exists too. `GameLoop`'s `while` **[v]** (`RogueGame.ts:2398`;
cited as `:1790-1794`)
is a driver; it simply has no clock of its own, because today a human's blocking
`await` supplies the cadence.

And the prototype for a turn-driven, input-free, world-advancing,
self-terminating loop is already written:
`StartPlayerWaitLong` (`RogueGame.ts:14293`) / `CheckPlayerWaitLong` (`:14312`)
**[v]**. It runs `DoWait` for the player and returns to
`GameLoop` **with no keypress** (in `HandlePlayerActor`), and it
self-terminates on five conditions, of which **three are set from the world, not
the player**:

| interrupt | set by | line |
|---|---|---|
| an audible message | `AddMessageIfAudibleForPlayer` | symbol **[v]** |
| a loud noise | `OnLoudNoise` | symbol **[d]** |
| a melee attack | `DoMeleeAttack` | symbol **[d]** |
| an hour elapsed | `m_PlayerLongWaitEnd` | symbol **[v]** |
| hungry / starving / sleepy / exhausted / unwell | `CheckPlayerWaitLong` | symbol **[d]** |

*Re-anchored 2026-10-03. The original carried bare line numbers (`1469`, `20112`,
`16483`, `11342`, `11365-11378`) in a `RogueGame.ts` that has since grown ~4,000
lines; the interrupt **set** is what §4 needs and it is unchanged, but re-read the
five symbols rather than the numbers.*

That is a complete "wake up when threatened" model. Real-time is this loop with
a wall-clock deadline instead of `TURNS_PER_HOUR`.

### 4.1 The work

| # | change | where | size |
|---|---|---|---|
| 1 | `isSuspended` as a third skip condition beside `isSleeping` | `Rules.getNextActorToAct`, the `!a.isSleeping` test (`Rules.ts:2337`) | 1 line |
| 2 | suspend/resume guard: zero AP on suspend; on the skip path also run `CheckSpecialPlayerEventsAfterAction` (called at `RogueGame.ts:4935`) and the `previous*` assignments and `UpdatePlayerFOV` | `advancePlayMap`, after the `isPlayer` read at `RogueGame.ts:4890` | ~15 lines |
| 3 | extend the `m_SimulatingInIdle` guard from `AddMessagePressEnter` to the other blocking primitives, and **rewrite the comment that says it is unnecessary** | the guard is `RogueGame.ts:2227`; the sets/clears are `:16787`/`:16791` | ~6 lines + comment, **minus the three sites left in §4.1's table** |
| 4 | wall clock in the `GameLoop` `while`, placed *after* `AdvancePlay` returns so it cannot race the turn | `RogueGame.ts:2398` | ~3 lines |

*Every `where` cell re-anchored to a symbol 2026-10-03. All four previously carried
bare `RogueGame.ts` offsets in a file that has grown ~4,000 lines since. The sizes are
unchanged; item 3's is now smaller, because eight of the sites it would have covered
already have a guard.*
| 5 | discard the AP bank on resume | — | 1 line |

**Item 3 is the one that bites at runtime, and the existing comment is why
nobody would have found it.** Only `AddMessagePressEnter` carries the
`m_SimulatingInIdle` guard:

```ts
		if (this.m_SimulatingInIdle) return;
```
**[v]** `RogueGame.ts` (`AddMessagePressEnter`)

with a comment nearby explaining that the other blocking helpers need no such guard
*"because they are all player-only flows"*. **That claim becomes false.** However —
**[corrected 2026-10-03]** the situation is better than this section said, and the
reason is worth recording: **eight world-initiated sites now carry an
`isBotPlayer` guard** (bot control, which this plan never inventoried, predates it by
a commit). So the guard *pattern* this item needs already exists at eight of the
sites below, and the work is smaller than "extend the guard and rewrite the comment":
it is copy an existing idiom, not invent one.

World-initiated blocking sites, all verified. `bot-guarded` marks the eight that
already have `isBotPlayer`:

| site | fires when | state |
|---|---|---|
| `NextMapTurn` infection effect | infection crosses a threshold on the player | **unguarded** |
| `CheckForEvent_NationalGuard` | raid/announce | **bot-guarded** |
| `CheckForEvent_ArmySupplies`, `_BikersRaid`, `_GangstasRaid`, `_BlackOpsRaid`, `_BandOfSurvivors`, `_CHARScientists` | six more announce/raid events | **bot-guarded** (all six) |
| `RefugeesEventDistrictFactor` | district-factor event, reads the player | **bot-guarded** |
| `OnNewNight` / `OnNewDay` | skill-upgrade screen, which also opens a full-screen menu | **unguarded** |
| `PlayerDied` → `HandlePostMortem` | three sequential blocks | **unguarded** |

**So eight of the world-initiated sites are done and the residue is three**, of
which the two night/day ones matter most — a skill-upgrade screen is a full-screen
menu, not a one-key prompt, and it is exactly what a parked remote player must not
be handed. The six raid events gate on
`map === this.m_Player.location.map && !isSleeping && !isUndead` **[d]**, so a
parked, awake, living player on their own district gets a hard
`AddMessagePressEnter` from a dice roll they never made — that part of the
analysis stands, and it is now the *unguarded* three rather than all nine.

**[?]** The eight guards test `isBotPlayer`, not `m_SimulatingInIdle`. That covers
the bot case and therefore the auto-play case, but **not** a human who is AFK with
`IdleAdvance` off — which is the case §4.1 item 3 is actually about. Whether the
existing guards are the right predicate or whether idle-simulation needs its own
check is unresolved, and it is the first thing to settle before extending them.

**Item 2's FOV half is not optional.** `UpdatePlayerFOV` does two things and
both matter:

```ts
		player.location.map!.setViewAndMarkVisited(LOS.fovPoints(this.m_PlayerFOV));
```
**[v]** `RogueGame.UpdatePlayerFOV` (`RogueGame.ts:36635`; cited as `:30208`)

`setViewAndMarkVisited` clears the previous view first **[d]**, so a stale FOV is
not merely old data — every tile the player *stopped* being able to see stays
`isInView = true` **[v]**, `Map.setViewAndMarkVisited` (`Map.ts:546`). There are **151 call
sites** of `IsVisibleToPlayer` **[d, re-measured 2026-10-03: was 141]**, and 22 of
the 23 `AddMessage` calls in
`NextMapTurn` are gated on it **[d]**. With a current FOV almost nothing floods;
with a stale one, everything the player could see when they stopped moving keeps
reporting. The fix is already in the file at the one place the engine noticed
the problem:

```ts
			if (actor === this.m_Player) {
				this.UpdatePlayerFOV(this.m_Player);
```
**[v]** `RogueGame.ts:5863-5864` (cited as `:4901-4903`), on the exhaustion-collapse
path. Hoisting that
into the skip path is three lines.

### 4.2 What real-time does *not* need

**The AI needs no changes.** There are exactly five `isPlayer` reads in
`web/src/gameplay/ai/` **[d, re-counted 2026-10-03 — still exactly 5]** and none is
about whether the player acted: two are "never do this *to* the player"
(`BaseAI.ts:2908`, `CivilianAI.ts:511`) and
three select between `FOLLOW_PLAYERLEADER_MAXDIST` and
`FOLLOW_NPCLEADER_MAXDIST` **[d]** — **both of which are `1`**, so the branch is
a no-op in all three files. Nothing reads `Session.lastTurnPlayerActed`, which
exists only to pick bold-vs-faded text in `DrawMessages` (`RogueGame.ts:2198`; cited
as `:1590`) **[d]**.

**`MemorizedSensor` does not make an AI forget a stationary player.** Each sense
pass prunes percepts past their persistence and then *refreshes* the age of any
percept re-sensed **[d]**. A player standing in the open is re-sensed every
turn. The persistences (10-20 turns **[d]**) matter for a player who *breaks line
of sight*, not one who stands still.

**Stamina cannot soft-lock.** `RegenActorStaminaPoints` is called for every
actor below max, unconditionally, in `NextMapTurn` (`RogueGame.ts:5598`; cited as
`:4667`) **[d]**, at
`STAMINA_REGEN_PER_TURN = 2` **[d]**. A survivor at 0 stamina is back over
`STAMINA_MIN_FOR_ACTIVITY` in five turns with no input required. Plain movement
costs no stamina at all **[d]**; only run, jump, melee and corpse-dragging are
gated, and each gates on the 5-turn-recoverable tired state.

**The behavioural risk is the opposite of a soft-lock:** an exhausted parked
player collapses into sleep at `4882-4907` **[d]**, becoming a sleeping, deaf
(`AddMessageIfAudibleForPlayer` returns early for sleepers **[d]**), FOV-refreshed
NPC. That is a design decision, not a bug, and it should be made deliberately.

---

## 5. The two traps in the obvious design

Both come from the same place: **`actionPoints` is uncapped anywhere in the
tree** **[d]**. It is written in six places **[d]** and clamped in none.

### 5.1 The bank is spent inside a frozen turn

`NextMapTurn` is what advances `map.localTime` **[d]**, and
`advancePlayMap` (`:4868`) calls it only once `getNextActorToAct` returns `null`
**[d]**. So a player who parked for 50 turns banks 50×100 AP and
then spends it **50 actions with the sun, the zombies and the fires all frozen**.
The bank has to be discarded, not spent.

### 5.2 The bank breaks the scent rule

```ts
		if (actor.actionPoints > 0)
			this.DropActorScents(actor);
```
**[v]** in `NextMapTurn` (`RogueGame.ts:~18368`; cited as `:15185`)

The alpha10 fix this implements assumes AP is exhausted after one move, so the
per-turn blanket drop in `NextMapTurn` (`4655-4659` **[d]**) covers the hole.
**With a bank the condition is true after every step**, so a 50-action burst
lays a continuous scent trail through all of it. That is a correctness break —
AI behaviour diverges — not a balance one.

### 5.3 A soft-lock that is not reachable — measured 2026-10-03, pinned

**This section was wrong and so was the fix it proposed.** It originally read:

> `actorSpeed` floors at zero ... Reachable in normal play **[?]** — a survivor who
> is exhausted, dragging a corpse (`÷2`), in army body armour (`-10`) holding a
> chainsaw (`-10`) walks 100 → 33 → 16 → −4 → **0**. **Fix in Phase 0, with a test.**

The trap's *shape* was right — `getNextActorToAct` never returns an actor with no
AP and `NextMapTurn` never grants, so an actor at speed 0 is inert for good. The
arithmetic was wrong twice over, and the conclusion changes:

**`actorSpeed === 0` is unreachable. The floor is 3.**

```ts
    return Math.max(Math.floor(speed), 0);
```
**[v]** `web/src/engine/Rules.ts`, the `actorSpeed` tail

Every term is read off shipped data, so the minimum is computed rather than
sampled — heaviest torso armour 10 (`ARMOR_ARMY_BODYARMOR`,
`ARMOR_CHAR_LIGHT_BODYARMOR`), heaviest weapon 10 (`MELEE_CHAINSAW`),
`SHIELD_ENCUMBERANCE_PENALTY = 0.75` **[v]**, and **nothing writes
`doll.body.speed` at runtime** so the base is the model's own value. A base-100
actor under all seven penalties: `100 → 66 → 33 → 23 → 17 → 7 → 3`.

**Where the original went wrong is the interesting part.** It picked base 33 —
and there is exactly one actor at base 33, `SEWERS_THING`, the lowest in the game.
It then applied *every* term, which is where −4 came from. But `SEWERS_THING` is
undead, so it fails **both** ability gates: `canTire` is false so it never takes
the `×2/3`, and `hasToSleep` is false so it never takes the `÷2`. The low base and
the missing multipliers are the same fact, and they cancel.

**Every load-capable actor, re-counted 2026-10-03:** the base-100 survivors and
police (`MALE_CIVILIAN` through `BLACKOPS_MAN`, plus `CHAR_SCIENTIST`) all land on
**3**; the two base-125 undeads who *can* tire but never sleep — `JASON_MYERS` and
`DERANGED_PATIENT` — land on **22**; and `SEWERS_THING` lands on 3 as well, for the
same non-tiring reason. **`CHAR_SCIENTIST` is base 100, not 125** — an earlier draft
of this paragraph grouped it with the 125s and would have put it at 22. That was the
one line here wrong on a re-read rather than on a fresh measurement, which is the
whole argument for re-reading a table you have already checked once.

**So the clamp stays as it is.** `Rules.cs:4680-4681` has the identical one — *"done,
speed must be >= 0"*, `Math.Max((int)speed, 0)` — and raising it to 1 would be a
divergence from the reference for a case that cannot occur. That was the proposed
fix, and it should not be applied.

**Delivered as a pin instead** — `web/tests/actor-speed-floor.test.ts`, six cases
that recompute the worst case per actor model off the real models and fail with a
readable message if any load-capable actor reaches the clamp. Mutation-checked:
setting `POLICEMAN`'s `SPD` to 15 in `Actors.json` fails it, naming the actor and
its floored speed. The margin is one CSV cell wide, which is the whole argument for
a test rather than a comment.

Two of the pin's own first-draft assertions were wrong, and both are worth knowing
before anyone extends it: a hand-written sum for `SEWERS_THING` (`33 × ⅔ − 20` is 2,
not 0), and probing `canActorActNextTurn` with a `{actionPoints: 0}` literal, which
throws rather than answering because it reaches `actor.doll.body.speed`. **These
predicates cannot be stubbed** — only driven with a real actor.

**What is genuinely left is the reachability caveat this section always flagged**:
a *runtime* path to 0 needs a temporary actor with base < 33 that can tire, and
nothing in the shipped content produces one. That is a content question, not a
scheduler bug.

---

## 6. What is expensive: the single-player assumptions

This is the real work, and it is orthogonal to the network.

| # | assumption | evidence | cost |
|---|---|---|---|
| 1 | **`m_Player` is *the* player** | **427** references **[d, re-measured 2026-10-03: was 387]**, written in 3 places: `HandlePlayerActor` (`:8016`), `RefreshPlayer` (`:34220`), `HandleReincarnation` (`:35047`) | rename the concept to *the acting player*; the reads mostly keep working |
| 2 | **one FOV, written onto the map** | `m_PlayerFOV` → `setViewAndMarkVisited` **[v]**; `IsVisibleToPlayer` at **151** sites **[d]** | **zero** for turn-passing — each client computes its own FOV from its replica |
| 3 | **one camera** | `m_MapViewRect` | **zero** for turn-passing |
| 4 | **one current map, and the world clock is gated on it** | `advancePlayDistrict` (`:4628`) **[v]** `district === currentMap?.district` | with two players in two districts, only one ticks the clock **[d]** |
| 5 | **game over is one player's life** | `GameLoop`'s `while` (`:2398`) `while (m_Player != null && !m_Player.isDead …)` **[v]**; `advancePlayDistrict` calls `HandleReincarnation` and bails on `m_Player.isDead` (`:4646`) **[v]** | becomes "no player left"; the 25-site death → post-mortem → hi-score flow becomes per-player or needs a spectator mode |
| 6 | **one log, no filtering** | `MessageManager` has none **[d]**; `MAX_MESSAGES = 6` and `MESSAGES_HISTORY = 59` (**`RogueGame.ts:485-486` [v]**) clear the visible strip wholesale and ring-buffer the rest. **Note [corrected 2026-10-03]: these were cited as `RogueGame.ts:339-340` and are now module-level `export const`s, not fields** — the *values* are unchanged, but anything reading them off the class is wrong | fine with a current FOV; a flood without one |
| 7 | **one score** | `Scoring` has one `turnsSurvived`, one achievement set, one hi-score entry | decide shared-vs-per-player before Phase 1; recommendation is **do not build a scoreboard yet** |
| 8 | **the save is single-player** | `root.player` is one ref (`sessionGraphRoot.ts:74` **[v, re-verified]**); `findPlayerActor` returns the first match (`:130` **[v, re-verified]**); `reattachPlayer` attaches one controller (`:144` **[v, re-verified]**); `Actor._controller` is `skip`ped (`specs.ts:738` **[v]**, cited as `:699`); `Map.m_checkNextActorIndex` is `skip`ped as a "cache" (`specs.ts:485` **[v]**) | `players[]` + a per-actor controller tag + `GRAPH_VERSION` bump |

**Items 2, 3 and 4 are the reason turn-passing was chosen.** They are the three
that are genuinely expensive, and turn-passing makes all three free: only the
acting player is ever rendered, so only one FOV and one camera need to be
correct at a time, and each client is single-player by construction.

**Item 8 has two one-line landmines** that matter for reconnect rather than for
the first session:

- `DiceRoller.state` is `private state: number` **[v, re-verified]** `DiceRoller.ts:9`
  and is **not serialised** — `grep -c DiceRoller specs.ts` is still **0**, so it is
  not in the graph at all, not merely skipped. `LoadGame` rebuilds the roller from
  the seed (`RogueGame.ts:2673` **[v]**, cited as `:26086`), so the sequence
  restarts. One `uint32` and a root field.
- `Map.m_checkNextActorIndex` is the live turn cursor, skipped as a cache. Safe
  at a turn boundary, wrong mid-turn **[d]**. Carry it. **Re-verified 2026-10-03:
  still `{ kind: "skip" }` at `specs.ts:485`, and still absent from the graph.**

---

## 7. The architecture

```
Browser client                        Node server (VPS)
──────────────                        ────────────────────
CanvasUI ─┐                           Express + ws
          ├─ RogueGame                │         │
InputHandler┘  constructed,            │         ▼
               NEVER Run()     ◄─────►│     NetUI : IRogueUI
               redraw on a tick        │         │
               UI_PostKey → socket      │    RogueGame — the authority
                                        │         │
                                        └───── per-turn map snapshot
```

**The server runs the shipped game.** `NetUI` is a drop-in for `NullRogueUI`:
`IRogueUI` has **43** methods **[d, re-measured 2026-10-03: it said 44]** of which
exactly **three block** — `UI_WaitKey`
(`IRogueUI.ts:80` **[v]**), `UI_Wait` (`140` **[v]**) and `UI_PreloadImages`
(`159` **[v]**) **[d]**. The other 41 are fire-and-forget, of which 8 are
state-consuming peeks and 2 are injection seams (`UI_PostKey`, `UI_PostMouseButtons`)
**[d]**.

> **[corrected 2026-10-04 by Phase 0 — this paragraph's conclusion is wrong, and the
> error is load-bearing.]** *"So the whole blocking-input surface of a 36,653-line
> engine is one method"* is true and useless. **The player's turn does not go through
> any of the three.** It goes through `WaitKeyOrMouse`, which **polls**
> `this.m_UI.UI_PeekKey()` in a `do…while` and **never calls `UI_WaitKey`**:
>
> ```ts
> this.m_UI.UI_PeekKey();   // consume keys to avoid repeats
> do {
>   const inKey = this.m_UI.UI_PeekKey();
> ```
>
> The play loop is therefore driven by a **synchronous, non-blocking, argument-less**
> peek — counted among the "8 state-consuming peeks" this paragraph dismisses in a
> subordinate clause. Measured, not reasoned: the first version of the Phase 0 test
> scripted `UI_WaitKey`, and the keys were never seen.
>
> **What that costs the design:**
>
> - **A promise-returning `NetUI` cannot answer the play loop.** A peek returns
>   `GameKeyEvent | null` *now*; a socket cannot answer *now*. Either the peek
>   blocks — abandoning both the poll design and the timeout-based `IdleAdvance`
>   §2.1 calls load-bearing for a disconnected peer — or the loop becomes an
>   `await`, which is a real change to the engine's hottest loop.
> - **Per-player UI resolution is necessary and not sufficient.** "`m_UI` has to
>   become *resolved* rather than fixed" (below) gives each player its own object.
>   That does not help while the loop polls, because the poll cannot suspend on
>   that player's socket — it would have to return `null` and burn CPU, which is
>   the "modal dialog with nobody behind it" risk of §4.1 item 3 arriving early.
>
> **So Phase 2's `NetUI` is bigger than one drop-in class**, and the decision it has
> to make first is *peek-blocks or loop-awaits*. That question should be settled
> before Phase 2 is scheduled, not inside it. **[?]** — no measurement of which is
> cheaper has been made, and the poll has a real advantage (it is why the browser
> build can drive a turn without a promise per keystroke) that an `await` loop has
> to reproduce.

**The client runs the shipped renderer** against a replica of its own map that it
never simulates. It computes its own FOV, because `UpdatePlayerFOV` is a pure
function of the map, the actor's position and the light sources in it — and all
of those are in the snapshot. **This is what makes item 2 in §6 free**, and it
is why the 151 `IsVisibleToPlayer` sites never need to change.

**The elegant consequence.** With two players, `m_UI` has to become *resolved*
rather than fixed — roughly
`actor.isPlayer ? session.uiFor(actor) : sharedNullUI` in `advancePlayMap` —
and that one resolution makes the entire UI layer per-player. Turn-passing then
needs no protocol work at all, because `HandlePlayerActor`'s loop already *is*
"wait for a key, act, repeat, until everyone's out of AP" **[d]**.

### 7.1 Protocol

JSON frames. No binary, no delta encoding, on day one.

| frame | direction | payload |
|---|---|---|
| `hello` | client → server | protocol version, content version |
| `welcome` | server → client | `PROTOCOL_VERSION`, `GRAPH_VERSION`, seed, ruleset, your actor id, session options incl. `IdleAdvance` |
| `input` | client → server | one `GameKeyEvent` — `{key, keyCode, code, shift, ctrl, alt}` (`IRogueUI.ts:11` **[d, re-verified]**) |
| `mapState` | server → client | this player's map, per turn |
| `hud` | server → client | world clock, scoring, new log lines |
| `ping` | both | latency |

**A version handshake is not optional.** The service worker is cache-first over
`/assets/*` **[d]**, so a client can be running a stale bundle against today's
server with no detection — and `GameSaveManager.VERSION` is already written but
never read **[d]**, so there is no existing check to lean on.

### 7.2 The one genuinely new engine piece

A **per-map snapshot codec**, `engine/serialization/mapSnapshot.ts`.

`Session.load` restores a whole 3×3 world — 4.6 MB of JSON, ~20,000 objects,
**~5 s** **[v]** `tests/save-graph-roundtrip.test.ts:93-98`. Fine for a join,
hopeless per turn. But a single map is a *tree*, not a graph, so a per-map
encoding drops the `$ref` indirection entirely and can reuse the existing packed
`tilesGrid` codec (`specs.ts:314` **[v]**) plus the `refList`-shaped lists at
`specs.ts` **[v]** with local indices — `mapsList:449`, `actorsList:493`,
`mapObjectsList:494`, `corpsesList:495`, `itemsList:577`, plus `boringForList:649`
and the four on `Actor` at `760-764`. **All five lines this originally cited
(`263/398/461/486/496`) were wrong** — every one is something else. Roughly 200 lines,
and `Map` gains a `replaceStateFrom(json)`.

**Start with a full per-map snapshot per turn. Do not build a diff.** A 3×3
world is 56 maps, 5,800 map objects and 970 actors **[v]**, so one map is
roughly 17 actors and 100 map objects; call it 150-250 KB of JSON. Clipping to
the client's FOV plus one tile of margin would cut the tile portion to ~23% of a
50×50 map **[?]**, but that is an optimisation to add after measuring, not a
prerequisite to build. `Map.assertActorIntegrity()` **[corrected 2026-10-03: not
"already runs every turn" — it is called from `HeadlessRunner.ts:207` only, and
there is no call in `RogueGame.ts`, so today it guards the sim and not the game]**
would run on the client replica for free once invoked there, which would make it a
live invariant check on the replication. That is one call site, not a given.

### 7.3 Deployment

**[corrected 2026-10-03] This subsection's opening claim was wrong, and
instructively so.** It said the Dockerfile "stops being *not the deploy path* and
becomes the deploy". `Dockerfile:3-5` says the opposite **in capitals**:

> **NOT the deploy path.** The site is published by `.github/workflows/pages.yml`,
> as a static bundle assembled from `docs/` and the game.

So there is no existing Node-in-production path to inherit. The Dockerfile does
still run `node dist-server/server/index.js` on 8080 **[v]**
`web/server/index.ts:26`, and it remains a reasonable *base image* for a
multiplayer server — but it is a fresh deployment decision, not a repurpose of an
existing one, and the bundle it copies (`dist-server/`) is not currently what ships.

Three constraints, two of them unchanged:

- **The service worker is hostile to a same-origin WebSocket.** `sw.js` bails on
  `if (url.origin !== self.location.origin) return;` **[v]** `public/sw.js:146`,
  so a **cross-origin** socket is safe — and a **same-origin** one is not: the
  guards all pass, the handler calls `event.respondWith` on a WebSocket request,
  and the connection dies **[d]**. Either serve the bundle from Pages and the
  socket from the VPS, or skip SW registration when joining a session — one line
  in `main.ts`'s `registerServiceWorker()`, which already swallows registration
  failures **[v]**. **Pages + a cross-origin VPS socket is the arrangement the
  current deploy already implies**, so that is the cheaper of the two.
- **No server state exists today.** `web/server/index.ts` is 28 lines of
  `express.static` plus an SPA fallback **[v]** — re-measured 2026-10-03, still 28.
  There is no `ws` dependency, no upgrade handler, no session store. That is all
  new and all small.
- **The version handshake now has something to point at.** §7.1 leans on
  `GameSaveManager.VERSION` being written but never read **[d]**. Since this was
  written there is also `web/src/engine/GameVersion.ts` exporting
  `GAME_VERSION = "0.9.2"` — the *app* version shown in the chrome, extracted
  because it was written out in three places. That is exactly the "content
  version" the `hello` frame wants **[d]**, so it should be reused there rather
  than adding a third version notion alongside `PROTOCOL_VERSION` (wire format)
  and `GameSaveManager.VERSION` (save format). All three are genuinely different
  axes; the mistake would be inventing a fourth.

---

## 8. Phases

Each phase ends with a stated gate. `npm run verify` (type-check + coverage
gate + build) is green at every one **[d]**.

### Phase 0 — the claim, as one test

**DONE 2026-10-04. The gate is green — the round-robin assumption holds.**
`web/tests/multiplayer-phase0-roundrobin.test.ts`, 2 cases. Two `PlayerController`
actors on one map, one map turn, headless.

Measured, on a real 1×1 world played 12 turns by the existing harness first:

| assertion | result |
|---|---|
| two player-controlled actors on the map | ✅ |
| each picked **exactly once** within one map turn | ✅ order `A,B` |
| the two player picks **alternate** (not `A,A,B,B`) | ✅ |
| the pick sequence **ends in `null`**, which is what runs `NextMapTurn` | ✅ |
| world advanced **exactly one** map turn | ✅ |
| the turn visited every actor with AP, not just the two players | ✅ |

**Mutation-checked**, because a test that cannot fail is a comment with a build
step: adding to the scheduler the player filter §3 says does not exist — "return
`null` for anyone but the first player" — fails it with
`player B was picked exactly once (order was A): expected +0 to be 1`.

So **§3 through §7 are not void**, and the plan's central bet is settled: no
scheduler change is needed to make the engine alternate between two players.

Also in this phase, because it was a bug independent of multiplayer: the
`actorSpeed === 0` strand. **Done 2026-10-03, and the answer was not the one this
plan assumed** — measured unreachable and pinned rather than fixed, see §5.3. The
only residue is a *content* question (a temporary actor with base < 33 that can
tire), which needs no Phase 0 work.

#### What Phase 0 found that the plan had wrong

**The player's turn is driven by a synchronous *peek*, not by a blocking wait.**
`WaitKeyOrMouse` polls `this.m_UI.UI_PeekKey()` and never calls `UI_WaitKey`. §7
builds the whole `NetUI` case on "`IRogueUI` has 43 methods of which exactly three
block", naming `UI_WaitKey`, `UI_Wait` and `UI_PreloadImages` — and the one input
path a networked player actually needs is **none of those three**. It is a
non-blocking peek that takes no argument.

Two consequences, both Phase 2/3 decisions this test does not make:

- **A promise-returning `NetUI` cannot answer the play loop.** Either the peek
  blocks — which gives up the poll design and the timeout-based `IdleAdvance` that
  §2.1 calls load-bearing — or the loop becomes an `await`. §7's "`m_UI` has to
  become *resolved* rather than fixed" is necessary and **not sufficient**: giving
  each player its own `IRogueUI` object does not help while the loop polls, because
  a poll cannot suspend on a socket.
- **Phase 0's third assertion is unanswerable as written.** "Neither player's keys
  reached the other" cannot be tested, because `UI_PeekKey()` takes no argument —
  the engine never tells the UI who it is asking. The test asserts the *count*
  instead (2 peeks per player turn, 4 total, all from one queue) and records the
  limitation rather than papering over it. This is the one place the plan asked for
  something the current `IRogueUI` shape cannot express, which is precisely what a
  Phase 0 gate is for.

**Two setup hazards, both of which cost this phase three runs** and are recorded in
the test's header because neither is obvious:

- **A wrong input seam hangs rather than fails.** Overriding `UI_WaitKey` (the
  obvious choice, and the method §7 calls blocking) leaves the play loop reading
  `NullRogueUI`'s idle cycle — `Enter, Escape, n, y` — where `Escape` translates to
  `PlayerCommand.NONE`, which `break`s the switch **without** setting
  `loop = false`. The turn never ends, no action points are spent, and the
  scheduler picks the same player forever.
- **That hang cannot be timed out.** Every iteration awaits an already-resolved
  promise, so it runs entirely in the microtask queue and starves the macrotask
  one: Vitest's test timeout never fires, and neither does a `Promise.race` against
  `setTimeout`. The only thing that stops it is throwing from inside the input
  seam, which is why the test's double carries a peek cap. **Any future networked
  test will hit this**, because "no input arrives" is the failure mode a network
  code has by definition.

**Not yet done, and deliberately:** the plan says "two turns". This is one map turn,
which is the *sharper* claim — the trace in §3 is A, B, null → `NextMapTurn`, and a
second turn only re-tests it. Phase 1's gate ("a two-player headless run survives 50
turns") is where repetition belongs, because it also needs the save format.

### Phase 1 — engine, no network

**Started 2026-10-04. Slice 1 of 3 DONE: the save carries a roster.**
`d2b8e43`, five cases in `web/tests/save-player-roster.test.ts`.

`m_Player` becomes *the acting player*. A player list on `Session`;
`GameLoop`'s game-over becomes "no player left"; `RefreshPlayer` and
`findPlayerActor` return lists; the save format carries `players[]` and a
per-actor controller tag in place of the single `root.player` ref, ~~with a
`GRAPH_VERSION` bump~~ — **declined, see below**. Decide shared vs per-player
scoring here and write down the decision.

Expect the suite to surface reads that quietly meant "the player" rather than
"whoever is acting". That is the point of running it, and it is why this phase
is separate from Phase 0.

**Gate:** a two-player headless run survives 50 turns, and the two-player save
round-trips through the existing bijection test. **Half of it is met** — the
two-player save round-trips. The 50-turn run is not, because nothing *acts* as a
second player yet (slices 2 and 3).

#### Slice 1 — the save names every player (done)

**What was wrong, and both halves were silent.** `Session.writeGraph` recorded
`findPlayerActor(currentMap)`: the **first** player-controlled actor on the **one**
map the session calls current. So two players on one map meant the second was never
written, and two players in two districts — turn-passing's whole reason for
existing — meant the second was not even looked for.

Silent because `_controller` is `{ kind: "skip" }` in the graph spec: a restored
actor has no controller, so `isPlayer` is false until one is attached. **A player
missing from a save does not come back un-driven; it comes back as an ordinary
NPC**, indistinguishable from one that never was a player. Nothing throws.

Done: `findPlayerActors(world)` walks every district (in generation order, so two
saves of one world agree and a round-trip can compare without sorting); the roster
rides in the root beside `player`, which is untouched; `Session.load` exposes
`loadedPlayers`; `LoadGame` reattaches the whole roster. `reattachPlayer` is
**deleted**, not kept beside its plural — its only remaining caller was a test, and
a function kept alive by a test is dead code with a green tick.

Mutation-checked twice: `findPlayerActors` returning only the first player fails the
round-trip, and scoping it to one district fails three cases. The first mutation I
wrote was a no-op — it probed a field that does not exist — so it was redone rather
than read as a pass.

**The `GRAPH_VERSION` bump is declined, and this is a divergence from the plan.**
The reason is already in this codebase for the same shape of change, on
`Session.armyHelicopterRescueMap`:

> a `Map` in the save root would need a new entry in the hand-written graph spec and
> a `GRAPH_VERSION` bump to refuse older saves, and the pair below rides in the root's
> plain JSON where **an absent key is simply a default — an old save restores with no
> rescue site, which is what it had.**

Bumping to 2 would refuse **every existing single-player save** to distinguish two
formats that are byte-identical when there is one player — and multiplayer does not
exist yet, so there is no save a bump would protect. The migration is one
`?? [player]` on read, pinned from both sides:

- a save with **no** `players` key (every save before this change) reads as a
  one-player roster;
- a save with an **explicitly empty** `players` reads as empty, and does *not*
  resurrect the singular `player`. That second one is the line that stops a save
  from a game where every player died coming back with someone alive, and it is the
  case `??` gets wrong if written carelessly.

**The bump is not deferred forever.** It becomes correct when the format has a state
an old build would **misread** rather than merely lack — which is a question about
the second player's *map* and *turn cursor*, not about the roster. Those are slices
2 and 3, and the answer belongs with them.

#### Slices 2 and 3 — not started

Ordered by what unblocks the gate:

2. **`GameLoop`'s game-over and `RefreshPlayer`.** `m_Player` is one field, so
   `RefreshPlayer` binds whichever player it finds first and the rest are players
   without a driver — which is exactly the state Phase 0's test leaves behind, and
   the reason the roster slice had to stop where it did. `GameLoop`'s
   `while (m_Player != null && !m_Player.isDead …)` becomes "no player left".
   `RefreshPlayer` returns the list; `findPlayerActor` becomes one of several.
   **This is where the 427 `m_Player` references start to matter**, and the plan's
   own advice stands: run it behind the two-player test, not behind review.
3. **`Map.m_checkNextActorIndex` and the turn cursor.** Already carried as a known
   gap (§6 item 8, Phase 4) — it is `{ kind: "skip" }` today and safe only at a turn
   boundary. With two players it is wrong more often, because a remote player's
   turn can be parked mid-map-turn. **This is the item that decides whether the
   version bump above is needed**, since an old build handed a two-player save would
   misread the cursor rather than merely lack it.

**[?]** still unanswered and now cheap to state: whether `ActionGame` grows a
`players` accessor, or whether the list belongs on `Session` with `ActionGame`
reading through it. Slice 2 makes this concrete and it should be settled there,
before slice 2 starts rather than during it.

**[corrected 2026-10-03] One thing this phase would now build on, which did not
exist when the phase was written — and one caveat.** `engine/actions/ActionGame.ts`
has landed: a structural interface for the slice of `RogueGame` that `ActorAction`
implementations may reach, replacing a `type Game = any` that had been `any` since
the port began. It is exactly **the 38 lowercase `do*` aliases plus `rules`**, and
every member was measured rather than chosen (`Actions.ts` reaches 39 members on
`this.game`, so an unused member here would be a false claim that `implements`
then fails on).

Two consequences for this phase:

- **It is the natural place a player list has to appear.** The `do*` block is Hub 1
  — §6.8 of the port plan keeps it on `RogueGame` permanently — and it operates on
  whoever is acting. A `Game`-shaped seam that is already typed, already narrow, and
  already implemented-by is a far better place to hang "the acting player" than a
  raw field rename across 427 references.
- **It does not reduce the 427.** Typing the seam means those calls are *checked*,
  not that they are *correct*. The reads that quietly meant "the player" rather than
  "whoever is acting" are exactly what a type cannot catch, so the phase's gate —
  run it behind the two-player test, not behind review — is unaffected.

**[?]** Whether `ActionGame` should grow a `players` accessor, or whether the player
list belongs on `Session` with `ActionGame` reading through it, is undecided here.
It is a five-minute question with a Phase 1 answer, and it is the first thing to
settle before starting.

### Phase 2 — server

`ws` dependency; `server/index.ts` gains `http.createServer` +
`WebSocketServer`; `NetUI` implements `IRogueUI` with per-actor routing (§7).
`NullRogueUI` is the existing precedent for the non-acting case.

**Gate:** two `NetUI` connections can drive one `RogueGame` through 50 turns
with no browser involved — a `HeadlessRunner` variant. This is the real
integration test and it is the one that would catch a re-entrancy bug.

### Phase 3 — client

`?mp=<host>`: skip the service worker, skip the main menu, connect, apply
`mapState` on receipt, redraw on a tick, post keys. The client computes its own
FOV. `mapSnapshot.ts` lands here (it is the client's half of the contract).

**Stop condition:** if a replica-only `RogueGame` cannot `RedrawPlayScreen`
cleanly, then `BROWSER_PORT_PLAN.md` §6 Wave 2 — the render cluster, already
recorded there as the highest-value extraction **[d]** — becomes a
**prerequisite** rather than a nicety, and this plan stops until that wave has
landed.

**[corrected 2026-10-03] the line range this used to cite, `20517–23492`, is dead.**
Every one of its boundary lines now lands on unrelated code — that section's own
re-measurement notes the same thing about §6.2's table, and the port plan lists
"§6.2's 9-row line-range table is dead" under *also wrong, not yet fixed*. The
cluster is still ~2,976 lines with 11 outbound calls; only the numbers are stale.
**§6.4's gate is the thing to read instead**, and it is unchanged: Wave 0 must
exist first (`engine/GameContext.ts` and `tests/helpers/game.ts`, neither of which
does). So this stop condition cannot be reached before Wave 0 lands anyway.

### Phase 4 — persistence

`DiceRoller.state` into the save; carry `Map.m_checkNextActorIndex` (§6 item 8).
Together these are the difference between "a server restart ends the run" and "a
server restart resumes it". Join and reconnect reuse the existing whole-world
`Session.save()` — 4.6 MB **[v]**, once, which is fine.

**Gate:** kill the server mid-session, restart, and a client reconnects into a
world whose future rolls match the pre-restart future. That test is the only
honest proof that the RNG state was captured.

### Phase 5 — real-time, optional

The table in [§4.1](#41-the-work), in that order. **Item 3 first**, because it is
the one that produces a modal dialog with nobody behind it.

Do this *after* turn-passing has been played, because the real cost is not the
engine — it is the balance and the log, and neither can be judged from a plan.
Add the AP-discard on resume (§5.1) in the same commit as item 1, not after.

**Gate:** park a player for 100 turns with the wall clock running; assert no
message storm, no stranded dialog, no banked actions, and that the AI has in
fact come looking.

### Phase 6 — deploy

Serve from the VPS, `ws` in the same image. `PROTOCOL_VERSION` in the handshake
(§7.1). Decide the SW question (§7.3) and write down which way.

---

## 9. Deliberately not doing, and why

**Deterministic lockstep** — every client simulates, only inputs are shared. The
deciding argument is not bandwidth, it is the AI: 970 actors with 11 controller
classes whose multi-turn perception memory lives in `MemorizedSensor` **[d]**
would have to be bit-identical across browsers *and* survive a disconnect. The
serialiser already calls this a project of its own:

> a controller points back at its actor and, in the AI case, holds a whole
> perception cache, and rebuilding those is a project of its own.

**[v]** `specs.ts` — **corrected 2026-10-03: cited as `:684-698`, which is a
backpack-inventory codec and nothing to do with this. The quote is at `:726-730`,
in the controller's docblock, and is otherwise verbatim.** Lockstep is right for a
platformer and wrong for a 970-actor simulation with no event bus.

**A delta protocol.** There are no listeners or callbacks anywhere in the
engine **[d]** — every mutation is a direct field write inside ~500 `Do*`/`On*`
primitives plus ~900 lines of `NextMapTurn` upkeep. So there is no "actor moved"
event to stream, and a delta would mean instrumenting all of it. A per-map
snapshot sidesteps the problem entirely, and §7.2 explains why the size is
acceptable.

**Shared fog of war / simultaneous views.** This is the one that would force
`m_PlayerFOV` to become per-viewer across 151 call sites, with
`Tile.isInView` written onto the map **[v]**. Turn-passing avoids it completely
because each client is single-player by construction. If it is ever wanted, the
answer is *separate processes*, not a refactor of visibility — which is
another argument for the architecture in §7.

**Split-screen in one process.** The same 151 sites, plus two canvases, plus the
`LOGICAL_W/LOGICAL_H` constants `CanvasUI.ts` deliberately duplicates rather
than imports **[d]**.

---

## 10. Risks and stop conditions

| risk | why it is real | what to do |
|---|---|---|
| **Phase 0's test is not green** | §3 is a reading of 15 lines of scheduler, and reading is not running | Stop. Everything downstream assumes it. |
| **The `m_Player` → acting-player rename is bigger than it looks** | **427** references **[d]**; the ones that quietly meant "the player" are indistinguishable from correct ones by inspection | Run it behind the two-player test, not behind review. A read that is wrong is not a compile error and not a `tsc` failure. |
| **The client's render-only `RogueGame` does not `RedrawPlayScreen` cleanly** | Untested. `RogueGame` mixes simulation and drawing in one class by design (§6 of the port plan calls the split overdue) | Phase 3's stop condition. §6 Wave 2 is the fallback, and it is already planned. |
| **A stale cached bundle talks to a new server** | cache-first `/assets/*` **[d]**, no version handshake anywhere | `PROTOCOL_VERSION` in `hello`. Non-negotiable. |
| **A modal dialog with no human behind it** | **44** `AddMessagePressEnter` call sites now **[d, re-measured 2026-10-03: this said six]**, of which eight world-initiated ones already carry an `isBotPlayer` guard — so the risk is real but smaller than stated, and the guard pattern to copy exists | Phase 5 item 3, minus the eight already done. Fix it before the wall clock, not after. |
| **Per-turn payload is too large** | 150-250 KB per map **[?]** — extrapolated, not measured | Measure before optimising. Clip to FOV, then diff, in that order. |
| ~~**A player is stranded at `actorSpeed === 0`**~~ | **Retired 2026-10-03.** §5.3 said this was reachable in normal play **[?]**; measured, it is not — the floor is 3, because the one actor with a low enough base is undead and so takes neither multiplier. Pinned by `web/tests/actor-speed-floor.test.ts` | Nothing. **Do not apply the `Math.max(…, 1)` this plan used to prescribe** — it is a divergence from `Rules.cs:4681` for an unreachable case |
| **Desync between client and server** | The client holds a replica it never simulates, so drift is expected by construction | `Map.assertActorIntegrity()` on the replica — **but it is not wired into `RogueGame` today** (§7.2), so this is a call site to add, not a free check. Periodic full resync is the backstop. |

---

## 11. Open questions

1. **Shared or per-player scoring?** Not answered. The recommendation is to keep
   one `Scoring` for the *acting* player and build no scoreboard until the
   scheduler work in Phase 1 has settled what "the player" means. Deciding this
   before Phase 1 means deciding it against a model that is about to change.
2. **What happens when one player dies?** Spectate, become a ghost, or end the
   session? This is a design question with no technical answer and it blocks
   Phase 1's game-over condition, not Phase 0.
3. **Does a parked player keep their followers?** `behaviorFollowActor` gates on
   `isLeaderVisible` **[d]**, so followers cluster around a stationary leader.
   Whether that is desirable is a balance question **[?]**.
4. **Is a 5,800-map-object world affordable on the server per turn, and how many
   concurrent sessions?** Unmeasured. One `RogueGame` is ~25 MB of live object
   graph **[d]**, so a small VPS bounds this before the CPU does.
5. **Does the client need `Session` state outside its own map** — zones, uniques,
   the `fireEvent` raid calendar? Probably yes for the minimap and the day
   counter, and it is not yet enumerated **[?]**. It is the most likely source of
   a Phase 3 surprise.
6. **Does the play-loop peek block, or does the loop become an `await`?**
   **Added 2026-10-04, and it is now the first question in this list**, because
   Phase 0 showed that `NetUI` cannot be a drop-in (§7): `WaitKeyOrMouse` polls
   `UI_PeekKey()` synchronously, and a socket cannot answer a poll. The two answers
   cost very different things and they should be compared *before* Phase 2 is
   scheduled rather than discovered inside it:
   - **peek blocks.** `NetUI` stays a drop-in and the engine barely changes — but
     the poll design and the timeout-based `IdleAdvance` both go, and §2.1 calls the
     latter load-bearing for a disconnected peer.
   - **loop awaits.** The engine's hottest loop gains a promise per iteration, and
     the browser build loses whatever the poll buys it. The timeout path can
     survive as an explicit race.
   **[?]** No measurement of either has been made. §6.9's existing scanner tests
   and the first-person goldens are what would catch a regression in the second
   option, so they are the prior art for costing it.

---

## Citation trust boundary

Written 2026-10-03, and this pass **did** the re-grep it originally deferred. Every
`file:line` in the body is now either a current line number attached to a named
symbol, or a symbol alone. The claims did not move; the anchors did.

**Six were wrong in a way that mattered, not just drifted:**

| Was | Now | What was wrong |
|---|---|---|
| `specs.ts:684-698` — the authority for rejecting lockstep | `specs.ts:726-730` | cited range is a backpack-inventory codec. The quote was real and verbatim, just somewhere else entirely |
| `specs.ts:263/398/461/486/496` — the `refList` fields §7.2 reuses | `specs.ts:449,493,494,495,577` (+ `649`, `760-764`) | **all five wrong.** Every one is something else; §7.2's codec sketch pointed at five unrelated lines |
| `RogueGame.ts:339-340` — `MAX_MESSAGES` / `MESSAGES_HISTORY` | `RogueGame.ts:485-486` | values unchanged, but these are now **module-level `export const`s, not fields** — anything reading them off the class is wrong |
| `RogueGame.ts:4244` — the `isPlayer` read after the scheduler's pick | `RogueGame.ts:4890`, in `advancePlayMap` | moved; still the same read, still after the pick |
| `RogueGame.ts:1329` then `:1934-1939` — the constructor | `RogueGame.ts:837` | moved twice, and gained a fourth `sound` parameter in between |
| `RogueGame.ts:111,234` + `GameOptions.ts:23` — the three `@ui` leaks | `:112, :276, :23` | moved, **and there are four now** — `@ui/ActionMenu` arrived with the action menu and nobody counted |

**Re-verified as still exact, no correction needed** — these are the short, stable
files where a line number *is* the right unit and nothing has split them:
`sessionGraphRoot.ts:74/130/144`, `SessionGraph.ts:56` (`GRAPH_VERSION` still 1),
`DiceRoller.ts:9`, `IRogueUI.ts:11` and all three blocking methods at `:80/140/159`,
`HeadlessRunner.ts:207`, `specs.ts:314` (`tilesGrid`), `specs.ts:485`
(`m_checkNextActorIndex` still `{ kind: "skip" }`), `web/server/index.ts:26`,
`Rules.ts:297` (`SHIELD_ENCUMBERANCE_PENALTY = 0.75`),
`Rules.ts:138` (`STAMINA_REGEN_PER_TURN = 2`), and the C# clamp at
`Rules.cs:4680-4681` — **which is the one that decides §5.3, so it was read rather
than assumed.**

**Both of §3's load-bearing claims re-read and unchanged**: the scheduler is still
fourteen lines with no player filter, and `isPlayer` is still a type test rather than
an identity field. If either had changed, §3 through §7 would be void.

**Counted again** (`[d]`, and these move): 151 `IsVisibleToPlayer` sites; 427
`m_Player` references; 43 `IRogueUI` methods; 44 `AddMessagePressEnter` call sites;
8 `isBotPlayer` guards (`NationalGuard`, `ArmySupplies`, `BikersRaid`, `GangstasRaid`,
`BlackOpsRaid`, `BandOfSurvivors`, `CHARScientists`, `RefugeesEventDistrictFactor`);
exactly 5 `isPlayer` reads in `ai/`; **4** `@ui` imports from `engine/`.

**Still worth knowing before Phase 1** (the `DiceRoller` and `refList` items are
Phase 4 and Phase 3 respectively; the Wave 0 one gates Phase 3's stop condition):

- **`DiceRoller` is not in the save graph at all** — `grep -c DiceRoller specs.ts`
  is 0, so Phase 4 item 1 is a root field, not a skip-list edit. Slightly less work
  than §6 item 8 implied.
- **The `refList` count doubled.** There are now **ten** `{ kind: "refList" }`
  fields, not the five §7.2 assumed. The codec sketch in §7.2 is unaffected in shape
  but its inventory was short by half.
- **§6.4's Wave 0 deliverables still do not exist**, so §8 Phase 3's stop condition
  is unreachable until they do — and three of §6's Wave 1 modules have landed
  *without* them, which means §6's sequencing is not a schedule.
- **§6 item 8's `players[]` now exists**, without the version bump — see §8 Phase 1.
  What does *not* exist yet is the per-actor controller tag alongside it, which is
  the part that would eventually force the bump.

**The `[v]` / `[d]` / `[?]` convention stays**, because it is the thing that made
this document findable: every claim is labelled by how it was arrived at. What
changed is that the labels now have a floor under them — a `[v]` next to a symbol
means the symbol was re-read, and after this pass that is true of every one in the
body. Keep it.

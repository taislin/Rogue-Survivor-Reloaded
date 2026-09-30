# Multiplayer — a design and phasing plan for the browser port

> **Status: design only, 2026-09-30. No code has been written.** This file
> records a feasibility study and a phasing plan. It is the sibling of
> `BROWSER_PORT_PLAN.md` the same way `STILL_ALIVE_REFERENCE.md` is: a statement
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
DOM-free. `web/.porting/CONVENTIONS.md` rule 2 ("no platform leakage") means
`engine/` and `data/` never import from `ui/`, and `RogueGame`'s constructor
takes its collaborators as arguments:

```
1329: 	constructor(
        UI: IRogueUI,
        music: IMusicManager = new NullMusicManager(),
        ambients: IAmbientManager = new NullAmbientManager(),
      ) {
```
**[v]** `web/src/engine/RogueGame.ts:1329`

So `new RogueGame(someUI)` runs unchanged in Node, in a browser, or in a test.
`sim/HeadlessRunner.ts:100` already does exactly that with a `NullRogueUI`
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
`await this.WaitKeyOrMouse(...)` **[v]** `RogueGame.ts:6875`, and while it parks
the whole stack below it is suspended: `NextMapTurn` cannot run, so AP regen
(`4664`), starvation, fire and `++map.localTime.turnCounter` (`5188`) all stop;
and `advancePlayDistrict`'s `worldTime.turnCounter++` **[v]** `RogueGame.ts:4066`
does not run, so day and night are frozen too.

So the option cannot be the foundation. **What it *is*, and this is the useful
part:** it is the only existing, tested anti-stall primitive. A disconnected or
AFK remote player must not hold the scheduler forever, and
`WaitKeyOrMouse(idleAdvanceMs(s_Options.idleAutoAdvance), ...)` **[v]**
`RogueGame.ts:6876` already does exactly that, with 562 lines of tests behind
it. For networked play this is not a nice-to-have; it is load-bearing.

### 2.2 Real-time is much cheaper than the first draft of this plan claimed

The first estimate given to the author of this plan was that making the
scheduler suspendable was "the single biggest cost multiplier", on the reasoning
that `HandlePlayerActor` is a 750-line `do…while` with 43 exits plus nested
blocking sub-dialogs. **That was wrong**, and the reason it was wrong is that
the scheduler does not need to be suspended at all — see [§3](#3-the-load-bearing-finding-the-scheduler-already-round-robins)
and [§4](#4-what-real-time-actually-costs). The correct figure is ~28 lines of
engine change.

This is recorded rather than quietly fixed because it is the same failure mode
`BROWSER_PORT_PLAN.md` §1.1a documents: a plausible mechanism, never opened, and
a confident number attached to it. A cost estimate is a claim about code, and it
has the same failure mode as a claim about a value type.

---

## 3. The load-bearing finding: the scheduler already round-robins

**This is the reason networked play is as cheap as it is, and it is the opposite
of what the "recursive descent" framing suggests.**

The entire turn-ordering scheduler is fifteen lines:

```ts
2165:  getNextActorToAct(map: GameMap | null, _turnCounter: number): Actor | null {
2166:    if (!map) return null;
2167:
2168:    const n = map.countActors;
2169:    for (let i = map.checkNextActorIndex; i < n; i++) {
2170:      const a = map.getActor(i);
2171:      if (a.actionPoints > 0 && !a.isSleeping) {
2172:        map.checkNextActorIndex = i;
2173:        return a;
2174:      }
2175:    }
2176:
2177:    return null;
2178:  }
```
**[v]** `web/src/engine/Rules.ts:2165-2178`

There is no player filter, no priority queue, no turn token, no time-slicing.
It is a linear scan of `map.actors` from a cursor. The player is picked by
exactly the same `actionPoints > 0` test as a zombie, and `actor.isPlayer` is
read only *after* the pick, at `RogueGame.ts:4244` **[v]**.

`HandlePlayerActor` then does:

```ts
6660: 		this.m_Player = player; // remember player.
```
**[v]** `web/src/engine/RogueGame.ts:6660`

That is an assignment, not an assertion. It does not check that `player` is
*the* player.

**Therefore: give a second actor a `PlayerController` and the existing
scheduler alternates between them.** `isPlayer` is already a type test rather
than an identity field:

```ts
256:  get isPlayer(): boolean {
257:    return this._controller instanceof PlayerController;
258:  }
```
**[v]** `web/src/data/Actor.ts:256`

Trace it, with A at list index 3 and B at index 7: call 1 picks A (cursor 3); A
spends 100 AP, so `actionPoints` is 0; call 2 scans from 3, skips A, picks B
(cursor 7); B spends 100; call 3 finds nobody, returns `null`, and
`advancePlayMap:4228` calls `NextMapTurn`, which regrants at `4664` and resets
the cursor to 0 at `4671` **[v]**. One map turn, both players acted once, world
advanced once. No scheduler change.

**This is Phase 0's test and the whole feasibility claim at once.** If it is not
green in a day, everything below it is void.

### 3.1 Why the recursive descent does not block two players

`advancePlayDistrict` is a `do…while`, not recursion, for the *player's own*
turn ordering **[v]** `RogueGame.ts:4047-4059`. The recursion in the call graph
is only the background-district simulation (`SimulateDistrict:28154` →
`AdvancePlay` → `advancePlayDistrict`). Two humans in sequence is a loop, and
loops alternate cleanly.

---

## 4. What real-time actually costs

The cheap theory: a parked player has `actionPoints <= 0`, so
`getNextActorToAct` (`Rules.ts:2171`) skips them; `NextMapTurn` grants every
non-sleeping actor `actorSpeed` (`RogueGame.ts:4664`) and zeroes the cursor
(`4671`) **[v]**; therefore the world advances around a player who is not
acting, with no change to `HandlePlayerActor` at all.

**The theory is confirmed for the scheduler and is the whole of the win.** The
driver already exists too. `GameLoop`'s `while` **[v]** `RogueGame.ts:1790-1794`
is a driver; it simply has no clock of its own, because today a human's blocking
`await` supplies the cadence.

And the prototype for a turn-driven, input-free, world-advancing,
self-terminating loop is already written:
`StartPlayerWaitLong` / `CheckPlayerWaitLong` **[v]**
`RogueGame.ts:11336-11381`. It runs `DoWait` for the player and returns to
`GameLoop` **with no keypress** (`HandlePlayerActor:6669-6673`), and it
self-terminates on five conditions, of which **three are set from the world, not
the player**:

| interrupt | set by | line |
|---|---|---|
| an audible message | `AddMessageIfAudibleForPlayer` | `1469` **[v]** |
| a loud noise | `OnLoudNoise` | `20112` **[d]** |
| a melee attack | `DoMeleeAttack` | `16483` **[d]** |
| an hour elapsed | `m_PlayerLongWaitEnd` | `11342` **[v]** |
| hungry / starving / sleepy / exhausted / unwell | `CheckPlayerWaitLong` | `11365-11378` **[d]** |

That is a complete "wake up when threatened" model. Real-time is this loop with
a wall-clock deadline instead of `TURNS_PER_HOUR`.

### 4.1 The work

| # | change | where | size |
|---|---|---|---|
| 1 | `isSuspended` as a third skip condition beside `isSleeping` | `Rules.ts:2171` | 1 line |
| 2 | suspend/resume guard: zero AP on suspend; on the skip path also run `CheckSpecialPlayerEventsAfterAction` (`4250`) and the `previous*` assignments (`4254-4261`) and `UpdatePlayerFOV` | `RogueGame.ts:4244-4261` | ~15 lines |
| 3 | extend the `m_SimulatingInIdle` guard from `AddMessagePressEnter` to the other blocking primitives, and **rewrite the comment that says it is unnecessary** | `RogueGame.ts:1619`, comment at `1614-1617` | ~6 lines + comment |
| 4 | wall clock in the `GameLoop` `while`, placed *after* `AdvancePlay` returns so it cannot race the turn | `RogueGame.ts:1790-1821` | ~3 lines |
| 5 | discard the AP bank on resume | — | 1 line |

**Item 3 is the one that bites at runtime, and the existing comment is why
nobody would have found it.** Only `AddMessagePressEnter` has the guard:

```ts
1619: 		if (this.m_SimulatingInIdle) return;
```
**[v]** `RogueGame.ts:1619`

with a comment at `1614-1617` explaining that the other blocking helpers need no
such guard *"because they are all player-only flows"*. **That claim becomes
false.** World-initiated blocking sites, all verified:

| site | fires when |
|---|---|
| `4521` | `NextMapTurn` infection effect on the player |
| `5759`, `5888`, `5974`, `6055`, `6131` | `ArmySupplies`, `BikersRaid`, `GangstasRaid`, `BlackOpsRaid`, `BandOfSurvivors` |
| `5672` | `NationalGuard` |
| `21316`, `21378` | `OnNewNight` / `OnNewDay` → skill-upgrade screen, which also opens a full-screen menu |
| `21205`, `21255` | `PlayerDied` → `HandlePostMortem`, three sequential blocks |

**[v]** for all of the above. The six raid/announce events gate on
`map === this.m_Player.location.map && !isSleeping && !isUndead` **[d]**, so a
parked, awake, living player on their own district gets a hard
`AddMessagePressEnter` from a dice roll they never made.

**Item 2's FOV half is not optional.** `UpdatePlayerFOV` does two things and
both matter:

```ts
30208: 		player.location.map!.setViewAndMarkVisited(LOS.fovPoints(this.m_PlayerFOV));
```
**[v]** `RogueGame.ts:30208`

`setViewAndMarkVisited` clears the previous view first **[d]**, so a stale FOV is
not merely old data — every tile the player *stopped* being able to see stays
`isInView = true` **[v]**, `Map.ts:405-415`. There are **141 call sites** of
`IsVisibleToPlayer` **[v]**, and 22 of the 23 `AddMessage` calls in
`NextMapTurn` are gated on it **[d]**. With a current FOV almost nothing floods;
with a stale one, everything the player could see when they stopped moving keeps
reporting. The fix is already in the file at the one place the engine noticed
the problem:

```ts
4901: 			if (actor === this.m_Player) {
4902: 				this.UpdatePlayerFOV(this.m_Player);
```
**[v]** `RogueGame.ts:4901-4903`, on the exhaustion-collapse path. Hoisting that
into the skip path is three lines.

### 4.2 What real-time does *not* need

**The AI needs no changes.** There are exactly five `isPlayer` reads in
`web/src/gameplay/ai/` **[d]** and none is about whether the player acted: two
are "never do this *to* the player" (`BaseAI.ts:2685`, `CivilianAI.ts:434`) and
three select between `FOLLOW_PLAYERLEADER_MAXDIST` and
`FOLLOW_NPCLEADER_MAXDIST` **[d]** — **both of which are `1`**, so the branch is
a no-op in all three files. Nothing reads `Session.lastTurnPlayerActed`, which
exists only to pick bold-vs-faded text in `DrawMessages` (`RogueGame.ts:1590`).

**`MemorizedSensor` does not make an AI forget a stationary player.** Each sense
pass prunes percepts past their persistence and then *refreshes* the age of any
percept re-sensed **[d]**. A player standing in the open is re-sensed every
turn. The persistences (10-20 turns **[d]**) matter for a player who *breaks line
of sight*, not one who stands still.

**Stamina cannot soft-lock.** `RegenActorStaminaPoints` is called for every
actor below max, unconditionally, at `RogueGame.ts:4667` **[d]**, at
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

`NextMapTurn` is what advances `map.localTime` (`5188` **[d]**), and
`advancePlayMap` calls it only once `getNextActorToAct` returns `null`
(`4228-4232` **[d]**). So a player who parked for 50 turns banks 50×100 AP and
then spends it **50 actions with the sun, the zombies and the fires all frozen**.
The bank has to be discarded, not spent.

### 5.2 The bank breaks the scent rule

```ts
15185: 		if (actor.actionPoints > 0)
15186: 			this.DropActorScents(actor);
```
**[v]** `RogueGame.ts:15185`

The alpha10 fix this implements assumes AP is exhausted after one move, so the
per-turn blanket drop in `NextMapTurn` (`4655-4659` **[d]**) covers the hole.
**With a bank the condition is true after every step**, so a 50-action burst
lays a continuous scent trail through all of it. That is a correctness break —
AI behaviour diverges — not a balance one.

### 5.3 A real soft-lock, worth fixing regardless of multiplayer

`actorSpeed` floors at zero:

```ts
2354:     return Math.max(Math.floor(speed), 0);
```
**[v]** `web/src/engine/Rules.ts:2354`

and at 0 the actor is in a stable trap: `getNextActorToAct` (`2171`) never
returns them and `NextMapTurn` (`4664`) never grants. Nothing can restart them.
Reachable in normal play **[?]** — a survivor who is exhausted, dragging a
corpse (`÷2`), in army body armour (`-10`) holding a chainsaw (`-10`, live under
`Feature.WeaponWeight`) walks 100 → 33 → 16 → −4 → **0**. The exact input needs
confirming against the CSV column values before the fix is written, but the
shape of the trap is confirmed by reading both ends of it. **Fix in Phase 0,
with a test, whether or not multiplayer happens.**

---

## 6. What is expensive: the single-player assumptions

This is the real work, and it is orthogonal to the network.

| # | assumption | evidence | cost |
|---|---|---|---|
| 1 | **`m_Player` is *the* player** | 387 references **[v]**, written in 3 places (`6660`, `RefreshPlayer:27834`, `HandleReincarnation:28848`) | rename the concept to *the acting player*; the reads mostly keep working |
| 2 | **one FOV, written onto the map** | `m_PlayerFOV` → `setViewAndMarkVisited` (`30208`) **[v]**; `IsVisibleToPlayer` at 141 sites **[v]** | **zero** for turn-passing — each client computes its own FOV from its replica |
| 3 | **one camera** | `m_MapViewRect` | **zero** for turn-passing |
| 4 | **one current map, and the world clock is gated on it** | `advancePlayDistrict:4065` **[v]** `district === currentMap?.district` | with two players in two districts, only one ticks the clock **[d]** |
| 5 | **game over is one player's life** | `GameLoop:1790-1794` `while (m_Player != null && !m_Player.isDead …)` **[v]**; `advancePlayDistrict:4051-4057` runs `HandleReincarnation` and bails on `m_Player.isDead` **[v]** | becomes "no player left"; the 25-site death → post-mortem → hi-score flow becomes per-player or needs a spectator mode |
| 6 | **one log, no filtering** | `MessageManager` has none **[d]**; `MAX_MESSAGES = 6` (`RogueGame.ts:339` **[v]**) clears the visible strip wholesale, `MESSAGES_HISTORY = 59` (`340` **[v]**) ring-buffers the rest | fine with a current FOV; a flood without one |
| 7 | **one score** | `Scoring` has one `turnsSurvived`, one achievement set, one hi-score entry | decide shared-vs-per-player before Phase 1; recommendation is **do not build a scoreboard yet** |
| 8 | **the save is single-player** | `root.player` is one ref (`sessionGraphRoot.ts:74` **[v]**); `findPlayerActor` returns the first match (`130` **[v]**); `reattachPlayer` attaches one controller (`144` **[v]**); `Actor._controller` is `skip`ped (`specs.ts:699` **[v]**); `Map.m_checkNextActorIndex` is `skip`ped as a "cache" (`specs.ts:484` **[v]**) | `players[]` + a per-actor controller tag + `GRAPH_VERSION` bump |

**Items 2, 3 and 4 are the reason turn-passing was chosen.** They are the three
that are genuinely expensive, and turn-passing makes all three free: only the
acting player is ever rendered, so only one FOV and one camera need to be
correct at a time, and each client is single-player by construction.

**Item 8 has two one-line landmines** that matter for reconnect rather than for
the first session:

- `DiceRoller.state` is `private state: number` **[v]** `DiceRoller.ts:9` and is
  **not serialised**; `LoadGame` rebuilds the roller from the seed
  (`RogueGame.ts:26086` **[v]**), so the sequence restarts. One `uint32` and a
  root field.
- `Map.m_checkNextActorIndex` is the live turn cursor, skipped as a cache. Safe
  at a turn boundary, wrong mid-turn **[d]**. Carry it.

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
`IRogueUI` has 44 methods of which exactly **three block** — `UI_WaitKey`
(`IRogueUI.ts:80` **[v]**), `UI_Wait` (`140` **[v]**) and `UI_PreloadImages`
(`159` **[v]**) **[d]**. The other 41 are fire-and-forget, of which 8 are
state-consuming peeks and 2 are injection seams (`UI_PostKey`, `UI_PostMouseButtons`)
**[d]**. So the whole blocking-input surface of a 30,000-line engine is one
method.

**The client runs the shipped renderer** against a replica of its own map that it
never simulates. It computes its own FOV, because `UpdatePlayerFOV` is a pure
function of the map, the actor's position and the light sources in it — and all
of those are in the snapshot. **This is what makes item 2 in §6 free**, and it
is why the 141 `IsVisibleToPlayer` sites never need to change.

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
| `input` | client → server | one `GameKeyEvent` — `{key, keyCode, code, shift, ctrl, alt}` (`IRogueUI.ts:11-31` **[d]**) |
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
`tilesGrid` codec (`specs.ts:313` **[v]**) plus the `refList`-shaped lists at
`specs.ts:263/398/461/486/496` **[v]** with local indices. Roughly 200 lines,
and `Map` gains a `replaceStateFrom(json)`.

**Start with a full per-map snapshot per turn. Do not build a diff.** A 3×3
world is 56 maps, 5,800 map objects and 970 actors **[v]**, so one map is
roughly 17 actors and 100 map objects; call it 150-250 KB of JSON. Clipping to
the client's FOV plus one tile of margin would cut the tile portion to ~23% of a
50×50 map **[?]**, but that is an optimisation to add after measuring, not a
prerequisite to build. `Map.assertActorIntegrity()` already runs every turn
**[v]** and runs on the client replica for free, which makes it a live invariant
check on the replication.

### 7.3 Deployment

The Dockerfile already runs `node dist-server/server/index.js` on 8080
**[v]** `server/index.ts:26`, so it stops being "not the deploy path" and becomes
the deploy. Two constraints:

- **The service worker is hostile to a same-origin WebSocket.** `sw.js` bails on
  `if (url.origin !== self.location.origin) return;` **[v]** `public/sw.js:146`,
  so a **cross-origin** socket is safe — and a **same-origin** one is not: the
  guards all pass, the handler calls `event.respondWith` on a WebSocket request,
  and the connection dies **[d]**. Either serve the bundle from Pages and the
  socket from the VPS, or skip SW registration when joining a session — one line
  beside `main.ts:103` **[v]**, which already swallows registration failures.
- **No server state exists today.** `server/index.ts` is 28 lines of
  `express.static` plus an SPA fallback **[v]**. There is no `ws` dependency, no
  upgrade handler, no session store. That is all new and all small.

---

## 8. Phases

Each phase ends with a stated gate. `npm run verify` (type-check + coverage
gate + build) is green at every one **[d]**.

### Phase 0 — the claim, as one test

Two `PlayerController` actors in one map, headless, two turns. Assert: each acted
exactly once, the world advanced exactly one map turn, and neither player's keys
reached the other. About 40 lines, in the sim — **per `BROWSER_PORT_PLAN.md`
§1.4a, this belongs in the headless harness, not a browser, and a browser check
does not substitute for it.**

Also in this phase, because it is a bug independent of multiplayer: the
`actorSpeed === 0` strand (§5.3), with a test that walks the specific input to
zero and asserts the actor is still reachable.

**Gate:** the test is green. **If it is not, stop** — the round-robin assumption
is wrong and §3 through §7 are void.

### Phase 1 — engine, no network

`m_Player` becomes *the acting player*. A player list on `Session`;
`GameLoop:1790` game-over becomes "no player left"; `RefreshPlayer` and
`findPlayerActor` return lists; the save format carries `players[]` and a
per-actor controller tag in place of the single `root.player` ref, with a
`GRAPH_VERSION` bump (`SessionGraph.ts:56` **[v]**, currently 1). Decide shared
vs per-player scoring here and write down the decision.

Expect the suite to surface reads that quietly meant "the player" rather than
"whoever is acting". That is the point of running it, and it is why this phase
is separate from Phase 0.

**Gate:** a two-player headless run survives 50 turns, and the two-player save
round-trips through the existing bijection test.

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
cleanly, then `BROWSER_PORT_PLAN.md` §6 Wave 2 — the render cluster at
`20517–23492`, 2,976 lines and 11 outbound calls, already recorded as the
highest-value extraction **[d]** — becomes a **prerequisite** rather than a
nicety, and this plan stops until that wave has landed.

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

**[v]** `specs.ts:684-698`. Lockstep is right for a platformer and wrong for a
970-actor simulation with no event bus.

**A delta protocol.** There are no listeners or callbacks anywhere in the
engine **[d]** — every mutation is a direct field write inside ~500 `Do*`/`On*`
primitives plus ~900 lines of `NextMapTurn` upkeep. So there is no "actor moved"
event to stream, and a delta would mean instrumenting all of it. A per-map
snapshot sidesteps the problem entirely, and §7.2 explains why the size is
acceptable.

**Shared fog of war / simultaneous views.** This is the one that would force
`m_PlayerFOV` to become per-viewer across 141 call sites, with
`Tile.isInView` written onto the map **[v]**. Turn-passing avoids it completely
because each client is single-player by construction. If it is ever wanted, the
answer is *separate processes*, not a refactor of visibility — which is
another argument for the architecture in §7.

**Split-screen in one process.** The same 141 sites, plus two canvases, plus the
`LOGICAL_W/LOGICAL_H` constants `CanvasUI.ts` deliberately duplicates rather
than imports **[d]**.

---

## 10. Risks and stop conditions

| risk | why it is real | what to do |
|---|---|---|
| **Phase 0's test is not green** | §3 is a reading of 15 lines of scheduler, and reading is not running | Stop. Everything downstream assumes it. |
| **The `m_Player` → acting-player rename is bigger than it looks** | 387 references **[v]**; the ones that quietly meant "the player" are indistinguishable from correct ones by inspection | Run it behind the two-player test, not behind review. A read that is wrong is not a compile error and not a `tsc` failure. |
| **The client's render-only `RogueGame` does not `RedrawPlayScreen` cleanly** | Untested. `RogueGame` mixes simulation and drawing in one class by design (§6 of the port plan calls the split overdue) | Phase 3's stop condition. §6 Wave 2 is the fallback, and it is already planned. |
| **A stale cached bundle talks to a new server** | cache-first `/assets/*` **[d]**, no version handshake anywhere | `PROTOCOL_VERSION` in `hello`. Non-negotiable. |
| **A modal dialog with no human behind it** | six world-initiated `AddMessagePressEnter` sites **[v]**, one guard, and a comment asserting the others are safe | Phase 5 item 3. Fix it before the wall clock, not after. |
| **Per-turn payload is too large** | 150-250 KB per map **[?]** — extrapolated, not measured | Measure before optimising. Clip to FOV, then diff, in that order. |
| **A player is stranded at `actorSpeed === 0`** | §5.3, reachable in normal play **[?]** | Phase 0, regardless of everything else. |
| **Desync between client and server** | The client holds a replica it never simulates, so drift is expected by construction | `Map.assertActorIntegrity()` on the replica is a free check. Periodic full resync is the backstop. |

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

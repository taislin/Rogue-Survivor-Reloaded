# Relay — one player's world, continued by the next player

> **Status: design study only. No code has been written for it and no phase has
> begun.** Written 2026-10-04 against `master` `658a9c0`. **Revised twice the same
> day**: first from "people in a room" to "a server holding a pool of saves" (§1.2),
> then to record **the one settled design decision — keep the corpse** (§3.1). Both
> revisions moved the single biggest engine item rather than adding to it, and both
> moved it *down*. See §3.4 for the correction that produced the second move.
>
> **The one-sentence version.** A relay run is an ordinary save file. When the
> player holding the controller dies, the client uploads the save to a small
> server; the server keeps a bounded pool of them, shows each with the number of
> players who have died on it, and hands one to a stranger, who loads it, takes
> over the dead stranger's city — **and their corpse, and everything on it** — as a
> new character, and keeps going. **The simulation needs almost nothing**: the
> engine's existing `HandleReincarnation` already performs a complete handover, and
> nothing destroys the world when a player dies. **The load path is the only real
> engine work**, and it is ~30 lines ([§3](#3-the-load-path-the-actual-work)).
>
> **Sibling document.** [`MULTIPLAYER_PLAN.md`](MULTIPLAYER_PLAN.md) is about
> *concurrent* players in separate browsers and shares one server with this one
> (§7.1). It is a dependency, not a duplicate: everything in §7 is a small,
> filesystem-shaped service, and so is its Phase 2. Its §11 open questions 1 and 3
> are *answered* by this mode for the relay case ([§5.4](#54-scoring)).

**Citation convention**, inherited from the other two plans and kept for the same
reason: **[v]** read from the code today, **[d]** derived by reading more than one
place and reasoning, **[?]** not checked. **Cite symbols, not line numbers** —
`MULTIPLAYER_PLAN.md`'s closing section records that 34 of 49 sampled line
citations had drifted within three days, and `STILL_ALIVE_JOURNAL.md` that 17 of 22
had. A symbol survives a 36,735-line god-file being refactored.

---

## Table of contents

1. [Scope](#1-scope)
2. [What already exists](#2-what-already-exists)
3. [The load path: the actual work](#3-the-load-path-the-actual-work)
4. [The three refusals](#4-the-three-refusals)
5. [Shape: seats, run identity, inheritance](#5-shape-seats-run-identity-inheritance)
6. [The handoff gate](#6-the-handoff-gate)
7. [The server](#7-the-server)
8. [Identity: why not the IP hash](#8-identity-why-not-the-ip-hash)
9. [The trust boundary](#9-the-trust-boundary)
10. [Where it lives, and what it costs](#10-where-it-lives-and-what-it-costs)
11. [Phases](#11-phases)
12. [Risks and stop conditions](#12-risks-and-stop-conditions)
13. [Open questions](#13-open-questions)

---

## 1. Scope

### 1.1 In scope

Two or more human beings, **not necessarily in the same room and not necessarily at
the same time**, taking turns at one world. The world is a save file. The server
holds a bounded pool of save files and a rule about who may take which.

**Out of scope, deliberately:** simultaneous play (that is `MULTIPLAYER_PLAN.md`);
a shared fog of war; per-player inventory or per-player map memory; full server-side
validation of saves ([§9](#9-the-trust-boundary) says why that is the wrong goal);
and anything needing two `RogueGame`s or two processes.

### 1.2 What changed in the revision, and why it is not just an added section

The first draft assumed pass-and-play: one browser, one keyboard, several people
around it. That made the *engine* the whole feature and put the cost at ~310 lines.

It is now a server-mediated pool. Two things follow that the first draft got wrong:

1. **The load path is bigger than the death path.** In pass-and-play the handover
   happens inside a live process where `HandleReincarnation` is one call away. Across
   a network it happens in a *cold* process that must restore 4.6 MB of JSON and then
   discover it has no living player. That code does not exist and the naive version of
   it is actively broken ([§3](#3-the-load-path-the-actual-work)).
2. **§1's old assumption — same room — was load-bearing for the design and is now
   false.** Consequences: hidden information is genuinely impossible (§9), the
   outgoing player genuinely cannot keep playing (§6), and the world genuinely keeps
   existing between sessions, which is the entire appeal.

The first draft's §10 listed "local relay cannot hide anything" as a risk. It was
right and understated: it is not a limitation of the transport, it is a property of
the mode.

### 1.3 The overlap with `MULTIPLAYER_PLAN.md`

**One server.** This design needs a Node process with a writable directory that the
static site can POST to. `MULTIPLAYER_PLAN.md` §7.3 already established that a Node
server on a VPS is the chosen shape for multiplayer, and that the `Dockerfile` is
**not** the deploy path (the site ships from `.github/workflows/pages.yml`). **Put
the relay pool on the same box as the multiplayer authority** rather than inventing
a second deployment. This is the one place the two plans must be reconciled, and it
should be reconciled before either is scheduled.

---

## 2. What already exists

### 2.1 `HandleReincarnation` is most of a handover

Read it. `RogueGame.HandleReincarnation` **[v]**, in order:

1. stop ambience; if `s_Options.maxReincarnations <= 0` or the player declines
   `AskForReincarnation()`, stop the music and **return**;
2. LIMBO music, a "preparing reincarnations" screen;
3. six `FindReincarnationAvatar` calls — random actor, random living, random undead,
   random follower, killer, zombified;
4. `CompileDistrictFunFacts` — a district briefing to read while choosing;
5. an avatar menu, `UI_WaitKey` in a loop, `Escape`/`n` declines;
6. and then the part that matters:

```
avatar.controller = new PlayerController();
this.PrepareActorForPlayerControl(avatar);

this.m_Player = avatar;
this.m_Session.currentMap = avatar.location.map;
this.m_Session.scoring.startNewLife(this.m_Session.worldTime.turnCounter);
...
for (let dx…) for (let dy…) for (const m of world.getDistrict(dx, dy).maps)
    m.setAllAsUnvisited();
...
this.UpdatePlayerFOV(this.m_Player);
this.ComputeViewRect(this.m_Player.location.position);
this.ClearMessages();
```

Every one of those lines is something a relay needs, already shipped:

| line | what it gives |
|---|---|
| `avatar.controller = new PlayerController()` | the stranger is now "the player" |
| `PrepareActorForPlayerControl(avatar)` | clears the AI's orders, wakes it, makes it playable |
| `m_Player = avatar` | the 427 `m_Player` reads now mean the incoming player |
| `m_Session.currentMap = avatar.location.map` | the view, the input and the clock anchor move with them |
| `scoring.startNewLife(turnCounter)` | points, achievements, kills and sightings reset; the life clock re-bases |
| `setAllAsUnvisited()` on **every map of every district** | the new player starts blind, minimap included |

**The blind handover is free, and it is the most valuable thing this mode gets for
nothing.** `Tile.isVisited` and `Tile.isInView` are shared `Map` state, not
per-player **[v]**, so "the last player's notes do not carry over" is one call that
already happens. The opposite — *inheriting* the map memory — would need fog per
viewer across the **151** `IsVisibleToPlayer` sites, which `MULTIPLAYER_PLAN.md` §9
names as the thing that forces separate processes. **Recommendation: blind, and do
not revisit it.** §9 explains why the transport cannot fix this anyway.

### 2.2 Nothing destroys the world at death

So nothing has to be snapshotted, copied or rehydrated. **[v]**

- `KillActor` sets `deadGuy.isDead = true`, and only later does
  `deadGuy.location.map!.removeActor(deadGuy)` and `addCorpse(corpse)`.
- The `Session`, the `World`, all 56 maps of a 3×3 city, `worldTime`, `Scoring`, the
  uniques, the raid calendar and every AI's `MemorizedSensor` are untouched.
- The world is regenerated only by `StartNewGame`, which is called from the main menu.
- `Session.save` already writes all of it: **4.6 MB of JSON** (quoted from
  `MULTIPLAYER_PLAN.md` §7.2's measurement), ~5 s to load **[v]**.

**So a relay run is an ordinary save file, and there is no relay-specific save
format.** That is the reason §10's estimate is as small as it is.

### 2.3 The sweep already tolerates a successful handover

`advancePlayDistrict` **[v]**:

```ts
if (this.m_Player.isDead && !this.anyPlayerAlive)
    await this.HandleReincarnation();

if (!this.m_IsGameRunning || this.m_HasLoadedGame ||
    (this.m_Player.isDead && !this.anyPlayerAlive))
    return;
```

Both tests are re-evaluated after `HandleReincarnation` returns. Once it has rebound
`m_Player` to a live avatar, `m_Player.isDead` is false, the `return` does not fire,
and the `do…while` over the map turn continues. **[d]** — read from both halves, not
executed. The handoff window itself is not a re-entrancy hazard: there is no live
player during the gate, but the gate is a straight-line `await` inside
`HandleReincarnation`, so nothing else is running. **[d]**

`MULTIPLAYER_PLAN.md` §8 Phase 1 is what made this legible: before `anyPlayerAlive`
existed, this loop ended the run on the outgoing player's death.

### 2.4 And one hazard it does not tolerate

`advancePlayDistrict`, step 2.1 **[v]**:

```ts
if (district === this.m_Session.currentMap?.district) {
    this.m_Session.worldTime.turnCounter++;
    …
}
```

`district` is the parameter, captured before `AdvancePlay(map, sim)` ran.
`HandleReincarnation` reassigns `m_Session.currentMap`. If the incoming avatar is in
a **different district**, that identity test is false for the rest of the sweep, so
**the world clock stops** — day/night, `OnNewDay`/`OnNewNight`, the raid calendar —
while the new player plays out the turn. The next `GameLoop` iteration recovers, so
the damage is bounded to one sweep. **[d]**

It cannot fire today, precisely because of §4.1: the avatar is always in the dead
player's own district. **It is the price of lifting that restriction.**

---

## 3. The load path: the actual work

**This is the section the revision is about.** Everything in §2 is already written.
This is not.

### 3.1 The ordering inside `KillActor` is the whole problem

Read the three statements in order **[v]**:

```
KillActor:
  deadGuy.isDead = true;                       // 1
  …
  await this.PlayerDied(killer, reason);       // 2
  …
  deadGuy.location.map!.removeActor(deadGuy);  // 3
  …
  deadGuy.location.map!.addCorpse(corpse);     // 4
```

**At statement 2 the dead player is still in `map.actors`.** `isDead` is already
`true`, but `removeActor` has not run. So the two possible upload moments differ:

| | **at statement 2** (inside `PlayerDied`) | **at statement 4** ✅ **decided** |
|---|---|---|
| `players[]` in the save | `[theDeadPlayer]` | **`[]`** |
| `Corpse` in the save | **none** | **present, with the player's whole inventory** |
| what `LoadGame` binds | a corpse | nothing |

**Decided: upload at statement 4, after `addCorpse`. Keep the corpse.** §3.3 is why
that is also the *cheaper* option, which is not what this document said when it was
written.

### 3.2 Why nobody has hit this before

`CheckAutoSaveTime` bails on `this.m_Player.isDead` **[v]**, and the manual save key
is only reachable from inside the play loop. **So the engine has never written a save
whose player is dead, and never had to restore one.** This is not a bug report waiting
to happen; it is an unexercised state that the relay mode is the first client of, and
both upload moments are states the engine has never produced. `[d]`

### 3.3 What the corpse actually brings, verified

Not a design inference — four things checked:

1. **`Corpse.deadGuy` is a `readonly Actor`** **[v]** — a *strong* reference, and the
   graph's `corpsesList` carries it. So the dead player is still fully present in the
   restored world: name, doll, skill table, inventory, and everything they were
   carrying. They are not a smear; they are a person, lying there.
2. **Corpse belongings live in `map.groundInventories`**, and `optimizeBeforeSaving`
   walks exactly those **[v]**. So the loot is in the save, and the pass that walks it
   is the one that drops dead-actor references from items — which is *correct* for a
   corpse's effects and is not a problem here.
3. **`scoring.killer`, `scoring.zombifiedPlayer` and `scoring.followersWhenDied` are
   all `w.ref(...)`** **[v]** in the scoring codec. **All three round-trip.** This is
   what makes §4.2 work across a network rather than only within one process — and it
   was the one claim in that section resting on an assumption rather than a reading.
4. **`IsSuitableReincarnation` rejects `a.isDead`** **[v]**, so the corpse is correctly
   never offerable as an avatar, and the `RANDOM_ACTOR` world walk sees it and drops
   it. Harmless.

### 3.4 The cost of `players: []` is one stale pointer

`LoadGame` **[v]**:

```ts
reattachPlayers(this.m_Session.loadedPlayers);   // [] → nothing is reattached
this.RefreshPlayer();
this.AddMessage(new Message("LOADING DONE.", …));
this.AddMessage(new Message("Welcome back to Rogue Survivor!", …));
this.RedrawPlayScreen();
```

`RefreshPlayer` **[v]**:

```ts
for (const a of map.actors) {
    if (a.isPlayer) { this.m_Player = a; break; }
}
```

It scans `map.actors` for a player, finds none, and therefore **never assigns
`m_Player`**. And `m_Player` is declared **`m_Player!: Actor`** — a definite-assignment
assertion — and **is never set to null anywhere in the 36,735-line file** **[v]**. So
after a relay load:

- in a browser that played a previous run, `m_Player` still points at **an actor from
  the `World` that `Session.load` just replaced**;
- in a cold process — the actual relay case — `m_Player` is `undefined` despite the
  `!`.

**And `LoadGame` dereferences it twice before returning.** `RefreshPlayer` ends with
`ComputeViewRect(this.m_Player.location.position)` under an `!= null` guard that does
not help, and `RedrawPlayScreen`'s first two statements are
`this.m_Rules.canActorSeeSky(this.m_Player)` and `canActorKnowTime(this.m_Player)`
**[v]** — neither guarded. **[d]**

So the concrete failure is a stale or undefined `m_Player` reaching `RedrawPlayScreen`
immediately after a successful load. **That is the entire cost of the decided
option, and it is two lines:** clear `m_Player` before the session is swapped, and
give `LoadGame` a "bound nothing" branch that does not redraw.

**This is a correction to the estimate this document made an hour earlier.** It
recommended uploading inside `PlayerDied`, on the reasoning that `players: [corpse]`
"restores into a state the engine demonstrably survives". That reasoning compared
*save content* when the real cost driver is *what `players[]` contains* — and
`players: []` is the **cleaner** of the two, because it is an honest empty rather than
a corpse pretending to be a player. The decided option is both the better design and
the smaller change. Recorded rather than quietly fixed, because that is the same
failure mode `BROWSER_PORT_PLAN.md` documents: a plausible mechanism, never opened,
with a confident number attached.

### 3.5 The load seam, and why the resume path is smaller than estimated

`Session.adopt(json)` **[v]** is *"the only call that touches storage"* and is exactly
how `LoadGame` installs a save it did not just write. So the relay's load is:

```
fetch → Session.adopt(json) → Session.load() → reattach → take an avatar
```

`Session.load` refuses a save without a complete graph at this `GRAPH_VERSION`, which
is correct for a foreign save and needs no change **[v]**.

**The last step is `HandleReincarnation` minus the Limbo gate**, and that is worth
stating plainly because it is the difference between ~80 lines of new engine and ~10.
`FindReincarnationAvatar` reads `m_Session.currentMap!.district`, and `currentMap` is
restored from the save — **so with the district filter of §4.1 still in place, the
resume starts in the district the author died in, which is the correct default for
free.** Every subsequent step — `controller = new PlayerController()`,
`PrepareActorForPlayerControl`, `m_Player = avatar`, `currentMap = avatar.location.map`,
`startNewLife`, the world-wide `setAllAsUnvisited`, `UpdatePlayerFOV`,
`ComputeViewRect`, `ClearMessages`, `StopSimThread`/`StartSimThread` — is §2.1's
already-written code. **[d]**

**One rule for whoever writes it: the resume must run before `RedrawPlayScreen`, not
after.** §3.4 is the reason.

`Session.adopt(json)` **[v]** is *"the only call that touches storage"* and is exactly
how `LoadGame` installs a save it did not just write (`Session.adopt` is called from
`LoadGame` with `GameSaveManager.loadGame`'s result). So the relay's load is:

```
fetch the save  →  Session.adopt(json)  →  Session.load()  →  reattach  →  take an avatar
```

**Two lines to get a stranger's world on screen**, and the third step is the new part.
`Session.load` refuses a save without a complete graph at this `GRAPH_VERSION`, which
is the right behaviour for a foreign save and needs no change **[v]**.

---

## 4. The three refusals

### 4.1 The district filter

`FindReincarnationAvatar` looks world-wide **[v]** — it walks every district's every
map — and then `IsSuitableReincarnation` throws nearly all of it away **[v]**:

```ts
if (a.isDead || a.isPlayer) return false;
// same district only.
if (a.location.map!.district !== this.m_Session.currentMap!.district) return false;
```

**Net effect: the incoming player is always in the district the last one died in.**
The world walk scans ~970 actors to find the ~17 that survive. **[d]**

This is a C# line (`RogueGame.cs:22243`) and it is *correct for classic* — one
player, one district, no reason to leave. But "a stranger explores the world someone
else left" is precisely what it forbids, so **the mode's distinguishing feature is
behind this one `if`**. Across a network it matters more than it did locally: a
stranger who lands in the same district as the corpse is not exploring a world, they
are scavenging a ruin, and the difference is the whole pitch.

**The fix must be conditional, not a deletion** — mode-dependent, so classic stays
bit-identical. ~6 lines. It also has to become a *choice*: with 9 districts and a city
one player has already stripped, "spawn me anywhere" and "spawn me where I want" are
different modes ([§13](#13-open-questions) item 3).

### 4.2 Three of the six avatar modes read the *outgoing* player's data

**[v]** `FindReincarnationAvatar`:

| mode | reads | set by |
|---|---|---|
| `RANDOM_ACTOR` / `RANDOM_LIVING` / `RANDOM_UNDEAD` | the world walk | — |
| `RANDOM_FOLLOWER` | `scoring.followersWhendDied` | `PlayerDied`, from `m_Player` |
| `KILLER` | `scoring.killer` | `PlayerDied`, from `m_Player` |
| `ZOMBIFIED` | `scoring.zombifiedPlayer` | `KillActor`, from `m_Player` |

**Across a network these are a stranger's data**: `scoring.killer` is whoever killed
the uploader, `scoring.zombifiedPlayer` is the uploader's own body. So the stranger is
offered *"become the thing that killed the last player"*.

That is not a leak to be plugged — **it is the best mechanic the mode contains**, it
costs zero lines, and it is the moment the run stops feeling like a save file and
starts feeling like a story somebody lived. `scoring.killer` is only offerable while
the killer lives, because the corpse is converted and removed (§3.4), which is the
right outcome for free.

**Recommendation: keep all three, deliberately, and say so in the mode description.**
It is also the answer to "is a stranger reading someone's data?" — they are being
handed the story's antagonist, not its save file.

**All three survive a network, which was the open question and is now settled by
reading rather than by hope:** `scoring.killer`, `scoring.zombifiedPlayer` and
`scoring.followersWhenDied` are all written as `w.ref(...)` in the scoring codec and
read back through `ctx.resolve` **[v]** (§3.3 item 3). **A stranger loading a stranger's
save is offered the person who killed them.** That is not a hypothetical — it is what
the codec does today, and it is the single strongest thing about this mode.

### 4.3 Two endings are hard stops

**[v]**

- **Undead.** `PlayerDied` writes *"You die one last time... Game over!"* for
  `isUndead`. There is no undead seat in a relay pool unless that line is
  reconsidered.
- **The helicopter rescue.** `PlayerWasRescued` sets `m_PlayerWasRescued`, one of
  `GameLoop`'s three loop conditions **[v]**, and removes the player from the map. It
  is a deliberate one-way latch for the rest of that run **[v]**
  (`endgame-exit.test.ts` pins the reset in `StartNewGame`). A rescued seat is a
  **finished run**, not a death — so a rescued *last* player ends the relay cleanly,
  and a rescued *non-last* player is the interesting problem.

Across a network both get worse, because the *author's* ending decides whether their
save is uploadable at all ([§7.4](#74-when-a-save-becomes-claimable)).

---

## 5. Shape: seats, run identity, inheritance

### 5.1 Three readings of the request, and only one is a mode

**A. "Take over the body."** The stranger is offered the previous player's killer /
follower / zombified form. That is `HandleReincarnation` **unchanged**. Cost: near
zero. But it is barely a mode, and §4.1 pins the stranger to the corpse's district.
**Rejected as the mode**, kept as an avatar *option*.

**B. "The world is the story."** A new character the stranger chooses, dropped into
the city as it now is. This is the reading the request describes and the only one
where "continue someone's story, then go and explore" means anything.
**Recommended.** Its distinguishing feature requires §4.1, and inherits §2.4.

**C. "A fresh character, generated."** As B, but through `HandleNewCharacter`'s
race / gender / undead-type / skill screens instead of the avatar menu. Strictly more
freedom — and it makes the avatar chooser pointless, because if you can design a
character you do not need to be told what the last one became. **Rejected as the
default**, kept for **seat 1**, which has no previous player to inherit from.

### 5.2 What a seat is

**A seat is one person's story: one character, one life, one score.** Not
`maxReincarnations` lives.

That makes it a relay rather than a chain of solo runs, and it has a free consequence:
**`scoring.reincarnationNumber` becomes the seat index**, so the HUD line
`Avatar ${1 + reincarnationNumber}/${1 + maxReincarnations}` **[v]** already reads
"seat 2 of 4", and the save already carries it. **[d]**

**It is also the right number in the wrong place, and this is the trap.**
`Scoring.computeDifficultyRating(options, side, reincarnationNumber)` ends with
`rating /= 1 + reincarnationNumber` **[v]**. In classic that is right — a player on
their fourth life scored the same play lower. In a relay it means **seat 4 scores a
third of seat 1 for identical play**, and `HandlePostMortem` recomputes the rating at
death from the current value **[v]**, so it lands in the hi-score table. One argument
at two call sites (§10), and Phase 3 must pin it with **two seats doing identical play
scoring identically** — it ships silently and is only noticed by whoever plays last.

### 5.3 Run identity, and what is inherited

**A run needs an identity that survives death**, because the pool is keyed by it and
each death re-uploads. `Session.seed` is not it: it is derived from the clock, it is
not guaranteed unique, and it is also the RNG seed, so reusing it as an identity
invites a collision that silently overwrites somebody's story. **Mint a `runId`**
(server-side, §8) and put it in the save root — additive, `??` default, **no
`GRAPH_VERSION` bump**, the argument already written twice in this codebase
(`Session.armyHelicopterRescueMap`, `LoadedGraph.players`) **[v]**.

| # | thing | inherited | why, and what it costs |
|---|---|---|---|
| 1 | the city — 3×3, 56 maps, generated once | **yes** | nothing destroys it; 0 lines |
| 2 | the world clock and the day | **yes** | same `worldTime`; 0 lines |
| 3 | zombies, survivors, NPCs, their AI memory | **yes** | same objects; 0 lines |
| 4 | loot, barricades, fires, **the last seat's corpse and everything on it** | **yes — decided** | §3.3: `Corpse.deadGuy` is a strong `Actor` ref and the loot is in `map.groundInventories`, which `optimizeBeforeSaving` walks. 0 lines |
| 4a | **the corpse's name, face and skill sheet** | **yes** | same ref. `DescribeAvatar` prints any of it for free **[v]** |
| 5 | map memory / the minimap | **no** | `setAllAsUnvisited()` world-wide. Free, and per-player fog is the 151-site problem. **Blind is the design** |
| 6 | skills, inventory, achievements, kills | **no** | `startNewLife` resets all of them; 0 lines |
| 7 | the last seat's **killer / followers / zombie-form as avatar candidates** | **yes, deliberately** | §4.2; 0 lines, and it is the mode's best moment |
| 8 | the last seat's followers as *this* seat's followers | **no** — released | a follower cluster anchored on a corpse is a permanent AI artefact that follows the next person around. Needs an unleadering pass; **[?]** whether the AI copes with a leaderless cluster is unmeasured |
| 9 | score | one score **per seat** | `startNewLife` resets points/achievements/kills, so each seat already scores independently — *except* the divisor (§5.2) |
| 10 | difficulty rating | drifts, wrongly | `1/(1+seatIndex)` |
| 11 | the hi-score entry | per seat | says `reincarnation N`, which in a relay means "seat N" — wording |

### 5.4 Scoring

One score per seat, which `startNewLife` already gives. That answers
`MULTIPLAYER_PLAN.md` §11 item 1 **for the relay case only** — the general
shared-vs-per-player question is still open over there, and this file should not
pretend to close it.

### 5.5 An abandoned run does not time out — but the lease does

The game blocks on `UI_WaitKey`; if the author walks away mid-run, the world is
frozen at that instant, forever **[v]** (`HandlePlayerActor` parks the whole stack
below it, which `MULTIPLAYER_PLAN.md` §2.1 already records).

**The server-side lease is what turns that into something workable**, and it is the
one part of the design where the server earns its keep: an author's lock that expires
turns their abandoned run into pool content ([§7.3](#73-the-lock)). That is a
genuinely good emergent property — **the pool fills with stories people walked away
from, which is the most interesting kind of story to inherit.**

---

## 6. The handoff gate

### 6.1 Where it goes

```
KillActor → PlayerDied → HandlePostMortem (grave, pager, hi-score)
          → back in advancePlayDistrict
          → HandleReincarnation → AskForReincarnation ("Limbo", Y/N)
          → avatar menu
```

The gate goes **between `HandlePostMortem` and `AskForReincarnation`** — inside
`HandleReincarnation`, replacing the `maxReincarnations <= 0 || !AskForReincarnation()`
early-out. It is "Leave?" turned into "upload, then answer Leave?".

### 6.2 The requirement that is not obvious

If the outgoing player is still at the keyboard when the death screen appears — and
they will be, having just died — a gate that accepts `Enter` is a gate they walk
through, and the mode's premise is silently destroyed. No error, no crash, and nothing
to notice afterwards: it looks exactly like someone playing badly. **[d]**

Three requirements, all from existing evidence:

1. **Never accept `Enter`.** `NullRogueUI.ensureKey` synthesises `Enter, Escape, n, y`
   when its queue starves **[v]**, so an Enter-accepting gate is both trivially
   bypassable and untestable with the existing harness.
2. **Drain pending input first.** `endgame-exit.test.ts`'s header records the shape of
   this bug already: `Escape` means "leave" in the scores screen and "no" in Limbo,
   and `N` was added to the avatar menu's decline arm because the screen before it
   taught the opposite **[v]**.
3. **The briefing is a digest, not the pager.** `HandlePostMortem` has already paged
   the grave before the gate is reached — that belongs to the outgoing player. The
   stranger needs five lines: who, where, why, on what day, what they scored. All five
   are already set on `scoring` by `PlayerDied` and `HandlePostMortem` **[v]** —
   `deathPlace` is `"MapName"` or `"MapName at ZoneName"` **[v]**, so the briefing can
   name the district.

   **Keeping the corpse (§3.1) buys the best line in the mode here, and it is nearly
   free: the briefing can say where the body is.** The author died in a named zone on a
   named map, `deathPlace` says so, and `setAllAsUnvisited()` means the stranger has no
   map memory to shortcut it with — so the first thing the mode asks a new player to do
   is *find a dead stranger's corpse and take their stuff.* That is a goal, not a
   loading screen, and it is worth more than any amount of tutorial text.

### 6.3 Across a network there is a fourth requirement

The gate now also has to **report an upload failure without lying**. "Uploaded" and
"upload failed" must be visibly different, and a failed upload must not silently
produce a local-only run that the player believes is in the pool. **Recommendation:
make the upload outcome explicit in the gate, and let the player continue either
way** — a lost upload is an inconvenience, and blocking them on a network is worse.

The confirm key itself: a key the game does not otherwise bind is cheap, but it has
to survive being read from the keybinding table **[?]**. A typed confirmation is
unambiguous but the codebase has no string-entry loop. Either way **a solo developer
must be able to playtest it** (§5.1 seat 1), so it cannot require a second human.

---

## 7. The server

### 7.1 What exists, and what does not

`web/server/index.ts` is `express.static` plus an `app.get("*")` SPA fallback
**[v]** — **21 lines, re-measured 2026-10-04; `MULTIPLAYER_PLAN.md` says 28 and has
drifted.** No `http.createServer`, no body parser, no `ws`, no writable data
directory, no session store. Every line of §7 is new and all of it is small.

The `app.get("*")` fallback is worth noting for the wrong reason: it does **not**
swallow `POST` (different method), but any new route must be registered **before**
it, and a `GET /api/relay/saves/:id` that misses will return `index.html` with a
200 — which the client will try to `JSON.parse`. **Every API route needs an explicit
404.** **[d]**

### 7.2 Storage: no DB, and the index is a cache

```
<data>/saves/<runId>.json        the save — authoritative
<data>/saves/<runId>.meta.json   { deaths, day, citySize, graphVersion, ruleset,
                                  uploadedAt, sizeBytes }   ~1 KB
<data>/saves/<runId>.lock        { holder, role, expiresAt }
<data>/played.json               { <hash(clientToken)>: [runId, …] }
```

**The save stays the source of truth** and the sidecar is derived at upload. But note
where `deaths` actually lives: `reincarnationNumber` is inside the scoring codec in
`specs.ts` **[v]**, i.e. **inside `graph`**, so listing it without a sidecar means
`JSON.parse`-ing 4.6 MB × 10 saves per request. **[d]** One parse per *upload* is
fine; ten per *listing* is not. The sidecar is the answer, and it should be written
from what the **server** parsed rather than from a client header, so the number in the
listing is one the server can stand behind.

### 7.3 The lock: a file, not a row

**`open(path, 'wx')` failing with `EEXIST` is the mutual-exclusion primitive.** No
memory, no race, and — unlike an in-memory lock table — **it survives a server
restart**, which an in-memory table silently does not.

```
claim:  try 'wx'  →  EEXIST  →  read; if expiresAt < now, unlink and retry once
heartbeat: rewrite the lock with a new expiresAt
release: unlink
```

A lock file holding `{ holder, role, expiresAt }` covers both cases the design needs:
`role: "author"` (the uploader, refreshed on every upload) and `role: "player"` (a
stranger playing it).

**The heartbeat has to live in the browser, not the engine.** It is a `setInterval`
in the page — no `RogueGame` cooperation needed, and none should be added, because
the engine is a 36,735-line `await`-nest that would have to be told about HTTP.

**And it has to survive a backgrounded tab**, which browsers throttle to ≥1/min and
may freeze outright. **[v]** for the throttle, **[?]** for the freeze. So the TTL is a
real number and a real decision: **30-minute lease, 60-second heartbeat.** A tab
backgrounded past the lease loses it — which is arguably correct, because the player
was not playing — but it means someone who alt-tabs comes back to find their story
taken. The alternative (never steal; a crashed run needs a manual reclaim) is worse:
after ten crashed games the pool is empty and only a shell can fix it.

**One pool property falls out of this for free and is worth stating as a feature:**
an author's abandoned run's lease expires, and its save becomes claimable. **The pool
fills with stories people walked away from.** (§5.5.)

### 7.4 When a save becomes claimable

This is the rule the whole thing turns on, and it has three states:

| state | how it gets there | listed? |
|---|---|---|
| **authored** | uploaded; author holds an `author` lock | **no** |
| **released** | the author finished, quit, or their lease expired | yes |
| **claimed** | a stranger holds a `player` lock | no |

**Uploads happen at every death, not once at the end.** That is what makes the pool
self-healing: a run that is abandoned still appears, at whatever point it reached,
because the last upload is already there. Keyed by `runId`, so each upload replaces
the previous one rather than accumulating.

**A consequence to accept:** a stranger's first experience of a story is a save taken
at a *random* moment in someone's run, possibly mid-fight. The briefing ([§6.2](#62-the-requirement-that-is-not-obvious))
is what makes that legible, and it is not optional.

### 7.5 Eviction, and the pool size

Ten saves × 4.6 MB = **~46 MB on disk**. Fine. But:

- **Cap the upload size.** 4.6 MB is a 3×3 city at the default; `citySize` is an
  option and the maximum was **not measured** **[?]**. A relay save over some ceiling
  (say 12 MB) is rejected, and `citySize` should be capped in relay mode so the pool's
  size is predictable rather than discovered.
- **Evict oldest-unlocked first.** Simple, and one wrinkle: a save being *written* must
  not be evictable or listable, so upload to a temp name and `rename` — atomic on
  every platform that matters. **[d]**
- **The interesting alternative** is evicting the *shallowest* run first (fewest
  deaths), which biases the pool toward deep stories — what a browsing player wants.
  But it means a day-2 death can never contribute, and new players are exactly who
  this mode is for. **Recommendation: oldest-unlocked for v1**, and note the trade
  rather than pretend it is obvious.

### 7.6 Endpoints

| method | path | notes |
|---|---|---|
| `POST` | `/api/relay/session` | mints `{ clientToken, runId }`. **rate-limited by IP** ([§8](#8-identity-why-not-the-ip-hash)) |
| `POST` | `/api/relay/saves/:runId` | upload/replace. Body **streamed to disk** — `req.pipe(createWriteStream)` — because `express.json()`'s default 100 KB limit is 46× too small and holding 4.6 MB per concurrent upload in memory is how a small box falls over |
| `GET` | `/api/relay/saves` | reads sidecars only. Omits locked and already-played |
| `POST` | `/api/relay/saves/:runId/claim` | acquire the lock; returns the save bytes, or `409` |
| `PUT` | `/api/relay/saves/:runId/heartbeat` | renew |
| `POST` | `/api/relay/saves/:runId/release` | unlock |
| — | everything else under `/api/` | **explicit 404**, because the SPA fallback will otherwise answer with `index.html` and a 200 ([§7.1](#71-what-exists-and-what-does-not)) |

**A listing needs `graphVersion` and `ruleset` in the sidecar**, or the client cannot
grey out a save its build would refuse. `Session.load` already refuses a
version-mismatched save **[v]**, which is correct — but discovering that by *loading*
it is a crash, not a greyed-out row.

### 7.7 Compression

4.6 MB of JSON gzips hard. `CompressionStream('gzip')` is available in modern
browsers, so the client can compress and Node can decompress with `zlib`. Worth ~10×
bandwidth on a small VPS. **[?]** the ratio — measure, do not assume; JSON with 970
actors and thousands of tiles may not compress as well as JSON usually does.

---

## 8. Identity: why not the IP hash

The proposal was to hash the IP to enforce one play per person. **It does not work,
in three separate ways, and one of them is a self-inflicted denial of service on
your own players.** It is worth being precise because the failure is silent.

1. **A hash of an IPv4 address is not a secret.** The space is 2³². The entire
   address space is enumerable in minutes, so an unsalted (or weakly salted) hash in a
   sidecar is a lookup, not a pseudonym. If the hashes are ever published — in a log,
   in a bug report, in a screenshot — every one of them reverses.
2. **NAT breaks it, and this is the one that will actually happen.** Carrier-grade
   NAT, a corporate VPN, a university, a mobile carrier: one address, thousands of
   people. "One play per IP" means **the first person behind that NAT to play locks
   out everyone else behind it.** To an actual player this looks like the feature
   working.
3. **Dynamic assignment leaks it.** A player whose address changes can replay freely,
   so the rule does not hold where it matters and does hold where it is merely
   annoying.

### 8.1 What to use instead

**A server-minted client token.** 32 random bytes, returned by
`POST /api/relay/session`, stored hashed in `played.json`. It survives NAT, survives
IP rotation, needs no PII, and survives a server restart.

**And the token must never be serialised into the save.** This is the trap: a relay
save carries `runId`, and if it also carried the token, loading a stranger's save
would make you *impersonate them* — their "already played" marks would apply to you,
and you would be unable to play anything. **The token is device state, not run state.**
`localStorage` in, `localStorage` out, never through `Session.save`.

### 8.2 The honest framing

**"One play each" is a convention, not access control.** It stops the case you
actually have — your friend replaying the same story — and it stops nobody who is
trying, because a determined client can re-mint. Build it as a courtesy gate, say so
in the docs, and do not let it grow a UI that implies it is enforcement.

**Where the IP *is* the right tool: rate-limiting the mint endpoint.** A short-lived,
coarse, abuse-shaped identity is exactly what an address is good at. And optionally,
"someone on your network already played this" is a nice honest use of the same
coarse signal — the truthful version of what the hash was reaching for.

---

## 9. The trust boundary

**The server accepts an arbitrary 4.6 MB JSON blob from a stranger and hands it to
the next stranger's browser, which parses it with a hand-written recursive graph
reader.** That is the shape of the risk, and it is not hypothetical.

| risk | why it is real | mitigation |
|---|---|---|
| **JSON bomb / deep nesting** | the *victim's* tab is the real parser. `readSessionGraph` is a recursive walk, and a 100k-deep object costs nothing to upload and overflows the stack on load **[?]** — V8's `JSON.parse` is iterative, so the depth survives parsing and detonates in the reader | **the one non-obvious item.** A depth check on the parsed object at upload, iterative with an explicit stack, ~10 lines. Size caps do not catch it; a deep bomb is small |
| **Malformed save crashes the victim** | half a load is worse than none — the engine says so about itself **[v]** | `Session.load` already refuses an incomplete graph **[v]**. Validate `graphVersion` and `graph` presence at upload so it never reaches the pool |
| **Content injection** | the save carries actor names, item names, `Message` strings, `TextFile` graves — all drawn on another player's screen | low severity, but real. `Content-Type: application/json` and `Content-Disposition: attachment` so a browser never renders it as a document |
| **Body-size memory exhaustion** | `express.json()` defaults to 100 KB; raising it to 12 MB means 12 MB per concurrent request | **stream to disk** ([§7.6](#76-endpoints)), never buffer |
| **Poisoned listings** | a client that lies about `deaths` | the sidecar is derived from what the **server** parsed, not from a header ([§7.2](#72-storage-no-db-and-the-index-is-a-cache)) |
| **Cross-version saves** | a save from a newer build half-loads on an older one | `graphVersion` in the sidecar so the listing can grey it out; `Session.load` refuses it anyway |
| **The service worker** | `public/sw.js` is cache-first over `/assets/*` **[v]** | a `/api/` request on another origin is not `/assets/*`, so it is safe — but state it, because `MULTIPLAYER_PLAN.md` §7.3 already found the SW hostile to same-origin traffic of this kind |

**What is deliberately not being built: full server-side save validation.** The
server would need the entire class graph to run `readSessionGraph`, and that is a
large attack surface bought for a property nobody needs. Structural validation plus
size and depth limits is the right trade, and it should be said out loud rather than
left as an apparent omission.

---

## 10. Where it lives, and what it costs

### 10.1 A third axis, not `GameMode`

`GameMode` is read through `Rules.has*` predicates — `hasCorpses`, `hasInfection`,
`hasImmediateZombification`, `hasEvolution`, `hasZombiesInSewers` **[v]** — and
`Ruleset` is read through `Feature`, with `feature-flags.test.ts` forbidding any file
outside the registry from comparing against a `Ruleset` member **[v]**. A relay is
neither: it changes who holds the controller and when the run ends, and nothing about
corpses, infection, evolution or content. Adding it to `GameMode` would put a fourth
case in front of every `Rules.has*` call and would make `descGameMode` — which is
written into the **hi-score table** and into `NewGameConfig`'s persisted record
**[v]** — carry a meaning it does not have.

**Recommendation: `RelayConfig` on `Session`**, parallel to how `Ruleset` was
separated from `GameMode`. The picker cost is real and should be scheduled, not
discovered **[v]**: `HandleSelectRulesetAndMode` has exactly two rows and `row = 1 - row`
flips between them; `NewGameConfig` persists a `{ruleset, mode}` **name pair** matched
by `indexOf`, half-remembered → `null`; `applyLastNewGameConfig` seeds both axes for
quick start; `tests/ruleset-picker.test.ts` pins the lot. A third row makes `row` a
real index rather than a flip — **and the seat count has to be remembered too, or
`Shift+Enter` quick start silently starts a one-seat relay.**

### 10.2 The inventory

Every `where` cell is a symbol.

| # | change | where | size |
|---|---|---|---|
| 1 | `RelayConfig` on `Session`: seat count, seat index, per-seat log | `Session.ts` | ~40 |
| 2 | root save keys `relay`, `relaySeatIndex`, `relayLog`, **`runId`** | `Session.save` / `Session.load` | ~30 |
| 3 | **`LoadGame` with nothing bound**: clear `m_Player` before the swap, skip the redraw (§3.4) | `LoadGame` / `RefreshPlayer` | **~6** |
| 4 | **the resume path: load, then take an avatar** (§3.5) — `HandleReincarnation` minus the Limbo gate | new, beside `LoadGame` | **~25** |
| 5 | `HandleRelayHandoff` — the gate of §6 | new, beside `HandleReincarnation` | ~120 |
| 6 | the handoff condition replaces the `maxReincarnations <= 0 \|\| !AskForReincarnation()` early-out | `HandleReincarnation` | ~15 |
| 7 | seat 1 uses character creation; seats 2..N the avatar chooser | `HandleReincarnation` / `GameLoop` | ~20 |
| 8 | mode-conditional district filter | `IsSuitableReincarnation` | ~6 |
| 9 | cross-district avatar must not freeze the world clock (§2.4) | `advancePlayDistrict` step 2.1 | ~6 |
| 10 | "no seats left" as the loop's termination predicate | `GameLoop`'s `while` | ~3 |
| 11 | release the dead seat's followers | `PlayerDied` or the gate | ~20 |
| 12 | difficulty divisor and post-mortem / hi-score wording for a seat | `computeDifficultyRating` call sites, `HandlePostMortem`, `RedrawPlayScreen` | ~15 |
| 13 | the picker's third row and the remembered seat count | `HandleSelectRulesetAndMode`, `NewGameConfig` | ~40 |
| 14 | **client**: upload at each death, the gate, the pool browser, the lease heartbeat | new module beside `main.ts` | ~250 |
| 15 | **server**: the seven endpoints, the pool, the lock, the played ledger, the validator | `web/server/` | ~350 |

**~945 lines, of which ~600 are new files on either side of the wire.** Up from 310 in
the pass-and-play draft; the increase is almost entirely items 14 and 15, the
transport, which is what §1.2 said.

**Items 3 and 4 came down from ~100 to ~31** after the corpse decision, because
`players: []` turned out to be the cleaner state (§3.4). This is the second time in
this document that a cost estimate moved on a re-read rather than on new work, and
both times it moved *down*; §12's first row is the standing instruction to write the
tests before believing the table.

**Item 2 needs no `GRAPH_VERSION` bump**, and the argument is already written twice in
this codebase **[v]**. The migration is one `?? default` on read, pinned from both
sides: a save with **no** key reads as not-a-relay, and a save with an **explicitly
empty** relay reads as empty and does **not** resurrect a seat — the second line is the
one `??` gets wrong when written carelessly, and it is what stops a finished relay from
coming back with a seat.

### 10.3 Item 10 contradicts a written decision and must say so

`anyPlayerAlive` deliberately scans the world rather than reading a stored roster,
because "every desynchronisation shows up as a game that refuses to end or ends early
— the two worst failures available" **[v]**. A relay's seat count is the **first
stored roster in the codebase**. The resolution is that the two answer different
questions and both should exist:

- `anyPlayerAlive` → *"is anybody playing right now"*. Keep it, scanned.
- the relay ledger → *"is anybody left to hand to"*. Stored, because it must survive
  the moment when nobody is playing.

The loop condition is the conjunction. Anyone who later "simplifies" one into the
other reintroduces a game-over bug in one direction or the other, so **both sites get
a comment**, which is what `anyPlayerAlive`'s docblock is for.

---

## 11. Phases

Each phase ends with a stated gate. `npm run verify` is green at every one.

### Phase 0 — the two claims, as two tests

`web/tests/relay-phase0-handover.test.ts` and `web/tests/relay-phase0-resume.test.ts`.
Drive the **real** paths — the same discipline as `endgame-exit.test.ts`, which drives
the real `GameLoop` rather than writing its own.

**Test 1, the death-time handover:**

| assertion | what it settles |
|---|---|
| the `World` object is the **same instance** before and after | §2.2 |
| `worldTime.turnCounter` did **not** rewind | §2.2 |
| a second `PlayerController` exists and is **not** the corpse | §2.1 |
| `findPlayerActors(world)` has length 1 afterwards | the roster does not accumulate corpses |
| **the new avatar is in a different district from the corpse** | **§4.1** |
| every map in the world has **zero visited tiles** at handover | §2.1, the blind promise |
| the map-turn sweep **continued** rather than returning | §2.3 |
| the world clock **advanced** through the rest of the sweep | **§2.4** |

**Test 2, the resume** — the one the revision is about, and the one that should be
written first. Take the save at **`addCorpse`**, i.e. the decided moment:

| assertion | what it settles |
|---|---|
| a save taken after `addCorpse`, **adopted and loaded cold**, restores a complete world | §3.5 |
| `players[]` in that save is exactly `[]` | §3.1 — pins the ordering inside `KillActor` |
| **`getCorpseAt` on the death tile returns a corpse whose `deadGuy` is the dead player, and that actor carries the inventory they died with** | **§3.3 items 1–2 — the reason the decision was made, and the one that would fail if `Corpse.deadGuy` ever became a weak or name-only reference** |
| `scoring.killer` and `scoring.zombifiedPlayer` **resolve to actors in the restored world** | §3.3 item 3, §4.2 — the cross-network claim, pinned |
| the naive `LoadGame` leaves `m_Player` **unchanged** — stale in a warm process, `undefined` in a cold one — and `RedrawPlayScreen` then dereferences it | **§3.4, the finding, written as a test before it is fixed** |
| after the resume path runs, there is exactly one live `PlayerController` and `anyPlayerAlive` | the fix |
| the resumed world is the **same object graph** as the saved one — same city, same clock, same corpse | §2.2 |
| the resumed avatar is not in the dead player's district | §4.1 |

**Both mutation-checked, both directions**, because a test that cannot fail is a
comment with a build step:

- making `IsSuitableReincarnation`'s district test a no-op **fails the district
  assertion**. If that mutation cannot be made to fail, **item 8 is unnecessary and
  §10.2's table is wrong** — that is the point of writing it first.
- reintroducing the frozen clock **fails the clock assertion**.
- for Test 2: **making `Corpse.deadGuy` non-serialised** (dropping it from the corpse
  codec) **fails the corpse assertion**. That is the mutation that matters most in this
  document, because it is the one that would silently delete the thing the mode is for
  — and it would pass every other test here.
- for Test 2: **restoring the `m_Player` clear** after the fix (i.e. reverting item 3)
  **fails the stale-`m_Player` assertion**.

Watch for the harness hazard `MULTIPLAYER_PLAN.md` §8 Phase 0 recorded: a wrong input
seam **hangs rather than fails**, and the hang cannot be timed out because the loop
starves the macrotask queue. Throwing from the input seam is the only stop.

### Phase 1 — the ledger, engine-side, no UI, no server

`RelayConfig`, the save keys including `runId`, the two `??` migrations, and the
seat-index arithmetic of §5.2. This is `MULTIPLAYER_PLAN.md` Phase 1 in miniature, and
it is separate for the same reason: expect the suite to surface reads that quietly
meant "the player" rather than "whoever is acting", and that is the point of running
it.

**Gate:** a relay save round-trips with three seats spent; a pre-relay save reads as
not-a-relay; an explicitly-empty relay reads as empty and does not resurrect a seat.

### Phase 2 — the server

The pool, the sidecar, the lock, the validator, the played ledger, the seven endpoints.

**Gate, in the shape this codebase uses:** upload a real save; assert the listing shows
its death count; assert a second claim is refused with `409`; assert the lock survives
a **server restart** (stop, start, claim again — the in-memory version of this design
fails here and it should fail in the test before it fails in production); assert an
expired lock is stealable and an unexpired one is not; assert an over-cap body is
rejected; assert a 100k-deep graph is rejected at upload; assert a listing for a
client that already played something omits it.

**This phase needs no engine work at all**, which is why it is second and not last: it
is the whole transport, it is testable without a browser, and it de-risks §9 before any
of it can reach a player.

### Phase 3 — the gate and the resume

`HandleRelayHandoff`, the drain, the digest, the upload outcome, the decline path,
seat 1's character creation, and the resume path of item 4.

**Gate, in the shape of `endgame-exit.test.ts`:** drive a real death; assert the gate
is drawn; assert **no key the outgoing player could have been holding gets through**;
assert the wrong key does nothing and does not fall through to the avatar menu; assert
the right key uploads and hands over; assert a failed upload is visible and does not
block play; assert declining ends the run at the main menu exactly as today. Every one
of these is a race rather than an await, for the reason that file's header gives.

### Phase 4 — the inherited world

Followers released (§5.3 row 8), the undead and rescue endings (§4.3), the difficulty
divisor (§5.2), post-mortem and HUD wording (§5.3 rows 10–11).

**Gate:** a **three-seat relay** runs headless through three deaths with per-seat
rather than per-session assertions — three scores, one clock that never rewound, one
world instance. Plus the specific one: **two seats doing identical play score
identically**, which fails today.

### Phase 5 — the pool browser

`GET /api/relay/saves`, the listing screen, claim, and the lease heartbeat.
`MULTIPLAYER_PLAN.md` Phase 4's persistence gate applies here too: *"kill the server
mid-session, restart, and a client reconnects into a world whose future rolls match
the pre-restart future"* — because `DiceRoller.state` is **not in the save graph at
all** (`grep -c DiceRoller specs.ts` is 0) **[v]**, so a relay save's future rolls
restart from the seed. For a single-player run that is a save/load annoyance; **for a
pool where the story is the point, it means two people playing the same uploaded save
get different futures.** That is the honest framing of what `MULTIPLAYER_PLAN.md`
Phase 4 has to fix, and it should be quoted there.

### Phase 6 — deployment

A VPS with a writable directory, serving both this and the multiplayer authority
([§1.3](#13-the-overlap-with-multiplayerplanmd)). CORS from the Pages origin. Decide
the service-worker question and write down which way.

---

## 12. Risks and stop conditions

| risk | why it is real | what to do |
|---|---|---|
| **Phase 0's corpse assertion fails** | §3.3 is four separate readings. If `Corpse.deadGuy` is not actually carried by the corpse codec, or the loot is not in `groundInventories`, **the decided option loses its entire justification** and the fallback in §13 item 1 applies | Phase 0 decides it, and the mutation is the one that matters: **drop `deadGuy` from the corpse codec.** Every other test here would pass |
| **Phase 0's stale-`m_Player` assertion fails to reproduce** | §3.4 is **[d]**. If something already clears `m_Player`, or `RedrawPlayScreen` turns out to be guarded, item 3 is unnecessary | Phase 0 decides it. The assertion is *expected to hold* before the fix — if it does not, the finding is wrong |
| **Phase 0 disproves §2** | §2 is a reading of an existing method, and `MULTIPLAYER_PLAN.md` §8 Phase 0 exists because reading is not running | **Stop.** Re-derive before scheduling Phase 1 |
| **The item-8 mutation cannot be made to fail** | it would mean the district filter is not what pins the avatar, and §4.1's analysis is wrong | Phase 0 decides it; do not proceed on the reading |
| **The item-9 clock freeze is larger than 6 lines** | §2.4 is **[d]** | Phase 0 measures it. If large, fall back to same-district-only |
| **The lease outlives a tab that is merely backgrounded** | **[v]** for the throttle, **[?]** for the freeze; 30 min / 60 s is a judgement, not a measurement | Shorter TTL and a visible countdown, or accept it. The alternative — never steal — leaks the pool permanently |
| **The IP rule locks out a campus** | §8.2. CGNAT is the common case, not the exotic one | Client token, not an address. IP only for rate limiting |
| **A crafted save reaches a player's browser** | §9 | size cap, depth check, structural validation, `Content-Disposition: attachment`, explicit API 404s |
| **The outgoing player walks through the gate** | §6.2. Silent, and indistinguishable from bad play | never accept `Enter`; drain first; Phase 3's gate asserts it |
| **`reincarnationNumber` as seat index leaks into scoring** | `rating /= 1 + reincarnationNumber` reaches the hi-score table | Phase 4's "two seats, identical play, identical score" |
| **A stored roster is the first in the codebase, against a written decision** | `anyPlayerAlive`'s docblock argues for scanning | §10.3: both exist, the conjunction is the loop condition, both sites get a comment |
| **A pool with nobody in it** | every save is authored by someone currently playing, so the pool is only as full as the concurrent population | the abandoned-lease path (§5.5) fixes the *steady state*; the cold-start problem is real and should be seeded by hand |
| **`played.json` is lost** | it is server state that must not be lost, and losing it means everyone can replay everything | it lives in the same directory as the saves; back up the directory, not the process |
| **The static site cannot reach the server** | Pages + a cross-origin VPS API is CORS, not same-origin, and `MULTIPLAYER_PLAN.md` §7.3 already found the SW hostile to same-origin traffic of this kind | Phase 6, and reuse that finding rather than rediscovering it |

---

## 13. Open questions

Each is a decision, not a measurement, and each has a recommendation so it can be
settled in one line rather than re-derived.

1. ~~**Does the uploaded save contain the previous player's corpse?**~~ **DECIDED
   2026-10-04: yes. Upload after `addCorpse`.** See [§3.1](#31-the-ordering-inside-killactor-is-the-whole-problem).
   Two things are worth keeping from the reasoning, because both cut against the
   decision having been obvious:
   - The prize is **verified, not assumed** ([§3.3](#33-what-the-corpse-actually-brings-verified)):
     `Corpse.deadGuy` is a strong `Actor` reference and the loot lives in
     `map.groundInventories`, which `optimizeBeforeSaving` walks. Phase 0 pins both,
     and the mutation that would delete the feature is *dropping `deadGuy` from the
     corpse codec* — which every other test in the document would pass.
   - **It is also the cheaper option**, which is the opposite of what this file
     recommended before the decision was made. `players: []` is a cleaner state than
     `players: [corpse]`, and the resume is `HandleReincarnation` minus its Limbo gate.
     See [§3.4](#34-the-cost-of-players--is-one-stale-pointer).
2. **Does a stranger get to see anything the last player found?** Recommendation:
   **no** (§2.1) — and note that the transport cannot change this anyway (§9), so it
   is a design property rather than a limitation.
3. **Does the incoming player choose the district?** §4.1 forbids it today. "Anywhere"
   and "your choice" are different modes, and "your choice" is better: it lets the
   stranger walk into the district the author *avoided*. **Recommend: yes**, and fall
   back to same-district if item 9 is large.
4. **Are the previous seat's followers released, or inherited?** §5.3 row 8.
   **Recommend: released.** Nobody wants a stranger leading a cluster of zombies' ex-
   friends.
5. **Is `deaths` shown as the seat count or as something richer?** The sidecar can
   carry day, city size and ruleset for free. **Recommend: show `deaths` and `day` —
   day is the one number that makes "continue someone's story" legible, because it
   tells you how much of the game has already happened.**
6. **Does the helicopter rescue end the relay?** §4.3. **Recommend: a rescue always
   ends that seat and consumes the run's one clean ending, so an early rescue ends the
   relay early.** The alternative contradicts the flag's one-way-latch design.
7. **Can a seat be undead?** §4.3. **Recommend: no undead seats in v1**, because that
   *"You die one last time"* line is load-bearing for the undead run's framing and
   reconsidering it is a change to *that* mode.
8. **Is one-play-each per browser or per person?** §8. It is per browser, it is a
   convention, and it is defeatable. **Recommend: ship it as a convention and say so**,
   rather than growing a UI that implies enforcement.
9. **Does the pool show in-progress runs at all?** §7.4 says no (author-locked). But
   then a first-time visitor sees an empty pool unless someone is playing.
   **Recommend: no — but seed the pool by hand at launch**, because a story with a
   corpse in it and a day-6 clock is worth ten empty listings.
10. **Who plays the abandoned runs?** Nobody, unless the lease path works (§5.5). This
    is the mode's long-term supply and it is entirely unmeasured. **[?]**

---

## Citation trust boundary

Written and revised 2026-10-04 against `658a9c0`. Symbols, not lines.

**Read and confirmed today:** `KillActor`'s four-step ordering (`isDead` →
`await PlayerDied` → `removeActor` → `addCorpse`) · **`Corpse.deadGuy` being a
`readonly Actor`, a strong reference** · **`Corpse` having no inventory of its own** ·
**the scoring codec writing `killer`, `zombifiedPlayer` and `followersWhenDied` as
`w.ref(...)` and reading them back through `ctx.resolve`** · `Map.groundInventories`
and `optimizeBeforeSaving` walking it · **`m_Player!: Actor` being a definite-assignment
assertion and never nulled anywhere in the file** · `RedrawPlayScreen`'s first two
statements dereferencing `m_Player` unguarded · `reattachPlayers` returning `[]` for an
empty roster and skipping nulls · `RefreshPlayer`'s loop and the absence of an `isDead`
test · `LoadGame`'s sequence including the two welcome messages · `CheckAutoSaveTime`'s
`m_Player.isDead` bail · `scoring.deathPlace`'s `"MapName at ZoneName"` form ·
`Session.adopt`'s documented role · `HandleReincarnation`'s fourteen steps ·
`FindReincarnationAvatar`'s world walk and five branches · `IsSuitableReincarnation`'s
six filters · `advancePlayDistrict`'s two guard expressions and step 2.1's identity test
· `GameLoop`'s three loop conditions · `anyPlayerAlive` · `PlayerDied`'s undead line and
its `scoring` writes · `HandlePostMortem`'s grave, pager and `register` ·
`startNewLife`'s ten resets · `Scoring.totalPoints`, `survivalPoints`, and
`computeDifficultyRating`'s `rating /= 1 + reincarnationNumber` · `Map`'s four
visit/view methods · `PlayerController` as a marker type · `Session.save`'s root object
· `sessionGraphRoot`'s `players` and its `GRAPH_VERSION` argument · `NewGameConfig`'s
name-pair persistence · `HandleSelectRulesetAndMode`'s two-row flip ·
`NullRogueUI.ensureKey`'s idle cycle · `endgame-exit.test.ts`'s `Escape`/`N` history ·
`m_PlayerWasRescued` and its reset · `GameSaveManager`'s shape and `MAX_SLOTS` ·
`web/server/index.ts`, re-measured at **21** lines · `Feature`/`Ruleset` registry
discipline · `specs.ts` carrying `reincarnationNumber` inside the scoring codec.

**Derived, not run:** §2.3 (the sweep continuing) · §2.4 and its bound · §3.4's
stale-`m_Player` walkthrough into `RedrawPlayScreen` · §3.5's "the resume is
`HandleReincarnation` minus the gate" · §7.1's SPA-fallback hazard · §8's enumerability
argument · §9's recursion claim about `readSessionGraph` · §12's cold-start problem.

**Two estimates in this document were revised downward on a re-read rather than on new
work** (§3.4 and §10.2), which is the same failure mode
`BROWSER_PORT_PLAN.md` §1.1a records: a plausible mechanism, never opened, with a
confident number attached. Both times the mechanism turned out to be *simpler* than
the reading suggested. Neither revision was found by reasoning harder — both were found
by opening the next file (`Corpse.ts`, `specs.ts`) rather than the next argument.

**Not checked:** §9's depth-bomb exploitability (needs an actual test, which is why
Phase 2's gate includes one) · §7.7's compression ratio · `citySize`'s maximum, so the
upload cap's number is a guess · whether a genuinely unbound key exists for §6.3 ·
leaderless follower clusters (§5.3 row 8) · whether `Session.load`'s refusal path
handles a foreign `graphVersion` gracefully or merely returns false.

**Deliberately not re-measured:** the `MULTIPLAYER_PLAN.md` derived counts (151
`IsVisibleToPlayer` sites, 427 `m_Player` references, 970 actors, 56 maps, 4.6 MB) are
quoted from that file. None of §10.2's line estimates depends on one.
# Fan suggestions compendium — the 2010–2011 backlog

> **What this is.** A transcription of
> [the Suggestions Compendium](https://roguesurvivor.proboards.com/thread/12/suggestions-compendium)
> — the index thread `ibazly` maintained on the
> [Rogue Survivor Fan Forums](https://roguesurvivor.proboards.com/) from
> 25 Nov 2010, last edited 25 Jul 2011 — plus a **status column per item**,
> measured against this port rather than assumed.
>
> **Why it is here.** The forum is the only written record of what the player
> base actually asked for, and it predates every fork: Still Alive, Alpha 10,
> and this port. Roughly **half of it is already implemented**, and almost none
> of it is implemented *for the reason the forum asked* — so a reader who
> assumes "suggested ⇒ missing" will re-propose things that shipped years ago,
> and a reader who assumes "suggested ⇒ present" will assume the wrong version
> of it. The status column exists to stop both.

---

## How the status column was measured

> **Re-measured 2026-10-03 against `master` `8d5dfc8`.** The marks below were written on
> 2026-10-01; ~90 commits have landed since, and **five verdicts are wrong** — three now
> point the opposite way, one rests on a citation that never existed, and one is
> understated. Each is corrected inline with a **[corrected 2026-10-03]** marker.
>
> **The method paragraph below is itself stale and would now mis-score items.** It says
> "Named in `src/`" — a directory that is untracked since `cfd19ae` — and it would score
> every item that now lives in `web/src/gameplay/GameItems.ts` or
> `web/src/engine/CharacterAppearance.ts` rather than in `web/data/*.csv` as "No". Two
> items did exactly that. It also says the `Feature` flags and the generator lists
> "differ", which is no longer true: `PENDING_WIRING` is empty
> (`FeatureFlags.ts:221`, pinned by `feature-flags.test.ts:202` — "158 call sites across
> 38 features"), so **every flag has a reader**. Re-measure with a symbol search over
> `web/src/`, not a CSV column presence check.

Four states, and the distinction between the last two is the whole point:

| Mark | Meaning |
|---|---|
| **Partly** | A recognisable relative is present, but not the suggestion. Usually a different item with a similar silhouette — a `crowbar` where the thread asked for a `metal pipe`. |
| **No** | Nothing in the tree. Not necessarily *wanted* — §"Deliberately no" below. |
| **—** | Could not be determined without a design decision rather than a lookup. Left blank rather than guessed. |

**Every mark below was read out of the tree**, not inferred from the item's
name. The method per class:

- **Items** — the id lists in `web/data/Items_*.csv`. That directory is the
  *merged* superset (vanilla + Still Alive), so an "In" here means the row is
  present and bound, not that it is reachable in a ruleset.
- **Actors** — `web/data/Actors.csv`.
- **Buildings** — the `make*Building` / `Make*` generator methods in
  `web/src/gameplay/generators/`, cross-checked against the `Feature` flags in
  `FeatureFlags.ts`. **A flag with no generator is not a building**, and the two
  lists differ; the marks reflect the generators.
  **[corrected 2026-10-03] The second half of that is now false** — the lists no
  longer differ, because `PENDING_WIRING` is empty by design and test-pinned. A flag
  with no generator is now a bug, not a category.
- **Mechanics** — a targeted search of `web/src/`. A suggestion with **no**
  mark on this row is not "not searched": it was searched and the search
  returned nothing. That distinction is the lesson `BROWSER_PORT_PLAN.md` §1.6
  records, so it is stated rather than assumed.

**Thread links.** ProBoards has migrated URLs twice; the compendium's own links
are the old `index.cgi?board=sugs&action=display&thread=N` form and still
resolve, but they are unaesthetic and fragile. Every link here is the current
`/thread/<id>/<slug>` form, taken from the board index itself rather than
guessed from the slug pattern.

---

## 1. Mechanics and gameplay

The compendium's own "User Suggestions" list, in its order. Twenty-three
threads, each with an author.

| # | Suggestion | By | Thread | Status |
|---|---|---|---|---|
| 1 | Fortifications that block eyesight | toupz | [thread 11](https://roguesurvivor.proboards.com/thread/11/block-eyesight-fortification) | **Partly** — shelves block LOS (`MapGenerator.ts:334` documents the stairway case); no barricade type does. The thread's author confirms shelving was the only vanilla thing that did it, and `Deon` replied "it has been implemented" the same week. |
| 4 | Rooftop levels | toupz | [thread 19](https://roguesurvivor.proboards.com/thread/19/new-levels-rooftop) | **No** — **[corrected 2026-10-03] the stated evidence was false**: `generateShoppingMallUpperLevel` and `generateShoppingMallParking` both exist (`makeShoppingMall.ts:618`, `:1020`) and `upperlevel` matches throughout. The verdict survives on the narrower and correct argument that there is still no *general* rooftop tier — only the mall has one. |
| 5 | Player becoming a follower | ibazly | [thread 21](https://roguesurvivor.proboards.com/thread/21/reincarnating-follower) | Needs investigation. |
| 7 | Constructing crossbow bolts | deon | [thread 23](https://roguesurvivor.proboards.com/thread/23/crossbow-bolts-breaking-objects) | **No** — `makeItemBoltsAmmo` spawns bolts as loot; there is no whittling/crafting verb in the tree. |
| 9 | Zombie infection spreads | flag | [thread 34](https://roguesurvivor.proboards.com/thread/34/infection-contagion) | **No** — no contagion term in `web/src/`. Infection is bite→wound only. |
| 11 | Dual wielding | toupz | [thread 49](https://roguesurvivor.proboards.com/thread/49/dual-wielding) | **No** — no second-weapon slot concept. |
| 12 | Pets | torchedearth | [thread 43](https://roguesurvivor.proboards.com/thread/43/pets) | **No** — `UnintelligentAnimalAI` exists for rabbits and chickens, but nothing binds one to a player. |
| 13 | Pushing causes stunning | Aaron | [thread 41](https://roguesurvivor.proboards.com/thread/41/pushing-idea) | **No** — **[corrected 2026-10-03] this was `Partly` on a citation that does not exist.** `Attack.ts` has no stun field; its fields are exactly `kind, verb, hitValue, hit2Value, hit3Value, damageValue, staminaPenalty, disarmChance, range` (`:16-24`). Line 63 is `if (this.range === 1) return this.range;` inside `efficientRange` — the word "stun" appears only in a comment about the stun *gun* the content pack adds. Repo-wide the only "stun" hits are that item's verb string and its sounds. **There is no stun mechanic in the port.** |
| 15 | Multiplayer | brash | [thread 164](https://roguesurvivor.proboards.com/thread/164/multiplayer) | **No** — design only. See [`MULTIPLAYER_PLAN.md`](MULTIPLAYER_PLAN.md), which is this suggestion's answer. |
| 16 | Relationships with NPCs | toupz | [thread 146](https://roguesurvivor.proboards.com/thread/146/npc) | **Partly** — `Faction` relations and `trust` exist; nothing deeper. |
| 17 | Zombie evolution and skills | tons0phun | [thread 163](https://roguesurvivor.proboards.com/thread/163/undead-evolution-zombie-skills) | **Partly** — **[corrected 2026-10-03]** `Skills.csv` has **30** rows, not 29 (this file's own §7 says 30; the two contradicted each other). `BOWS_EXPLOSIVES` is present; no per-undead evolution tree. |
| 18 | More starting options | — | [thread 161](https://roguesurvivor.proboards.com/thread/161/more-starting-roles-play-role) | **Partly** — difficulty at creation landed via `Feature.DifficultyAtCreation`; free choice of any actor did not. |
| 19 | Zombie progression and degradation | jacos | [thread 150](https://roguesurvivor.proboards.com/thread/150/zombie-progression-new-abilities-type) | **Partly** — overlapping with #17. |
| 20 | Sandbox gameplay | xander | [thread 153](https://roguesurvivor.proboards.com/thread/153/sandbox-type-fort-trading-crafting) | **No** — the `GameMode` axis exists but has no sandbox mode. |
| 21 | Customizing avatars | galdis | [thread 151](https://roguesurvivor.proboards.com/thread/151/modest-proposal) | **Partly** — **[corrected 2026-10-03] was `No`, and it shipped.** `web/src/engine/CharacterAppearance.ts` (236 lines) offers six selectable doll layers — `eyes, skin, head, torso, legs, shoes` — with a magnified live preview, plus `tests/character-appearance.test.ts`. Landed in `4e48ed3` / `9fd6e01` / `376716c`. **Not** full 3D-modifier customisation, so *Partly* rather than *In*. |

---

## 2. Weapons

[thread 16](https://roguesurvivor.proboards.com/thread/16/weapon-suggestions),
opened by **doomer**. 51 entries, transcribed in the compendium's order with
their attributed authors.

Verified against `web/data/Items_MeleeWeapons.csv`, `Items_RangedWeapons.csv`
and `Items_Explosives.csv`.

| Suggestion | By | Status |
|---|---|---|
| Bazooka | toupz | **Partly** — `RANGED_GRENADE_LAUNCHER` is the same verb |
| M1 Garand old rifle | toupz | **No** |
| 9mm pistol | toupz | **Partly** — `RANGED_PISTOL` exists; not a 9mm |
| Throwing knives | toupz | **No** |
| Net traps | toupz | **No** |
| Magnum | Aaron | **Partly** — `RANGED_REVOLVER` / `RANGED_KOLT_REVOLVER` |
| AK-47 | Aaron | **Partly** — `RANGED_ARMY_RIFLE1..4` |
| Throwing spears | zebiolizard2 | **Partly** — `MELEE_IMPROVISED_SPEAR`, but not thrown |
| Riot shield | Nakovalen | **Partly** — **[corrected 2026-10-03] was `No`.** `ItemID.POLICE_RIOT_SHIELD = 197` (`GameItems.ts:437`), sprite at `GameImages.ts:1067`, equippable (`RogueGame.ts:22688`), with a ported block roll (`Rules.ts:275,294,2512`) and `tests/police-riot-shield.test.ts`. Landed in `8a63964` + `07e951`. |
| Improvised shield | Nakovalen | **No** |
| Firearm scopes / sniper rifles | Aaron | **Partly** — `RANGED_PRECISION_RIFLE`, `RANGED_ARMY_PRECISION_RIFLE` |
| Pellet gun | ibazly | **No** |
| Butcher knife | ibazly | **Partly** — `MELEE_KITCHEN_KNIFE` |
| Ball launcher | ibazly | **No** |
| Croquet mallet | ibazly | **Partly** — `MELEE_HUGE_HAMMER` |
| Gun turret | ibazly | **No** |
| Zombie stun gun | transcendenttyrant | **No** |
| Proximity mines | transcendenttyrant | **No** |
| Chains | Ve | **No** |
| Metal pipe | Ve | **Partly** — `MELEE_CROWBAR` |
| Hatchet | Ve | **Partly** — `MELEE_SMALL_HAMMER` |
| Hedge clippers | Ve | **No** |
| Compound bow | Ve | **No** |
| Recurve bow | Ve | **No** |
| Compound crossbow | Ve | **No** |
| Recurve crossbow | Ve | **No** |
| Taser | Nakovalen | **Partly** — `RANGED_STUN_GUN` |
| Assault rifle | Nakovalen | **Partly** — the army rifles |
| Light machine gun | Nakovalen | **Partly** — `RANGED_MINIGUN` |
| Heavy machine gun | Nakovalen | **Partly** — the minigun again |
| Firecrackers | Nakovalen | **No** |

**Read the "Partly" column as a real answer.** Most of these were *not*
ignored: Still Alive independently added the fire axe, machete, chainsaw,
pipe wrench, pickaxe and barbed-wire bat, and four army rifles. The
attribution question is answered differently and better than the forum could
have asked it — the content tables are `web/src/gameplay/data/`.

---

## 3. Buildings, stores and locations

[thread 17](https://roguesurvivor.proboards.com/thread/17/building-suggestions),
opened by **toupz**. 41 entries.

Verified against the generator methods in
`web/src/gameplay/generators/` — **not** the `Feature` flags, ~~several of which
have no generator behind them yet.~~
**[corrected 2026-10-03] That is no longer true of either list.** `PENDING_WIRING` is
empty (`FeatureFlags.ts:221`) and `feature-flags.test.ts:202` pins "158 call sites across
38 features", so every flag has a reader and a generator with no flag would now be the
anomaly. The *method* — trust the generator over the flag — is still the right one; the
justification for it was stale.

| Suggestion | By | Status |
|---|---|---|
| Clothing store | toupz | **Partly** — `makeShopBuilding` + 7 `ShopType`s, none of them clothing |
| Multiple-story buildings | Aaron | **Partly** — Mall and Basements |
| Warehouses | zebiolizard2 | **No** |
| Cathedrals | zebiolizard2 | **Partly** — `makeChurchBuilding` |
| Towers | zebiolizard2 | **No** |
| Railway station | zebiolizard2 | **Partly** — `makeSubwayStationBuilding` |
| School | zebiolizard2 | **No** |
| Museum | zebiolizard2 | **No** |
| Port | zebiolizard2 | **No** |
| Clubs | zebiolizard2 | **No** |
| Factory | zebiolizard2 | **No** |
| Fort | zebiolizard2 | **No** |
| Auto repair shop | zebiolizard2 | **No** — **[corrected 2026-10-03] was `In`, and it is not implemented.** `MakeMechanicWorkshop` appears only in planning comments (`TownBuilding.ts:564`, `makeClinicBuilding.ts:25`); `grep -rn makeMechanicWorkshop web/src/` → 0 hits. The business cascade deliberately leaves case 3 empty — *"case 3 is the mechanic workshop, which is vanilla and not part of this port's set, so that arm is left empty rather than transliterated"* (`BaseTownGenerator.ts:559-563`). It is the last unported generator. |
| Zoo | zebiolizard2 | **Partly** — `makeAnimalShelterBuilding` |
| Mansion | zebiolizard2 | **No** |
| Power plant | zebiolizard2 | **No** |
| Radio tower | zebiolizard2 | **No** |
| Stadium | zebiolizard2 | **Partly** — `makeSportsCourts` (basketball + tennis) |
| Cinema | zebiolizard2 | **No** |
| Hotel | zebiolizard2 | **No** |
| Unfinished buildings | zebiolizard2 | **No** |
| Sex shop | toupz | **No** |
| Isolated houses outside the city | blaz | **No** |
| Laboratories | blaz | **Partly** — the CHAR underground map |
| Rural district | Nakovalen | **No** |
| Motels | zebiolizard2 | **No** |
| Bomb shelter | curtisjack10 | **No** |

---

## 4. Miscellaneous inventory

[thread 20](https://roguesurvivor.proboards.com/thread/20/inventory-suggestions),
opened by **demios** in the compendium's transcription (the thread itself is
attributed to `ibazly` on the board index — the compendium says otherwise, and
the discrepancy is left as the compendium has it). 24 entries.

| Suggestion | By | Status |
|---|---|---|
| Propane tank | demios | **No** |
| Walkie talkie | zebiolizard2 | **Partly** — `TRACKER_POLICE_RADIO`, `TRACKER_BLACKOPS` |
| Soda / drinks | zebiolizard2 | **Partly** — `MEDICINE_ENERGY_DRINK` |
| Toolbox | zebiolizard2 | **No** |
| Radio transmitter | zebiolizard2 | **Partly** — `TRACKER_ZTRACKER` |
| GPS | zebiolizard2 | **Partly** — `makeItemBlackOpsGPS` |
| Scope | Nakovalen | **No** |
| Silencer | Nakovalen | **No** |
| Laser sight | Nakovalen | **No** |
| Hockey mask | Nakovalen | **No** |
| Helmet | Nakovalen | **Partly** — `ARMOR_ARMY_BODYARMOR` |
| Shield | toupz | **Partly** — **[corrected 2026-10-03] was `No`.** See §2's "Riot shield" row: `POLICE_RIOT_SHIELD` is a real, equippable item with a ported block roll and a dedicated test (`8a63964`, `07e951`). |
| Army helmet | toupz | **Partly** — as above |

---

## 5. Enemies and NPCs

[thread 38](https://roguesurvivor.proboards.com/thread/38/npc-enemy-suggestions),
opened by **zebiolizard2**, in the compendium's four groupings. 20 entries.

Verified against `web/data/Actors.csv` (30 rows) and the AI controllers.

### Passive / civilian / friendly

| Suggestion | By | Status |
|---|---|---|
| National Guard medics | zebiolizard2 | **No** |
| SWAT | zebiolizard2 | **No** |
| Nurses and doctors | zebiolizard2 | **No** |
| Firefighters | obiworm | **No** |
| Paramedics | obiworm | **No** |
| TV crew | obiworm | **No** |

### "Human" enemies

| Suggestion | By | Status |
|---|---|---|
| Looter | zebiolizard2 | **No** |
| Crazed civilian | zebiolizard2 | **Partly** — `DERANGED_PATIENT` |
| CHAR preacher | zebiolizard2 | **No** |
| Rogue National Guard | nakovalen | **Partly** — `ARMY_NATIONAL_GUARD` exists as friendly |
| Rednecks | nakovalen | **No** |

### Zombies / monsters

| Suggestion | By | Status |
|---|---|---|
| Regenerating zombie | zebiolizard2 | **No** |
| The Blob | zebiolizard2 | **No** |
| Elemental zombie | zebiolizard2 | **No** |
| Sludger | curtisjack10 | **No** |

### Other NPCs — *"may be hostile, may not be"*

| Suggestion | By | Status |
|---|---|---|
| CHAR experiments | otakucore | **No** |
| CHAR test subjects | otakucore | **No** |

---

## 6. Construction

[thread 28](https://roguesurvivor.proboards.com/thread/28/constructing-suggestions),
opened by **ibazly**. 19 entries.

| Suggestion | By | Status |
|---|---|---|
| Buildable and Lockable Doors | ibazly | **No** |
| Melee weapons out of improvised weapon stacks | ibazly | **Partly** — `MELEE_IMPROVISED_CLUB` / `_SPEAR` exist as items; no crafting verb |
| Spiked fortification | zebiolizard2 | **Partly** — `TRAP_BARBED_WIRE` is a trap, not a barricade |
| Weak wall | zebiolizard2 | **No** |
| Whittling planks into improvised weapons | zebiolizard2 | **No** |
| Chests | zebiolizard2 | **Partly** — wardrobes and fridges are containers |
| Dummy | Aaron | **No** |
| Beds | toupz | **In** — `makeObjBed` |
| Wooden cots | toupz | **No** |
| Crates | toupz | **Partly** — `makeObjJunk` |
| Signs | toupz | **No** |
| Stool / chair | toupz | **In** — `makeObjChair` |
| Unbreakable / stronger barricades | transcendenttyrant | **Partly** — `DoorWindow.BASE_HITPOINTS` tiers, no invulnerable class |
| Gunhole barricade | transcendenttyrant | **No** |
| Spiked pitfall | p40thawk | **Partly** — `TRAP_SPIKES` |
| Wedge | p40thawk | **No** |
| Shotshell trap | p40thawk | **No** |
| Razor wire | p40thawk | **Partly** — `TRAP_BARBED_WIRE` |
| Ballistae | p40thawk | **No** |

> **The recurring shape in this table is a trap-vs-barricade confusion**, and
> it is worth naming once rather than eight times. **[corrected 2026-10-03: "Four" is
> wrong — three of the four have any `Partly` object. Gunhole barricade is marked `No`,
> so nothing buildable-and-lethal exists for it.]** Four suggestions — spiked
> fortification, gunhole barricade, spiked pitfall, razor wire — describe an
> object that is *both* buildable *and* lethal. The engine has two separate
> concepts (`ItemTrapModel` and `ItemBarricadeMaterialModel`) and the forum
> kept asking for the intersection. Unifying it is a real design question, not
> four missing items.

---

## 7. Skills

[thread 29](https://roguesurvivor.proboards.com/thread/29/skill-suggestions),
opened by **Aaron**, three pages and 35 replies.

The compendium deliberately does **not** enumerate these — Aaron's note is that
relisting everyone's suggestions "would be a bit cumbersome, so I am merely
going to leave the link". That is the correct call and it is preserved here
rather than papered over with a guess.

What the port has: **29 skills** in `web/data/Skills.csv` (30 rows, two of
which are the `_FIRST_LIVING` / `_FIRST_UNDEAD` progression markers), one
`SKILL_*` constant each, bound through `Rules.SKILL_*` statics and pinned by
`tests/skills-data.test.ts` (53 cases, and a 43-entry assertion on the C#
assignments). Seven values are corrected from the C# defaults. **[corrected
2026-10-03] two corrections here.** The skill count was **28**; the code's
`SkillID._COUNT` is **29**. And *"One rename landed: `BOWS` → `BOWS_EXPLOSIVES`"* is
**not a rename** — **both** rows are in the CSV (`data/Skills.csv:4` `"BOWS"`, `:31`
`"BOWS_EXPLOSIVES"`), and `SkillID` still has only `BOWS = 2` (`Skills.ts:23`) with no
`BOWS_EXPLOSIVES`. It is an **added row**, and the rename it was described as is
**still unstarted** — this is the one genuinely open item in the table.

Note the undead half is **already a small evolution system** — `Z_EATER`,
`Z_GRAB`, `Z_INFECTOR`, `Z_TRACKER` and the `Z_LIGHT_*` / `Z_STRONG` /
`Z_TOUGH` variants are gated behind infection thresholds. That is closer to
#17 and #19 than anything else in the tree, and it is a place where "already
implemented" is easy to miss because the thread's word for it was
"evolution".

---

## 8. Events

[thread 44](https://roguesurvivor.proboards.com/thread/44/new-events), opened by
**Nakovalen**.

Also deliberately not enumerated — Nakovalen's note is that posting each item
with a description "would be a bit tedious", so only the link survives.

What the port has, all of it from Still Alive rather than from this thread:
Black Ops raids from day 14 (`Feature.BlackOpsRaid`), CHAR research raids from
day 21 (`Feature.CHARResearchRaid`), and a helicopter-rescue endgame
(`Feature.HelicopterRescue`).

---

## Where each thread actually stands

Not a status report, a pointer to the thread list, for anything the compendium
did not index. The compendium covers 22 of the board's 124 threads; the rest
are on [the board index](https://roguesurvivor.proboards.com/board/11/suggestions)
across seven pages. A few worth knowing about that predate or postdate it:

- [Ideas/Improvements thread](https://roguesurvivor.proboards.com/thread/284/ideas-improvements-thread) (2013)
- [Alpha 9 bug/suggestion](https://roguesurvivor.proboards.com/thread/287/alpha-9-bug-suggestion) (2013)
- [In-game speed improvement](https://roguesurvivor.proboards.com/thread/269/game-speed-improvement) (2012)
- [Water & hydration](https://roguesurvivor.proboards.com/thread/262/water-hydration) (2012)
- [Infinite reincarnation](https://roguesurvivor.proboards.com/thread/325/infinite-reincarnation) (2014)
- [Ability to start as any character + toggle sanity](https://roguesurvivor.proboards.com/thread/323/ability-character-option-toggle-sanity) (2014)
- [Any plans for ports to other platforms?](https://roguesurvivor.proboards.com/thread/334/any-plans-ports-platforms) (2014)

The last one is the only item on this list that has actually been answered.


---
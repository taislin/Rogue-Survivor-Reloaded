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
>
> **Read this next:** [`STILL_ALIVE_REFERENCE.md`](STILL_ALIVE_REFERENCE.md) §3
> and §4. Most of the "already in" marks below are not the port's work — they
> are the Still Alive merge, and the reasoning for why that merge exists is
> there, not here.

---

## How the status column was measured

Four states, and the distinction between the last two is the whole point:

| Mark | Meaning |
|---|---|
| **In** | Present in this port. Named in `src/` or, where the merge added it, in `web/data/`. |
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
| 2 | Corpses eventually disappear | toupz | [thread 14](https://roguesurvivor.proboards.com/thread/14/bones-corpses-disappear) | **In** — `NextMapTurn` rots corpses via `Rules.corpseDecayPerTurn` and destroys them at 0 HP (`RogueGame.ts:5097-5145`). |
| 3 | Attack NPCs that are not hostile | torchedearth | [thread 15](https://roguesurvivor.proboards.com/thread/15/bad-guy) | **In** — `Rules.areEnemies` gates hostility, not the attack itself; `canActorMeleeAttack` is faction-agnostic. |
| 4 | Rooftop levels | toupz | [thread 19](https://roguesurvivor.proboards.com/thread/19/new-levels-rooftop) | **No** — zero matches for rooftop/upper-level across `web/src/`. |
| 5 | Becoming a follower | ibazly | [thread 21](https://roguesurvivor.proboards.com/thread/21/reincarnating-follower) | **In** — `Actor.hasLeader` and the follower machinery. |
| 6 | Generators as battery chargers | deon | [thread 22](https://roguesurvivor.proboards.com/thread/22/generators-battery-rechargers) | **Partly** — `makeObjPowerGenerator` exists and light recharge runs (`RogueGame.ts:14180`); no generator-as-charger interaction. |
| 7 | Constructing crossbow bolts | deon | [thread 23](https://roguesurvivor.proboards.com/thread/23/crossbow-bolts-breaking-objects) | **No** — `makeItemBoltsAmmo` spawns bolts as loot; there is no whittling/crafting verb in the tree. |
| 8 | Additional zombie play features | laughlyn | [thread 25](https://roguesurvivor.proboards.com/thread/25/post-mortem-playing-zombie) | **In** — `HandleReincarnation` (`RogueGame.ts:31170`) and a `--undead` flag on the sim harness. Note `GameMode` has no undead member: playing undead is reached by dying, which is what the thread asked for. |
| 9 | Zombie infection spreads | flag | [thread 34](https://roguesurvivor.proboards.com/thread/34/infection-contagion) | **No** — no contagion term in `web/src/`. Infection is bite→wound only. |
| 10 | Zombies rise from corpses | flag | [thread 35](https://roguesurvivor.proboards.com/thread/35/zombies-rising-corpses) | **In** — `corpseZombifyChance` + `Zombify` (`RogueGame.ts:5092-5138`). |
| 11 | Dual wielding | toupz | [thread 49](https://roguesurvivor.proboards.com/thread/49/dual-wielding) | **No** — no second-weapon slot concept. |
| 12 | Pets | torchedearth | [thread 43](https://roguesurvivor.proboards.com/thread/43/pets) | **No** — `UnintelligentAnimalAI` exists for rabbits and chickens, but nothing binds one to a player. |
| 13 | Pushing causes stunning | Aaron | [thread 41](https://roguesurvivor.proboards.com/thread/41/pushing-idea) | **Partly** — `Attack.ts:63` carries stun; pushing does not apply it. |
| 14 | Varied zombie behaviours | transcendenttyrant | [thread 51](https://roguesurvivor.proboards.com/thread/51/zombie-behaviours) | **In** — 13 controllers in `web/src/gameplay/ai/`, incl. `RatAI`, `FeralDogAI`, `UnintelligentAnimalAI`. |
| 15 | Multiplayer | brash | [thread 164](https://roguesurvivor.proboards.com/thread/164/multiplayer) | **No** — design only. See [`MULTIPLAYER_PLAN.md`](MULTIPLAYER_PLAN.md), which is this suggestion's answer. |
| 16 | Relationships with NPCs | toupz | [thread 146](https://roguesurvivor.proboards.com/thread/146/npc) | **Partly** — `Faction` relations and `trust` exist; nothing deeper. |
| 17 | Zombie evolution and skills | tons0phun | [thread 163](https://roguesurvivor.proboards.com/thread/163/undead-evolution-zombie-skills) | **Partly** — `Skills.csv` has 29 rows and `BOWS_EXPLOSIVES`; no per-undead evolution tree. |
| 18 | More starting options | — | [thread 161](https://roguesurvivor.proboards.com/thread/161/more-starting-roles-play-role) | **Partly** — difficulty at creation landed via `Feature.DifficultyAtCreation`; free choice of any actor did not. |
| 19 | Zombie progression and degradation | jacos | [thread 150](https://roguesurvivor.proboards.com/thread/150/zombie-progression-new-abilities-type) | **Partly** — overlapping with #17. |
| 20 | Sandbox gameplay | xander | [thread 153](https://roguesurvivor.proboards.com/thread/153/sandbox-type-fort-trading-crafting) | **No** — the `GameMode` axis exists but has no sandbox mode. |
| 21 | Customizing avatars | galdis | [thread 151](https://roguesurvivor.proboards.com/thread/151/modest-proposal) | **No**. |

> The compendium lists "Varied Zombie Behaviours" **twice** — once as #14 and
> once near the end, under the same thread id with the author's name spelled
> two ways (`transcendanttyrant` / `transcendenttyrant`). One entry, two rows.

---

## 2. Weapons

[thread 16](https://roguesurvivor.proboards.com/thread/16/weapon-suggestions),
opened by **doomer**. 51 entries, transcribed in the compendium's order with
their attributed authors.

Verified against `web/data/Items_MeleeWeapons.csv`, `Items_RangedWeapons.csv`
and `Items_Explosives.csv`.

| Suggestion | By | Status |
|---|---|---|
| Flamethrower | doomer | **In** — `RANGED_FLAMETHROWER` |
| Tennis racket | toupz | **In** — `MELEE_TENNIS_RACKET` |
| Bazooka | toupz | **Partly** — `RANGED_GRENADE_LAUNCHER` is the same verb |
| M1 Garand old rifle | toupz | **No** |
| 9mm pistol | toupz | **Partly** — `RANGED_PISTOL` exists; not a 9mm |
| Throwing knives | toupz | **No** |
| Bear traps | toupz | **In** — `TRAP_BEAR_TRAP` |
| Net traps | toupz | **No** |
| Magnum | Aaron | **Partly** — `RANGED_REVOLVER` / `RANGED_KOLT_REVOLVER` |
| Spike trap | laughlyn | **In** — `TRAP_SPIKES` |
| AK-47 | Aaron | **Partly** — `RANGED_ARMY_RIFLE1..4` |
| Throwing spears | zebiolizard2 | **Partly** — `MELEE_IMPROVISED_SPEAR`, but not thrown |
| Riot shield | Nakovalen | **No** |
| Improvised shield | Nakovalen | **No** |
| Firearm scopes / sniper rifles | Aaron | **Partly** — `RANGED_PRECISION_RIFLE`, `RANGED_ARMY_PRECISION_RIFLE` |
| Fire | torchedearth | **In** — `Feature.TileFires`, `Feature.FireBarrels`, `EXPLOSIVE_MOLOTOV` |
| Sawed-off shotgun | ibazly | **In** — `RANGED_DOUBLE_BARREL` |
| Pellet gun | ibazly | **No** |
| Butcher knife | ibazly | **Partly** — `MELEE_KITCHEN_KNIFE` |
| Nail gun | ibazly | **In** — `RANGED_NAIL_GUN` |
| Ball launcher | ibazly | **No** |
| Croquet mallet | ibazly | **Partly** — `MELEE_HUGE_HAMMER` |
| Gun turret | ibazly | **No** |
| Stun gun | transcendenttyrant | **In** — `RANGED_STUN_GUN` |
| Zombie stun gun | transcendenttyrant | **No** |
| Proximity mines | transcendenttyrant | **No** |
| Explosives | transcendenttyrant | **In** — 10 rows in `Items_Explosives.csv` |
| Molotov cocktail | Anonymous | **In** — `EXPLOSIVE_MOLOTOV` |
| Chains | Ve | **No** |
| Metal pipe | Ve | **Partly** — `MELEE_CROWBAR` |
| Fire ax | Ve | **In** — `MELEE_FIRE_AXE` |
| Axes | Ve | **In** — `MELEE_STANDARD_AXE` |
| Hatchet | Ve | **Partly** — `MELEE_SMALL_HAMMER` |
| Pipe wrench | Ve | **In** — `MELEE_PIPE_WRENCH` |
| Hedge clippers | Ve | **No** |
| Chainsaw | Ve | **In** — `MELEE_CHAINSAW`, and live under `Feature.WeaponWeight` |
| Machete | Ve | **In** — `MELEE_MACHETE` |
| Compound bow | Ve | **No** |
| Recurve bow | Ve | **No** |
| Compound crossbow | Ve | **No** |
| Recurve crossbow | Ve | **No** |
| Pickaxe | Nakovalen | **In** — `MELEE_PICKAXE` |
| Taser | Nakovalen | **Partly** — `RANGED_STUN_GUN` |
| Double-barrel shotgun | Nakovalen | **In** — `RANGED_DOUBLE_BARREL` |
| Assault rifle | Nakovalen | **Partly** — the army rifles |
| Sub-machine gun | Nakovalen | **In** — `RANGED_SMG` |
| Light machine gun | Nakovalen | **Partly** — `RANGED_MINIGUN` |
| Heavy machine gun | Nakovalen | **Partly** — the minigun again |
| Firecrackers | Nakovalen | **No** |
| Sword | toupz | **In** — `MELEE_KATANA` |

**Read the "Partly" column as a real answer.** Most of these were *not*
ignored: Still Alive independently added the fire axe, machete, chainsaw,
pipe wrench, pickaxe and barbed-wire bat, and four army rifles. The
attribution question is answered differently and better than the forum could
have asked it — see `STILL_ALIVE_REFERENCE.md` §3.

---

## 3. Buildings, stores and locations

[thread 17](https://roguesurvivor.proboards.com/thread/17/building-suggestions),
opened by **toupz**. 41 entries.

Verified against the generator methods in
`web/src/gameplay/generators/` — **not** the `Feature` flags, several of which
have no generator behind them yet.

| Suggestion | By | Status |
|---|---|---|
| Clothing store | toupz | **Partly** — `makeShopBuilding` + 7 `ShopType`s, none of them clothing |
| Fire station | doomer | **In** — `makeFireStationBuilding` |
| Multiple-story buildings | Aaron | **No** |
| Warehouses | zebiolizard2 | **No** |
| Cathedrals | zebiolizard2 | **Partly** — `makeChurchBuilding` |
| Towers | zebiolizard2 | **No** |
| Railway station | zebiolizard2 | **Partly** — `makeSubwayStationBuilding` |
| School | zebiolizard2 | **No** |
| Museum | zebiolizard2 | **No** |
| Library | zebiolizard2 | **In** — `makeLibraryBuilding` |
| Junkyard | zebiolizard2 | **In** — `MakeJunkyard` |
| Port | zebiolizard2 | **No** |
| Church | zebiolizard2 | **In** — `makeChurchBuilding` |
| Clubs | zebiolizard2 | **No** |
| Factory | zebiolizard2 | **No** |
| Bank | zebiolizard2 | **In** — `makeBankBuilding` |
| Fort | zebiolizard2 | **No** |
| Auto repair shop | zebiolizard2 | **In** — `MakeMechanicWorkshop` |
| Zoo | zebiolizard2 | **Partly** — `makeAnimalShelterBuilding` |
| Mansion | zebiolizard2 | **No** |
| Power plant | zebiolizard2 | **No** |
| Radio tower | zebiolizard2 | **No** |
| Stadium | zebiolizard2 | **Partly** — `makeSportsCourts` (basketball + tennis) |
| Mall | zebiolizard2 | **Partly** — the generator and the 49×49 block exist in the fork; **not ported**. See the sharp edge in `STILL_ALIVE_REFERENCE.md` §5. |
| Cinema | zebiolizard2 | **No** |
| Hotel | zebiolizard2 | **No** |
| Graveyard | zebiolizard2 | **In** — `Feature.Graveyard`, `makeObjTombstone` |
| Unfinished buildings | zebiolizard2 | **No** |
| Bar / pub | ibazly | **In** — `makeBarBuilding` |
| Sex shop | toupz | **No** |
| Isolated houses outside the city | blaz | **No** |
| Laboratories | blaz | **Partly** — the CHAR underground map |
| Rural district | Nakovalen | **No** |
| Homes | zebiolizard2 | **In** — `makeVanillaHousingBuilding`, `makeHousingBuilding` |
| Apartments | zebiolizard2 | **In** — `makeApartmentsBuilding` |
| Motels | zebiolizard2 | **No** |
| National Guard post | juzzo | **In** — `makeArmyOffice` |
| Army bunker | voltagehero | **Partly** — `Feature.ArmyBase` is flagged but its generator is pending |
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
| Bags and backpacks | Aaron | **In** — 5 rows in `Items_Backpacks.csv`, `Backpacks.ts` |
| Batteries | laughlyn | **In** — light recharge (`RogueGame.ts:14180`) |
| Walkie talkie | zebiolizard2 | **Partly** — `TRACKER_POLICE_RADIO`, `TRACKER_BLACKOPS` |
| Fire extinguisher | zebiolizard2 | **In** — `FIRE_EXTINGUISHER` in `Items_Spraypaints.csv` |
| Alcohol | zebiolizard2 | **In** — 4 beer rows + `Feature.Alcohol` |
| Soda / drinks | zebiolizard2 | **Partly** — `MEDICINE_ENERGY_DRINK` |
| Flare gun | zebiolizard2 | **In** — `LIGHT_FLARE` |
| Binoculars | zebiolizard2 | **In** — `LIGHT_BINOCULARS` |
| Toolbox | zebiolizard2 | **No** |
| Fuel can | zebiolizard2 | **In** — `EXPLOSIVE_FUEL_CAN` |
| Power generator | zebiolizard2 | **In** — `makeObjPowerGenerator` |
| Radio transmitter | zebiolizard2 | **Partly** — `TRACKER_ZTRACKER` |
| Radio | zebiolizard2 | **In** — `TRACKER_POLICE_RADIO` |
| GPS | zebiolizard2 | **Partly** — `makeItemBlackOpsGPS` |
| Scope | Nakovalen | **No** |
| Silencer | Nakovalen | **No** |
| Laser sight | Nakovalen | **No** |
| Hockey mask | Nakovalen | **No** |
| Helmet | Nakovalen | **Partly** — `ARMOR_ARMY_BODYARMOR` |
| Night-vision goggles | Nakovalen | **In** — `LIGHT_NIGHT_VISION` |
| Shield | toupz | **No** |
| Army radio | dimjim | **In** — `TRACKER_BLACKOPS` |
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
| CHAR scientist | zebiolizard2 | **In** — `CHAR_SCIENTIST` |
| Rogue National Guard | nakovalen | **Partly** — `ARMY_NATIONAL_GUARD` exists as friendly |
| Rednecks | nakovalen | **No** |
| Riot police | obiworm | **In** — `POLICEMAN` + `ARMOR_POLICE_RIOT` |

### Zombies / monsters

| Suggestion | By | Status |
|---|---|---|
| Sewer tentacles | zebiolizard2 | **In** — `SEWERS_THING` + `SewersThingAI` |
| Night zombies | zebiolizard2 | **In** — `UNDEAD_DARK_ZOMBIE`, `UNDEAD_DARK_EYED_ZOMBIE` |
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
| Doors | ibazly | **In** — wooden / iron / glass / hospital / CHAR variants |
| Melee weapons out of improvised weapon stacks | ibazly | **Partly** — `MELEE_IMPROVISED_CLUB` / `_SPEAR` exist as items; no crafting verb |
| Spiked fortification | zebiolizard2 | **Partly** — `TRAP_BARBED_WIRE` is a trap, not a barricade |
| Weak wall | zebiolizard2 | **No** |
| Basement hatch | zebiolizard2 | **In** — `generateHouseBasementMap` |
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
> it is worth naming once rather than eight times. Four suggestions — spiked
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

What the port has: **28 skills** in `web/data/Skills.csv` (30 rows, two of
which are the `_FIRST_LIVING` / `_FIRST_UNDEAD` progression markers), one
`SKILL_*` constant each, bound through `Rules.SKILL_*` statics and pinned by
`tests/skills-data.test.ts` (53 cases, and a 43-entry assertion on the C#
assignments). Seven values are corrected from the C# defaults. One rename
landed: `BOWS` → `BOWS_EXPLOSIVES`, which is the only content change in the
whole table and is Still Alive's, not this port's.

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

## Deliberately no

Recorded so a future reader does not re-litigate them:

- **Relationships with NPCs** (#16). The thread is titled "Sex with npc". This
  is a 2012 browser-playable roguelike; the mechanic as asked for is out of
  scope, and the *systems* half of it — a relationship model deeper than
  `Faction` relations — is the only part worth ever taking.
- **Customizing avatars** (#21). Every actor's sprite is a whole-body image or
  a layered doll with a fixed part set. Arbitrary player-authored avatars would
  be a renderer change, not a content change, and the port's own §5.4 records
  that the renderer is where the last six bugs lived.
- **Multiplayer** (#15) — not declined. Designed, not built:
  [`MULTIPLAYER_PLAN.md`](MULTIPLAYER_PLAN.md), whose Phase 0 is a single test.
- **Rooftop levels** (#4), **pets** (#12), **dual wielding** (#11). Each needs
  a new core concept — a third map tier, a player-bound AI, a second weapon
  slot — and each is a larger change to the scheduler and the save format than
  the whole of the Still Alive Stage 2.

---

## Where each thread actually stands

Not a status report — a pointer to the thread list, for anything the compendium
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

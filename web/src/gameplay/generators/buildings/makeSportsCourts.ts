/**
 * `Feature.SportsCourts` — C# `BaseTownGenerator.cs:5858-5966` `MakeTennisCourt` and
 * `:5968-6079` `MakeBasketballCourt`.
 *
 * Two buildings, one file, because they are the same building twice: a chain wire
 * yard the exact size of a court, a fixed-layout tile mosaic laid over the inside
 * of the fence, a chain link gate on one rolled side, and a zone. Nothing here is
 * a *room* — no walls to walk around, no doors, no second map, no actors — and
 * neither method places an actor, calls `addExit` or builds a second `Map`.
 *
 * ## The dispatch is the head of the parks `&&` chain, and it takes no roll
 *
 * C# `:555-562`:
 *
 * ```csharp
 * if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))
 * {
 *     if (MakeFuelStation(map, b, fuelStationsPlaced)) { ++fuelStationsPlaced; goto Completed; }
 *     if (!fireStationPlaced && MakeFireStation(map, b)) { … goto Completed; }
 *     int rolled = m_DiceRoller.Roll(0, 99);
 * ```
 *
 * Both courts are tried **first**, they share the one `RollChance(ParkBuildingChance)`
 * that gates the whole region, and — unlike every other arm in that chain — they
 * do not roll for themselves at all. So `makeFuelStationBuilding`'s module header
 * calls them the two slots *before* its own, and this file is why: what the shared
 * roll is being spent on, when it lands, is a court about half the time.
 *
 * ## The size gates are EXACT equality on `buildingRect`, and they are the only
 * ## exact-equality gates in the C# generator set
 *
 * `:5863` is `if (b.BuildingRect.Width != 8 || b.BuildingRect.Height != 10)` and
 * `:5973` is `if (b.BuildingRect.Width != 10 || b.BuildingRect.Height != 8)`. Every
 * other one of the fourteen building generators asks for a **minimum** — a building
 * that wants room takes all of it — and the fuel station is the single exception with
 * a *window*. These two are neither. They are a shape, and the court mosaic in
 * step 2 is a fixed list of 48 tile models handed to the interior tiles **in visit
 * order**, so there is no layout that survives a block one tile bigger: a 9x10
 * building rect has 7x8 = 56 interior tiles, the list runs out at 48, and
 * `listOfTilesToPlace[toPlaceIndex]` would be `null`.
 *
 * `Block` insets **twice** (`TownBuilding.ts:224-231`), so these are block rects:
 *
 * | building | gate (`:5863`, `:5973`) | block rect | inside rect | interior tiles |
 * | --- | --- | --- | --- | --- |
 * | tennis | 8x10 | **10x12** | 6x8 | 48 |
 * | basketball | 10x8 | **12x10** | 8x6 | 48 |
 *
 * The two are **mutually exclusive by shape, not by dispatch order** — no block is
 * both 8x10 and 10x8, so the `&&` chain's short-circuit never decides anything between
 * them. What the chain does decide is against everything downstream: a block that is
 * either court is a completed block, and never reaches the fuel station, the fire
 * station or the parks cascade. Whether a given district produces a 10x12 or a 12x10
 * block at all is the block-cutting's business (`BaseMapGenerator`), and a district that
 * produces neither simply never builds one — the gates are the C#'s and were not
 * relaxed to make a map busier.
 *
 * ## The entrance switch's `default` IS the roll-2 case, and the other one is not
 *
 * `:5927` / `:6047` are `int entranceFace = m_DiceRoller.Roll(0, 4);` and both
 * switches handle `case 0`, `case 1`, `case 3` and a `default:`. There is **no
 * `case 2`**, and that is not a hole — it is the roll. `DiceRoller.Roll` is
 * `m_Rng.Next(min, max)` (`Engine/DiceRoller.cs:37-45`) and .NET's
 * `Random.Next(min, max)` is **exclusive of max**, so `Roll(0, 4)` is `[0, 4)` =
 * `{0, 1, 2, 3}` and the value the author called 2 is what `default` catches. The
 * port's `DiceRoller.roll` is `[min, max)` for the same reason
 * (`DiceRoller.ts:23-29`).
 *
 * **This is the exact opposite of `makeFuelStationBuilding`, and the two must not be
 * normalised to match.** That file's `case 4` hole is dead code: its switch handles
 * `0..3` with **no default**, so the roll's fourth value is handled and the fifth
 * cannot occur. This file's switch handles `0, 1, 3` and a `default`, so the
 * roll's third value lands on the `default` arm and the fourth is handled by `case
 * 3`. Both are total over `[0, 4)`; they are spelled differently and the difference
 * is the C#'s. Changing either — to `roll(0, 5)`, to an inclusive roller, to a
 * `case 2`, to a `default` that assumed a fifth arm — moves the gate to the wrong
 * wall or drops the court entirely, and neither shows up as a crash. The four faces
 * are: `0` west, `1` east, `3` north, `default` (== 2) south.
 *
 * ## `RemoveMapObjectAt` before the gate is load-bearing, not defensive
 *
 * Step 1 has already put a chain wire fence on **every** perimeter tile of the
 * building rect, and all four entrance positions are perimeter tiles: `0` and `1`
 * are `BuildingRect.Left` / `Right - 1` at the mid-height, `3` and `default` are
 * `Top` / `Bottom - 1` at the mid-width. The C#'s `PlaceMapObjectAt` **throws**
 * `"another MapObject already at position"` on an occupied tile
 * (`Data/Map.cs:860-869`); the port's `ctx.mapObjectPlace` silently declines one
 * (`MapGenerator.ts:332-338`). So without {@link removeMapObjectAt} the C# throws on
 * *every single court it builds* and the port builds a court with a fence and no gate
 * on it, silently, on all four sides. The removal is what the C#'s own comment means
 * by "make room", and the port keeps it in the one place the other two buildings that
 * copied this ladder put it (`makeAnimalShelterBuilding.ts:379`, `makeParkBuilding`).
 *
 * (The same C# method also throws `"cannot place map objects on unwalkable tiles"`,
 * and that check does *not* bite here: every `_OUTER` and court `TileModel` is built
 * `isWalkable: true` — `GameTiles.ts:303-400` — so the fence is the only thing standing
 * in the gate's way, which is what makes the removal the whole of it rather than the
 * first half of it.)
 *
 * ## The two mosaics are numbered by two different schemes, and neither is used
 *
 * The tennis list's numbers — `10, 11, 12, 13, 14, 15, 18, 19, …` — are row-major
 * indices into the 8x10 building rect in runs of six with a stride of eight, which
 * is what a hand-laid 8-wide row of six interior columns looks like. The basketball
 * list's numbers — `18, 19, … 25, 27, … 34, 36, … 43, 45, …` — are **sprite-sheet**
 * indices in runs of eight with a stride of **nine**, so they address a 9-wide
 * image sheet and are not a position in anything.
 *
 * **The loop does not read either number.** It is purely positional:
 * `map.SetTileModelAt(x, y, listOfTilesToPlace[toPlaceIndex])` hands out the list in
 * visit order, so the numbers are labels on sprites and nothing more. The only
 * place a *number* is load-bearing is the basketball ring test at `:6027`, and that
 * compares the **placed tile model against two `TileID`s**, not against an index —
 * see {@link placeCourtMosaic}. The two schemes are therefore not reconcilable and do
 * not need to be: reconciling them would be inventing a correspondence the C# never
 * had.
 *
 * ## The break numbers are 72 and 71, and both are unreachable in practice
 *
 * Each loop carries two independent terminations, and the C# comments on them are
 * *not* both right:
 *
 * - `if (globalPieceIndex == 72) break;` for tennis, `== 71` for basketball, at the
 *   head of the inner loop **and** again at the foot of the outer one.
 * - `if (toPlaceIndex < 47) ++toPlaceIndex; else break;` — the real one.
 *
 * An 8x10 (or 10x8) building rect is 80 tiles, 32 of them perimeter, so the interior
 * is exactly 48 and the list is exactly 48 long. `toPlaceIndex` therefore reaches 47
 * on the **48th and last interior tile**, and the `else break` fires there — before
 * `globalPieceIndex` is anywhere near 72 or 71. Simulated:
 *
 * | court | 48th (= last) placement at | `globalPieceIndex` guard fires later, at | the C# comment says |
 * | --- | --- | --- | --- |
 * | tennis | **`globalPieceIndex == 71`**, the 6th interior tile of row 8 | 72, the 1st tile of row 9 | "71 is the last global piece" — **correct** |
 * | basketball | **`globalPieceIndex == 69`**, the 8th interior tile of row 6 | 71, the 2nd tile of row 7 | "70 is the last global piece" — **off by one** |
 *
 * The basketball comment is off by one against tennis's (70 where tennis says 71) and
 * off by one against where the placement actually lands (70 where it is 69). Both
 * comments are kept **verbatim**; the correction lives in the constant's own doc
 * comment and in `tests/sports-courts-building.test.ts`, which pins both indices.
 * Nothing observable depends on it: the `globalPieceIndex` guards only ever fire on
 * a perimeter tile the `continue` would have skipped, so they are pure safety nets
 * against a list that ran out. If the gate at step 0 were ever relaxed to a minimum,
 * they are the only thing standing between a bigger block and
 * `listOfTilesToPlace[undefined]`, which is why they are not deleted as dead code.
 *
 * ## Dice, in the order the C# spends them
 *
 * The two courts are *not* symmetric and the asymmetry is the C#'s step numbering,
 * not a decision:
 *
 * - **Tennis — 49 dice, and the entrance is first.** `:5927` `Roll(0, 4)`, then
 *   step 4's `ItemsDrop` at `:5954-5956` rolls `RollChance(10)` once **per interior
 *   tile** of the inside rect. An 8x10 building rect has a 6x8 inside rect, so that
 *   is 48 rolls — and the predicate is `map.GetMapObjectAt(pt) == null &&
 *   RollChance(10)`, i.e. **the object test short-circuits ahead of the roll**. The
 *   inside rect is empty at that point (the fence is on the building rect's
 *   perimeter, the mosaic only sets tile models), so all 48 do roll.
 *   1 + 48 = **49**.
 * - **Basketball — at most 47 dice, and the fire barrel's roll is first.** Step 2's
 *   loop spends `RollChance(5)` per interior tile *before* step 3's `Roll(0, 4)`, and
 *   the `!fireBarrelPlaced` guard short-circuits **ahead of** that roll, so at most one
 *   barrel is ever placed and every placement after it spends nothing at all. Two of
 *   the 48 placements are ring tiles and take the `if` branch, so the loop's ceiling is
 *   48 - 2 = **46** rolls; plus the entrance's 1, that is **at most 47**, and typically
 *   far fewer because the barrel lands early (a mean near 20 rolls at 5%).
 *   There is **no `ItemsDrop`** for basketball at all: the reference gives a tennis
 *   court tennis rackets and a basketball court no loot arm whatsoever, which is
 *   preserved rather than tidied into symmetry.
 *
 * The ordering within the basketball loop is also load-bearing: the two ring tiles
 * are `else if`-chained **ahead of** the barrel roll, so a ring tile never rolls at
 * all and can never host a barrel. See {@link placeCourtMosaic}.
 *
 * ## The four transcribed factories
 *
 * None of the four is on `TownBuildingContext` — the `makeObj*`/`makeItem*` families
 * are `protected` on `BaseMapGenerator` (`TownBuilding.ts:47-56`) and a building file
 * has a context rather than a `this`. Copy counts **after this file**:
 *
 * | C# | here | also in | copies after mine | note |
 * | --- | --- | --- | --- | --- |
 * | `MakeObjFence` `BaseMapGenerator.cs:444` | {@link makeObjChainwireFence} | `makeJunkyard.ts:553`… and `makeAnimalShelterBuilding.ts:722` | **3** | byte-identical to both; NOT the port's own `makeObjFence`, which is vanilla's *wooden* fence |
 * | `MakeObjChainFenceGate` `:1176` | {@link makeObjChainFenceGate} | `makeAnimalShelterBuilding.ts:781` | **2** | 5-arg `DoorWindow`; the C#'s 6th arg has nowhere to go |
 * | `MakeObjBasketballRing` `:1185` | {@link makeObjBasketballRing} | — | **1** | brand new to the port |
 * | `MakeObjFireBarrel` `:758` | {@link makeObjFireBarrel} | `makeJunkyard.ts:553`, `makeFireStationBuilding.ts:468` | **4** | plus the port's own `protected` copy at `BaseMapGenerator.ts:609` |
 *
 * A `ctx.makeObjChainwireFence` would delete all three chain wire fence copies at
 * once, and it is the one of the four worth promoting: the other three are each used
 * by a single court. It is deliberately **not** added here — that is two files this
 * change does not own.
 *
 * `MakeItemTennisRacket` (`:1718-1721`) is the fifth transcription:
 * `new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_TENNIS_RACKET)!)`. The port's
 * `GameItems.ts:174` spells the member `MELEE_TENNIS_RACKET` (the C#'s
 * `GameItems.TENNIS_RACKET`), and nothing was renumbered to make it fit.
 *
 * `IsMetal` (Release 5-4) **is** a field on the port's `MapObject` (`MapObject.ts:140`,
 * added with `Feature.FuelStation`) and the C# sets it on all four of these factories —
 * the fence (`:450`), the gate (`:1181`), the ring (`:1191`) and the barrel (`:766`) — so
 * it is set on all four here. Any note in this repo saying the field does not exist —
 * `makeAnimalShelterBuilding`'s header and `makeFireStationBuilding`'s barrel doc both
 * still carry one — is stale. `HoverDescription` on the barrel (Release 7-6) is *still*
 * not a field, for the reason `BaseMapGenerator` gives.
 */

import { Item } from '@data/Item';
import type { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Models } from '@data/Models';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { Rect } from '@engine/Rect';
import { Session } from '@engine/Session';
import { Barrel, DoorWindow } from '@engine/mapobjects/MapObjects';
import { ItemMeleeWeapon } from '@engine/items/ItemWeapon';
import { GameImages } from '@gameplay/GameImages';
import { ItemID } from '@gameplay/GameItems';
import { TileID } from '@gameplay/GameTiles';
import type { TownBuildingContext } from '../TownBuilding';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * C# `:5863` — the tennis court is a building rect of **exactly** 8 wide and exactly
 * 10 high, and nothing else. `Block` insets twice, so the block rect is 10x12 and the
 * inside rect (the mosaic's 48 tiles plus the `ItemsDrop` sweep) is 6x8.
 *
 * The only exact-equality gate in the C# generator set besides the basketball court's;
 * see the module header for why a bigger block would run the list dry.
 */
const TENNIS_COURT_WIDTH = 8;
const TENNIS_COURT_HEIGHT = 10;

/** C# `:5973` — the same idea, transposed: 10 wide, 8 high, block rect 12x10. */
const BASKETBALL_COURT_WIDTH = 10;
const BASKETBALL_COURT_HEIGHT = 8;

/**
 * C# `:5908`, `:5920` and the basketball pair at `:6019`, `:6040` — the head-of-inner-
 * loop and foot-of-outer-loop `globalPieceIndex` guards.
 *
 * **Both are unreachable in practice and neither is right about where the last
 * placement lands.** Simulating the loops: tennis's real 48th (and last) placement is
 * at `globalPieceIndex == 71`, so `72` only ever fires afterwards, on the first tile
 * of the bottom perimeter row; basketball's is at `69`, so `71` only ever fires on
 * the second tile of the bottom perimeter row. The C#'s own comments are kept
 * verbatim on each — including basketball's "70 is the last global piece we need to
 * place down manually", which is off by one against tennis's "71" *and* off by one
 * against the 69 it is attached to. Nothing observable depends on any of it, and the
 * guards are the only thing between a relaxed step 0 and
 * `listOfTilesToPlace[undefined]`, so they stay.
 */
const TENNIS_GLOBAL_PIECE_STOP = 72;
const BASKETBALL_GLOBAL_PIECE_STOP = 71;

/**
 * C# `:5901`, `:6011` — `int toPlaceIndex = 0; //the 48 tiles that we need to place`,
 * and the `:5915` / `:6035` test `if (toPlaceIndex < 47)`. Lifted because it is the
 * loop's real terminator, and because "48 tiles" is what makes the exact-size gate at
 * step 0 necessary rather than merely fussy.
 */
const LAST_COURT_PIECE_INDEX = 47;

/** C# `:5955` — `map.GetMapObjectAt(pt) == null && m_DiceRoller.RollChance(10)`, 10%. */
const TENNIS_RACKET_CHANCE = 10;

/** C# `:6029` — `!fireBarrelPlaced && m_DiceRoller.RollChance(5)`, Release 7-6. */
const FIRE_BARREL_CHANCE = 5;

// ── C# :5883-5899 MakeTennisCourt's listOfTilesToPlace ─────────────────────────

/**
 * C# `:5886-5897`, verbatim and in order — all 48 `TileID`s, transcribed rather than
 * generated because the *pattern* is a red herring.
 *
 * The numbers look like row-major indices of the 8x10 building rect in runs of six
 * with a stride of eight (`10..15`, then skip `16, 17`, then `18..23`, …), and 8x6 = 48
 * is exactly the interior — but the run of six starting at index 10 lands on columns
 * 2..7 of a row whose interior is columns 1..6, so it is offset by one and is *not* a
 * positional encoding. Nothing reads it: the loop hands the list out in visit order, so
 * the numbers are labels on sprites.
 *
 * (For the record, the C#'s list is exactly `[10..71].filter(n => n % 8 >= 2)`, which
 * reproduces all 48 ids — and is wrong the moment somebody "corrects" the offset to
 * match the geometry. Transcribed, not derived.)
 */
const TENNIS_COURT_TILES: readonly TileID[] = [
  TileID.FLOOR_TENNIS_COURT_10,
  TileID.FLOOR_TENNIS_COURT_11,
  TileID.FLOOR_TENNIS_COURT_12,
  TileID.FLOOR_TENNIS_COURT_13,
  TileID.FLOOR_TENNIS_COURT_14,
  TileID.FLOOR_TENNIS_COURT_15,
  TileID.FLOOR_TENNIS_COURT_18,
  TileID.FLOOR_TENNIS_COURT_19,
  TileID.FLOOR_TENNIS_COURT_20,
  TileID.FLOOR_TENNIS_COURT_21,
  TileID.FLOOR_TENNIS_COURT_22,
  TileID.FLOOR_TENNIS_COURT_23,
  TileID.FLOOR_TENNIS_COURT_26,
  TileID.FLOOR_TENNIS_COURT_27,
  TileID.FLOOR_TENNIS_COURT_28,
  TileID.FLOOR_TENNIS_COURT_29,
  TileID.FLOOR_TENNIS_COURT_30,
  TileID.FLOOR_TENNIS_COURT_31,
  TileID.FLOOR_TENNIS_COURT_34,
  TileID.FLOOR_TENNIS_COURT_35,
  TileID.FLOOR_TENNIS_COURT_36,
  TileID.FLOOR_TENNIS_COURT_37,
  TileID.FLOOR_TENNIS_COURT_38,
  TileID.FLOOR_TENNIS_COURT_39,
  TileID.FLOOR_TENNIS_COURT_42,
  TileID.FLOOR_TENNIS_COURT_43,
  TileID.FLOOR_TENNIS_COURT_44,
  TileID.FLOOR_TENNIS_COURT_45,
  TileID.FLOOR_TENNIS_COURT_46,
  TileID.FLOOR_TENNIS_COURT_47,
  TileID.FLOOR_TENNIS_COURT_50,
  TileID.FLOOR_TENNIS_COURT_51,
  TileID.FLOOR_TENNIS_COURT_52,
  TileID.FLOOR_TENNIS_COURT_53,
  TileID.FLOOR_TENNIS_COURT_54,
  TileID.FLOOR_TENNIS_COURT_55,
  TileID.FLOOR_TENNIS_COURT_58,
  TileID.FLOOR_TENNIS_COURT_59,
  TileID.FLOOR_TENNIS_COURT_60,
  TileID.FLOOR_TENNIS_COURT_61,
  TileID.FLOOR_TENNIS_COURT_62,
  TileID.FLOOR_TENNIS_COURT_63,
  TileID.FLOOR_TENNIS_COURT_66,
  TileID.FLOOR_TENNIS_COURT_67,
  TileID.FLOOR_TENNIS_COURT_68,
  TileID.FLOOR_TENNIS_COURT_69,
  TileID.FLOOR_TENNIS_COURT_70,
  TileID.FLOOR_TENNIS_COURT_71,
];

// ── C# :5993-6009 MakeBasketballCourt's listOfTilesToPlace ────────────────────

/**
 * C# `:5996-6007`, verbatim and in order — all 48 `TileID`s.
 *
 * **A different numbering scheme from the tennis list and not comparable to it.**
 * These are sprite-sheet indices in runs of eight with a stride of **nine**
 * (`18..25`, skip `26`, `27..34`, skip `35`, `36..43`, …), so they address a 9-wide
 * image and are not a position in the 10x8 building rect at all. The two lists also
 * start at different numbers for the same reason: the tennis list is a rect address
 * and this one is a sheet address. See the module header.
 *
 * The two ids the *ring* test names — `FLOOR_BASKETBALL_COURT_36` (index 16) and
 * `FLOOR_BASKETBALL_COURT_43` (index 23) — are the only numbers in either list that
 * anything branches on, and the branch is on the **tile that was just placed**, not on
 * the index.
 */
const BASKETBALL_COURT_TILES: readonly TileID[] = [
  TileID.FLOOR_BASKETBALL_COURT_18,
  TileID.FLOOR_BASKETBALL_COURT_19,
  TileID.FLOOR_BASKETBALL_COURT_20,
  TileID.FLOOR_BASKETBALL_COURT_21,
  TileID.FLOOR_BASKETBALL_COURT_22,
  TileID.FLOOR_BASKETBALL_COURT_23,
  TileID.FLOOR_BASKETBALL_COURT_24,
  TileID.FLOOR_BASKETBALL_COURT_25,
  TileID.FLOOR_BASKETBALL_COURT_27,
  TileID.FLOOR_BASKETBALL_COURT_28,
  TileID.FLOOR_BASKETBALL_COURT_29,
  TileID.FLOOR_BASKETBALL_COURT_30,
  TileID.FLOOR_BASKETBALL_COURT_31,
  TileID.FLOOR_BASKETBALL_COURT_32,
  TileID.FLOOR_BASKETBALL_COURT_33,
  TileID.FLOOR_BASKETBALL_COURT_34,
  TileID.FLOOR_BASKETBALL_COURT_36,
  TileID.FLOOR_BASKETBALL_COURT_37,
  TileID.FLOOR_BASKETBALL_COURT_38,
  TileID.FLOOR_BASKETBALL_COURT_39,
  TileID.FLOOR_BASKETBALL_COURT_40,
  TileID.FLOOR_BASKETBALL_COURT_41,
  TileID.FLOOR_BASKETBALL_COURT_42,
  TileID.FLOOR_BASKETBALL_COURT_43,
  TileID.FLOOR_BASKETBALL_COURT_45,
  TileID.FLOOR_BASKETBALL_COURT_46,
  TileID.FLOOR_BASKETBALL_COURT_47,
  TileID.FLOOR_BASKETBALL_COURT_48,
  TileID.FLOOR_BASKETBALL_COURT_49,
  TileID.FLOOR_BASKETBALL_COURT_50,
  TileID.FLOOR_BASKETBALL_COURT_51,
  TileID.FLOOR_BASKETBALL_COURT_52,
  TileID.FLOOR_BASKETBALL_COURT_54,
  TileID.FLOOR_BASKETBALL_COURT_55,
  TileID.FLOOR_BASKETBALL_COURT_56,
  TileID.FLOOR_BASKETBALL_COURT_57,
  TileID.FLOOR_BASKETBALL_COURT_58,
  TileID.FLOOR_BASKETBALL_COURT_59,
  TileID.FLOOR_BASKETBALL_COURT_60,
  TileID.FLOOR_BASKETBALL_COURT_61,
  TileID.FLOOR_BASKETBALL_COURT_63,
  TileID.FLOOR_BASKETBALL_COURT_64,
  TileID.FLOOR_BASKETBALL_COURT_65,
  TileID.FLOOR_BASKETBALL_COURT_66,
  TileID.FLOOR_BASKETBALL_COURT_67,
  TileID.FLOOR_BASKETBALL_COURT_68,
  TileID.FLOOR_BASKETBALL_COURT_69,
  TileID.FLOOR_BASKETBALL_COURT_70,
];

/**
 * C# `:6027` — "these two spots have rings". Compared against the **tile just placed**,
 * not against a list index, and that is the whole reason the basketball list's numbering
 * scheme is irrelevant here: the C# asks "is the tile I just put down one of these two?".
 *
 * They are list entries 16 and 23, which is the 17th and 24th interior tile in visit
 * order — the first and the eighth interior tile of row 3 of a 10-wide rect, so
 * `x = BuildingRect.Left + 1` and `x = BuildingRect.Left + 8`. Two rings, one tile in
 * from the left wall and two in from the right, on the same row, which is the C#'s
 * asymmetry and is preserved.
 */
const RING_TILES: readonly TileID[] = [TileID.FLOOR_BASKETBALL_COURT_36, TileID.FLOOR_BASKETBALL_COURT_43];

// ── C# :5858 MakeTennisCourt ──────────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:5858` `MakeTennisCourt(map, b)` — `//@@MP (Release 7-3)`.
 *
 * Returns `true` when the block became a tennis court, which is how `:555`'s
 * `if (!MakeTennisCourt(map, b) && !MakeBasketballCourt(map, b))` says the block is
 * finished with.
 *
 * **No `hasFeature` gate in the C#**: neither court method tests anything, and both
 * are reached only through the parks chain, which is itself not feature-gated in the
 * reference. The port gates it here, as the first statement and *ahead of the size
 * check*, so that a Classic district pays nothing for a building the Still Alive
 * district would have rolled for — the same reasoning, and the same position, as
 * `makeFuelStationBuilding`'s.
 */
export function makeTennisCourtBuilding(ctx: TownBuildingContext): boolean {
  // Behind `Feature.SportsCourts` from the first statement, ahead of the size check:
  // under Classic this is not a cosmetic difference, it is 49 dice the reference
  // district never spends.
  if (!hasFeature(Session.get().ruleset, Feature.SportsCourts)) return false;

  const { map, block: b, roller } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:5863`. `!=` on **both** axes, i.e. exact equality — see the module header for
  // why this is not a minimum like every other building's, and the block-rect table
  // for what 8x10 means once `Block` has inset twice.
  if (b.buildingRect.width !== TENNIS_COURT_WIDTH || b.buildingRect.height !== TENNIS_COURT_HEIGHT) return false;

  /////////////////////////////
  // 1. Edges, walkway & fence
  /////////////////////////////
  // C# `:5869-5878`. Walkway over the whole block, the `_OUTER` court tile over the
  // building rect — "for the outer edges. the actual court comes in step 2" — and a
  // jumpable chain wire fence on every perimeter tile of the building rect.
  //
  // The `_OUTER` model is doing double duty: it is what step 2's `continue` tests to
  // tell an outer edge from a court tile, so step 1 has to be a plain `TileRectangle`
  // and nothing may overwrite a perimeter tile afterwards.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_TENNIS_COURT_OUTER)!, b.buildingRect);
  placePerimeterFence(ctx);

  ///////////////
  // 2. Place down the fixed-layout court
  ///////////////
  // C# `:5900-5922`. No dice in here at all — see {@link placeCourtMosaic}, which is
  // the shared transcription of both loops and says why basketball's is not a
  // drop-in for this one.
  placeCourtMosaic(ctx, TileID.FLOOR_TENNIS_COURT_OUTER, TENNIS_COURT_TILES, TENNIS_GLOBAL_PIECE_STOP, null);

  ///////////////
  // 3. Entrance
  ///////////////
  // C# `:5927-5949`. The `Roll(0, 4)` is the tennis court's **first** die.
  const { ex, ey } = entrancePoint(b.buildingRect, roller.roll(0, 4));
  // Load-bearing, not defensive: step 1 fenced this tile and the C#'s
  // `PlaceMapObjectAt` throws on an occupied tile. See the module header.
  removeMapObjectAt(map, ex, ey);
  ctx.mapObjectPlace(map, ex, ey, makeObjChainFenceGate(DoorWindow.STATE_CLOSED));

  ////////////
  // 4. Items
  ////////////
  // C# `:5954-5956`. `(pt) => map.GetMapObjectAt(pt) == null && m_DiceRoller.RollChance(10)`,
  // `(pt) => MakeItemTennisRacket()`.
  //
  // **The object test is ahead of the roll and that is the C#'s `&&` order, not an
  // accident**: 6x8 = 48 interior tiles, every one of them rolled at, because the
  // inside rect is empty by now (the fence is on the building rect, the mosaic only
  // set tile models). Tennis is therefore the most expensive building in the parks
  // chain by a wide margin: 1 + 48 = 49 dice. Written with the object test first so a
  // reader can see the roll is *conditional*, and no literal appears inside the
  // lambda.
  ctx.itemsDrop(
    map,
    b.insideRect,
    (pt) => map.getMapObjectAt(pt.x, pt.y) === null && roller.rollChance(TENNIS_RACKET_CHANCE),
    () => makeItemTennisRacket()
  );

  ///////////
  // 5. Zone
  ///////////
  // C# `:5961-5962`. `"Tennis court"` — sentence case, lower-case second word — over
  // the building rect, and the walkway zones after it, as all fourteen buildings do.
  map.addZone(ctx.makeUniqueZone('Tennis court', b.buildingRect));
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:5965`.
  return true;
}

// ── C# :5968 MakeBasketballCourt ──────────────────────────────────────────────

/**
 * C# `BaseTownGenerator.cs:5968` `MakeBasketballCourt(map, b)` — `//@@MP (Release 7-3)`.
 *
 * The transposed twin: 10x8 building rect, a 48-tile mosaic, two basketball rings, one
 * fire barrel, one chain link gate, one zone. **No `ItemsDrop`** — the reference has
 * no loot arm for this court at all, and the asymmetry with the tennis court beside
 * it is the C#'s, not an omission in the port.
 */
export function makeBasketballCourtBuilding(ctx: TownBuildingContext): boolean {
  // Ahead of the size check, and for the same reason as the tennis court's gate.
  if (!hasFeature(Session.get().ruleset, Feature.SportsCourts)) return false;

  const { map, block: b, roller } = ctx;

  ////////////////////////
  // 0. Check suitability
  ////////////////////////
  // C# `:5973`. `!=` on both axes, transposed from the tennis court's. Mutually
  // exclusive with it by shape alone: no block is both 8x10 and 10x8.
  if (b.buildingRect.width !== BASKETBALL_COURT_WIDTH || b.buildingRect.height !== BASKETBALL_COURT_HEIGHT)
    return false;

  /////////////////////////////
  // 1. Edges, walkway & fence
  /////////////////////////////
  // C# `:5979-5988`. Identical to the tennis court's step 1 with the other `_OUTER`
  // model; the fence predicate is verbatim the C#'s four-way perimeter test.
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_WALKWAY)!, b.rectangle);
  ctx.tileRectangle(map, Models.tiles.get(TileID.FLOOR_BASKETBALL_COURT_OUTER)!, b.buildingRect);
  placePerimeterFence(ctx);

  ///////////////
  // 2. Place down the fixed-layout court
  ///////////////
  // C# `:6010-6042`, plus `:6012`'s `bool fireBarrelPlaced = false; //@@MP - added (Release 7-6)`.
  //
  // **This step spends the court's dice, and it does so before the entrance roll** —
  // the reverse of the tennis court, because the C#'s step 2 is the tile loop and its
  // step 3 is the entrance. Up to 46 `RollChance(5)`s and then one `Roll(0, 4)`.
  placeCourtMosaic(
    ctx,
    TileID.FLOOR_BASKETBALL_COURT_OUTER,
    BASKETBALL_COURT_TILES,
    BASKETBALL_GLOBAL_PIECE_STOP,
    RING_TILES,
    roller
  );

  ///////////////
  // 3. Entrance
  ///////////////
  // C# `:6047-6069`. The same ladder as the tennis court's, the same `Roll(0, 4)`, the
  // same `default`-is-the-roll-2 reading, and the same load-bearing
  // `RemoveMapObjectAt`. It is the *last* die this court spends, not the first.
  const { ex, ey } = entrancePoint(b.buildingRect, roller.roll(0, 4));
  removeMapObjectAt(map, ex, ey);
  ctx.mapObjectPlace(map, ex, ey, makeObjChainFenceGate(DoorWindow.STATE_CLOSED));

  ///////////
  // 4. Zone
  ///////////
  // C# `:6074-6075`. Note there is no step 4 items here: the numbering jumps from
  // "3. Entrance" straight to "4. Zone".
  map.addZone(ctx.makeUniqueZone('Basketball court', b.buildingRect));
  ctx.makeWalkwayZones(map, b);

  // Done. C# `:6078`.
  return true;
}

// ── Shared: the perimeter fence ──────────────────────────────────────────────

/**
 * C# `:5871-5878` and `:5981-5988`, verbatim and identical in both methods.
 *
 * `MapObjectFill(b.BuildingRect, …)` over the four edges, returning the chain wire
 * fence on a perimeter tile and `null` inside. `MapObjectFill` declines an occupied
 * tile (`MapGenerator.ts:378-382`), so a court that inherits a wrecked car on its
 * perimeter keeps the car and loses that fence post — the C# behaves the same way
 * and the gate at step 3 would then find the tile occupied, which is exactly what
 * {@link removeMapObjectAt} clears.
 *
 * Factored out rather than written twice: the two C# blocks differ only in which
 * `_OUTER` model step 1 laid, and that is not visible to this predicate. The
 * predicate itself is the C#'s, with its four comparisons in the C#'s order.
 */
function placePerimeterFence(ctx: TownBuildingContext): void {
  const { map, block: b } = ctx;
  const r = b.buildingRect;
  ctx.mapObjectFill(map, r, (pt) => {
    const placeFence = pt.x === r.left || pt.x === r.right - 1 || pt.y === r.top || pt.y === r.bottom - 1; // place fence
    return placeFence ? makeObjChainwireFence(GameImages.OBJ_CHAINWIRE_FENCE) : null;
  });
}

// ── Shared: the fixed-layout mosaic ───────────────────────────────────────────

/**
 * C# `:5900-5922` (tennis) and `:6010-6042` (basketball), as one function.
 *
 * ```
 * int globalPieceIndex = 0; // all 80 tiles that make up the court
 * int toPlaceIndex = 0;     // the 48 tiles that we need to place
 * for (int y = …Top; y < …Bottom; y++)
 *   for (int x = …Left; x < …Right; x++)
 *   {
 *       ++globalPieceIndex;
 *       if (globalPieceIndex == 72) break;                 // tennis; 71 for basketball
 *       if (map.GetTileAt(x, y).Model == …COURT_OUTER) continue;
 *       map.SetTileModelAt(x, y, listOfTilesToPlace[toPlaceIndex]);
 *       <basketball only: ring / fire barrel>
 *       if (toPlaceIndex < 47) ++toPlaceIndex; else break;
 *   }
 * if (globalPieceIndex == 72) break;
 * ```
 *
 * Three things about it are load-bearing and all three are transliterated as written
 * rather than tidied:
 *
 * 1. **The loop is positional and the list's numbers are never read.** `list[i]` is
 *    handed out in visit order, so the two lists' incompatible numbering schemes
 *    (row-major rect indices for tennis, sprite-sheet indices with a stride of nine
 *    for basketball) cannot disagree with the geometry. See the module header.
 * 2. **The `else break` at `toPlaceIndex == 47` is the terminator that runs.** The
 *    `globalPieceIndex` guard only ever fires afterwards, on a perimeter tile the
 *    `continue` would have skipped: tennis's real last placement is at
 *    `globalPieceIndex == 71` (guard: 72, first tile of row 9) and basketball's at
 *    `== 69` (guard: 71, second tile of row 7). Both guards are kept because they are
 *    the only backstop against a list running dry, and
 *    `tests/sports-courts-building.test.ts` pins both indices so the discrepancy
 *    cannot be "corrected" by accident.
 * 3. **`continue` is checked against the tile's own model, not against the
 *    perimeter predicate.** They agree today because step 1 laid `_OUTER` on exactly
 *    the perimeter and nothing has written a tile since — and they have to agree, or
 *    the 48 placements would land on fence posts and the list would run out eight
 *    entries early. Reading it off the model is what the C# does and it is why step 1
 *    is a bare `TileRectangle`.
 *
 * `ringTiles` is `null` for tennis, which is how the C#'s two loops are one function
 * here: the tennis loop has no ring test and no barrel at all, so passing `null` skips
 * both without a second copy of the loop. `roller` is `null` for tennis for the same
 * reason — the tennis court spends no dice in this loop, and `ctx.roller` would be
 * needed for nothing.
 *
 * The basketball extras keep the C#'s exact branch order, which decides both whether a
 * die is spent and what lands on the tile:
 *
 * ```csharp
 * if (list[toPlaceIndex] == …COURT_36 || list[toPlaceIndex] == …COURT_43)
 *     map.PlaceMapObjectAt(MakeObjBasketballRing(…), new Point(x, y));
 * else if (!fireBarrelPlaced && m_DiceRoller.RollChance(5))
 * {   map.PlaceMapObjectAt(MakeObjFireBarrel(…), new Point(x, y));
 *     fireBarrelPlaced = true; }
 * ```
 *
 * The two ring tiles are `if`-chained **ahead of** the roll, so a ring tile spends no
 * die and can never host a barrel, and `!fireBarrelPlaced` short-circuits **ahead of**
 * `RollChance(5)`, so the roll is spent at most until the barrel lands — at most 46
 * rolls for a 48-placement loop with two ring tiles, and a mean near 20 at 5%.
 * `map.PlaceMapObjectAt` in the C# is `ctx.mapObjectPlace` here, which declines an
 * occupied tile rather than throwing; the interior tiles are empty at this point in
 * both courts, so the two agree.
 */
function placeCourtMosaic(
  ctx: TownBuildingContext,
  outerTile: TileID,
  tiles: readonly TileID[],
  globalPieceStop: number,
  ringTiles: readonly TileID[] | null,
  roller: TownBuildingContext['roller'] | null = null
): void {
  const { map, block: b } = ctx;
  const outer = Models.tiles.get(outerTile)!;
  const models = tiles.map((id) => Models.tiles.get(id)!);

  // C# `:5900` / `:6010`. The 80 is the comment's, and it is right: an 8x10 or a
  // 10x8 building rect is 80 tiles.
  let globalPieceIndex = 0; // all 80 tiles that make up the court
  let toPlaceIndex = 0; // the 48 tiles that we need to place
  let fireBarrelPlaced = false; //@@MP - added (Release 7-6)

  for (let y = b.buildingRect.top; y < b.buildingRect.bottom; y++) {
    for (let x = b.buildingRect.left; x < b.buildingRect.right; x++) {
      ++globalPieceIndex;
      // The C#'s own comment, kept verbatim, and it is right for tennis and off by one
      // for basketball — see {@link TENNIS_GLOBAL_PIECE_STOP}.
      if (globalPieceIndex === globalPieceStop) break; //71 is the last global piece we need to place down manually

      if (map.getTileAt(x, y)?.model === outer) continue; //we're on an outer edge that we set earlier

      const placed = models[toPlaceIndex]!;
      map.setTileModelAt(x, y, placed);

      if (ringTiles !== null) {
        // C# `:6026-6033`. The ring test is on the *tile id* the C# compares the
        // placed model against, so it does not care that the two lists are numbered
        // by two different and incompatible schemes.
        if (ringTiles.includes(tiles[toPlaceIndex]!)) {
          ctx.mapObjectPlace(map, x, y, makeObjBasketballRing(GameImages.OBJ_BASKETBALL_RING));
        } else if (!fireBarrelPlaced && roller!.rollChance(FIRE_BARREL_CHANCE)) {
          //@@MP - added (Release 7-6)
          ctx.mapObjectPlace(map, x, y, makeObjFireBarrel(GameImages.OBJ_EMPTY_BIN));
          fireBarrelPlaced = true;
        }
      }

      if (toPlaceIndex < LAST_COURT_PIECE_INDEX) ++toPlaceIndex;
      // the last piece we need to place down manually. This is the branch that runs;
      // the `globalPieceIndex` guard above is the backstop.
      else break;
    }
    // The C#'s second copy of the same guard, at the foot of the outer loop. Kept, for
    // the reason above; see {@link TENNIS_GLOBAL_PIECE_STOP}.
    if (globalPieceIndex === globalPieceStop) break; //71 is the last global piece we need to place down manually
  }
}

// ── Shared: the entrance ladder ──────────────────────────────────────────────

/**
 * C# `:5929-5947` and `:6049-6067`, verbatim, as one function because the two blocks
 * are character-for-character identical.
 *
 * ```
 * switch (entranceFace)
 * {
 *     case 0: // west
 *         ex = BuildingRect.Left;  ey = BuildingRect.Top + BuildingRect.Height / 2; break;
 *     case 1: // east
 *         ex = BuildingRect.Right - 1; ey = BuildingRect.Top + BuildingRect.Height / 2; break;
 *     case 3: // north
 *         ex = BuildingRect.Left + BuildingRect.Width / 2; ey = BuildingRect.Top; break;
 *     default: // south
 *         ex = BuildingRect.Left + BuildingRect.Width / 2; ey = BuildingRect.Bottom - 1; break;
 * }
 * ```
 *
 * **There is no `case 2`, and the `default` is the roll-2 case.** `Roll(0, 4)` is
 * `System.Random.Next(0, 4)`, which is exclusive of max, so the roll is `[0, 4)` =
 * `{0, 1, 2, 3}` and `default` catches the 2. Written `case 0 / case 1 / case 3 /
 * default` and nothing else, on purpose: adding a `case 2` would be a *behaviour*
 * change only if it displaced the `default`, and turning the `default` into a
 * `case 2` with no `default` would make the switch non-total for a value the roller
 * cannot produce — which is a trade nobody should make silently in a file with two
 * copies of the ladder in it.
 *
 * The division is the C#'s integer division on positive values, so `Math.floor` is
 * exact rather than a rounding choice, and both axes are even here anyway (8x10 and
 * 10x8, so every half lands on a tile). `midX` / `midY` are the C#'s
 * `BuildingRect.Left + BuildingRect.Width / 2` and `BuildingRect.Top +
 * BuildingRect.Height / 2`, hoisted so the four arms read as the C#'s do — four
 * assignments rather than eight repeated expressions.
 *
 * This is *not* `makeFuelStationBuilding`'s shape. That file's two switches handle
 * `case 0..3` with **no default** and its `case 4` is dead code. Do not normalise the
 * two to look alike; see the module header.
 */
function entrancePoint(r: Rect, entranceFace: number): { ex: number; ey: number } {
  const midX = r.left + Math.floor(r.width / 2);
  const midY = r.top + Math.floor(r.height / 2);
  let ex: number;
  let ey: number;
  switch (entranceFace) {
    case 0: // west
      ex = r.left;
      ey = midY;
      break;
    case 1: // east
      ex = r.right - 1;
      ey = midY;
      break;
    case 3: // north
      ex = midX;
      ey = r.top;
      break;
    // The roll is `Roll(0, 4)` = `Random.Next(0, 4)` = `[0, 4)`, so 0..3 is
    // exhaustive and there is no `case 2`: **this `default` is the roll-2 case.**
    default: // south
      ex = midX;
      ey = r.bottom - 1;
      break;
  }
  return { ex, ey };
}

// ── Map operations the port spells differently ───────────────────────────────

/**
 * C# `Map.RemoveMapObjectAt(ex, ey)` at `:5948` and `:6068`, and
 * `Data/Map.cs:890-896` in general. The port's `Map` has `removeMapObject(obj)` and no
 * by-position form.
 *
 * **Not defensive here.** Step 1 has already put a chain wire fence on every
 * perimeter tile and all four entrance positions are perimeter tiles, so this is the
 * line that clears the fence post the gate stands on. The C#'s `PlaceMapObjectAt`
 * throws on an occupied tile; the port's `ctx.mapObjectPlace` declines one, so
 * without this removal the port would produce a court with a fence and no gate on all
 * four sides, silently. `if (obj)` rather than a null-guard on the map bounds, because
 * the C# would throw there and every coordinate reaching this function is derived from
 * a building rect.
 */
function removeMapObjectAt(map: GameMap, x: number, y: number): void {
  const obj = map.getMapObjectAt(x, y);
  if (obj) map.removeMapObject(obj);
}

// ── Transcribed factories ─────────────────────────────────────────────────────

/**
 * C# `BaseMapGenerator.cs:444-453` `MakeObjFence` — "Chain wire and IS jumpable".
 *
 * **Byte-identical to the copies in `makeJunkyard.ts` and
 * `makeAnimalShelterBuilding.ts`, and this is the third.** Not a new context candidate
 * in the usual sense — one `ctx.makeObjChainwireFence` would delete all three at once,
 * and that is the shape to add it in, so the copies are a known-and-tolerated state
 * rather than an oversight. It is deliberately not added by this change: the seam is
 * `TownBuilding.ts` and `BaseTownGenerator.placement()`, neither of which this file
 * owns.
 *
 * The name has to be disambiguated because the port's own `protected makeObjFence`
 * (`BaseMapGenerator.ts:486`) is vanilla's **wooden** fence — named `fence`, it gives
 * wood, and it is a different object — so a file that reached for `makeObjFence` here
 * would have silently put up the wrong wall.
 *
 * `isMetal` **is** set: the C# has had it since Release 5-4 and the port's `MapObject`
 * has had the field since `Feature.FuelStation` (`MapObject.ts:140`). Notes elsewhere
 * in this repo claiming the field does not exist are stale.
 */
function makeObjChainwireFence(imageId: string): MapObject {
  const fence = new MapObject(
    'chain wire fence',
    imageId,
    MapObjectBreak.BREAKABLE,
    MapObjectFire.UNINFLAMMABLE,
    DoorWindow.BASE_HITPOINTS * 10
  );
  fence.isMaterialTransparent = true;
  fence.jumpLevel = 1;
  fence.isMetal = true; //@@MP (Release 5-4)
  fence.standOnFovBonus = true;
  return fence;
}

/**
 * C# `BaseMapGenerator.cs:1176-1183` `MakeObjChainFenceGate(state)` — the gate both
 * courts put on their rolled side, and the second copy in the port after
 * `makeAnimalShelterBuilding.ts:781`'s, which is the one to read the argument
 * discussion next to.
 *
 * Half a door's hit points (2x against the wooden door's 1x) and material-transparent,
 * so a survivor can see the court through a closed gate — which matters more here than
 * it does at the animal shelter's perimeter, because the thing behind the gate is an
 * open court rather than a dog. The C# sets `IsMaterialTransparent = true` and the
 * port's `DoorWindow` has no such field, so it is left off here too, for the reason
 * `DoorWindow`'s own `isTransparent` override gives (`MapObjects.ts:52-57`).
 *
 * **The `state` has nowhere to go.** The C# threads it into a six-argument
 * `DoorWindow`; the port's constructor takes five and always opens closed
 * (`MapObjects.ts:29`), so the state is applied with `setState` afterwards — the same
 * `makeBankBuilding` does. At the one call site in this file the argument is always
 * `STATE_CLOSED`, so `gate.setState(DoorWindow.STATE_CLOSED)` is a **faithful no-op**
 * and the parameter is kept only so the factory matches the C#'s shape. It is not
 * dead: it is the difference between a gate that is closed and a gate that is closed
 * *for a reason*, and a future open gate is a one-word change at the call site.
 */
function makeObjChainFenceGate(state: number): DoorWindow {
  const gate = new DoorWindow(
    'chainlink gate',
    GameImages.OBJ_CHAINWIRE_GATE_CLOSED,
    GameImages.OBJ_CHAINWIRE_GATE_OPEN,
    GameImages.OBJ_CHAINWIRE_GATE_BROKEN,
    2 * DoorWindow.BASE_HITPOINTS
  );
  gate.isMetal = true; //@@MP (Release 5-4)
  gate.setState(state);
  return gate;
}

/**
 * C# `BaseMapGenerator.cs:1185-1193` `MakeObjBasketballRing(ringImageID)` — **the
 * first time this factory has existed in the port**, so there is no copy to match and
 * nothing to be byte-identical to.
 *
 * ```csharp
 * return new MapObject("basketball ring", ringImageID)
 * {
 *     IsMaterialTransparent = true,
 *     IsWalkable = true,
 *     IsMetal = true
 * };
 * ```
 *
 * **The two-argument `MapObject` constructor is the whole subtlety.** It leaves
 * `breakState` at `UNBREAKABLE` and `fireState` at `UNINFLAMMABLE`, and `MapObject`'s
 * guard (`:60-62`) only assigns hit points to a breakable-or-burnable object — so a
 * ring is 0/0, unbreakable, and fire does not touch it. `isWalkable` therefore has to
 * be set explicitly rather than being a default: a ring is a backboard, a survivor
 * can stand under it, and the court is not blocked by its own hoops. Two of the 48
 * placements get one, and they are the only map objects a basketball court carries
 * other than its gate and (very likely) its barrel.
 */
function makeObjBasketballRing(imageId: string): MapObject {
  const ring = new MapObject('basketball ring', imageId);
  ring.isMaterialTransparent = true;
  ring.isWalkable = true;
  ring.isMetal = true; //@@MP (Release 5-4)
  return ring;
}

/**
 * C# `BaseMapGenerator.cs:758-772` `MakeObjFireBarrel(barrelImageID)` — Release 7-6.
 *
 * **The fourth copy in the port** after `makeJunkyard.ts:553`,
 * `makeFireStationBuilding.ts:468` and the generator's own `protected`
 * `makeObjFireBarrel` (`BaseMapGenerator.ts:609`), which it matches field for field.
 * Followed the junkyard's copy because this is the junkyard's fixture, just built in
 * the wrong place: the image is `OBJ_EMPTY_BIN` rather than a barrel sprite, and it
 * lands on a court tile rather than in a yard.
 *
 * Unbreakable, burnable, four kilos and **walkable**, which is what makes it a thing
 * you stand on rather than an obstacle, and `isContainer` is the C#'s own comment —
 * "in case items were left there when the barrel was unlit".
 *
 * Two C# fields still do not fit and both are reported rather than approximated:
 *
 * - `HoverDescription = "Use matches to start the fire. Bump to add more wood once
 *   alight."` (Release 7-6) is not a field on the port's `MapObject`. Adding a field
 *   to a core class as a side effect of a generator is how that goes wrong, and the
 *   three existing copies all carry the same note.
 * - `IsMetal = true` **is** a field now (`MapObject.ts:140`), so unlike those three
 *   copies this one sets it. Their notes saying otherwise are stale.
 *
 * The interesting consequence for this court specifically: the barrel is `BURNABLE`
 * and placed on a court tile, so `Feature.TileFires` can set it alight, and at that
 * point a basketball court has a fire in it that nothing in the reference ever
 * expected. That is the C#'s behaviour and it is preserved.
 */
function makeObjFireBarrel(imageId: string): Barrel {
  const barrel = new Barrel('receptacle', imageId, MapObjectBreak.UNBREAKABLE, 0);
  barrel.isMaterialTransparent = true;
  barrel.isContainer = true; // in case items were left there when the barrel was unlit
  barrel.isMovable = true;
  barrel.isWalkable = true;
  barrel.weight = 4;
  barrel.fireState = MapObjectFire.BURNABLE;
  barrel.isMetal = true; //@@MP (Release 5-4)
  return barrel;
}

/**
 * C# `BaseMapGenerator.cs:1718-1721` `MakeItemTennisRacket()`:
 * `return new ItemMeleeWeapon(m_Game.GameItems.TENNIS_RACKET);`
 *
 * The port's `GameItems` spells it `ItemID.MELEE_TENNIS_RACKET` (`GameItems.ts:174`,
 * and registered at `:576` as `MELEE_TENNIS_RACKET: { id: ItemID.MELEE_TENNIS_RACKET,
 * img: GameImages.ITEM_TENNIS_RACKET, verb: ["bash", "bashes"] }`). The id is 97, the
 * C#'s is what it is, and nothing was renumbered to make the names line up.
 *
 * **No `isForbiddenToAI`.** Unlike `MakeItemSiphonKit` and the two `ItemLight`s the
 * animal shelter copies, the C#'s sets nothing on this item, so a survivor's AI will
 * pick up a tennis racket and bash something with it. That is the reference.
 */
function makeItemTennisRacket(): Item {
  return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_TENNIS_RACKET)!);
}

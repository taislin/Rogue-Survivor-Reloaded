# Reloaded Ruleset — Change Log

The **Reloaded** ruleset (`Ruleset.RELOADED`) is the port's own ruleset. It is
built on top of **Still Alive** for now: every Still Alive feature is on, and
Reloaded-specific changes are layered on top through `Feature` flags that are
withheld from Still Alive.

This file tracks every change made under the Reloaded ruleset, in order.

## Changes

### 1. Business district rework — small CHAR buildings become generic offices

- **Feature:** `BusinessDistrictRework` (Reloaded only).
- **Where:** `BaseTownGenerator.makeCHARBuilding` (`web/src/gameplay/generators/BaseTownGenerator.ts`).
- **What:** Small CHAR buildings (agencies) are no longer generated. In the
  Reloaded ruleset they are replaced with generic offices (`makeOrdinaryOffice`),
  so business districts end up with fewer small CHAR agencies and more generic
  offices.
- **Status:** Done.

### 2. Residential room variety — houses assign distinct room roles

- **Feature:** `ResidentialRoomVariety` (Reloaded only).
- **Where:** `makeVanillaHousingBuilding` in `BaseTownGenerator.ts`.
- **What:** Instead of each room rolling a random content role, rooms cycle through
  living (5), kitchen (8), bedroom (0) so a house reliably contains a living room,
  a kitchen and a bedroom rather than three of the same kind.
- **Status:** Done.
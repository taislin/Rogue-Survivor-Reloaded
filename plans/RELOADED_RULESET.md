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
import { storage } from "@engine/storage";
import { GameMode, Ruleset, Session } from "@engine/Session";
import { reportSwallowed } from "@engine/Diagnostics";

/**
 * The ruleset and game mode the player last confirmed, so the new-game quick start
 * can repeat it.
 *
 * **Not a method on `RogueGame`.** It is a self-contained read/validate/write of
 * one small JSON record, it needs no game state, and §6 of the port plan is
 * explicitly about taking members *off* that class. Measured, putting it there
 * cost `RogueGame` ten private members and nothing else.
 *
 * It is a module rather than a field on `Session` for the same reason: this is a
 * preference carried between runs, not part of a run.
 */

/** Storage key. Public because tests have to be able to clear it. */
export const LAST_NEW_GAME_CONFIG_KEY = "lastNewGameRulesetAndMode";

/**
 * The picker's options, as values and as the names shown for them.
 *
 * Paired lists rather than one list plus a chain of ternaries at each use, because
 * the names are what gets persisted and the values are what gets applied, and
 * keeping them in step by hand is how a "Vintage" label ends up saving as
 * Standard. `RULESET_VALUES` is also how an index becomes a ruleset without a
 * comparison against a `Ruleset` member, which `feature-flags` rightly forbids
 * outside the registry.
 */
export const RULESET_VALUES: readonly Ruleset[] = [
  Ruleset.CLASSIC,
  Ruleset.STILL_ALIVE,
];
export const MODE_VALUES: readonly GameMode[] = [
  GameMode.GM_STANDARD,
  GameMode.GM_CORPSES_INFECTION,
  GameMode.GM_VINTAGE,
];

export const RULESET_ENTRIES: readonly string[] = RULESET_VALUES.map((r) =>
  Session.descShortRuleset(r),
);
export const MODE_ENTRIES: readonly string[] = MODE_VALUES.map((m) =>
  Session.descGameMode(m),
);

/**
 * The stored indices, or null when there is nothing usable.
 *
 * Matched as **names** against the entries on screen, never fed back through
 * `descShortRuleset`/`descGameMode`: those *throw* on a value they do not know, so
 * a persisted entry that a later version has dropped would throw inside the
 * new-game flow, before anything had been drawn. `indexOf` cannot throw, and
 * anything unrecognised is simply not a config.
 */
function loadIndices(): { rulesetIdx: number; modeIdx: number } | null {
  try {
    const raw = storage.getItem(LAST_NEW_GAME_CONFIG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { ruleset, mode } = parsed as { ruleset?: unknown; mode?: unknown };
    if (typeof ruleset !== "string" || typeof mode !== "string") return null;
    const rulesetIdx = RULESET_ENTRIES.indexOf(ruleset);
    const modeIdx = MODE_ENTRIES.indexOf(mode);
    // Half-remembered is not a config. If either half has gone, the caller gets the
    // session's own defaults rather than a stored ruleset beside a defaulted mode.
    if (rulesetIdx < 0 || modeIdx < 0) return null;
    return { rulesetIdx, modeIdx };
  } catch (e) {
    // A corrupt key must not cost the player their new game, and this is a
    // convenience rather than something to fail on.
    reportSwallowed("NewGameConfig.load", e);
    return null;
  }
}

/**
 * Seeds the session from the last confirmed pair, so the picker opens showing it
 * and the quick start has something truthful to repeat.
 *
 * Called once per new game, deliberately *not* from the picker: the picker has to
 * keep showing the live session so that returning to it after a cancel offers back
 * the choice the player can see they made.
 */
export function applyLastNewGameConfig(session: Session): void {
  const last = loadIndices();
  if (!last) return;
  session.ruleset = RULESET_VALUES[last.rulesetIdx];
  session.gameMode = MODE_VALUES[last.modeIdx];
}

/**
 * Records the confirmed ruleset and mode.
 *
 * Best-effort: this is a convenience, and a backend that is refusing writes — the
 * read-only or timed-out case in `storage.ts` — must not stop a game from starting.
 * `setItem` already discards a write it cannot perform and says so; this only
 * guards the call itself.
 */
export function saveNewGameConfig(
  ruleset: Ruleset,
  gameMode: GameMode,
): void {
  try {
    storage.setItem(
      LAST_NEW_GAME_CONFIG_KEY,
      JSON.stringify({
        ruleset: Session.descShortRuleset(ruleset),
        mode: Session.descGameMode(gameMode),
      }),
    );
  } catch (e) {
    reportSwallowed("NewGameConfig.save", e);
  }
}
/**
 * Reporting for the engine's *deliberately* non-fatal failures.
 *
 * ## Why this exists
 *
 * The port grew 28 `catch (e) {}` blocks, almost all wrapped around the combat
 * and trap **visualisation** sequence — `MapToScreen`, `OverlayImage`,
 * `AddOverlay`, and `RedrawPlayScreen` itself. Each is there because the C# drew
 * a damage popup through a GDI surface that could fail independently of the game
 * state, and the port wanted the simulation to survive a failed draw.
 *
 * That instinct is right. Silently swallowing is not: an empty `catch` makes a
 * *drawing* fault indistinguishable from *no fault at all*. A null field after a
 * save/load, an out-of-range overlay coordinate, a dead actor's stale position —
 * each of them left the screen stale and printed nothing, on a project whose
 * recorded lesson is that **the absence of an error is not evidence of
 * correctness**. Twelve of them even carried a note saying the guard was
 * redundant, which is a comment nobody can act on while the code stays silent.
 *
 * So: keep the guards, and make them say something. The failure is still
 * non-fatal — the simulation continues, which was the point — but it is now
 * visible in the console with the context needed to locate it.
 *
 * ## Why not throw
 *
 * A visualisation fault must not end a run. `metrics.error !== undefined` is
 * treated as a crash by the headless simulator, and the C# drew its popups
 * through a handle it checked rather than one it trusted, so a failed blit there
 * was never fatal to the game state either. Diverging on a crash is exactly the
 * kind of "crash is not behaviour worth preserving" decision the port records
 * deliberately; this is the opposite decision, and it is recorded here too.
 */

/**
 * Records a swallowed error.
 *
 * @param what Where it happened, in enough detail to find the call site. This is
 *   the only thing a console message gives you, and a bare stack trace from
 *   inside a draw helper is close to useless in a 26 000-line file.
 */
export function reportSwallowed(what: string, error: unknown): void {
  console.warn(`[RogueSurvivor] swallowed failure in ${what}:`, error);
}

/**
 * Starts an async call whose result nobody is waiting for, and makes sure a
 * rejection cannot escape.
 *
 * ## Why the plain `void` was not enough
 *
 * `void somePromise()` silences the *lint* rule, not the promise. A rejection
 * still reaches the host: silently in a browser console the player never opens,
 * and — because Node defaults to `--unhandled-rejections=throw` — as a **fatal
 * error that kills the process**, which is to say it kills the headless
 * simulator and Vitest. A promise nobody awaits is the one case where "nobody is
 * watching" actively makes things worse rather than merely quiet.
 *
 * So every deliberate fire-and-forget goes through here, which reports the
 * failure and keeps the process alive.
 *
 * ## When *not* to use it
 *
 * When ordering matters. A deferred call runs its synchronous prefix
 * immediately but its `await`s later, so anything it mutates can land after the
 * caller has moved on. `RogueGame.SpawnActorOnMapBorder` is the live case: it
 * calls `OnActorEnterTile` without waiting, so a trap under a freshly spawned
 * border actor resolves a tick late, out of order with the raid announcement the
 * caller prints. The honest fix is to make the spawner `async` and await it at
 * all eleven call sites; that was judged too broad to bundle with a diagnostics
 * change, and the ordering is recorded at the call site instead.
 */
export function fireAndForget(what: string, promise: Promise<unknown>): void {
  promise.catch((error) => reportSwallowed(`fire-and-forget ${what}`, error));
}

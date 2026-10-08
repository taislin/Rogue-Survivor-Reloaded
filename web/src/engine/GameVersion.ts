/**
 * The version string shown in the game's chrome.
 *
 * ## Why this module exists
 *
 * `0.9.2` was written out in three places: `package.json`, `RogueGame.ts` and
 * `OptionsScreen.ts`. The two source copies each carried a comment saying the other
 * must agree — `RogueGame`'s said it was "Duplicated rather than shared because the
 * C# keeps one `SetupConfig` constant and this port has no equivalent module to put
 * it in", and `OptionsScreen`'s said "Both must read the same, and both must agree
 * with `web/package.json`'s `version`".
 *
 * **No test checked either claim.** Both comments described an invariant that
 * nothing enforced, which is the state where a release bumps `package.json` and the
 * About box keeps advertising the previous build. The stated reason for the
 * duplication — that there was no module to put the constant in — is now false,
 * because this is that module.
 *
 * ## Why the number is still written out here
 *
 * It could be read from `package.json` at build time. That was not done here because
 * it trades a checked duplication for an unchecked one: `package.json` is not
 * importable from browser code without a build step that rewrites it, and a
 * `VITE_` define is only as reliable as the config that sets it. So the literal
 * stays, and `tests/version.test.ts` asserts all three agree — which is what the two
 * comments were asking for.
 */

/** Must equal `package.json`'s `version`. Asserted by `tests/version.test.ts`. */
export const GAME_VERSION = "0.9.5";
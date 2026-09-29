/**
 * The one place the deployment base path is decided.
 *
 * `base-path.ts` rather than a literal in each config because there are three
 * builds that disagree about where the game lives, and two of them are wrong
 * for it:
 *
 *   Neutralino (desktop)  "/"   dist/ is mounted at the VirtualFS root
 *                                    (neutralino.config.json: documentRoot
 *                                    "/dist/", url "/index.html"), so an
 *                                    absolute /assets is exactly right there.
 *   GitHub Pages          "/Rogue-Survivor-Reloaded/game/"
 *                                    the game sits in a subdirectory of the
 *                                    project site, because the docs site owns
 *                                    the root and the landing page.
 *   Anything else         "/"   the default, and what a plain static host gets.
 *
 * So the value is read from the environment rather than hardcoded. Hardcoding
 * the Pages path would break the desktop archives in GitHub Releases, and
 * hardcoding "/" would ship a black screen: every sprite is preloaded before
 * the first frame, so a wrong base is not a degraded game, it is an empty one.
 *
 * Vitest reads this too, and that is the reason it is a module. Vitest does not
 * inherit vite.config.mts — it has its own config file — so a base set in only
 * one of them leaves the suite asserting against a path the real build never
 * uses. Green tests, black screen. `BASE_PATH` in the test environment has to
 * be the same string the deploy builds with.
 *
 * The trailing slash is normalised because Vite requires the `/foo/` form and
 * every producer of this value is inconsistent about it: BASE_PATH is whatever
 * a human or a CI step typed, and the `base_path` output of
 * actions/configure-pages is `/my-repo` with no trailing slash. Two configs
 * disagreeing by one slash is a hard-to-spot build, and normalising once here
 * is cheaper than debugging it twice.
 */

/** `process.env.BASE_PATH` as given, or "/" when unset. */
const configured = process.env.BASE_PATH ?? "/";

/**
 * The base, guaranteed to end in a slash. Vite also accepts a full origin
 * (`https://example.com/game/`) and `./` for embedded use, neither of which
 * needs anything here beyond the slash.
 */
export const BASE_PATH = configured.endsWith("/") ? configured : `${configured}/`;

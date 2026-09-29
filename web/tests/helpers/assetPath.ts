import { join } from "node:path";
import { BASE_URL } from "@engine/BaseUrl";

/**
 * The deployment base the asset layer prefixes every URL with.
 *
 * Imported from `engine/BaseUrl.ts` rather than re-read from
 * `import.meta.env` here, because the tests' job is to catch the source and the
 * build config drifting apart. Reading the same constant the source reads is
 * what makes that possible; a second read of the env would be a third opinion.
 * See `web/base-path.ts` and the note in `vitest.config.mts` about why the test
 * config imports the value rather than repeating it.
 */
export const BASE = BASE_URL;

/**
 * Strip the base off a URL produced by `AssetPaths.ts`, leaving the path
 * relative to `public/`.
 *
 * The asset-existence assertions resolve a generated URL against the files in
 * `public/`, and the generated URL starts with the base, so it has to come off
 * before the join. This is deliberately not `replace(/^\//, "")`: that was the
 * old form and it happens to be correct only while the base is `/`. Under
 * `/Rogue-Survivor-Reloaded/game/` it leaves the repo and subdirectory on the
 * front, and every existence check reports a file that is not there — which
 * looks like a missing sprite rather than a stale assertion, and would send
 * someone looking for 1 124 files that all exist.
 *
 * Throws rather than returning a wrong path. Every caller is about to stat the
 * result, and a silently-mis-resolved path produces a test failure whose
 * message points at the asset rather than at this.
 */
export function publicFilePath(url: string): string {
  if (!url.startsWith(BASE)) {
    throw new Error(
      `asset URL does not start with the base ${JSON.stringify(BASE)}: ${url}`,
    );
  }
  return join(__dirname, "..", "..", "public", url.slice(BASE.length));
}

import { SOUND_FILES, MUSIC_FILES } from "@gameplay/GameSounds";

/**
 * Runtime asset locations.
 *
 * `web/public/assets/` is served at `/assets/`:
 *
 *   /assets/images/<imageSet>/<Category>/<name>.webp  sprites
 *   /assets/music/RS - <Title>.ogg                     music
 *   /assets/sfx/sfx - <name>.ogg                       sound effects
 *
 * The C# original kept the same three `Resources/` subtrees and resolved them by
 * id, with a `*_FILE` companion constant per id (see `GameSounds.cs`). The web
 * port keeps the ids as the single source of truth and derives the URL here, so
 * no call site builds a path by hand.
 *
 * Sprites are WebP, not PNG. The set is 1 124 32x32 pixel-art images; lossless
 * WebP is 13% of the PNG size for byte-identical visible pixels (see
 * scripts/optimize-sprites.py). `IMAGE_EXTENSION` is the one place that knows.
 */

export const ASSETS_ROOT = "/assets";
export const IMAGES_ROOT = `${ASSETS_ROOT}/images`;
export const MUSIC_ROOT = `${ASSETS_ROOT}/music`;
export const SFX_ROOT = `${ASSETS_ROOT}/sfx`;

/** Sprite file extension. Kept here so no call site hardcodes it. */
export const IMAGE_EXTENSION = "webp";

/** Sprite sets shipped in `assets/images/`; the others are variations of `classic`. */
export const IMAGE_SETS = ["classic", "deonapocalypse_v9_r1", "genesis_classic_1.4"] as const;
export type ImageSet = (typeof IMAGE_SETS)[number];

export const DEFAULT_IMAGE_SET: ImageSet = "classic";

let currentImageSet: ImageSet = DEFAULT_IMAGE_SET;

/**
 * Bumped every time the set changes.
 *
 * A cache that holds resolved URLs cannot see that the set it resolved them
 * against is no longer current, so whoever caches images needs a way to notice.
 * Publishing a generation is what makes that structural rather than a
 * responsibility: `CanvasUI` compares the generation it filled its cache under,
 * and any future cache does the same, instead of every caller having to remember
 * to invalidate. This is the same argument as the one for the save format's
 * version — a cache that silently serves the previous answer is worse than no
 * cache.
 */
let imageSetGeneration = 0;

export function getImageSet(): ImageSet {
  return currentImageSet;
}

/** The current set's generation; see `getImageSet`. */
export function getImageSetGeneration(): number {
  return imageSetGeneration;
}

/** Switches the sprite set; unknown names fall back to the default set. */
export function setImageSet(set: string): void {
  const next = (IMAGE_SETS as readonly string[]).includes(set) ? (set as ImageSet) : DEFAULT_IMAGE_SET;
  if (next === currentImageSet) return;
  currentImageSet = next;
  imageSetGeneration++;
}

/** `Activities/chasing` (or `Activities\chasing`) -> `/assets/images/classic/Activities/chasing.webp`. */
export function imagePath(imageId: string): string {
  return imagePathIn(currentImageSet, imageId);
}

/**
 * The same path, resolved against a *named* set rather than the current one.
 *
 * Needed for the fallback: a sprite missing from the selected set has to be
 * retried out of `classic`, and by then the current set is still the selected one.
 * Exported so the retry is a plain function call rather than a temporary change
 * of global state that something else could observe mid-draw.
 */
export function imagePathIn(set: ImageSet, imageId: string): string {
  return `${IMAGES_ROOT}/${set}/${imageId.replace(/\\/g, "/")}.${IMAGE_EXTENSION}`;
}

/** `army` -> `/assets/music/RS - Army.ogg`; already-resolved `*_FILE` values pass through. */
export function musicPath(musicId: string): string {
  const file = MUSIC_FILES[musicId];
  if (file != null) return `${MUSIC_ROOT}/${file}.ogg`;
  if (musicId.startsWith(ASSETS_ROOT)) return withOgg(musicId);
  return `${MUSIC_ROOT}/${musicId}.ogg`;
}

/** `undead rise` -> `/assets/sfx/sfx - undead rise.ogg`; already-resolved `*_FILE` values pass through. */
export function soundPath(soundId: string): string {
  const file = SOUND_FILES[soundId];
  if (file != null) return `${SFX_ROOT}/${file}.ogg`;
  if (soundId.startsWith(ASSETS_ROOT)) return withOgg(soundId);
  return `${SFX_ROOT}/${soundId}.ogg`;
}

function withOgg(path: string): string {
  return path.replace(/\.(mp3|ogg|wav)$/i, ".ogg");
}

/** Drops the `RS - ` / `sfx - ` file-name decorations, for logging. */
export function assetName(path: string): string {
  return path.substring(path.lastIndexOf("/") + 1).replace(/\.(png|webp|ogg|mp3|wav)$/i, "");
}

import { SOUND_FILES, MUSIC_FILES } from "@gameplay/GameSounds";

/**
 * Runtime asset locations.
 *
 * `web/public/assets/` is served at `/assets/`:
 *
 *   /assets/images/<imageSet>/<Category>/<name>.png   sprites
 *   /assets/music/RS - <Title>.ogg                     music
 *   /assets/sfx/sfx - <name>.ogg                       sound effects
 *
 * The C# original kept the same three `Resources/` subtrees and resolved them by
 * id, with a `*_FILE` companion constant per id (see `GameSounds.cs`). The web
 * port keeps the ids as the single source of truth and derives the URL here, so
 * no call site builds a path by hand.
 */

export const ASSETS_ROOT = "/assets";
export const IMAGES_ROOT = `${ASSETS_ROOT}/images`;
export const MUSIC_ROOT = `${ASSETS_ROOT}/music`;
export const SFX_ROOT = `${ASSETS_ROOT}/sfx`;

/** Sprite sets shipped in `assets/images/`; the others are variations of `classic`. */
export const IMAGE_SETS = ["classic", "deonapocalypse_v9_r1", "genesis_classic_1.4"] as const;
export type ImageSet = (typeof IMAGE_SETS)[number];

export const DEFAULT_IMAGE_SET: ImageSet = "classic";

let currentImageSet: ImageSet = DEFAULT_IMAGE_SET;

export function getImageSet(): ImageSet {
  return currentImageSet;
}

/** Switches the sprite set; unknown names fall back to the default set. */
export function setImageSet(set: string): void {
  currentImageSet = (IMAGE_SETS as readonly string[]).includes(set) ? (set as ImageSet) : DEFAULT_IMAGE_SET;
}

/** `Activities/chasing` (or `Activities\chasing`) -> `/assets/images/classic/Activities/chasing.png`. */
export function imagePath(imageId: string): string {
  return `${IMAGES_ROOT}/${currentImageSet}/${imageId.replace(/\\/g, "/")}.png`;
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
  return path.substring(path.lastIndexOf("/") + 1).replace(/\.(png|ogg|mp3|wav)$/i, "");
}

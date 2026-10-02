import { SOUND_FILES, MUSIC_FILES } from "@gameplay/GameSounds";
import { AMBIENT_FILES } from "@gameplay/GameAmbients";
import { BASE_URL } from "@engine/BaseUrl";

/**
 * Runtime asset locations.
 *
 * `web/public/assets/` is served under the deployment's base path:
 *
 *   <base>assets/images/<imageSet>/<Category>/<name>.webp  sprites
 *   <base>assets/music/RS - <Title>.ogg                     music
 *   <base>assets/sfx/sfx - <name>.ogg                       sound effects
 *   <base>assets/ambients/<name>.ogg                        ambient beds
 *
 * The base is `import.meta.env.BASE_URL` rather than a literal, which is what
 * lets the same build serve from a domain root and from a subdirectory. See
 * `web/base-path.ts` for who sets it and why the desktop build must keep `/`.
 * This is the one constant the whole asset layer hangs off — every path below
 * derives from it — so if the base is ever wrong, it is wrong for all 1 153
 * files at once, and the symptom is a black screen rather than a broken
 * sprite: the port preloads every image before the first frame, because a
 * browser cannot draw one it has not fetched.
 *
 * The C# original kept the same three `Resources/` subtrees and resolved them by
 * id, with a `*_FILE` companion constant per id (see `GameSounds.cs`). The web
 * port keeps the ids as the single source of truth and derives the URL here, so
 * no call site builds a path by hand. `Ambients/` is the fork's fourth subtree
 * (`GameAmbients.cs:9`), added with `Feature.AmbientAudio`; its file names carry
 * no `sfx - `/`RS - ` decoration, which is why it is a third root and not three
 * more entries in the two existing tables.

 *
 * Sprites are WebP, not PNG. The set is 1 124 32x32 pixel-art images; lossless
 * WebP is 13% of the PNG size for byte-identical visible pixels (see
 * scripts/optimize-sprites.py). `IMAGE_EXTENSION` is the one place that knows.
 */

// The base comes from engine/BaseUrl.ts, which explains both why it is read
// from the build and why the read is guarded. Always ends in a slash, which is
// why no separator is added below.
export const ASSETS_ROOT = `${BASE_URL}assets`;
export const IMAGES_ROOT = `${ASSETS_ROOT}/images`;
export const MUSIC_ROOT = `${ASSETS_ROOT}/music`;
export const SFX_ROOT = `${ASSETS_ROOT}/sfx`;
export const AMBIENTS_ROOT = `${ASSETS_ROOT}/ambients`;

/** Sprite file extension. Kept here so no call site hardcodes it. */
export const IMAGE_EXTENSION = "webp";

/**
 * Sprite sets shipped in `assets/images/`; the others are variations of `classic`.
 *
 * This array is the single source of truth: `GameOptions` reads the option's
 * bounds from it, so a set listed here appears in the options screen with no
 * other edit, and one missing from it is unreachable no matter what is on disk.
 */
export const IMAGE_SETS = [
  "classic",
  "deonapocalypse_v9_r1",
  "genesis_classic_1.4",
  "dafttiles_b1",
] as const;
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

/** `Activities/chasing` (or `Activities\chasing`) -> `<base>assets/images/classic/Activities/chasing.webp`. */
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

/** `army` -> `<base>assets/music/RS - Army.ogg`; already-resolved `*_FILE` values pass through. */
export function musicPath(musicId: string): string {
  const file = MUSIC_FILES[musicId];
  if (file != null) return `${MUSIC_ROOT}/${file}.ogg`;
  if (musicId.startsWith(ASSETS_ROOT)) return asOgg(musicId);
  return `${MUSIC_ROOT}/${musicId}.ogg`;
}

/** `undead rise` -> `<base>assets/sfx/sfx - undead rise.ogg`; already-resolved `*_FILE` values pass through. */
export function soundPath(soundId: string): string {
  const file = SOUND_FILES[soundId];
  if (file != null) return `${SFX_ROOT}/${file}.ogg`;
  // `asOgg`, not a replace-only helper, and this line was the whole of a real bug:
  // see `asOgg`. The shield-block pair is what proved it — `RogueGame`'s
  // `DoMeleeAttack` played `GameSounds.SHIELD_BLOCK_PLAYER_FILE`, whose value is a
  // bare path with no extension, so a replace found no suffix to convert and
  // returned a URL that does not exist. The effect was wired, reached the sfx
  // channel, got the right gain, and 404'd. `WebAudioSoundManager` dropped the
  // non-OK response without a word, so the sound was simply silent in play.
  if (soundId.startsWith(ASSETS_ROOT)) return asOgg(soundId);
  return `${SFX_ROOT}/${soundId}.ogg`;
}

/**
 * `wild animals` -> `<base>assets/ambients/night_animals.ogg`; already-resolved
 * `*_FILE` values pass through.
 *
 * The third channel's resolver, and the reason it does not consult `MUSIC_FILES`
 * or `SOUND_FILES`: an ambient id that is in neither table is a *bug in the
 * caller*, and guessing a directory for it here would turn that into a wrong file
 * playing. The C# has the same discipline by construction — `m_AmbientSFXManager`
 * is a separate player and only ever gets ids from `GameAmbients`.
 */
export function ambientPath(ambientId: string): string {
  const file = AMBIENT_FILES[ambientId];
  if (file != null) return `${AMBIENTS_ROOT}/${file}.ogg`;
  if (ambientId.startsWith(ASSETS_ROOT)) return asOgg(ambientId);
  return `${AMBIENTS_ROOT}/${ambientId}.ogg`;
}

/**
 * Resolve an id the music manager was handed, whether it is music **or** a
 * sound effect.
 *
 * This exists because the C# plays the three sound effects through the *music*
 * manager — `m_MusicManager.Play(GameSounds.UNDEAD_RISE, MusicPriority.PRIORITY_EVENT)`
 * at `src/Engine/RogueGame.cs:3280, 3611, 7052` — and loads them into it in the
 * same list as the tracks (`RogueGame.cs:1180-1182`). So one id namespace reaches
 * one player, and it is not a music-only namespace.
 *
 * The port kept a single `musicPath()` for that, which consults `MUSIC_FILES` and
 * on a miss falls through to `` `${MUSIC_ROOT}/${musicId}.ogg` ``. `undead rise`
 * is in `SOUND_FILES` and not `MUSIC_FILES`, so it resolved to
 * `<base>assets/music/undead rise.ogg` — a 404, verified against the shipped files
 * (`assets/sfx/sfx - undead rise.ogg` exists; `assets/music/` has no such file).
 * Because `play()` assigns `audioElement.src` *before* the request fails, the
 * effect did not merely fail to play: it replaced and so silenced whatever was
 * playing. A zombie's arrival — the moment the whole sound design is built
 * around — was mute, and it took the soundtrack with it.
 *
 * So: check both tables, and only guess a directory once neither knows the id.
 */
export function audioPath(id: string): string {
  if (MUSIC_FILES[id] != null) return musicPath(id);
  if (SOUND_FILES[id] != null) return soundPath(id);
  // Unknown to both: already-resolved paths pass through, anything else is
  // treated as a bare music name, which is the pre-existing behaviour.
  return musicPath(id);
}

/** Whether `id` names a shipped asset, in either table. */
export function isKnownAudioId(id: string): boolean {
  return MUSIC_FILES[id] != null || SOUND_FILES[id] != null;
}

/**
 * Normalises a path to `.ogg`, **adding** the extension when there is none.
 *
 * Adding is the whole point, and the reason this is not a `replace`. The C#'s
 * `*_FILE` constants carry no extension — `GameAmbients.cs:13` is
 * `Resources\Ambients\rain_outside_looped` — and the C# loader appends one at load
 * time (`MDXSoundManager.cs:48-51`, `return fileName + ".ogg";`). So a `*_FILE`
 * value reaching this file has no suffix, and a replace-only helper hands back a
 * URL the browser will 404.
 *
 * This was a real bug in `soundPath` and `musicPath`, and it was believed not to
 * be, on the grounds recorded in the sibling comment that "a music id never
 * arrives that way". A sound id arrived: `RogueGame`'s shield-block roll played
 * `SHIELD_BLOCK_PLAYER_FILE` and `SHIELD_BLOCK_NEARBY_FILE`, so the shield effect
 * was 404ing in play and nothing said so — `WebAudioSoundManager` dropped the
 * non-OK response without a word. `ambientPath` had it right all along, which is
 * the only reason anything on that channel was ever heard.
 *
 * A replace-only twin used to sit beside this one, for the case of an
 * already-resolved path that carries `.mp3`/`.wav` and needs converting. Nothing
 * passes such a path — the C#'s do not carry an extension either — so it is gone
 * rather than left as a second, weaker way to spell the same step. A helper that
 * silently fails to add a suffix is a trap, and the only way to keep one out of a
 * file like this is to not have it.
 */
function asOgg(path: string): string {
  return `${path.replace(/\.(mp3|ogg|wav)$/i, "")}.ogg`;
}

/** Drops the `RS - ` / `sfx - ` file-name decorations, for logging. */
export function assetName(path: string): string {
  return path.substring(path.lastIndexOf("/") + 1).replace(/\.(png|webp|ogg|mp3|wav)$/i, "");
}

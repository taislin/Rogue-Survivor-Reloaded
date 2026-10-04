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
 *
 * `civ13` is a **complete** set rather than a variant, which is worth recording
 * because Genesis — the set that made this a routing system at all — is not.
 * Measured on the two folders: civ13 has **1 113** sprites, **1 107** of which
 * exist in classic under the same id, and it adds six of its own
 * (`Icons/personal_enemy_{self,other,mutual}`, `Icons/scent_living_supressor`,
 * `MapObjects/crate`, `Tiles/Decoration/wall_char_office`). Only one classic sprite
 * is absent — `menu_title` — so the fallback borrows exactly one file and the set
 * ships all seven categories. That is the shape of `deonapocalypse_v9_r1` and
 * `genesis_classic_1.4`: one catch-all, its own directory first and `classic`
 * after it. No per-category routes are needed, and adding any would be cargo-cult
 * from the `genesis_actors_on_deonapocalypse` case.
 *
 * The same measurement found **no capitalisation mismatches** between civ13's
 * filenames and classic's ids. That is not a formality: `farm_fence_ew` versus
 * `farm_fence_EW`, and `ITEM_BIO_FORCE_GUN`, both shipped as 404s that worked
 * fine on macOS and Windows.
 */
export const IMAGE_SETS = [
  "classic",
  "deonapocalypse_v9_r1",
  "genesis_classic_1.4",
  "dafttiles_b1",
  "civ13",
  "genesis_actors_on_deonapocalypse",
] as const;
export type ImageSet = (typeof IMAGE_SETS)[number];

export const DEFAULT_IMAGE_SET: ImageSet = "classic";

/**
 * Where a sprite looks, in order, for one category of ids.
 *
 * `prefix` is matched against the image id with `/` separators, so `"Actors/"`
 * covers every actor and doll sprite. Routes are tried in order and the first
 * match wins, so a catch-all belongs **last**.
 */
export interface SpriteRoute {
  readonly prefix: string;
  readonly chain: readonly ImageSet[];
}

/**
 * How each style resolves a sprite.
 *
 * **Routes, not one chain, and that is not over-engineering.** Genesis is a
 * *variant of the classic set* rather than an actors-only pack: it ships all seven
 * categories — `Actors`, `Tiles`, `Items`, `Icons`, `MapObjects`, `Activities`,
 * `Effects`. So a single ordered chain would have answered "Genesis first" for
 * every sprite, and the combination people actually want — Genesis actors over a
 * Deonapocalypse world — would have quietly come out as Genesis *everything*,
 * with Deonaposecond supplying only the handful of sprites Genesis lacks (three).
 * Measured on the two folders: 336 of Genesis's 339 sprites also exist in
 * Deonapocalypse, and *zero* are Genesis-only.
 *
 * So a style is a list of routes, and prefix is what distinguishes an actor from
 * a wall. A style with no routes is the ordinary case: one catch-all, its own
 * directory first and `classic` after it, which is exactly what the hardcoded
 * fallback did before.
 *
 * Every chain ends in `classic`, which is the complete set — so an id missing from
 * all of them still draws, from the original game, rather than leaving a hole.
 *
 * **No merging and no copying.** The folders stay exactly as they are on disk and
 * the routing decides which one each sprite comes from.
 */
const IMAGE_SET_ROUTES: Readonly<Record<ImageSet, readonly SpriteRoute[]>> = {
  classic: [{ prefix: "", chain: ["classic"] }],
  deonapocalypse_v9_r1: [
    { prefix: "", chain: ["deonapocalypse_v9_r1", "classic"] },
  ],
  "genesis_classic_1.4": [
    { prefix: "", chain: ["genesis_classic_1.4", "classic"] },
  ],
  dafttiles_b1: [{ prefix: "", chain: ["dafttiles_b1", "classic"] }],
  // A complete set: all seven categories, 1 107 of 1 113 ids shared with classic
  // and six of its own, with `menu_title` the single sprite borrowed from the
  // fallback. So the ordinary shape — one catch-all — rather than the per-category
  // routing below. The measurement is in `IMAGE_SETS`'s docblock.
  civ13: [{ prefix: "", chain: ["civ13", "classic"] }],
  // Actors from Genesis, everything else from Deonapocalypse. Not a directory —
  // there is no such folder, and there does not need to be one.
  genesis_actors_on_deonapocalypse: [
    { prefix: "Actors/", chain: ["genesis_classic_1.4", "classic"] },
    { prefix: "", chain: ["deonapocalypse_v9_r1", "classic"] },
  ],
};

/**
 * The routes for a style. Exported as a function rather than the table so the
 * table stays private and no caller can reorder it in place.
 */
export function imageRoutes(set: ImageSet): readonly SpriteRoute[] {
  return IMAGE_SET_ROUTES[set] ?? [{ prefix: "", chain: [set, DEFAULT_IMAGE_SET] }];
}

/**
 * Whether a style is a folder of sprites rather than a routing between folders.
 *
 * The distinction is load-bearing for anything that inspects the disk: a routed
 * style has no folder of its own *by design* — there is nothing in it to be
 * missing — so "every advertised style has a folder" is true of the
 * folder-backed ones and meaningless for the rest.
 */
export function isFolderBacked(set: ImageSet): boolean {
  const routes = imageRoutes(set);
  return routes.length === 1 && routes[0]!.chain[0] === set;
}

/** The styles that are folders on disk, in `IMAGE_SETS` order. */
export function folderBackedSets(): ImageSet[] {
  return IMAGE_SETS.filter(isFolderBacked);
}
/**
 * The lookup order for one sprite under a style.
 *
 * First matching route wins, so a catch-all (`prefix: ""`, which matches
 * everything) has to be last in its list - and a style that forgot to order them
 * would resolve actors from Deonapocalypse while claiming to be Genesis.
 */
export function spriteChainFor(set: ImageSet, imageId: string): readonly ImageSet[] {
  const routes = imageRoutes(set);
  const id = imageId.replace(/\\/g, "/");
  for (const route of routes) {
    if (route.prefix === "" || id.startsWith(route.prefix)) return route.chain;
  }
  // Unreachable while every route list ends in a catch-all, but a chain is needed
  // and the last route is the least surprising answer.
  return routes[routes.length - 1]?.chain ?? [DEFAULT_IMAGE_SET];
}

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

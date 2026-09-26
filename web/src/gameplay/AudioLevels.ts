/**
 * Per-track audio loudness corrections — GENERATED, do not edit by hand.
 *
 * Regenerate with:  node scripts/measure-audio-levels.mjs
 * (requires `sox`)
 *
 * The shipped audio is inherited from the C# original and is wildly uneven:
 * music RMS ranges 0.055-0.267 and peak 0.365-1.000, so tracks differ by up to
 * ~20x in perceived loudness. Rather than re-encode 25 MB of music lossily, the
 * corrections are measured once and applied through a gain stage at playback
 * time; the files on disk are untouched. See scripts/measure-audio-levels.mjs for
 * the reasoning.
 *
 * Every gain satisfies `peak * gain <= 1.0`, so normalisation cannot introduce
 * clipping. Entries marked "peak-limited" could not reach the target RMS without
 * clipping and are intentionally left quieter.
 *
 * Music is normalised on RMS (perceived loudness); SFX on peak (short transients,
 * where a low peak just means "recorded quiet").
 */

import { MUSIC_FILES, SOUND_FILES } from "./GameSounds";

/** Measured music track levels. Gain is a multiplier applied at playback. */
export const MUSIC_GAINS: Readonly<Record<string, number>> = {
  "RS - Army": 1.505,
  "RS - Big Bear Theme Song": 1.156,
  "RS - Biker": 0.952,
  "RS - CUF": 0.869,
  "RS - Duckman Theme Song": 1.646,
  "RS - Famu Fataru Theme Song": 1.816,
  "RS - Fight": 0.941,
  "RS - Gangsta": 0.562,
  "RS - Hans von Hanz Theme Song": 1.479,
  "RS - Hey There": 0.874,
  "RS - Hospital": 1.768,
  "RS - Insane": 0.908,
  "RS - Interlude - Loop": 1.646,
  "RS - Intro": 1.482,
  "RS - Limbo": 0.581,
  "RS - Post mortem": 1.25,
  "RS - Reincarnate": 1.135,
  "RS - Roguedjack Theme Song": 2.736,
  "RS - Santaman Theme Song": 0.707,
  "RS - Sewers": 0.918,
  "RS - Sleep - Loop": 1.111,
  "RS - Subway": 1.89,
  "RS - Surface": 1.102,
  "RS - Survivors": 0.749,
};

/** Measured sound effect levels. Gain is a multiplier applied at playback. */
export const SFX_GAINS: Readonly<Record<string, number>> = {
  "sfx - nightmare": 0.95,
  "sfx - undead eat": 2.446,
  "sfx - undead rise": 1.128,
};

/** Raw measurements, for diagnostics and for the tests that pin the maths. */
export const AUDIO_MEASUREMENTS = {
  music: {
    "RS - Army": { peak: 0.664154, rms: 0.058393, gain: 1.505, peakLimited: true },
    "RS - Big Bear Theme Song": { peak: 0.483429, rms: 0.129734, gain: 1.156, peakLimited: false },
    "RS - Biker": { peak: 0.601105, rms: 0.157475, gain: 0.952, peakLimited: false },
    "RS - CUF": { peak: 0.970551, rms: 0.172441, gain: 0.869, peakLimited: false },
    "RS - Duckman Theme Song": { peak: 0.607422, rms: 0.071477, gain: 1.646, peakLimited: true },
    "RS - Famu Fataru Theme Song": { peak: 0.490112, rms: 0.082588, gain: 1.816, peakLimited: false },
    "RS - Fight": { peak: 0.958313, rms: 0.159350, gain: 0.941, peakLimited: false },
    "RS - Gangsta": { peak: 0.990173, rms: 0.266641, gain: 0.562, peakLimited: false },
    "RS - Hans von Hanz Theme Song": { peak: 0.675995, rms: 0.098712, gain: 1.479, peakLimited: true },
    "RS - Hey There": { peak: 0.875061, rms: 0.171582, gain: 0.874, peakLimited: false },
    "RS - Hospital": { peak: 0.536865, rms: 0.084804, gain: 1.768, peakLimited: false },
    "RS - Insane": { peak: 0.726990, rms: 0.165173, gain: 0.908, peakLimited: false },
    "RS - Interlude - Loop": { peak: 0.607208, rms: 0.079901, gain: 1.646, peakLimited: true },
    "RS - Intro": { peak: 0.481049, rms: 0.101156, gain: 1.482, peakLimited: false },
    "RS - Limbo": { peak: 0.999969, rms: 0.257796, gain: 0.581, peakLimited: false },
    "RS - Post mortem": { peak: 0.639587, rms: 0.119983, gain: 1.25, peakLimited: false },
    "RS - Reincarnate": { peak: 0.880981, rms: 0.096319, gain: 1.135, peakLimited: true },
    "RS - Roguedjack Theme Song": { peak: 0.365417, rms: 0.054624, gain: 2.736, peakLimited: true },
    "RS - Santaman Theme Song": { peak: 0.999969, rms: 0.212125, gain: 0.707, peakLimited: false },
    "RS - Sewers": { peak: 0.671753, rms: 0.163339, gain: 0.918, peakLimited: false },
    "RS - Sleep - Loop": { peak: 0.899750, rms: 0.131203, gain: 1.111, peakLimited: true },
    "RS - Subway": { peak: 0.517975, rms: 0.079334, gain: 1.89, peakLimited: false },
    "RS - Surface": { peak: 0.888611, rms: 0.136057, gain: 1.102, peakLimited: false },
    "RS - Survivors": { peak: 0.997986, rms: 0.200204, gain: 0.749, peakLimited: false },
  },
  sfx: {
    "sfx - nightmare": { peak: 0.999969, rms: 0.217036, gain: 0.95, peakLimited: false },
    "sfx - undead eat": { peak: 0.388367, rms: 0.012583, gain: 2.446, peakLimited: false },
    "sfx - undead rise": { peak: 0.841797, rms: 0.093365, gain: 1.128, peakLimited: false },
  },
};

/**
 * Loudness correction for a music id (a `GameMusics` constant).
 *
 * The table is keyed by file basename because that is what sox measured, so the
 * id is resolved through `MUSIC_FILES` first — the same lookup `musicPath()`
 * performs. Unknown ids get 1.0, i.e. no correction.
 */
export function musicGain(musicId: string): number {
  const file = MUSIC_FILES[musicId];
  return (file === undefined ? undefined : MUSIC_GAINS[file]) ?? 1.0;
}

/** Loudness correction for a sound id (a `GameSounds` constant). */
export function sfxGain(soundId: string): number {
  const file = SOUND_FILES[soundId];
  return (file === undefined ? undefined : SFX_GAINS[file]) ?? 1.0;
}

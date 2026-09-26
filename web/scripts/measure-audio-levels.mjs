#!/usr/bin/env node
/**
 * Measure the shipped audio assets and regenerate `src/gameplay/AudioLevels.ts`.
 *
 *   node scripts/measure-audio-levels.mjs
 *
 * WHY THIS EXISTS
 *
 * The C# original played these files through DirectX/SFML at a single fixed
 * volume per category, so wildly different source levels went unnoticed. In the
 * browser they are audible: the music tracks span an RMS of 0.055 to 0.267, a
 * ~20x range in perceived loudness, so the player is constantly turning the
 * volume up and down as the soundtrack changes.
 *
 * WHY IT IS DONE AT RUNTIME RATHER THAN BY RE-ENCODING
 *
 * The obvious fix is to normalise the files. That means a second lossy encode of
 * 25 MB of music, which cannot be undone, is not reproducible from the repo
 * without the toolchain that produced it, and throws away the original masters.
 * Instead we measure once, offline, and store the correction factors in a
 * generated table that the audio managers apply through a gain stage. The files
 * on disk stay byte-identical to the C# originals.
 *
 * THE TWO NORMALISATIONS
 *
 * Music is normalised on RMS, which tracks perceived loudness far better than
 * peak. SFX are normalised on peak, which is the standard for short transient
 * sounds: an effect whose peak is low is simply recorded quiet, and pushing its
 * RMS to match a dense music bed would just amplify its noise floor.
 *
 * In both cases the gain is capped so that `peak * gain <= 1.0`. That is what
 * keeps normalisation from being distortion: a track that is quiet *and* peaky
 * simply cannot be brought up to the target without clipping, so it is left
 * quieter. The tables below record where that limit bound.
 *
 * Requires `sox` on PATH.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const musicDir = join(webRoot, "public", "assets", "music");
const sfxDir = join(webRoot, "public", "assets", "sfx");
const outFile = join(webRoot, "src", "gameplay", "AudioLevels.ts");

/** Target RMS for music. Roughly the middle of the shipped range. */
const MUSIC_TARGET_RMS = 0.15;
/** Target peak for SFX, just under full scale to leave a little headroom. */
const SFX_TARGET_PEAK = 0.95;
/** Hard ceiling on any correction, ~8 dB. */
const MAX_GAIN = 3.0;

/**
 * Peak and RMS for one audio file, via `sox ... stat`.
 *
 * `stat` writes to *stderr*, not stdout — execFileSync would silently hand back
 * an empty string and every measurement would come out NaN. spawnSync is used
 * so stderr can be read explicitly, and a non-numeric result is a hard error
 * rather than a silently-poisoned table.
 */
function measure(file) {
  const res = spawnSync("sox", [file, "-n", "stat"], { encoding: "utf8" });
  const stat = res.stderr ?? "";
  const num = (re) => {
    const m = re.exec(stat);
    return m ? Number.parseFloat(m[1]) : Number.NaN;
  };
  const peak = num(/^Maximum amplitude:\s+(\S+)/m);
  const rms = num(/^RMS\s+amplitude:\s+(\S+)/m);
  if (!Number.isFinite(peak) || !Number.isFinite(rms)) {
    throw new Error(`could not measure ${file} (peak=${peak} rms=${rms})`);
  }
  return { peak, rms };
}

/**
 * Correction factor for one file.
 * `target / actual`, never exceeding MAX_GAIN, and never enough to clip.
 *
 * The gain is floored to 3 decimals rather than rounded to nearest: rounding to
 * nearest can land a hair *above* the no-clip bound (peak 0.6639 x 1.506 =
 * 1.00003), which would make normalisation introduce the very clipping it
 * exists to avoid. Flooring is strictly safe and the difference is inaudible.
 */
function gainFor({ peak, rms }, target, usePeak) {
  const wanted = usePeak ? target / peak : target / rms;
  const noClip = 1 / peak;
  const gain = Math.min(wanted, noClip, MAX_GAIN);
  // Floor, do not round to nearest: rounding can land a hair *above* the
  // no-clip bound (peak 0.6639 x 1.506 = 1.00003), which would make
  // normalisation introduce the very clipping it exists to avoid. Flooring is
  // strictly safe and the difference is inaudible. Do NOT clamp to a minimum of
  // 1 -- gains below 1 are the entire point for the loud half of the library.
  return {
    gain: Number((Math.floor(gain * 1000) / 1000).toFixed(3)),
    clippedByPeak: wanted > noClip + 1e-9,
  };
}

const music = {};
for (const file of readdirSync(musicDir).filter((f) => f.endsWith(".ogg")).sort()) {
  const id = basename(file, ".ogg");
  const m = measure(join(musicDir, file));
  const { gain, clippedByPeak } = gainFor(m, MUSIC_TARGET_RMS, false);
  music[id] = { gain, peak: m.peak, rms: m.rms, clippedByPeak };
}

const sfx = {};
for (const file of readdirSync(sfxDir).filter((f) => f.endsWith(".ogg")).sort()) {
  const id = basename(file, ".ogg");
  const m = measure(join(sfxDir, file));
  const { gain, clippedByPeak } = gainFor(m, SFX_TARGET_PEAK, true);
  sfx[id] = { gain, peak: m.peak, rms: m.rms, clippedByPeak };
}

const row = (name, e) =>
  `  ${JSON.stringify(name)}: { gain: ${e.gain}, peak: ${e.peak.toFixed(6)}, rms: ${e.rms.toFixed(6)} },` +
  `${e.clippedByPeak ? " // peak-limited: cannot reach target without clipping" : ""}`;

const source = `/**
 * Per-track audio loudness corrections — GENERATED, do not edit by hand.
 *
 * Regenerate with:  node scripts/measure-audio-levels.mjs
 * (requires \`sox\`)
 *
 * The shipped audio is inherited from the C# original and is wildly uneven:
 * music RMS ranges 0.055-0.267 and peak 0.365-1.000, so tracks differ by up to
 * ~20x in perceived loudness. Rather than re-encode 25 MB of music lossily, the
 * corrections are measured once and applied through a gain stage at playback
 * time; the files on disk are untouched. See scripts/measure-audio-levels.mjs for
 * the reasoning.
 *
 * Every gain satisfies \`peak * gain <= 1.0\`, so normalisation cannot introduce
 * clipping. Entries marked "peak-limited" could not reach the target RMS without
 * clipping and are intentionally left quieter.
 *
 * Music is normalised on RMS (perceived loudness); SFX on peak (short transients,
 * where a low peak just means "recorded quiet").
 */

import { MUSIC_FILES, SOUND_FILES } from "./GameSounds";

/** Measured music track levels. Gain is a multiplier applied at playback. */
export const MUSIC_GAINS: Readonly<Record<string, number>> = {
${Object.entries(music)
  .map(([n, e]) => `  ${JSON.stringify(n)}: ${e.gain},`)
  .join("\n")}
};

/** Measured sound effect levels. Gain is a multiplier applied at playback. */
export const SFX_GAINS: Readonly<Record<string, number>> = {
${Object.entries(sfx)
  .map(([n, e]) => `  ${JSON.stringify(n)}: ${e.gain},`)
  .join("\n")}
};

/** Raw measurements, for diagnostics and for the tests that pin the maths. */
export const AUDIO_MEASUREMENTS = {
  music: {
${Object.entries(music)
  .map(([n, e]) => `    ${JSON.stringify(n)}: { peak: ${e.peak.toFixed(6)}, rms: ${e.rms.toFixed(6)}, gain: ${e.gain}, peakLimited: ${e.clippedByPeak} },`)
  .join("\n")}
  },
  sfx: {
${Object.entries(sfx)
  .map(([n, e]) => `    ${JSON.stringify(n)}: { peak: ${e.peak.toFixed(6)}, rms: ${e.rms.toFixed(6)}, gain: ${e.gain}, peakLimited: ${e.clippedByPeak} },`)
  .join("\n")}
  },
};

/**
 * Loudness correction for a music id (a \`GameMusics\` constant).
 *
 * The table is keyed by file basename because that is what sox measured, so the
 * id is resolved through \`MUSIC_FILES\` first — the same lookup \`musicPath()\`
 * performs. Unknown ids get 1.0, i.e. no correction.
 */
export function musicGain(musicId: string): number {
  const file = MUSIC_FILES[musicId];
  return (file === undefined ? undefined : MUSIC_GAINS[file]) ?? 1.0;
}

/** Loudness correction for a sound id (a \`GameSounds\` constant). */
export function sfxGain(soundId: string): number {
  const file = SOUND_FILES[soundId];
  return (file === undefined ? undefined : SFX_GAINS[file]) ?? 1.0;
}
`;

writeFileSync(outFile, source, "utf8");

// Report the spread before and after, which is the whole point of the exercise.
const spread = (entries, get) => {
  const vals = entries.map((e) => get(e) * (e.gain ?? 1));
  return Math.max(...vals) / Math.min(...vals);
};
const before = (entries, get) => {
  const vals = entries.map((e) => get(e));
  return Math.max(...vals) / Math.min(...vals);
};

console.log(`wrote ${outFile}`);
console.log(`\nmusic: ${Object.keys(music).length} tracks, ${Object.keys(sfx).length} sfx`);
console.log(`  RMS spread  before ${before(Object.values(music), (e) => e.rms).toFixed(2)}x` +
            `  after ${spread(Object.values(music), (e) => e.rms).toFixed(2)}x`);
console.log(`  peak spread before ${before(Object.values(music), (e) => e.peak).toFixed(2)}x` +
            `  after ${spread(Object.values(music), (e) => e.peak).toFixed(2)}x`);
const limited = Object.entries(music).filter(([, e]) => e.clippedByPeak).map(([n]) => n);
if (limited.length) console.log(`  peak-limited (left quieter to avoid clipping): ${limited.join(", ")}`);

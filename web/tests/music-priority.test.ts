import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MusicPriority } from "@engine/audio/IMusicManager";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { audioPath, isKnownAudioId, musicPath, soundPath } from "@engine/AssetPaths";
import { GameSounds, GameMusics } from "@gameplay/GameSounds";
import { publicFilePath } from "./helpers/assetPath";

/**
 * The music manager is handed *sound effects* as well as tracks, and it used to
 * resolve every id against the music table alone.
 *
 * The C# loads the three effects into the music manager in the same list as the
 * tracks (`src/Engine/RogueGame.cs:1180-1182`) and plays them through it at
 * `PRIORITY_EVENT` (`:3280`, `:3611`, `:7052`). The port kept one `musicPath()`
 * for that, which consults `MUSIC_FILES` and otherwise falls through to
 * `` `${MUSIC_ROOT}/${id}.ogg` ``.
 *
 * `undead rise` is in `SOUND_FILES`, so it resolved to
 * `/assets/music/undead rise.ogg`. There is no such file — the shipped one is
 * `assets/sfx/sfx - undead rise.ogg` — so it was a 404. And because `play()`
 * assigns `audioElement.src` *before* the request resolves, the effect did not
 * merely fail: it replaced, and so silenced, whatever was playing. A zombie's
 * arrival, the moment the sound design is built around, was mute and took the
 * soundtrack with it.
 *
 * These assertions are about *resolvable ids and real files*, because that is the
 * part that was silently wrong. Whether a given `.ogg` decodes is a browser
 * question this suite cannot answer — `NullRogueUI`/`NullMusicManager` drop every
 * call, which is exactly why the original bug was invisible here.
 */

/** `/assets/...` -> the file under `web/public`. */
function publicFile(url: string): string {
  return publicFilePath(url);
}

describe("every id the music manager is given resolves to a real file", () => {
  // Only the bare ids, which is what `play()` is called with: the classes also
  // carry `PATH` and a `*_FILE` per id, and those are already-resolved URLs that
  // take a different branch through `audioPath`.
  const MANAGED = [
    ...Object.values(GameSounds),
    ...Object.values(GameMusics),
  ].filter((v) => typeof v === "string" && !v.startsWith("/")) as string[];

  it("covers the three sound effects the C# plays through the music manager", () => {
    // Spelled out rather than derived, so deleting one from the game fails here.
    expect(MANAGED).toContain(GameSounds.UNDEAD_RISE);
    expect(MANAGED).toContain(GameSounds.NIGHTMARE);
    expect(MANAGED).toContain(GameSounds.UNDEAD_EAT);
  });

  it("resolves every managed id to a file that exists on disk", () => {
    const missing: string[] = [];
    for (const id of MANAGED) {
      const url = audioPath(id);
      if (!existsSync(publicFile(url))) missing.push(`${id} -> ${url}`);
    }
    expect(missing, `unresolvable audio ids:\n${missing.join("\n")}`).toEqual([]);
  });

  it("routes a sound effect to sfx/ and a track to music/", () => {
    // The distinction `audioPath` exists to make, asserted on the real ids.
    expect(audioPath(GameSounds.UNDEAD_RISE)).toMatch(/^\/assets\/sfx\//);
    expect(audioPath(GameSounds.NIGHTMARE)).toMatch(/^\/assets\/sfx\//);
    expect(audioPath(GameSounds.UNDEAD_EAT)).toMatch(/^\/assets\/sfx\//);
    expect(audioPath(GameMusics.ARMY)).toMatch(/^\/assets\/music\//);
  });

  it("knows every managed id in one of the two tables", () => {
    const unknown = MANAGED.filter((id) => !isKnownAudioId(id));
    expect(unknown, `ids in neither MUSIC_FILES nor SOUND_FILES: ${unknown.join(", ")}`).toEqual([]);
  });

  it("musicPath alone would still miss the sound effects — the trap that was live", () => {
    // Not a tautology: this is the *pre-fix* behaviour, kept so the reason
    // `audioPath` exists cannot be quietly deleted. If a sound effect is ever
    // added to the music table, this is the assertion that says so.
    for (const id of [GameSounds.UNDEAD_RISE, GameSounds.NIGHTMARE, GameSounds.UNDEAD_EAT]) {
      expect(musicPath(id)).not.toBe(audioPath(id));
      expect(soundPath(id)).toBe(audioPath(id));
    }
  });

  it("the music manager resolves through audioPath, not musicPath", () => {
    // The assertion above only pins the helper. This pins the *caller*, which is
    // where the 404 actually was: a helper nobody calls is still a broken game.
    const src = readFileSync(
      join(__dirname, "..", "src", "engine", "audio", "WebAudioMusicManager.ts"),
      "utf-8",
    );
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");

    expect(code, "WebAudioMusicManager must resolve ids with audioPath").toContain("audioPath(");
    expect(
      code,
      "WebAudioMusicManager must not resolve ids with musicPath — sound effects live in the sfx table",
    ).not.toMatch(/[^a-zA-Z]musicPath\(/);
  });
});

describe("MusicPriority", () => {
  it("keeps the C# values, which the BGM guard compares against", () => {
    // src/Engine/IMusicManager.cs:14-24. `NULL` must be 0, and `UpdateBgMusic`'s
    // guard is `> BGM`, so these are load-bearing, not descriptive.
    expect(MusicPriority.NULL).toBe(0);
    expect(MusicPriority.BGM).toBe(1);
    expect(MusicPriority.EVENT).toBe(2);
  });

  it("reports a higher priority for an event track than for background music", () => {
    // The whole point of the concept, and the reason `UpdateBgMusic` can leave a
    // raid theme alone: `getPriority() > BGM` must be true for an event.
    expect(MusicPriority.EVENT > MusicPriority.BGM).toBe(true);
    expect(MusicPriority.BGM > MusicPriority.BGM).toBe(false);
  });

  it("a stopped NullMusicManager reports NULL and nothing playing", () => {
    const m = new NullMusicManager();
    expect(m.getPriority()).toBe(MusicPriority.NULL);
    expect(m.isPlaying()).toBe(false);
    expect(m.getCurrentMusicId()).toBeNull();
  });
});

describe("the music manager distinguishes a one-shot from a loop", () => {
  it("exposes play and playLooping as separate operations", () => {
    // The port hard-coded `audioElement.loop = true` in the constructor and never
    // reset it, so `PLAYER_DEATH`, `FIGHT`, `INTRO` and all three ~1s sound
    // effects looped for the rest of the session. C# `SFMLSoundManager` sets
    // `music.Loop = true` only in `PlayLooping` (:129-145).
    const m = new NullMusicManager();
    expect(typeof m.play).toBe("function");
    expect(typeof m.playLooping).toBe("function");
    expect(m.play).not.toBe(m.playLooping);
  });
});

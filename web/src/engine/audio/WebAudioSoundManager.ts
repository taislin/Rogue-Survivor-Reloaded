import { ISoundManager } from './ISoundManager';
import { soundPath } from '@engine/AssetPaths';
import { sfxGain } from '@gameplay/AudioLevels';
import { reportSwallowed } from "@engine/Diagnostics";

export class WebAudioSoundManager implements ISoundManager {
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private volume: number = 1.0;
  private enabled: boolean = true;

  constructor() {
    // AudioContext will be initialized on first user interaction to comply with autoplay policies
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Ids with a live buffer source right now.
   *
   * Exists for `playIfNotAlreadyPlaying`, which the C# also tracks (it asks
   * `IsPlaying`). Set when a source starts and cleared on its `onended`, so an id
   * drops out when the buffer finishes rather than when it was scheduled.
   */
  private readonly playing = new Set<string>();

  /**
   * C# `PlayIfNotAlreadyPlaying` -- `ISoundManager.cs:44`.
   *
   * Returns whether it started anything, which is what the C#'s callers would read
   * off `IsPlaying` afterwards.
   */
  public playIfNotAlreadyPlaying(soundId: string): boolean {
    if (!this.enabled || this.volume <= 0) return false;
    if (this.playing.has(soundId)) return false;
    void this.play(soundId);
    return true;
  }

  public async play(soundId: string): Promise<void> {
    if (!this.enabled || this.volume <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    let buffer = this.buffers.get(soundId);
    if (!buffer) {
      try {
        const url = soundPath(soundId);
        const response = await fetch(url);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(soundId, buffer);
      } catch (e) {
        // A sound id with no file behind it is a packaging bug, not a condition
        // to absorb: the player hears nothing and the log stays empty.
        reportSwallowed(`WebAudioSoundManager.play("${soundId}")`, e);
        return;
      }
    }

    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = this.ctx.createGain();
      // Per-sound loudness correction (see gameplay/AudioLevels.ts) folded into
      // the master volume, so effects are as audible as the music bed. The
      // shipped sfx are peak-normalised, which matters most for "undead eat" —
      // its peak is 0.39 against 1.0 for "nightmare".
      gainNode.gain.value = this.volume * sfxGain(soundId);
      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      this.playing.add(soundId);
      source.onended = () => {
        this.playing.delete(soundId);
      };
      source.start(0);
    }
  }

  public stopAll(): void {
    // Web Audio buffer sources stop automatically when finished.
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.volume;
  }

  public async preload(soundIds: string[]): Promise<void> {
    this.initContext();
    if (!this.ctx) return;
    
    for (const id of soundIds) {
      if (this.buffers.has(id)) continue;
      try {
        const url = soundPath(id);
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.buffers.set(id, buffer);
        }
      } catch (e) {
        // Preloading is best-effort per id, so one missing file must not abandon
        // the rest — but it still gets said, for the same reason as above.
        reportSwallowed(`WebAudioSoundManager.preload("${id}")`, e);
      }
    }
  }
}

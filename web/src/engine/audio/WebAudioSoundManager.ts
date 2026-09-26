import { ISoundManager } from './ISoundManager';
import { soundPath } from '@engine/AssetPaths';
import { sfxGain } from '@gameplay/AudioLevels';

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
        // Fallback or ignore missing sound asset
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
        // ignore individual preload failures
      }
    }
  }
}

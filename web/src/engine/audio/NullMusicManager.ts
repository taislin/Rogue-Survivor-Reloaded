import { IMusicManager, MusicPriority, type MusicPriorityValue } from './IMusicManager';

/**
 * No audio at all — the headless simulator's manager.
 *
 * Records nothing and answers nothing, so a test can never tell it apart from a
 * working one by its results. That is deliberate: `NullRogueUI` works the same
 * way, and it is the reason the sim is blind to presentation faults.
 */
export class NullMusicManager implements IMusicManager {
  play(_musicId: string, _priority: MusicPriorityValue): void {}
  playLooping(_musicId: string, _priority: MusicPriorityValue): void {}
  playIfNotAlreadyPlaying(_musicId: string, _priority: MusicPriorityValue): void {}
  stop(): void {}
  pause(): void {}
  resume(): void {}
  isPlaying(): boolean { return false; }
  getCurrentMusicId(): string | null { return null; }
  getPriority(): MusicPriorityValue { return MusicPriority.NULL; }
  setVolume(_vol: number): void {}
  getVolume(): number { return 0; }
}

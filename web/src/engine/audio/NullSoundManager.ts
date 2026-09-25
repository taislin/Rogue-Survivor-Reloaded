import { ISoundManager } from './ISoundManager';

export class NullSoundManager implements ISoundManager {
  play(_soundId: string): void {}
  stopAll(): void {}
  setVolume(_vol: number): void {}
  getVolume(): number { return 0; }
  async preload(_soundIds: string[]): Promise<void> {}
}

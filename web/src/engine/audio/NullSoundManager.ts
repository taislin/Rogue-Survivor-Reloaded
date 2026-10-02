import { ISoundManager } from './ISoundManager';

export class NullSoundManager implements ISoundManager {
  play(_soundId: string): void {}
  playIfNotAlreadyPlaying(_soundId: string): boolean {
    return false;
  }
  stopAll(): void {}
  setVolume(_vol: number): void {}
  getVolume(): number { return 0; }
  setEnabled(_on: boolean): void {}
  async preload(_soundIds: string[]): Promise<void> {}
}

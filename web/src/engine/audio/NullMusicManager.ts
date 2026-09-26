import { IMusicManager } from './IMusicManager';

export class NullMusicManager implements IMusicManager {
  play(_musicId: string): void {}
  stop(): void {}
  pause(): void {}
  resume(): void {}
  isPlaying(): boolean { return false; }
  getCurrentMusicId(): string | null { return null; }
  setVolume(_vol: number): void {}
  getVolume(): number { return 0; }
}

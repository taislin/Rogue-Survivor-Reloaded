export interface ISoundManager {
  play(soundId: string): void;
  stopAll(): void;
  setVolume(vol: number): void;
  getVolume(): number;
  preload(soundIds: string[]): Promise<void>;
}

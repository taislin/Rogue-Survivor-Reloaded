export interface IMusicManager {
  play(musicId: string): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPlaying(): boolean;
  setVolume(vol: number): void;
  getVolume(): number;
}

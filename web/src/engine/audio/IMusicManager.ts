export interface IMusicManager {
  play(musicId: string): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPlaying(): boolean;
  /** C# `IMusicManager.Music` — id of the track loaded/playing, null when stopped. */
  getCurrentMusicId(): string | null;
  setVolume(vol: number): void;
  getVolume(): number;
}

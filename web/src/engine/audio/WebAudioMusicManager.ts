import { IMusicManager } from './IMusicManager';

export class WebAudioMusicManager implements IMusicManager {
  private audioElement: HTMLAudioElement | null = null;
  private currentMusicId: string | null = null;
  private volume: number = 0.5;
  private isPlayingState: boolean = false;

  constructor() {
    this.audioElement = new Audio();
    this.audioElement.loop = true;
    this.audioElement.volume = this.volume;
  }

  public play(musicId: string): void {
    if (!this.audioElement) return;
    if (this.currentMusicId === musicId && this.isPlayingState) return;

    const normalized = musicId.replace(/\\/g, '/');
    const url = `/assets/${normalized}.ogg`;
    
    this.audioElement.src = url;
    this.audioElement.volume = this.volume;
    this.audioElement.play().then(() => {
      this.isPlayingState = true;
      this.currentMusicId = musicId;
    }).catch(() => {
      // Autoplay blocked or asset not found
      this.isPlayingState = false;
    });
  }

  public stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isPlayingState = false;
      this.currentMusicId = null;
    }
  }

  public pause(): void {
    if (this.audioElement && this.isPlayingState) {
      this.audioElement.pause();
      this.isPlayingState = false;
    }
  }

  public resume(): void {
    if (this.audioElement && !this.isPlayingState && this.currentMusicId) {
      this.audioElement.play().then(() => {
        this.isPlayingState = true;
      }).catch(() => {});
    }
  }

  public isPlaying(): boolean {
    return this.isPlayingState;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.audioElement) {
      this.audioElement.volume = this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }
}

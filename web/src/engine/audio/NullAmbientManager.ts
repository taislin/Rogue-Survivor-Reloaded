import { IAmbientManager } from "./IAmbientManager";

/**
 * No ambient audio — the headless simulator's and the tests' manager.
 *
 * Same bargain as `NullMusicManager`: it records nothing and answers nothing, so a
 * test cannot tell it apart from a working one by its results. That is deliberate —
 * the sim is blind to presentation faults, which is the property the whole headless
 * suite relies on. `tests/ambient-audio.test.ts` uses it to prove the game under
 * `NullRogueUI` drives a third channel without reaching for a DOM.
 */
export class NullAmbientManager implements IAmbientManager {
  play(_ambientId: string): void {}
  playLooping(_ambientId: string): void {}
  playIfNotAlreadyPlaying(_ambientId: string, _looping: boolean): void {}
  stop(_ambientId: string): void {}
  stopAll(): void {}
  pauseAll(): void {}
  resumeAll(): void {}
  isPlaying(_ambientId: string): boolean { return false; }
  isAnyPlaying(): boolean { return false; }
  getPlayingAmbients(): readonly string[] { return []; }
  setVolume(_vol: number): void {}
  getVolume(): number { return 0; }
  setEnabled(_on: boolean): void {}
}

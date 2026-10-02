/**
 * The options-menu level preview — C# `RogueGame.OptionsMenuAudioAdjustment`
 * (`RogueGame.cs:2230`, Still Alive, Release 7-3).
 *
 * ## Why it is a free function and not a method
 *
 * The C# has one method and calls it from two handlers. The port splits those two
 * handlers across two files — `RogueGame.HandleOptions` builds an `OptionsScreen`,
 * and `OptionsScreen` is where the input loop actually lives — so a method on
 * `RogueGame` would be unreachable from the screen that needs it: the screen is
 * handed three audio managers, not a game.
 *
 * The first attempt put a copy on each side. That compiled, passed, and left
 * `RogueGame.optionsMenuAudioAdjustment` with no caller at all — a dead method on
 * the class that Wave 0 exists to shrink, which is the wrong direction for a change
 * whose whole purpose is to reduce it. One function, two arguments, no duplicate.
 *
 * ## What it does
 *
 * "Plays a track when cursor on one of the volume adjustment options. For choosing
 * the level that suits you." Stepping a volume row in a menu that shows no preview
 * is how a player ends up with audio they cannot hear and no idea why, so the C#
 * starts a dedicated cue for whichever bus the row belongs to: `UI_MUSIC_VOLUME`
 * previews `TEST_MUSIC`, `UI_AMBIENTSFXS_VOLUME` previews `TEST_AMBIENT`, and
 * `UI_SFXS_VOLUME` fires one melee miss.
 *
 * The asymmetry is the method and is reproduced rather than tidied. The three
 * *volume* arms pause both other buses and start their own cue; the three *enable*
 * arms and the `default` arm stop both cues and **resume** everything. So arriving
 * on a toggle row restores music a preview had paused, and stepping a volume row
 * pauses it again.
 */

import type { IMusicManager } from "@engine/audio/IMusicManager";
import { MusicPriority } from "@engine/audio/IMusicManager";
import type { ISoundManager } from "@engine/audio/ISoundManager";
import type { IAmbientManager } from "@engine/audio/IAmbientManager";
import { GameAmbients } from "@gameplay/GameAmbients";
import { GameMusics, GameSounds } from "@gameplay/GameSounds";

/**
 * What the cursor landed on, as far as the preview is concerned.
 *
 * The caller maps option ids onto this rather than this module importing
 * `GameOptions`. `GameOptions` owns the options singleton and the storage layer,
 * and a leaf in `audio/` has no business pulling either in — but a *value*
 * import is needed to `switch` on `OptionIDs`, and the alternative (hardcoding
 * this module's own copy of the option numbers) is worse: those numbers are
 * appended, so a row added at the end of `OptionIDs` would silently point at the
 * wrong arm here.
 *
 * `NONE` is every other row. The C#'s `default` arm is the one that stops both
 * cues and resumes everything, and that is what should happen when the cursor
 * moves off the audio block onto, say, the district size.
 */
export const AudioPreview = {
	/** A volume row: pause the others and play this bus's cue. */
	MUSIC_VOLUME: 1,
	AMBIENT_VOLUME: 2,
	SFX_VOLUME: 3,
	/** An enable row: stop both cues and pause, like the C#. */
	MUSIC_ENABLE: 4,
	AMBIENT_ENABLE: 5,
	SFX_ENABLE: 6,
	/** Everything else: stop the cues and resume the game. */
	NONE: 0,
} as const;

export type AudioPreviewValue = (typeof AudioPreview)[keyof typeof AudioPreview];

export interface AudioAdjustmentHandles {
	music?: IMusicManager;
	sfx?: ISoundManager;
	ambient?: IAmbientManager;
}

export function previewAudioAdjustment(
	what: AudioPreviewValue,
	{ music, sfx, ambient }: AudioAdjustmentHandles,
): void {
	switch (what) {
		case AudioPreview.MUSIC_VOLUME:
			ambient?.stop(GameAmbients.TEST_AMBIENT);
			music?.pause();
			ambient?.pauseAll();
			music?.playIfNotAlreadyPlaying(GameMusics.TEST_MUSIC, MusicPriority.EVENT);
			break;
		case AudioPreview.AMBIENT_VOLUME:
			music?.stop();
			ambient?.pauseAll();
			music?.pause();
			ambient?.playIfNotAlreadyPlaying(GameAmbients.TEST_AMBIENT, true);
			break;
		case AudioPreview.SFX_VOLUME:
			ambient?.stop(GameAmbients.TEST_AMBIENT);
			music?.stop();
			ambient?.pauseAll();
			music?.pause();
			sfx?.play(GameSounds.MELEE_ATTACK_MISS_PLAYER);
			break;
		case AudioPreview.MUSIC_ENABLE:
		case AudioPreview.AMBIENT_ENABLE:
		case AudioPreview.SFX_ENABLE:
			music?.stop();
			ambient?.stop(GameAmbients.TEST_AMBIENT);
			music?.pause();
			ambient?.pauseAll();
			break;
		default:
			music?.stop();
			ambient?.stop(GameAmbients.TEST_AMBIENT);
			music?.resume();
			ambient?.resumeAll();
			break;
	}
}
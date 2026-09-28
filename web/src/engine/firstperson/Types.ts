/**
 * Types shared by the engine and the first-person renderer.
 *
 * DOM-free by construction, like the rest of `engine/`: the modules here take a
 * `Map` and produce geometry, and `ui/firstperson/` does the blitting. That split
 * is what lets the whole of the raycaster, the projector and the scene builder be
 * unit-tested in Node, and it is what lets a test rasterise the same draw list the
 * browser blits.
 */

/**
 * The view the play screen is drawn in.
 *
 * The values *are* the option, and they are a list that has to be visible from
 * both `OptionsScreen` (for its bounds) and the renderer, so it lives here rather
 * than as an enum declared inside `GameOptions`. Same reasoning, and the same
 * consequence, as `GameOptions.spriteStyle` pointing at `AssetPaths.IMAGE_SETS`
 * rather than keeping a copy of the list: a second list is a second thing to
 * forget to update.
 */
export const VIEW_MODES = ["top-down", "first-person"] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * The default view.
 *
 * Top-down, which is what the C# original draws and therefore what a port
 * should show on a first run. The first-person renderer is a second renderer, not
 * a replacement one, so it is opt-in from the first frame rather than something
 * the player has to switch off.
 */
export const DEFAULT_VIEW_MODE: ViewMode = "top-down";

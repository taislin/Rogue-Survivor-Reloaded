/**
 * The deployment base path, as the runtime sees it.
 *
 * A leaf module on purpose. Three modules need it — `engine/AssetPaths.ts`,
 * `gameplay/GameSounds.ts` and `ui/fonts.ts` — and `AssetPaths` already imports
 * `GameSounds`, so the constant cannot live in either of them without a cycle.
 * (A cycle is not merely untidy here: the consumers are `const`s evaluated at
 * module load, so one side would read the other as `undefined` depending on
 * which module the bundler reached first.)
 *
 * It reads `import.meta.env.BASE_URL` rather than the `base-path.ts` module the
 * build config uses, because the two run in different places. `base-path.ts`
 * reads `process.env` and is loaded by Node when the config is evaluated;
 * `process.env` does not exist in a browser bundle, and reaching for it from
 * game code would break the page at runtime. The build inlines
 * `import.meta.env.BASE_URL` from the same `base` option, so both read the same
 * `BASE_PATH` environment variable and cannot disagree about the value.
 *
 * The optional chaining is not defensive style. The port is bundled by two
 * different tools: Vite for the browser, and esbuild for `sim/` and `profile/`
 * — see those npm scripts. esbuild defines no `import.meta.env` at all, so a
 * bare `import.meta.env.BASE_URL` throws at *module load* in the esbuild
 * bundle, taking down `npm run sim` with "Cannot read properties of undefined
 * (reading 'BASE_URL')". That is not a degraded sim, it is no sim, and the sim
 * is what catches engine regressions that a green type-check and a green build
 * both sail past.
 *
 * The fallback is `/` because it is the only correct answer for that path: the
 * sim drives the engine through `ui/NullRogueUI.ts`, which drops every paint
 * call and never fetches an image or a font, so no path built from this is ever
 * requested. The code previously hardcoded `/` for everyone, so this restores
 * exactly the previous behaviour for every non-Vite bundle.
 */
export const BASE_URL = import.meta.env?.BASE_URL ?? "/";

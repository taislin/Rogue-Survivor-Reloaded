/**
 * The desktop build's update check, its banner, and the download that applies
 * an update the player has been offered.
 *
 * ## What this is for
 *
 * A build installed from a release zip is installed forever. `release.yml`
 * publishes what a newer build contains to a single-commit `payload` branch and
 * a `payload-<version>` tag (see `scripts/build-release.mjs`'s header and that
 * workflow's), and this is the client half: ask whether that payload is ahead of
 * the running build, say so in the corner of the main menu, and — once the menu
 * is up and the player is idle — fetch the files that changed.
 *
 * ## The three fetches, and why only one of them can be stale
 *
 *   - `latest.json`, from the `payload` branch: the only mutable reference, and
 *     the only thing on the launch path. It is 97 bytes.
 *   - `payload.json`, from the `payload-<version>` tag: the delta index. Tags do
 *     not move, so raw's `max-age=300` is a benefit rather than a hazard.
 *   - the payload files themselves, from the same tag.
 *
 * Version-addressed rather than commit-addressed because the sha of a commit
 * cannot be written inside it. A version can only be published once — which is
 * what `tests/version.test.ts` pinning `package.json`, `GameVersion.ts` and
 * `neutralino.config.json` together is for — so the name is immutable in
 * practice, and every file's bytes are checked against `payload.json` anyway.
 *
 * ## Why the check is not the framework's
 *
 * Neutralino ships `updater.checkForUpdates`, and reading the vendored client
 * (`public/js/neutralino.js`) is what settles how it may be used: it fetches a
 * URL, parses it, checks that `applicationId`, `version` and `resourcesURL` are
 * present, and resolves. It never compares `version` against anything. The
 * comparison is the whole of this feature's decision — an older release must
 * draw nothing and an equal one must draw nothing — so it is here, where it can
 * be tested against the string in `GameVersion.ts`, rather than inferred from a
 * framework call that would look like it had done it.
 *
 * ## Why the check's failure path is silence
 *
 * Every failure of the *check* — offline, captive portal, DNS, a 404 because the
 * branch does not exist yet, a timeout, an unparsable body — leaves the status
 * `idle`, and `idle` draws nothing. That is deliberate and is not a swallowed
 * error: for a player with no network, "no banner" and "up to date" are the same
 * observable state, and the alternative is a menu advertising an update nobody
 * can install. `TextFile.load` already encodes the same asymmetry — a non-`ok`
 * response and a thrown fetch both return `false`. A failure *after* an update
 * has been offered is a different thing, and is reported.
 *
 * ## Why once per process, and read at draw time
 *
 * `startUpdateCheck` fetches once; the menu redraws on every key press and mouse
 * move (that is why it waits in `WaitMenuInput` rather than `UI_WaitKey`), so a
 * result that lands while the player sits at the menu appears on the next
 * redraw without anything repainting itself. Drawing from the promise instead
 * would paint over whichever screen happened to be up.
 *
 * ## Why a download and not an install
 *
 * The files are written and the game is left running. `app.restartProcess` would
 * be a smaller feature and a worse one: the trigger is "an update exists", which
 * is true while somebody is mid-game, and restarting there discards a run. The
 * banner says the update is installed and the player restarts when they choose.
 */

import { CANVAS_WIDTH } from "@engine/CanvasSize";
import { Color } from "@engine/Color";
import { fireAndForget, reportSwallowed } from "@engine/Diagnostics";
import { GAME_VERSION } from "@engine/GameVersion";
import {
	MENU_BOLD_LINE_SPACING,
	MENU_CHAR_WIDTH,
	MENU_COLUMN_GAP,
} from "@engine/MenuChrome";
import { Rect } from "@engine/Rect";
import type { IRogueUI } from "@engine/IRogueUI";

const RAW_ROOT = "https://raw.githubusercontent.com/taislin/Rogue-Survivor-Reloaded";

/**
 * Where `release.yml`'s payload job publishes `latest.json`.
 *
 * No API call, so no rate limit: the GitHub API allows 60 requests an hour per
 * address, which is a shared budget on a NAT, and this check runs per launch.
 */
export const UPDATE_MANIFEST_URL = `${RAW_ROOT}/payload/latest.json`;

/** The immutable address of one release's payload. */
export function payloadUrl(version: string, path: string): string {
	return `${RAW_ROOT}/payload-${version}/${path}`;
}

/**
 * How long to wait before deciding the machine has no usable network.
 *
 * A race rather than `AbortSignal.timeout`, which is a 2023 API and one of the
 * three webviews this game runs in — the Linux one follows its distro's
 * WebKitGTK — can be older than it. The check is a few dozen bytes; if it hangs,
 * the race resolves and the abandoned request is the only thing left over.
 */
const UPDATE_CHECK_TIMEOUT_MS = 8000;

/** How long one payload file may take, which a big sprite over a slow link will. */
const UPDATE_FILE_TIMEOUT_MS = 120_000;

/** How long to wait for a native call to prove a server is listening. */
const CONTAINER_PROBE_TIMEOUT_MS = 2000;

/** Slack around the banner's text, so a Santa does not touch it. */
const UPDATE_BANNER_PADDING = 8;

/** The name the payload's own manifest has inside the payload. */
const PAYLOAD_MANIFEST = "payload.json";

/**
 * A version is three dot-separated numbers, and nothing else.
 *
 * The same shape `tests/version.test.ts` pins for `GAME_VERSION`, deliberately:
 * a manifest is remote input, and "0.9.3-beta" or "v1" has to be ignored rather
 * than compared, because `isNewerVersion` returning `true` for a version this
 * game cannot install is the one failure the banner cannot recover from.
 */
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** What the menu may say about updates. `idle` means draw nothing. */
export type UpdateStatus =
	| { readonly kind: "idle" }
	| { readonly kind: "available"; readonly version: string }
	| {
			readonly kind: "downloading";
			readonly version: string;
			readonly done: number;
			readonly total: number;
	  }
	| { readonly kind: "ready"; readonly version: string };

let status: UpdateStatus = { kind: "idle" };
let started = false;
let downloadStarted = false;
let containerReady: Promise<boolean> | null = null;

/** The current status. Read by the menu on every draw. */
export function getUpdateStatus(): UpdateStatus {
	return status;
}

/** Test seam: forget the result, and allow another check and another download. */
export function resetUpdateCheck(): void {
	status = { kind: "idle" };
	started = false;
	downloadStarted = false;
	containerReady = null;
}

/**
 * Is `candidate` strictly newer than `current`?
 *
 * Numerically per segment, not as strings: "0.10.0" sorts *before* "0.9.9"
 * alphabetically, and the day this project reaches 0.10.0 a string comparison
 * would quietly stop offering the update to everyone already on 0.9.x — the
 * failure being invisible precisely because it looks like correct behaviour.
 *
 * Unparsable on either side is `false`, not a guess.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
	const left = parseVersion(candidate);
	const right = parseVersion(current);
	if (left === null || right === null) return false;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return left[i] > right[i];
	}
	return false;
}

/** The three numbers of a version string, or null if it is not one. */
function parseVersion(version: string): number[] | null {
	if (!VERSION_PATTERN.test(version)) return null;
	return version.split(".").map((part) => Number(part));
}

/** The part of `latest.json` this module needs, validated. */
interface UpdateManifest {
	readonly version: string;
}

/** The delta index: every file of a payload, with the sha of its contents. */
export interface PayloadManifest {
	readonly version: string;
	readonly files: Readonly<Record<string, string>>;
}

/**
 * Parse a manifest body, or null if it is not one.
 *
 * Everything unrecognised is null rather than a partial read: `version` is the
 * only field that matters here, and a manifest missing it is a manifest this
 * build cannot compare itself against.
 */
function parseManifest(body: string): UpdateManifest | null {
	const parsed = parseJsonObject(body);
	if (parsed === null) return null;
	const version = parsed.version;
	if (typeof version !== "string" || !VERSION_PATTERN.test(version)) return null;
	return { version };
}

/**
 * Parse `payload.json`, rejecting anything that is not a path-to-sha map.
 *
 * A path is refused outright if it could escape the payload directory, because
 * these become filesystem writes and the manifest is remote input. The check is
 * per entry rather than one look at the shape: a single `../` in a 2 436-entry
 * map is the whole attack, and a shape test would not notice it.
 */
function parsePayloadManifest(body: string): PayloadManifest | null {
	const parsed = parseJsonObject(body);
	if (parsed === null) return null;
	const version = parsed.version;
	const files = parsed.files;
	if (typeof version !== "string" || !VERSION_PATTERN.test(version)) return null;
	if (typeof files !== "object" || files === null || Array.isArray(files)) return null;

	const out: Record<string, string> = {};
	for (const [path, sha] of Object.entries(files as Record<string, unknown>)) {
		if (!isSafePayloadPath(path)) return null;
		if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) return null;
		out[path] = sha;
	}
	return { version, files: out };
}

/** True for a relative path inside the payload: no `..`, no drive, no backslash. */
export function isSafePayloadPath(path: string): boolean {
	if (path === "" || path.startsWith("/") || path.includes("\\")) return false;
	return !path.split("/").some((segment) => segment === "" || segment === "..");
}

function parseJsonObject(body: string): Record<string, unknown> | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: null;
}

/**
 * Fetch the manifest once per process.
 *
 * Returns the promise so the caller can hand it to `fireAndForget` rather than
 * dropping it; a second call while the first is in flight, or after it settled,
 * does nothing — the menu redraws many times a second and this must not become
 * a request per frame.
 */
export function startUpdateCheck(): Promise<void> {
	if (started) return Promise.resolve();
	started = true;
	return runCheck();
}

/**
 * Has a Neutralino native call actually *answered*? Once per process.
 *
 * **`typeof Neutralino !== "undefined"` does not answer this**, and the storage
 * backend already documents why: `index.html` loads `/js/neutralino.js`
 * unconditionally, in the browser build as well as the packaged one, so the
 * client library — and with it `Neutralino.filesystem` — is present in a plain
 * browser with no server behind it. There, every native call is a message to a
 * WebSocket that nothing is listening on, which never resolves and never
 * rejects. A check that trusted the global would draw a banner on the website,
 * and a download that trusted it would sit at "downloading... 0/2436" forever.
 *
 * So this asks the server one read-only question and waits for an answer. It
 * answers in milliseconds in the packaged app, and times out in the browser,
 * where the consequence is that nothing here runs at all.
 */
function nativeContainerReady(): Promise<boolean> {
	if (containerReady === null) {
		const call = (globalThis as unknown as { Neutralino?: { os?: { getPath?: (name: string) => Promise<unknown> } } })
			.Neutralino?.os?.getPath;
		const answered =
			call === undefined
				? Promise.reject(new Error("no Neutralino server"))
				: withTimeout(Promise.resolve(call("data")), CONTAINER_PROBE_TIMEOUT_MS);
		containerReady = answered.then(
			() => true,
			() => false,
		);
	}
	return containerReady;
}

async function runCheck(): Promise<void> {
	try {
		if (!(await nativeContainerReady())) {
			status = { kind: "idle" };
			return;
		}
		const manifest = parseManifest(
			await withTimeout(fetchText(UPDATE_MANIFEST_URL), UPDATE_CHECK_TIMEOUT_MS),
		);
		if (manifest !== null && isNewerVersion(manifest.version, GAME_VERSION)) {
			status = { kind: "available", version: manifest.version };
			return;
		}
		status = { kind: "idle" };
	} catch {
		// Silence is the whole behaviour here — see the header. Not reported: an
		// offline player is not an error, and a console warning nobody opens would
		// only make the real failures harder to find.
		status = { kind: "idle" };
	}
}

/**
 * Start fetching an offered update, once.
 *
 * Called from the menu rather than from `startUpdateCheck` because "the menu is
 * on screen and idle" is the only moment this is free: the same fetch during
 * boot competes with 1 009 image ids, and mid-game it competes with the game. A
 * no-op unless an update is currently on offer, so the call site does not have
 * to know that.
 *
 * The promise is returned for tests to await. The menu call ignores it: the
 * rejection is already handled here, and installed inside this function so that
 * ignoring the result cannot leave one unhandled.
 */
export function beginUpdateDownloadIfAvailable(): Promise<void> {
	if (status.kind !== "available" || downloadStarted) return Promise.resolve();
	downloadStarted = true;
	const version = status.version;
	const running = (async () => {
		// Asked again because `startUpdateCheck`'s answer was about a different
		// question: whether it is worth *offering*. This one is about whether a
		// write can land, and it is the same check — but the browser can reach this
		// line through a stale offer, and a hang here is a banner stuck at 0/N.
		if (!(await nativeContainerReady())) {
			status = { kind: "idle" };
			return;
		}
		await applyUpdate(version);
	})();
	fireAndForget("update download", running);
	return running;
}

/**
 * What a payload needs before it can be written over an installed one.
 *
 * Pure, and the part worth testing exhaustively: the fetches and writes either
 * work or fail loudly, but a wrong plan is a game that silently downloads 55 MB,
 * or one that leaves a file behind forever.
 *
 * `local` is null for an installation with no manifest of its own — everything
 * is then fetched, because nothing is known to match.
 */
export function diffPayloads(
	local: Readonly<Record<string, string>> | null,
	remote: Readonly<Record<string, string>>,
): { readonly fetch: readonly string[]; readonly remove: readonly string[] } {
	const fetchList: string[] = [];
	for (const path of Object.keys(remote).sort()) {
		if (local === null || local[path] !== remote[path]) fetchList.push(path);
	}
	// Only files this build shipped are ever removed. A path the local manifest
	// never mentioned is something in the folder this updater did not put there,
	// and deleting it because a release did not list it would be the updater
	// overreaching rather than cleaning up.
	const removeList: string[] = [];
	if (local !== null) {
		for (const path of Object.keys(local).sort()) {
			if (!(path in remote)) removeList.push(path);
		}
	}
	return { fetch: fetchList, remove: removeList };
}

/**
 * Fetch, verify and write the changed files, then the manifest that says so.
 *
 * Three properties, in the order they matter:
 *
 *  1. **Nothing is written unverified.** Every file's bytes are hashed the way
 *     git hashes a blob and compared with `payload.json` before they touch the
 *     disk, so a truncated or substituted file fails the update instead of
 *     shipping.
 *  2. **Every file is replaced whole.** Bytes go to `<path>.new` and are moved
 *     into place, so an interruption leaves the old file rather than a
 *     half-written one, and re-running is safe: the manifest is the record of
 *     what has been applied, and it is written last.
 *  3. **A failure keeps the offer.** On any error the status goes back to
 *     `available`, so the next launch tries again — and because the manifest was
 *     not updated, the next attempt redoes exactly the files still wrong.
 */
async function applyUpdate(version: string): Promise<void> {
	try {
		const body = await withTimeout(
			fetchText(payloadUrl(version, PAYLOAD_MANIFEST)),
			UPDATE_FILE_TIMEOUT_MS,
		);
		const remote = parsePayloadManifest(body);
		if (remote === null) throw new Error("payload manifest is not one");
		// The tag is named for the version, so a manifest that disagrees with the
		// name it was fetched under is a wrong branch or a mispublished tag.
		if (remote.version !== version) {
			throw new Error(`payload manifest says ${remote.version}, fetched as ${version}`);
		}

		const local = await readLocalManifest(remote.files);
		const plan = diffPayloads(local, remote.files);

		status = { kind: "downloading", version, done: 0, total: plan.fetch.length };
		let done = 0;
		for (const path of plan.fetch) {
			const bytes = new Uint8Array(
				await withTimeout(fetchBytes(payloadUrl(version, path)), UPDATE_FILE_TIMEOUT_MS),
			);
			const sha = await gitBlobSha(bytes);
			if (sha !== remote.files[path]) {
				throw new Error(`payload ${path}: expected ${remote.files[path]}, read ${sha}`);
			}
			await writePayloadFile(`${path}.new`, bytes);
			await moveFile(`${path}.new`, path);
			done += 1;
			status = { kind: "downloading", version, done, total: plan.fetch.length };
		}

		const fs = desktopFileSystem();
		for (const path of plan.remove) await fs.remove(distPath(path));

		// The commit marker, and the remote bytes verbatim: a manifest this build
		// wrote itself is one more thing that can disagree with the next diff.
		await writePayloadFile(PAYLOAD_MANIFEST, new TextEncoder().encode(body));
		status = { kind: "ready", version };
	} catch (error) {
		// Unlike the check, this one is reported: an update was on offer and did
		// not arrive, which is a fact about the machine rather than about the
		// network being absent.
		reportSwallowed("update download", error);
		status = { kind: "available", version };
	}
}

/**
 * What this installation believes it has.
 *
 * Read over HTTP rather than through `filesystem`, because the runtime serves
 * the whole `dist/` from this origin already: `Neutralino.filesystem.readFile`
 * would add a second code path and a second set of error cases to read a file
 * the page can fetch itself.
 *
 * A build from before the payload existed has no manifest, and is measured
 * instead — once, by whoever installed it. Hashing 55 MB over loopback beats
 * downloading 55 MB, and it is the difference between fetching everything and
 * fetching nothing.
 */
async function readLocalManifest(
	remoteFiles: Readonly<Record<string, string>>,
): Promise<Record<string, string> | null> {
	try {
		const parsed = parsePayloadManifest(await fetchText(PAYLOAD_MANIFEST));
		if (parsed !== null) return { ...parsed.files };
	} catch {
		// No manifest beside us — see below.
	}
	const measured: Record<string, string> = {};
	for (const path of Object.keys(remoteFiles)) {
		try {
			measured[path] = await gitBlobSha(new Uint8Array(await fetchBytes(path)));
		} catch {
			// Not on this disk, and so in the fetch list by being absent here.
		}
	}
	return measured;
}

/** Git's blob sha of some bytes: `sha1("blob " + len + "\0" + data)`. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
	const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
	const digest = await crypto.subtle.digest("SHA-1", concatBytes(header, bytes));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
	const out = new Uint8Array(left.length + right.length);
	out.set(left, 0);
	out.set(right, left.length);
	return out;
}

/** The three filesystem calls this needs. */
interface DesktopFileSystem {
	writeBinaryFile(path: string, data: Uint8Array): Promise<unknown>;
	move(source: string, destination: string): Promise<unknown>;
	remove(path: string): Promise<unknown>;
}

/**
 * `window.Neutralino.filesystem`, or a refusal.
 *
 * A refusal rather than a degradation: `filesystem.writeBinaryFile` is among the
 * native methods Neutralino documents as needing to be allowed for `updater.*`,
 * `neutralino.config.json` declares no allow-list at all, and whether a packaged
 * build therefore permits it is an open question (BROWSER_PORT_PLAN.md §5.5,
 * blocker 6, to be answered on a real install). An updater that quietly wrote
 * nothing while reporting success would be the worst outcome available.
 */
function desktopFileSystem(): DesktopFileSystem {
	const filesystem = (globalThis as unknown as { Neutralino?: { filesystem?: DesktopFileSystem } })
		.Neutralino?.filesystem;
	if (!filesystem) throw new Error("update: no Neutralino filesystem in this container");
	return filesystem;
}

/** Absolute path of a payload file inside the installed `dist/`. */
function distPath(relative: string): string {
	const appPath = (globalThis as unknown as { NL_PATH?: string }).NL_PATH;
	if (typeof appPath !== "string") {
		throw new Error("update: no NL_PATH in this container");
	}
	return `${appPath}/dist/${relative}`;
}

async function writePayloadFile(relative: string, bytes: Uint8Array): Promise<void> {
	await desktopFileSystem().writeBinaryFile(distPath(relative), bytes);
}

async function moveFile(from: string, to: string): Promise<void> {
	await desktopFileSystem().move(distPath(from), distPath(to));
}

async function fetchText(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`);
	return await response.text();
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`);
	return await response.arrayBuffer();
}

/** Resolve with `promise`, or reject if it has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/**
 * The banner text, or null when there is nothing to say.
 *
 * `IRogueUI` exposes no text measurement, so the caller lays this out with
 * `MENU_CHAR_WIDTH` arithmetic — the same reason `MenuChrome.menuValueColumnX`
 * measures from `e.length` rather than measuring the rendered string. Three dots
 * rather than an ellipsis because the menu font is a bitmap grid rather than a
 * proportional one, and a glyph it does not have is a gap in the middle of a
 * word.
 */
function updateBannerText(state: UpdateStatus): string | null {
	switch (state.kind) {
		case "idle":
			return null;
		case "available":
			return `v${state.version} available (you have ${GAME_VERSION})`;
		case "downloading":
			return `v${state.version} downloading... ${state.done}/${state.total}`;
		case "ready":
			return `v${state.version} installed - restart to play it`;
	}
}

/**
 * Draw the update banner, if there is one, in the top right of the menu.
 *
 * ## The geometry, and why it is here rather than anywhere prettier
 *
 * The main menu draws its header at y=0, "Main Menu" at y=18, and nine rows from
 * y=54 at `MENU_BOLD_LINE_SPACING` each. So y=36 is the last line clear of the
 * rows, and right of x≈230 at that height the header has ended — which is the
 * whole of the free space. A clickable banner would be nicer and is deliberately
 * not here: a key would mean appending a `PlayerCommand`, and the append-only
 * guard and the redefine-keys screen are the two things this project's own
 * history records breaking.
 *
 * Filled, not just drawn: the menu background is black already, so the fill is
 * not covering anything — it is what separates the text from a Santa drawn over
 * the same pixels.
 */
export function drawUpdateBanner(ui: IRogueUI): void {
	const text = updateBannerText(status);
	if (text === null) return;

	const width = text.length * MENU_CHAR_WIDTH;
	const right = CANVAS_WIDTH - MENU_COLUMN_GAP;
	const left = right - width;
	const top = 2 * MENU_BOLD_LINE_SPACING;

	ui.UI_FillRect(
		Color.Black,
		new Rect(
			left - UPDATE_BANNER_PADDING,
			top - UPDATE_BANNER_PADDING,
			width + 2 * UPDATE_BANNER_PADDING,
			MENU_BOLD_LINE_SPACING,
		),
	);
	ui.UI_DrawStringBoldLarge(Color.Gold, text, left, top);
}
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createHash } from "node:crypto";

import {
	UPDATE_MANIFEST_URL,
	beginUpdateDownloadIfAvailable,
	drawUpdateBanner,
	diffPayloads,
	getUpdateStatus,
	gitBlobSha,
	isNewerVersion,
	isSafePayloadPath,
	payloadUrl,
	resetUpdateCheck,
	startUpdateCheck,
} from "@engine/Update";
import { CANVAS_WIDTH } from "@engine/CanvasSize";
import { Color } from "@engine/Color";
import { GAME_VERSION } from "@engine/GameVersion";
import { MENU_BOLD_LINE_SPACING, MENU_CHAR_WIDTH, drawHeader } from "@engine/MenuChrome";
import type { Rect } from "@engine/Rect";
import { NullRogueUI } from "@ui/NullRogueUI";

/**
 * The update check and its banner.
 *
 * Two things are being protected, and they are different in kind.
 *
 * The comparison is arithmetic that has to be right about a case nobody has hit
 * yet: `0.10.0` is *older* than `0.9.9` as a string, so a comparison using `<`
 * would work perfectly right up to the release after this one and then stop
 * offering updates to everyone already on 0.9.x — failing invisibly, because it
 * looks like correct behaviour. Hence `isNewerVersion` tested per segment.
 *
 * The fetch is untrusted input. Everything remote is a shape that might be right
 * and might not, and the only acceptable answer to all of "not JSON", "no
 * version", "not a version", "not ok", "offline" and "hung" is the same one: no
 * banner. Each is its own `it` rather than a loop, because they fail for
 * different reasons and a table would hide which one broke.
 */

/** The real `fetch`, so a test that stubs twice still restores the real one. */
const REAL_FETCH = globalThis.fetch;

let restoreFetch: () => void = () => undefined;

/** Replaces `globalThis.fetch` for one test, and records what was asked for. */
function stubFetch(handler: (url: string) => Promise<Partial<Response>>): string[] {
	const urls: string[] = [];
	globalThis.fetch = (async (url: string) => {
		urls.push(url);
		return handler(url);
	}) as unknown as typeof fetch;
	restoreFetch = () => {
		globalThis.fetch = REAL_FETCH;
	};
	return urls;
}

/**
 * A minimal `Response` stand-in, as `persistence.test.ts` builds them — with
 * `arrayBuffer` as well, because payload files are fetched as bytes and hashed
 * rather than as text.
 */
function ok(body: string): Partial<Response> {
	return {
		ok: true,
		status: 200,
		text: async () => body,
		arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
	} as Partial<Response>;
}

describe("isNewerVersion", () => {
	it("compares each segment as a number, not the string as a whole", () => {
		expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
		expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
		expect(isNewerVersion("0.9.10", "0.9.9")).toBe(true);
	});

	it("is false for the same version and for an older one", () => {
		expect(isNewerVersion("0.9.2", "0.9.2")).toBe(false);
		expect(isNewerVersion("0.9.1", "0.9.2")).toBe(false);
		// Older in the highest segment, which a lexicographic compare would also
		// get right — pinned so a change of strategy cannot pass by luck.
		expect(isNewerVersion("0.8.99", "0.9.0")).toBe(false);
	});

	it("treats anything that is not three numbers as no update", () => {
		// `version` is remote input. Guessing at "0.10.0-beta" or "v1" is how a
		// banner ends up offering a build this game cannot install.
		for (const candidate of ["0.10.0-beta", "v1.0.0", "1", "1.0", "", "latest", "0.9.2 "]) {
			expect(isNewerVersion(candidate, "0.9.2"), candidate).toBe(false);
		}
		// And the same on the other side: an unparsable running version is not
		// evidence of an update either.
		expect(isNewerVersion("0.9.3", "0.9.2-beta")).toBe(false);
	});
});

describe("the update check", () => {
	beforeEach(() => {
		resetUpdateCheck();
		fakeNeutralino();
	});

	afterEach(() => {
		restoreFetch();
		deleteNeutralino();
		vi.useRealTimers();
	});

	it("offers a version the running build does not have", async () => {
		const urls = stubFetch(async () => ok(JSON.stringify({ version: "9.9.9", commit: "abc1234" })));
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "available", version: "9.9.9" });
		expect(urls).toEqual([UPDATE_MANIFEST_URL]);
	});

	it("draws nothing when the payload branch is the build already running", async () => {
		// The real state of every up-to-date installation: `build-release.mjs`
		// writes the version it built into `latest.json`, so this is a normal
		// outcome rather than an error path. If it ever fails, the banner is
		// advertising an update that changes nothing.
		stubFetch(async () => ok(JSON.stringify({ version: GAME_VERSION })));
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
	});

	it("draws nothing for an older payload", async () => {
		stubFetch(async () => ok(JSON.stringify({ version: "0.0.1" })));
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
	});

	it("draws nothing when the body is not JSON", async () => {
		// What raw answers for a branch that does not exist yet is a 404 *page*,
		// so this is the first-run shape rather than a hypothetical.
		stubFetch(async () => ok("<html>404: Not Found</html>"));
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
	});

	it("draws nothing when the JSON has no version, or an unusable one", async () => {
		const bodies = [JSON.stringify({}), JSON.stringify({ version: 3 }), JSON.stringify({ version: "v2" })];
		for (const body of bodies) {
			resetUpdateCheck();
			stubFetch(async () => ok(body));
			await startUpdateCheck();
			expect(getUpdateStatus(), body).toEqual({ kind: "idle" });
		}
	});

	it("draws nothing when the request fails, which is what offline looks like", async () => {
		stubFetch(async () => {
			throw new TypeError("Failed to fetch");
		});
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
	});

	it("draws nothing on a non-ok response", async () => {
		stubFetch(async () => ({ ok: false, status: 404, text: async () => "" }) as Partial<Response>);
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
	});

	it("gives up on a request that never settles", async () => {
		vi.useFakeTimers();
		stubFetch(() => new Promise<Partial<Response>>(() => undefined));
		const pending = startUpdateCheck();
		await vi.advanceTimersByTimeAsync(30_000);
		await pending;
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
	});

	it("asks once per process however many times it is started", async () => {
		const urls = stubFetch(async () => ok(JSON.stringify({ version: "9.9.9" })));
		await startUpdateCheck();
		await startUpdateCheck();
		// The menu redraws on every mouse move. A request per frame is a request
		// per second against a public endpoint.
		expect(urls).toHaveLength(1);
		expect(getUpdateStatus()).toEqual({ kind: "available", version: "9.9.9" });
	});

	it("does not report an offline failure as a swallowed error", async () => {
		// `silent-failures.test.ts` requires every silent catch to say why. This is
		// the reason held to it: an offline player is the common case, not a fault.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		stubFetch(async () => {
			throw new Error("offline");
		});
		await startUpdateCheck();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

/** `NullRogueUI` drops every paint call, so record the two the banner makes. */
class ProbeUI extends NullRogueUI {
	readonly bold: Array<{ color: Color; text: string; x: number; y: number }> = [];
	readonly fills: Array<{ color: Color; rect: Rect }> = [];
	override UI_DrawStringBoldLarge(color: Color, text: string, x: number, y: number): void {
		this.bold.push({ color, text, x, y });
	}
	override UI_FillRect(color: Color, rect: Rect): void {
		this.fills.push({ color, rect });
	}
}

describe("the update banner", () => {
	beforeEach(() => {
		resetUpdateCheck();
		fakeNeutralino();
	});

	afterEach(() => {
		restoreFetch();
		deleteNeutralino();
	});

	/** An installed build that is offered a newer one. */
	async function withUpdateAvailable(): Promise<void> {
		stubFetch(async () => ok(JSON.stringify({ version: "9.9.9" })));
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "available", version: "9.9.9" });
	}

	it("draws nothing at all when there is no update", () => {
		const ui = new ProbeUI();
		drawUpdateBanner(ui);
		expect(ui.bold).toEqual([]);
		expect(ui.fills).toEqual([]);
	});

	it("names both versions, right-aligned inside the canvas", async () => {
		await withUpdateAvailable();

		const ui = new ProbeUI();
		drawUpdateBanner(ui);

		expect(ui.bold).toHaveLength(1);
		expect(ui.bold[0]!.text).toBe(`v9.9.9 available (you have ${GAME_VERSION})`);
		expect(ui.bold[0]!.color).toBe(Color.Gold);

		// Right edge inside the canvas, measured by glyph count because the menu
		// font is a fixed grid rather than a proportional one.
		const right = ui.bold[0]!.x + ui.bold[0]!.text.length * MENU_CHAR_WIDTH;
		expect(right).toBeLessThan(CANVAS_WIDTH);
		expect(CANVAS_WIDTH - right).toBeGreaterThan(0);
	});

	it("sits in the gap between the header and the first menu row", async () => {
		// `HandleMainMenu` draws the header at y=0, "Main Menu" at y=18, and nine
		// rows from y=54. Below 54 overlaps a row; at or above 18 overlaps the
		// header line.
		await withUpdateAvailable();

		const ui = new ProbeUI();
		drawUpdateBanner(ui);

		const text = ui.bold[0]!;
		const firstRow = 3 * MENU_BOLD_LINE_SPACING;
		expect(text.y).toBeGreaterThan(MENU_BOLD_LINE_SPACING);
		expect(text.y).toBeLessThan(firstRow);

		// The fill is what separates the text from a Santa drawn over the same
		// pixels, so it has to enclose the text and stay clear of the rows.
		const { color, rect } = ui.fills[0]!;
		expect(color).toBe(Color.Black);
		expect(rect.x).toBeLessThan(text.x);
		expect(rect.x + rect.width).toBeGreaterThan(text.x);
		expect(rect.y + rect.height).toBeLessThanOrEqual(firstRow);
	});

	it("does not ride along with the header, whose bold-string count is pinned", async () => {
		// `menu-chrome.test.ts` requires exactly one bold string out of `drawHeader`
		// — the game name and version. Drawing the banner from there instead of
		// from the menu's display block would break that; this is the same
		// invariant seen from the other side, and it is why the banner is a free
		// function called after the Santas rather than part of the header.
		await withUpdateAvailable();

		const ui = new ProbeUI();
		drawHeader(ui);
		expect(ui.bold).toHaveLength(1);
		expect(ui.bold[0]!.text).toBe(`ROGUE SURVIVOR - ${GAME_VERSION}`);
	});
});
describe("payload addressing", () => {
	it("reads discovery from the branch and files from the version tag", () => {
		// The split is the whole reason a tag exists: a branch tip can be five
		// minutes stale, which is fine for a 97-byte "is there an update" and not
		// fine for 2 436 files whose bytes are checked against a manifest.
		expect(UPDATE_MANIFEST_URL).toBe(
			"https://raw.githubusercontent.com/taislin/Rogue-Survivor-Reloaded/payload/latest.json",
		);
		expect(payloadUrl("0.9.3", "index.html")).toBe(
			"https://raw.githubusercontent.com/taislin/Rogue-Survivor-Reloaded/payload-0.9.3/index.html",
		);
	});

	it("refuses a path that could escape the payload directory", () => {
		// These become filesystem writes and the manifest is remote input. The two
		// shapes worth refusing are a traversal and an absolute path; both are
		// checked per entry, so one bad path fails the whole manifest rather than
		// one file.
		for (const path of ["../secrets", "assets/../../etc/passwd", "/etc/passwd", "assets\\x.png", ""]) {
			expect(isSafePayloadPath(path), path).toBe(false);
		}
		expect(isSafePayloadPath("index.html")).toBe(true);
		expect(isSafePayloadPath("assets/actors/santa.png")).toBe(true);
	});
});

describe("gitBlobSha", () => {
	it("computes the sha git computes for the same bytes", () => {
		// `build-release.mjs` writes these with node's crypto and this reads them
		// back with WebCrypto, and the two have to agree or every file fails its
		// own verification. The expected value is `git hash-object` of "hello\n",
		// pinned as a literal rather than computed so the test cannot pass by
		// agreeing with a shared mistake.
		return expect(gitBlobSha(new TextEncoder().encode("hello\n"))).resolves.toBe(
			"ce013625030ba8dba906f756967f9e9ca394464a",
		);
	});
});

describe("diffPayloads", () => {
	it("fetches what changed and what is new, and leaves the rest alone", () => {
		const plan = diffPayloads(
			{ "index.html": "aaa", "assets/santa.png": "bbb", "old.png": "ccc" },
			{ "index.html": "aaa", "assets/santa.png": "CHANGED", "new.png": "ddd" },
		);
		// Sorted, so a plan is diffable between two runs of the same update.
		expect(plan.fetch).toEqual(["assets/santa.png", "new.png"]);
	});

	it("removes only files this build shipped", () => {
		const plan = diffPayloads({ "old.png": "ccc" }, { "index.html": "aaa" });
		expect(plan.remove).toEqual(["old.png"]);
		// And a file that is in neither manifest is nobody's business: the
		// updater did not put it there.
		expect(plan.fetch).toEqual(["index.html"]);
	});

	it("fetches everything when this installation has no manifest", () => {
		// A build predating manifests knows nothing, so nothing can be skipped.
		const remote = { "index.html": "aaa", "assets/santa.png": "bbb" };
		expect(diffPayloads(null, remote)).toEqual({ fetch: ["assets/santa.png", "index.html"], remove: [] });
	});
});

/** A `Neutralino.filesystem` that records what the updater did to the disk. */
interface FakeFs {
	writes: Array<{ path: string; text: string }>;
	moves: Array<{ from: string; to: string }>;
	removals: string[];
}

function fakeNeutralino(options: { withoutFilesystem?: boolean } = {}): { fs: FakeFs } {
	const fs: FakeFs = { writes: [], moves: [], removals: [] };
	const win = globalThis as unknown as { Neutralino?: unknown; NL_PATH?: string };
	const decode = (data: Uint8Array) => new TextDecoder().decode(data);
	win.Neutralino = {
		// The probe `nativeContainerReady` asks before anything else, so a fake
		// without an answering `os.getPath` is the browser case — which has its own
		// test below.
		os: { getPath: async () => "/home/player" },
		filesystem: options.withoutFilesystem
			? {}
			: {
					writeBinaryFile: async (path: string, data: Uint8Array) => {
						fs.writes.push({ path, text: decode(data) });
					},
					move: async (from: string, to: string) => {
						fs.moves.push({ from, to });
					},
					remove: async (path: string) => {
						fs.removals.push(path);
					},
				},
	};
	win.NL_PATH = "/opt/game";
	return { fs };
}

describe("applying an offered update", () => {
	const VERSION = "9.9.9";

	/** A payload of two files, addressed by the tag the client will ask for. */
	function stubPayload(files: Record<string, string>, options: { corrupt?: string } = {}): string[] {
		const shas: Record<string, string> = {};
		for (const [path, body] of Object.entries(files)) {
			// The manifest carries the sha of what the payload *should* hold; the
			// `corrupt` option serves different bytes for one path, which is the
			// case that must fail before anything is written.
			shas[path] = options.corrupt === path ? "0".repeat(40) : blobSha(body);
		}
		return stubFetch(async (url) => {
			if (url === UPDATE_MANIFEST_URL) {
				return ok(JSON.stringify({ version: VERSION, commit: "abc1234" }));
			}
			if (url === payloadUrl(VERSION, "payload.json")) {
				return ok(JSON.stringify({ version: VERSION, files: shas }));
			}
			if (url.endsWith("/payload.json")) {
				// The local manifest, fetched from this origin over HTTP.
				return { ok: false, status: 404, text: async () => "" } as Partial<Response>;
			}
			const path = url.slice(`${payloadUrl(VERSION, "")}`.length);
			return ok(files[path] ?? "");
		});
	}

	beforeEach(() => {
		resetUpdateCheck();
		fakeNeutralino();
	});

	afterEach(() => {
		restoreFetch();
		deleteNeutralino();
	});

	it("writes changed files, then the manifest, and says it is ready", async () => {
		const { fs: neutralino } = fakeNeutralino();
		stubPayload({ "index.html": "<html>new</html>", "assets/santa.png": "PNGDATA" });
		await startUpdateCheck();
		expect(getUpdateStatus()).toEqual({ kind: "available", version: VERSION });

		await beginUpdateDownloadIfAvailable();

		// Every file staged beside its target and then moved over it: an
		// interruption leaves the old file rather than a half-written one.
		expect(neutralino.moves).toEqual([
			{ from: "/opt/game/dist/assets/santa.png.new", to: "/opt/game/dist/assets/santa.png" },
			{ from: "/opt/game/dist/index.html.new", to: "/opt/game/dist/index.html" },
		]);
		// The manifest is written last and verbatim from the payload, because it
		// is the record of what has been applied and the marker for a re-run.
		const manifestWrite = neutralino.writes[neutralino.writes.length - 1]!;
		expect(manifestWrite.path).toBe("/opt/game/dist/payload.json");
		expect(JSON.parse(manifestWrite.text).version).toBe(VERSION);
		expect(getUpdateStatus()).toEqual({ kind: "ready", version: VERSION });
	});

	it("starts once, however many times the menu redraws", async () => {
		const { fs: neutralino } = fakeNeutralino();
		const urls = stubPayload({ "index.html": "<html>new</html>" });
		await startUpdateCheck();
		await beginUpdateDownloadIfAvailable();
		await beginUpdateDownloadIfAvailable();
		await beginUpdateDownloadIfAvailable();
		// One manifest fetch per update, not one per frame.
		expect(urls.filter((u) => u.endsWith("/payload.json") && u.startsWith("https://raw"))).toHaveLength(1);
		expect(neutralino.moves).toHaveLength(1);
	});

	it("writes nothing at all when a payload file does not match its sha", async () => {
		const { fs: neutralino } = fakeNeutralino();
		stubPayload({ "index.html": "<html>new</html>" }, { corrupt: "index.html" });
		await startUpdateCheck();
		await beginUpdateDownloadIfAvailable();

		// The verification is before the write, not after it: a payload that
		// disagrees with its own manifest is refused, not repaired.
		expect(neutralino.writes).toEqual([]);
		expect(neutralino.moves).toEqual([]);
		// And the offer stands, so the next launch tries again.
		expect(getUpdateStatus()).toEqual({ kind: "available", version: VERSION });
	});

	it("says so rather than failing quietly when the container has no filesystem", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		fakeNeutralino({ withoutFilesystem: true });
		stubPayload({ "index.html": "<html>new</html>" });
		await startUpdateCheck();
		await beginUpdateDownloadIfAvailable();

		// `Neutralino.filesystem` is one of the native methods Neutralino wants in
		// `nativeAllowList` for `updater.*`, and whether a packaged build allows
		// it is unverified. An updater that reported success while writing nothing
		// is the failure mode worth refusing.
		expect(warn).toHaveBeenCalled();
		expect(getUpdateStatus()).toEqual({ kind: "available", version: VERSION });
		warn.mockRestore();
	});

	it("does nothing in a browser, where the client library has no server behind it", async () => {
		// `index.html` loads `neutralino.js` in the browser build too, so
		// `Neutralino.filesystem` exists there and every call to it is a message
		// nobody answers. Trusted, this is a banner on the website and a download
		// stuck at 0/N for ever; measured, it is a 2 s timeout and nothing else.
		const win = globalThis as unknown as { Neutralino?: unknown; NL_PATH?: string };
		win.Neutralino = { filesystem: {}, os: { getPath: () => new Promise<never>(() => undefined) } };
		const urls = stubFetch(async () => ok(JSON.stringify({ version: VERSION })));
		vi.useFakeTimers();

		const checking = startUpdateCheck();
		await vi.advanceTimersByTimeAsync(10_000);
		await checking;
		expect(getUpdateStatus()).toEqual({ kind: "idle" });

		// And the download trigger stays a no-op rather than reaching for a
		// filesystem that would never answer.
		await beginUpdateDownloadIfAvailable();
		expect(urls).toEqual([]);
		expect(getUpdateStatus()).toEqual({ kind: "idle" });
		delete win.Neutralino;
	});

	it("reports a failed download, unlike a failed check", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { fs: neutralino } = fakeNeutralino();
		stubFetch(async (url) => {
			if (url === UPDATE_MANIFEST_URL) return ok(JSON.stringify({ version: VERSION }));
			return { ok: false, status: 500, text: async () => "" } as Partial<Response>;
		});
		await startUpdateCheck();
		await beginUpdateDownloadIfAvailable();

		expect(warn).toHaveBeenCalled();
		expect(neutralino.writes).toEqual([]);
		expect(getUpdateStatus()).toEqual({ kind: "available", version: VERSION });
		warn.mockRestore();
	});
});

/** `git hash-object` of a string, computed the same way the build script does. */
function blobSha(text: string): string {
	return createHash("sha1").update(`blob ${text.length}\0${text}`).digest("hex");
}

function deleteNeutralino(): void {
	const win = globalThis as unknown as { Neutralino?: unknown; NL_PATH?: string };
	delete win.Neutralino;
	delete win.NL_PATH;
}

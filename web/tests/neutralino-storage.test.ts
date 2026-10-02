import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The desktop build persisted to a flat `storage.json` through a wrapper that
 * read it asynchronously and wrote it synchronously — so a cold start destroyed
 * what it was trying to load.
 *
 * The sequence, on **every** launch of the packaged app:
 *
 *   1. `new NeutralinoStorage()` calls `initAsync()`, which has not finished.
 *   2. `RogueGame.Run` loads options, keybindings and hiscores — from an empty
 *      map, so it gets the defaults.
 *   3. Something calls `setItem` (the option setters do, among others), which
 *      called `persist()` immediately: it serialised that near-empty map and
 *      wrote it over the player's real `storage.json`.
 *   4. *Then* the read landed — merging the file's keys into a map whose file had
 *      already been replaced by the defaults.
 *
 * The player's settings were destroyed by starting the game, and the failure was
 * invisible: the game booted, the options screen showed values, and there was
 * nothing to report.
 *
 * `NeutralinoStorage` also wrote on every single `setItem`, unsequenced, so two
 * snapshots could land out of order and let the older win.
 *
 * These run the real class against a fake `window.Neutralino` with controllable
 * latency, because the bug is a race and a synchronous mock would hide it.
 */

interface FakeFile {
  /** Resolves with this content, or rejects when null (file does not exist). */
  content: string | null;
  writes: Array<{ path: string; data: string }>;
  /** How long `getPath` and `readFile` take, so the race is reachable. */
  readDelayMs: number;
  /** Set to make writes fail, to check the failure is reported. */
  failWrites: boolean;
  /**
   * `6` is Neutralino 6.x (`readFile`/`writeFile`), `5` is 5.x
   * (`readFileData`/`writeFileData`). The old test hard-coded the 5.x names, so
   * the class passed against a client that has neither — which is the shipped
   * one.
   */
  api: 5 | 6;
  /** When true, the client library is absent: `window.NL_OS` only. */
  noClientLibrary: boolean;
}

let fake: FakeFile;
let win: Record<string, unknown>;

/**
 * The `window` a test wants, built from `fake` *now*.
 *
 * Built here rather than in `beforeEach` so a test can change `fake` and then ask
 * for the window it wants — the first version of the "no client library" test
 * set the flag after `beforeEach` had already built a working one, and the test
 * passed for the wrong reason and then failed for the right one.
 */
function buildWindow(): Record<string, unknown> {
  const read = async () => {
    if (fake.readDelayMs > 0) await new Promise((r) => setTimeout(r, fake.readDelayMs));
    if (fake.content === null) throw new Error("ENOENT: no such file");
    return fake.content;
  };
  const write = async (path: string, data: string) => {
    if (fake.failWrites) throw new Error("EACCES: permission denied");
    fake.writes.push({ path, data });
  };
  const filesystem: Record<string, unknown> = {
    createDirectory: async () => {
      // Throws every run after the first, as the real API does.
      throw new Error("directory exists");
    },
  };
  // Only the names the chosen client version actually has. This is the point:
  // a fake that always answers is a fake that cannot catch a renamed API.
  if (fake.api === 6) {
    filesystem.readFile = read;
    filesystem.writeFile = write;
  } else {
    filesystem.readFileData = read;
    filesystem.writeFileData = write;
  }
  return {
    // `injectGlobals` in neutralino.config.json, so both are present in the
    // packaged app. Either is enough for `hasNeutralino`.
    NL_OS: {},
    Neutralino: fake.noClientLibrary
      ? undefined
      : {
          os: {
            getPath: async (_kind: string) => {
              if (fake.readDelayMs > 0) await new Promise((r) => setTimeout(r, fake.readDelayMs));
              return "/home/player/AppData";
            },
          },
          filesystem,
        },
  };
}

/** Load a fresh copy of the module with `window` set up as Neutralino. */
async function loadModule(): Promise<typeof import("@engine/storage")> {
  win = buildWindow();
  (globalThis as { window?: unknown }).window = win;
  vi.resetModules();
  return await import("@engine/storage");
}

beforeEach(() => {
  fake = {
    content: null,
    writes: [],
    readDelayMs: 0,
    failWrites: false,
    api: 6,
    noClientLibrary: false,
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("NeutralinoStorage must not overwrite the file it is still reading", () => {
  it("does not write at all before the initial read completes", async () => {
    // The whole bug. A slow read plus one early setItem is enough.
    fake.content = JSON.stringify({ "rogue-survivor-options": '{"hiscore":1234}' });
    fake.readDelayMs = 30;

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
    };

    // What `RogueGame.Run` does at boot: read the options, find nothing (the
    // read has not landed), write the defaults back.
    expect(storage.getItem("rogue-survivor-options")).toBeNull();
    storage.setItem("rogue-survivor-options", '{"hiscore":0}');

    // Nothing may have been written yet.
    expect(fake.writes, "wrote before the read finished").toEqual([]);

    await storage.whenReady();
    await new Promise<void>((r) => setTimeout(r, 10));

    // Now it may write, and what it writes must be a *merge*: the default that
    // was just set, plus the player's own value under its own key.
    expect(fake.writes.length).toBeGreaterThan(0);
    const written = JSON.parse(fake.writes[fake.writes.length - 1]!.data) as Record<string, string>;
    expect(written["rogue-survivor-options"]).toBe('{"hiscore":0}');
  });

  it("a value set while the read is in flight is not clobbered by the disk value", async () => {
    fake.content = JSON.stringify({ k: "from-disk" });
    fake.readDelayMs = 20;

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
    };

    storage.setItem("k", "set-at-runtime");
    await storage.whenReady();
    await new Promise<void>((r) => setTimeout(r, 10));

    // The runtime write is newer than the file, so it wins.
    expect(storage.getItem("k")).toBe("set-at-runtime");
  });

  it("still adopts disk values for keys nothing wrote during the read", async () => {
    fake.content = JSON.stringify({ kept: "from-disk", clobbered: "old" });
    fake.readDelayMs = 20;

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
    };

    storage.setItem("clobbered", "new");
    await storage.whenReady();

    expect(storage.getItem("kept")).toBe("from-disk");
    expect(storage.getItem("clobbered")).toBe("new");
  });
});

describe("writes are serialised and coalesced", () => {
  it("a burst of setItem calls in one tick becomes one write", async () => {
    // `Session.adopt` pushes a ~4.6 MB save through here on the save keypress;
    // the old code serialised the whole storage once per call.
    fake.content = JSON.stringify({ seed: "0" });

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
    };
    await storage.whenReady();
    fake.writes.length = 0;

    for (let i = 0; i < 20; i++) storage.setItem(`key${i}`, `value${i}`);
    await new Promise<void>((r) => setTimeout(r, 10));

    expect(fake.writes.length, "a burst should collapse to a single write").toBe(1);
    const written = JSON.parse(fake.writes[0]!.data) as Record<string, string>;
    expect(Object.keys(written)).toHaveLength(21); // the seed plus 20
  });

  it("a failed write is reported rather than swallowed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.content = JSON.stringify({ seed: "0" });
    fake.failWrites = true;

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
    };
    await storage.whenReady();
    storage.setItem("k", "v");
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls.flat().join(" "))).toContain("storage.json");
  });

  it("a missing file on a first run is not an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.content = null; // never written before

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
    };
    await storage.whenReady();
    await new Promise<void>((r) => setTimeout(r, 10));

    // createDirectory and the read both throw on a first run; that must be quiet.
    expect(warn, "a first run warned").not.toHaveBeenCalled();
    expect(fake.writes.length).toBe(0);
  });
});

/**
 * The four defects that made the desktop build persist nothing, and the reported
 * symptom — "works in the browser, does not survive a restart in the packaged
 * app" — is what all four add up to.
 *
 * Every test below fails on the code as it stood. They are the reason this file
 * is worth reading before changing `storage.ts` again: the previous suite passed
 * throughout, because its fake answered to whatever names the class called.
 */
describe("the desktop build is actually reached", () => {
  it("selects the neutralino backend on a 6.x client, and reads and writes it", async () => {
    fake.content = JSON.stringify({ "rogue-survivor-options": '{"hiscore":99}' });

    const mod = await loadModule();
    expect(mod.hasNeutralino, "the desktop backend was not selected").toBe(true);

    const storage = mod.storage as unknown as {
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
      flush(): Promise<void>;
    };
    await storage.whenReady();

    // The read half. `readFileData` on a 6.x client is `TypeError: not a
    // function`, which the old empty `catch` swallowed as "first run" — so this
    // returned null and the player's options were about to be overwritten.
    expect(storage.getItem("rogue-survivor-options")).toBe('{"hiscore":99}');

    // The write half, and `flush` is what makes the claim checkable.
    storage.setItem("rogue-survivor-hiscores", "[]");
    await storage.flush();
    expect(fake.writes.length).toBeGreaterThan(0);
    const written = JSON.parse(fake.writes[fake.writes.length - 1]!.data) as Record<string, string>;
    expect(written["rogue-survivor-hiscores"]).toBe("[]");
  });

  it("still works against a 5.x client, which spells the methods *Data", async () => {
    // Not nostalgia: a property test is cheaper than a version pin, and the
    // shipped client is 6.9.0 while `neu` will happily serve another.
    fake.api = 5;
    fake.content = JSON.stringify({ k: "from-disk" });

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      getItem(k: string): string | null;
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
      flush(): Promise<void>;
    };
    await storage.whenReady();
    expect(storage.getItem("k")).toBe("from-disk");
    storage.setItem("k2", "v2");
    await storage.flush();
    expect(fake.writes.length).toBeGreaterThan(0);
  });

  it("is selected on NL_OS alone, when the client library is not there yet", async () => {
    // `injectGlobals` can arrive before the deferred `neutralino.js`, and the
    // packaged HTML has the module script first. Keying detection off
    // `window.NL_OS` *alone* is what broke the packaged build; keying it off the
    // client library alone would break a configuration that injects the globals
    // and serves the library another way. Either has to be enough.
    fake.noClientLibrary = true;

    const mod = await loadModule();
    expect(mod.hasNeutralino).toBe(true);
    const storage = mod.storage as unknown as { whenReady(): Promise<void>; flush(): Promise<void> };
    // No client library, so no file path — and that has to be *reported*, because
    // the old code returned from `flush` silently and the game looked like it was
    // saving.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await storage.whenReady();
    await expect(storage.flush()).rejects.toBeTruthy();
    expect(String(warn.mock.calls.flat().join(" "))).toContain("AppData persistence");
  });

  it("reports a corrupt file rather than treating it as a first run", async () => {
    // The dangerous case. A corrupt or unreadable file and a missing file both
    // throw, and the old code caught both the same way and carried on — so the
    // game loaded defaults and then wrote them back over the player's real file.
    // A missing file is benign; anything else destroys settings, and it has to
    // say so.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.content = "{ this is not json";

    const mod = await loadModule();
    const storage = mod.storage as unknown as { whenReady(): Promise<void> };
    await storage.whenReady();
    expect(String(warn.mock.calls.flat().join(" "))).toContain("storage.json");
  });
});

describe("a write failure is a failure, not a success", () => {
  it("flush rejects when the write is refused, so a caller can fall back", async () => {
    // This is what `GameSaveManager.saveGame` awaits. Without it, `setItem`
    // returned without throwing — it cannot throw, it only records a write — so
    // `saveGame` returned `true` for a save that had not happened, and
    // `RogueGame` discarded even that with a bare `void`.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.content = JSON.stringify({ seed: "0" });
    fake.failWrites = true;

    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
      flush(): Promise<void>;
    };
    await storage.whenReady();
    storage.setItem("rogueSurvivor_save_0", "{}");
    await expect(storage.flush()).rejects.toBeTruthy();
    expect(String(warn.mock.calls.flat().join(" "))).toContain("storage.json");
  });

  it("does not reject when the write succeeded", async () => {
    // The other half, because a `flush` that always rejects is as useless as one
    // that never does.
    fake.content = JSON.stringify({ seed: "0" });
    const mod = await loadModule();
    const storage = mod.storage as unknown as {
      setItem(k: string, v: string): void;
      whenReady(): Promise<void>;
      flush(): Promise<void>;
    };
    await storage.whenReady();
    storage.setItem("k", "v");
    await expect(storage.flush()).resolves.toBeUndefined();
  });
});

describe("GameSaveManager reports a desktop save that did not land", () => {
  it("returns false when the backend refused the write", async () => {
    // The end-to-end claim from the bug report, in the only form a test can take:
    // the shell is needed to prove a restart loses nothing, but "a write failure
    // is reported rather than swallowed" is testable here.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.content = JSON.stringify({ seed: "0" });
    fake.failWrites = true;

    const mod = await loadModule();
    const { GameSaveManager } = await import("@engine/GameSave");
    const storage = mod.storage as unknown as { whenReady(): Promise<void> };
    await storage.whenReady();

    // `indexedDB` does not exist in node, so the fallback rejects too and the
    // method returns false. That is the shape of the answer, and the reason it
    // is false is that `flush` rejected rather than that `setItem` threw.
    const ok = await GameSaveManager.saveGame(0, { hello: "world" });
    expect(ok).toBe(false);
    expect(String(warn.mock.calls.flat().join(" "))).toContain("storage.json");
  });

  // The bug this pins down black-screened the game in both the desktop app and
  // the browser, with no error logged anywhere. `index.html` loads
  // `/js/neutralino.js` unconditionally, so the client library's `os` and
  // `filesystem` are always defined - even in a browser with no Neutralino server
  // behind them - and `awaitClientLibrary` therefore returns `true`. The first
  // real call then waited for a reply that never came. Nothing in `Run()` is
  // painted before `LoadOptions` awaits readiness, so that await was the whole
  // screen: black, silent, forever.
  //
  // `readDelayMs` is reused as the hang. It models a server that accepts the
  // connection and then goes quiet, which is the case that is indistinguishable
  // from "still loading" without a deadline.
  it("becomes ready even when the Neutralino server never answers", async () => {
    fake.content = JSON.stringify({ seed: "0" });
    fake.readDelayMs = 60_000;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mod = await loadModule();
    const storage = mod.storage as unknown as { whenReady(): Promise<void> };

    // The deadline is 5s, so allow generous headroom for a slow CI box while
    // still failing fast if the fix is ever reverted - which is the point.
    await expect(
      Promise.race([
        storage.whenReady(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("whenReady() never settled")), 20_000),
        ),
      ]),
    ).resolves.toBeUndefined();

    // And it must say so, rather than pretending the read landed. This is the
    // load-bearing half of the fix: resolving is only safe because the backend
    // is abandoned, not assumed good.
    const said = String(warn.mock.calls.flat().join(" "));
    expect(said).toContain("no answer from the Neutralino server");
    expect(said).toContain("progress will not be saved");
  }, 25_000);

  it("returns true on a backend that saved", async () => {
    fake.content = JSON.stringify({ seed: "0" });
    const mod = await loadModule();
    const { GameSaveManager } = await import("@engine/GameSave");
    const storage = mod.storage as unknown as { whenReady(): Promise<void> };
    await storage.whenReady();

    expect(await GameSaveManager.saveGame(0, { hello: "world" })).toBe(true);
    expect(fake.writes.some((w) => w.path.endsWith("storage.json"))).toBe(true);
  });
});

/**
 * `neutralino.config.json`, which is not code and had no test.
 *
 * Two of its keys are load-bearing for everything above, and both were missing:
 * `enableNativeAPI` (default **false**, so every `Neutralino.*` call is refused
 * with `NE_RT_APIPRME`) and `injectGlobals` (without which the `NL_*` globals
 * never exist and the detection in `storage.ts` has nothing to see). A JSON file
 * that no test reads is exactly how both went missing in the first place, so it
 * is read here.
 */
describe("the desktop config", () => {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, "..", "neutralino.config.json"), "utf8"),
  ) as Record<string, any>;

  it("enables the native API, without which every call is refused", () => {
    expect(config.enableNativeAPI).toBe(true);
  });

  it("injects the NL_* globals into the window", () => {
    // A `modes.window` option, not a top-level one — which is easy to get wrong,
    // and `storage.ts` now treats the client library as an equally good signal
    // precisely because this one has been absent before.
    expect(config.modes?.window?.injectGlobals).toBe(true);
  });

  it("still names the 6.9.0 client the code speaks to", () => {
    // `storage.ts` supports both the 5.x `*Data` spellings and the 6.x ones, so
    // this is a note rather than a constraint — but a client bump should be a
    // deliberate act that re-reads the filesystem API.
    expect(config.cli.clientVersion).toBe("6.9.0");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
  /** How long `getPath` and `readFileData` take, so the race is reachable. */
  readDelayMs: number;
  /** Set to make writes fail, to check the failure is reported. */
  failWrites: boolean;
}

let fake: FakeFile;
let win: Record<string, unknown>;

/** Load a fresh copy of the module with `window` set up as Neutralino. */
async function loadModule(): Promise<typeof import("@engine/storage")> {
  (globalThis as { window?: unknown }).window = win;
  vi.resetModules();
  return await import("@engine/storage");
}

beforeEach(() => {
  fake = { content: null, writes: [], readDelayMs: 0, failWrites: false };
  win = {
    NL_OS: {},
    Neutralino: {
      os: {
        getPath: async (_kind: string) => {
          if (fake.readDelayMs > 0) await new Promise((r) => setTimeout(r, fake.readDelayMs));
          return "/home/player/AppData";
        },
      },
      filesystem: {
        createDirectory: async () => {
          // Throws every run after the first, as the real API does.
          throw new Error("directory exists");
        },
        readFileData: async () => {
          if (fake.readDelayMs > 0) await new Promise((r) => setTimeout(r, fake.readDelayMs));
          if (fake.content === null) throw new Error("ENOENT");
          return fake.content;
        },
        writeFileData: async (path: string, data: string) => {
          if (fake.failWrites) throw new Error("EACCES");
          fake.writes.push({ path, data });
        },
      },
    },
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

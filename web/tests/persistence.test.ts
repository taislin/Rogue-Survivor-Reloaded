import { describe, it, expect } from "vitest";
import { storage, hasLocalStorage } from "@engine/storage";
import { Session, GameMode } from "@engine/Session";
import { GameOptions } from "@engine/GameOptions";
import { Keybindings } from "@engine/Keybindings";
import { HiScore, HiScoreTable } from "@engine/HiScoreTable";
import { GameHintsStatus, AdvisorHint } from "@engine/GameHints";
import { TextFile } from "@engine/TextFile";
import { WorldTime } from "@engine/WorldTime";

/**
 * Persistence roundtrips.
 *
 * In Node there is no `localStorage`, so every one of these runs against the
 * in-memory fallback in `engine/storage.ts`. That is the point: naming the
 * bare global `localStorage` throws a `ReferenceError` outside a browser, and
 * before the wrapper existed six modules did exactly that. These tests fail if
 * anyone reintroduces a direct reference.
 */

describe("storage wrapper", () => {
  it("falls back to memory when there is no localStorage", () => {
    // The suite runs with environment "node", so this must be the fallback.
    // If someone adds jsdom later this flips, and the roundtrips below still
    // have to hold either way.
    expect(hasLocalStorage).toBe(false);
  });

  it("round-trips a value", () => {
    storage.setItem("test-key", "hello");
    expect(storage.getItem("test-key")).toBe("hello");
    storage.removeItem("test-key");
    expect(storage.getItem("test-key")).toBeNull();
  });

  it("returns null for a missing key rather than undefined", () => {
    expect(storage.getItem("never-written")).toBeNull();
  });
});

describe("Session save/load", () => {
  it("round-trips the fields it claims to serialise", () => {
    const session = Session.get();
    Session.useSeed(9999);
    session.gameMode = GameMode.GM_STANDARD;
    session.worldTime.turnCounter = 4321;
    session.lastTurnPlayerActed = 77;
    session.nextAutoSaveTime = 123456;

    // Session.save returns void, matching C#'s `public static void Save`
    // (Session.cs:586) — so assert through the roundtrip, not a return value.
    Session.save(session);
    expect(Session.load()).toBe(true);

    const back = Session.get();
    expect(back.seed).toBe(9999);
    expect(back.gameMode).toBe(GameMode.GM_STANDARD);
    expect(back.worldTime.turnCounter).toBe(4321);
    expect(back.lastTurnPlayerActed).toBe(77);
    expect(back.nextAutoSaveTime).toBe(123456);
  });

  it("preserves a pinned seed across reset (what --seed relies on)", () => {
    Session.useSeed(31337);
    expect(Session.get().seed).toBe(31337);
    Session.get().reset();
    expect(Session.get().seed).toBe(31337);
  });

  it("reports failure when there is nothing stored", () => {
    Session.delete();
    expect(Session.load()).toBe(false);
  });

  it("rejects corrupt stored JSON instead of throwing", () => {
    storage.setItem(Session.STORAGE_KEY, "{not json");
    expect(Session.load()).toBe(false);
    storage.removeItem(Session.STORAGE_KEY);
  });
});

describe("GameOptions save/load", () => {
  it("round-trips option values", () => {
    const options = GameOptions.load();
    options.musicVolume = 0.42;
    options.DEV_ShowActorsStats = true;
    GameOptions.save(options);

    const back = GameOptions.load();
    expect(back.musicVolume).toBeCloseTo(0.42, 5);
    expect(back.DEV_ShowActorsStats).toBe(true);
  });

  it("falls back to defaults on corrupt data", () => {
    storage.setItem(GameOptions.STORAGE_KEY, "]]]not json[[[");
    const back = GameOptions.load();
    expect(back).toBeInstanceOf(GameOptions);
  });
});

describe("Keybindings save/load", () => {
  it("round-trips a rebound key", () => {
    const keys = new Keybindings();
    const before = keys.getCommand("ENTER");
    keys.set(0, "F9");
    expect(keys.getCommand("F9")).toBe(0);

    keys.saveToStorage();

    const reloaded = new Keybindings();
    expect(reloaded.loadFromStorage()).toBe(true);
    expect(reloaded.getCommand("F9")).toBe(0);
    // Untouched bindings survive too.
    expect(reloaded.getCommand("ENTER")).toBe(before);
  });

  it("returns false when nothing is stored", () => {
    storage.removeItem("rogue_survivor_keybindings");
    expect(new Keybindings().loadFromStorage()).toBe(false);
  });
});

describe("HiScoreTable save/load", () => {
  it("round-trips entries and ordering", () => {
    const table = new HiScoreTable(HiScoreTable.DEFAULT_MAX_ENTRIES);
    for (const [name, points] of [
      ["Low", 10],
      ["High", 900],
      ["Mid", 100],
    ] as Array<[string, number]>) {
      const hi = new HiScore();
      hi.name = name;
      hi.totalPoints = points;
      hi.turnSurvived = points;
      table.register(hi);
    }
    // register() keeps the table sorted by descending score.
    expect(table.get(0).name).toBe("High");
    expect(table.get(1).name).toBe("Mid");
    expect(table.get(2).name).toBe("Low");

    HiScoreTable.save(table);
    const back = HiScoreTable.load();
    expect(back).not.toBeNull();
    expect(back!.count).toBe(3);
    expect(back!.get(0).name).toBe("High");
    expect(back!.get(0).totalPoints).toBe(900);
    expect(back!.get(2).name).toBe("Low");
  });

  it("returns null when nothing is stored", () => {
    storage.removeItem(HiScoreTable.STORAGE_KEY);
    expect(HiScoreTable.load()).toBeNull();
  });

  it("caps the table at max entries", () => {
    const table = new HiScoreTable(3);
    for (let i = 1; i <= 10; i++) {
      const hi = new HiScore();
      hi.name = `p${i}`;
      hi.totalPoints = i * 10;
      table.register(hi);
    }
    expect(table.count).toBeLessThanOrEqual(3);
  });
});

describe("GameHints save/load", () => {
  it("round-trips which hints have been shown", () => {
    const hints = new GameHintsStatus();
    hints.saveToStorage();

    // Use the public API, not the private `hints` array.
    hints.setAdvisorHintAsGiven(AdvisorHint.MOVE_BASIC);
    expect(hints.isAdvisorHintGiven(AdvisorHint.MOVE_BASIC)).toBe(true);
    hints.saveToStorage();

    const back = GameHintsStatus.loadFromStorage();
    expect(back.isAdvisorHintGiven(AdvisorHint.MOVE_BASIC)).toBe(true);
    expect(back.isAdvisorHintGiven(AdvisorHint.KEYS_OPTIONS)).toBe(false);
    expect(back.countAdvisorHintsGiven()).toBe(1);
  });

  it("ignores an out-of-range hint id", () => {
    const hints = new GameHintsStatus();
    hints.setAdvisorHintAsGiven(-1 as AdvisorHint);
    hints.setAdvisorHintAsGiven((AdvisorHint._COUNT + 5) as AdvisorHint);
    expect(hints.countAdvisorHintsGiven()).toBe(0);
  });

  it("falls back to all-unseen on corrupt data", () => {
    storage.setItem("rogue_survivor_hints", "{{{not json");
    const back = GameHintsStatus.loadFromStorage();
    expect(back.countAdvisorHintsGiven()).toBe(0);
  });
});

describe("TextFile", () => {
  // Asymmetric on purpose, and worth knowing about: `save` writes to storage
  // under `textfile:<name>`, but `load` fetches over HTTP. That is correct
  // today because the only thing ever loaded is the shipped manual
  // (RogueGame.GetUserManualFilePath), and the post-mortem grave is only ever
  // written -- C# likewise never reads a grave back (RogueGame.cs:17159 is the
  // only PostMortem file call). It would bite anyone who later tried to reopen
  // a saved grave, so it is pinned here rather than left as a surprise.
  it("save writes through to storage", () => {
    const file = new TextFile();
    file.append("ROGUE SURVIVOR");
    file.append("POST MORTEM");
    expect(file.save("grave_test.txt")).toBe(true);
    expect(storage.getItem("textfile:grave_test.txt")).toBe("ROGUE SURVIVOR\nPOST MORTEM");
  });

  it("load fetches over HTTP, not storage", async () => {
    const originalFetch = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (url: string) => {
      requested = url;
      return {
        ok: true,
        text: async () => "line one\nline two\n",
      } as unknown as Response;
    }) as typeof fetch;
    try {
      const file = new TextFile();
      expect(await file.load("manual.txt")).toBe(true);
      expect(requested).toBe("manual.txt");
      // A trailing newline must not become a phantom empty line.
      expect([...file.rawLines]).toEqual(["line one", "line two"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("load returns false on a non-ok response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      text: async () => "",
    })) as unknown as typeof fetch;
    try {
      expect(await new TextFile().load("missing.txt")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("WorldTime persistence helper", () => {
  it("reconstructs day and hour from a stored turn counter", () => {
    const t = new WorldTime(0);
    t.turnCounter = WorldTime.TURNS_PER_DAY * 2 + 5 * WorldTime.TURNS_PER_HOUR;
    expect(t.day).toBe(2);
    expect(t.hour).toBe(5);
  });
});

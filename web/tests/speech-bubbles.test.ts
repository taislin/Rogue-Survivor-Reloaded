import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { grepAll } from "./helpers/grepAll";
import { RogueGame, TILE_SIZE } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { GameOptions, OptionIDs, Options, stepGameOption } from "@engine/GameOptions";
import { DEFAULT_VIEW_MODE } from "@engine/firstperson/Types";
import { storage } from "@engine/storage";
import { Session } from "@engine/Session";
import { Actor } from "@data/Actor";
import { Faction } from "@data/Faction";
import { Map as GameMap, Lighting } from "@data/Map";
import { Point } from "@engine/Point";
import { SayFlags } from "@engine/actions/Actions";
import { GameActors, ActorID } from "@gameplay/GameActors";
import { GameItems } from "@gameplay/GameItems";
import { GameTiles, TileID } from "@gameplay/GameTiles";
import { Models } from "@data/Models";

/**
 * `(Gfx) Speech Bubbles` — an actor's last line, drawn over their tile.
 *
 * The feature is one line of reading, so most of what can go wrong is invisible
 * rather than loud. A bubble that outlives its speaker, one that hangs over an
 * empty tile after they walk off, one that never appears at all, and one that
 * appears for someone the player cannot see are all "the screen looked
 * slightly wrong" and none of them throws — which is why the expiry and the
 * visibility gate are pinned here rather than left to be noticed in play.
 *
 * The two properties that shape everything else:
 *
 * - **Bubbles are not overlays.** `ClearOverlays` runs 85 times in `RogueGame`,
 *   once per mouse move, so a bubble pushed into `m_Overlays` would be destroyed
 *   the instant the player moved the mouse. `m_SpeechBubbles` is a separate map
 *   and is only ever emptied by expiry, by the map changing, or by a new game.
 * - **The default is off.** The port is a 1:1 transcription by default, and a
 *   player who has never opened the options screen should be looking at Alpha
 *   10.1 rather than at a decision made for them here.
 */

const survivors = new Faction("The Survivors", "survivor");
const tiles = new GameTiles();

/** `src/`, for the two source-shaped assertions at the end of this file. */
const SRC = join(__dirname, "..", "src");

/**
 * A 60x60 map with the player in the middle and everything in sight.
 *
 * `setViewAndMarkVisited` is what `IsVisibleToPlayer` reads, so without it every
 * actor is invisible and the visibility gate under test would pass vacuously.
 */
function newFixture(): {
  game: RogueGame;
  ui: NullRogueUI;
  map: GameMap;
  player: Actor;
} {
  const ui = new NullRogueUI();
  const game = new RogueGame(ui, new NullMusicManager());
  const map = new GameMap(1234, "bubbles", 60, 60);
  for (let x = 0; x < 60; x++) {
    for (let y = 0; y < 60; y++) map.setTileModelAt(x, y, tiles.get(TileID.FLOOR_CONCRETE));
  }
  map.lighting = Lighting.LIT;
  const visible: Point[] = [];
  for (let x = 0; x < 60; x++) for (let y = 0; y < 60; y++) visible.push(new Point(x, y));
  map.setViewAndMarkVisited(visible);

  const player = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, "you");
  map.placeActor(player, new Point(30, 30));
  game.m_Player = player;
  Session.get().currentMap = map;
  game.ComputeViewRect(player.location.position);
  return { game, ui, map, player };
}

function npcAt(map: GameMap, name: string, pos: Point): Actor {
  const npc = new Actor(Models.actors.get(ActorID.MALE_CIVILIAN), survivors, name);
  map.placeActor(npc, pos);
  return npc;
}

/** Advances the map's clock, which is the only bubble lifetime there is. */
function passTurns(map: GameMap, turns: number): void {
  map.localTime.turnCounter += turns;
}

/**
 * Turns the option on or off.
 *
 * Writes the `Options` singleton rather than a `GameOptions.load()` result,
 * because that singleton is what the engine and `stepGameOption` both read —
 * `s_Options` is an alias for it. A fresh instance would look like it had been
 * enabled and change nothing.
 */
function setBubbles(on: boolean): void {
  Options.showSpeechBubbles = on;
}

/** Drops stored options and reloads the singleton, as `LoadOptions` does at boot. */
function resetOptions(): void {
  storage.removeItem(GameOptions.STORAGE_KEY);
  Options.copyFrom(GameOptions.load());
}

describe("the speech bubbles option", () => {
  beforeEach(() => {
    resetOptions();
  });

  it("is off by default, so the port looks like the C# until asked", () => {
    expect(new GameOptions().showSpeechBubbles).toBe(false);
    // Not merely as a field initialiser: `load()` returns early on a null blob
    // and so skips every other path a default could be applied on.
    expect(GameOptions.load().showSpeechBubbles).toBe(false);
    // And reset-to-default has to put it back, or turning it on then pressing R
    // on the options screen would leave it on.
    const options = new GameOptions();
    options.showSpeechBubbles = true;
    options.resetToDefaultValues();
    expect(options.showSpeechBubbles).toBe(false);
  });

  it("survives a save/load round trip", () => {
    // Automatic — `save()` walks every `m_`-prefixed field — so this is the test
    // that would notice if the field were ever renamed out of that convention.
    const options = new GameOptions();
    options.showSpeechBubbles = true;
    GameOptions.save(options);
    expect(GameOptions.load().showSpeechBubbles).toBe(true);
  });

  it("is copied by copyFrom, which is what 'R' on the options screen uses", () => {
    const src = new GameOptions();
    src.showSpeechBubbles = true;
    const dst = new GameOptions();
    dst.copyFrom(src);
    expect(dst.showSpeechBubbles).toBe(true);
  });

  it("flips on either arrow", () => {
    // A boolean has no order to step through, and a row that only answered to
    // Left would read as broken. `difficulty-at-creation.test.ts` nudges every
    // row in the real screen's list and demands it move in either direction.
    expect(Options.showSpeechBubbles).toBe(false);
    stepGameOption(OptionIDs.UI_SHOW_SPEECH_BUBBLES, 1);
    expect(Options.showSpeechBubbles).toBe(true);
    stepGameOption(OptionIDs.UI_SHOW_SPEECH_BUBBLES, -1);
    expect(Options.showSpeechBubbles).toBe(false);
  });

  it("has a label, a help text and a value that says which is the default", () => {
    const options = GameOptions.load();
    expect(GameOptions.optionName(OptionIDs.UI_SHOW_SPEECH_BUBBLES)).toContain("Speech Bubbles");
    expect(GameOptions.describe(OptionIDs.UI_SHOW_SPEECH_BUBBLES)).toContain("bubble");
    expect(options.describeValue(Session.get().gameMode, OptionIDs.UI_SHOW_SPEECH_BUBBLES))
      .toContain("default OFF");
    options.showSpeechBubbles = true;
    expect(options.describeValue(Session.get().gameMode, OptionIDs.UI_SHOW_SPEECH_BUBBLES))
      .toContain("ON");
  });

  it("is a renderer preference, not a ruleset feature", () => {
    // It is on or off in every ruleset alike. Had this been a `Feature`, turning
    // it on in Still Alive and Classic at the same time would have been two
    // different code paths for a difference that is only about pixels.
    expect(GameOptions.load().showSpeechBubbles).toBe(false);
    expect(new GameOptions().showSpeechBubbles).toBe(false);
  });
});

describe("speech bubbles: what gets said over someone's head", () => {
  beforeEach(() => {
    new GameActors();
    new GameItems();
    resetOptions();
  });

  it("draws an emote over the speaker, and nothing at all when the option is off", () => {
    const { game, ui, map } = newFixture();
    const npc = npcAt(map, "npc", new Point(31, 30));
    ui.recordText = true;

    game.DoEmote(npc, "Help!");
    game.DrawSpeechBubbles();
    // The feature is opt-in, so the default build has to be the 1:1 one.
    expect(ui.drawnBubbles).toEqual([]);

    setBubbles(true);
    game.DoEmote(npc, "Help!");
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual(["Help!"]);
  });

  it("bubbles a DoSay, which writes to the log itself rather than through DoEmote", () => {
    // `DoSay` is the NPC-to-NPC conversation line and it never calls `DoEmote`,
    // so a bubble hooked only into `DoEmote` would miss every conversation
    // between two NPCs — the case the feature exists for.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const a = npcAt(map, "a", new Point(31, 30));
    const b = npcAt(map, "b", new Point(32, 30));

    game.DoSay(a, b, "psst", SayFlags.NONE);
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual(["psst"]);
  });

  it("says nothing over someone the player cannot see", () => {
    // A bubble is part of what the player can see, not a district transcript. The
    // actor is on the map but its tile is out of view, which is the case a
    // position-only check would wave through.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const npc = npcAt(map, "npc", new Point(31, 30));
    map.getTileAt(31, 30)!.isInView = false;

    game.DoEmote(npc, "you cannot hear me");
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual([]);
    expect(game.m_SpeechBubbles.size).toBe(0);
  });

  it("keeps one bubble per actor, so a talkative NPC does not stack boxes", () => {
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const npc = npcAt(map, "npc", new Point(31, 30));

    game.DoEmote(npc, "first");
    game.DoEmote(npc, "second");
    game.DrawSpeechBubbles();

    // Last line wins, and there is exactly one box.
    expect(ui.drawnBubbles).toEqual(["second"]);
    expect(game.m_SpeechBubbles.size).toBe(1);
  });

  it("does not put an empty box on screen", () => {
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const npc = npcAt(map, "npc", new Point(31, 30));

    game.DoEmote(npc, "");
    game.DoEmote(npc, "   ");
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual([]);
  });

  it("trims the line it bubbles", () => {
    // `DoEmote` callers build strings like `"${VERB} \"${text}\""`, so the
    // whitespace is incidental rather than meaningful, and leading space on the
    // widest line is what makes a box look misaligned.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const npc = npcAt(map, "npc", new Point(31, 30));

    game.DoEmote(npc, "  Hello there  ");
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual(["Hello there"]);
  });

  it("separates two speakers", () => {
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const a = npcAt(map, "a", new Point(31, 30));
    const b = npcAt(map, "b", new Point(32, 30));

    game.DoEmote(a, "mine");
    game.DoEmote(b, "yours");
    game.DrawSpeechBubbles();
    expect([...ui.drawnBubbles].sort()).toEqual(["mine", "yours"]);
  });
});

describe("speech bubbles: how long they last", () => {
  beforeEach(() => {
    new GameActors();
    new GameItems();
    resetOptions();
  });

  it("goes away once the speaker has had a few turns", () => {
    // The lifetime is in the actor's map's turn counter, which is the same clock
    // `DoEmote` stamps its own message with — so a bubble and its log line expire
    // together rather than one outliving the other.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;
    const npc = npcAt(map, "npc", new Point(31, 30));

    game.DoEmote(npc, "still talking");
    passTurns(map, 5);
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual(["still talking"]);

    passTurns(map, 1); // six turns old
    ui.clearRecordedText();
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual([]);
    expect(game.m_SpeechBubbles.size).toBe(0);
  });

  it("follows a speaker who is still walking", () => {
    // The tile is read fresh at draw time rather than stored, so a bubble tracks
    // its owner. Storing the position would leave a box on the tile somebody
    // spoke from and has since left.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    const npc = npcAt(map, "npc", new Point(31, 30));
    game.DoEmote(npc, "walking");

    const before = game.MapToScreen(npc.location.position);
    map.placeActor(npc, new Point(35, 34));
    const after = game.MapToScreen(npc.location.position);
    expect(after).not.toEqual(before);

    ui.recordText = true;
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual(["walking"]);
    expect(game.IsInViewRect(npc.location.position)).toBe(true);
  });

  it("skips an off-panel bubble without forgetting it", () => {
    // A skip rather than a prune: the actor is still on this map and still
    // mid-sentence, and the view rect moves when the player does. Drawn anyway it
    // would land on the side panel, which is the one case where a bubble is both
    // ugly and unmissable.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    const npc = npcAt(map, "npc", new Point(31, 30));
    game.DoEmote(npc, "out of frame");

    // Far enough right that the centred camera no longer covers it.
    map.placeActor(npc, new Point(59, 30));
    expect(game.IsInViewRect(npc.location.position)).toBe(false);

    ui.recordText = true;
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual([]);
    // Still remembered — it is not stale, it is just not on screen.
    expect(game.m_SpeechBubbles.size).toBe(1);

    // Walk back into frame and it is still there, because no turns passed.
    map.placeActor(npc, new Point(31, 30));
    ui.clearRecordedText();
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual(["out of frame"]);
  });

  it("drops a bubble whose speaker left the map", () => {
    // Their tile now belongs to a map that is not on screen. Reading it against
    // the current map would hang their last words over an unrelated tile here —
    // the worst version of this bug, since the words are real and the tile is not.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    const npc = npcAt(map, "npc", new Point(31, 30));
    game.DoEmote(npc, "goodbye");

    const elsewhere = new GameMap(99, "stairs", 60, 60);
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) elsewhere.setTileModelAt(x, y, tiles.get(TileID.FLOOR_CONCRETE));
    }
    elsewhere.placeActor(npc, new Point(30, 30));

    ui.recordText = true;
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual([]);
    expect(game.m_SpeechBubbles.size).toBe(0);
  });

  it("drops a bubble whose speaker died", () => {
    const { game, ui, map } = newFixture();
    setBubbles(true);
    const npc = npcAt(map, "npc", new Point(31, 30));
    game.DoEmote(npc, "AAAAGGGGGGGRRR");
    npc.isDead = true;

    ui.recordText = true;
    game.DrawSpeechBubbles();
    expect(ui.drawnBubbles).toEqual([]);
    expect(game.m_SpeechBubbles.size).toBe(0);
  });

  it("is emptied by a new game, so a run cannot inherit the last one's last words", () => {
    // The map is keyed by actor and pruned by turn rather than by new game, so
    // without this a run started within the bubble lifetime of the previous one
    // would show them — visible, and attributed to whoever now stands there.
    const { game, map } = newFixture();
    setBubbles(true);
    game.DoEmote(npcAt(map, "npc", new Point(31, 30)), "from the previous run");
    expect(game.m_SpeechBubbles.size).toBe(1);

    game.ClearSpeechBubbles();
    expect(game.m_SpeechBubbles.size).toBe(0);
  });

  it("survives a redraw with no current map, rather than being wiped", () => {
    // The game loop being paused is not the same as the run ending. Throwing the
    // bubbles away here would make the option flicker off every time a menu
    // opened over the map.
    const { game, map } = newFixture();
    setBubbles(true);
    game.DoEmote(npcAt(map, "npc", new Point(31, 30)), "held");
    Session.get().currentMap = null;

    game.DrawSpeechBubbles();
    expect(game.m_SpeechBubbles.size).toBe(1);
  });

  it("draws nothing in first person, where a tile coordinate means nothing", () => {
    // `DrawMap` returns early into the projected 3D scene, but the overlay pass
    // is outside that branch and still runs — so without this a bubble would be
    // drawn at a plausible-looking spot in the corner. The view mode is a
    // process-wide option, so it is restored rather than left on.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    game.DoEmote(npcAt(map, "npc", new Point(31, 30)), "not there");
    ui.recordText = true;

    Options.viewMode = "first-person";
    try {
      game.DrawSpeechBubbles();
    } finally {
      Options.viewMode = DEFAULT_VIEW_MODE;
    }
    expect(ui.drawnBubbles).toEqual([]);
    // And the bubble is *kept*, not discarded: the player still has top-down to
    // come back to, and it should still be there when they do.
    expect(game.m_SpeechBubbles.size).toBe(1);
  });
});

describe("speech bubbles: where they are drawn", () => {
  beforeEach(() => {
    new GameActors();
    new GameItems();
    resetOptions();
  });

  it("anchors to the speaker's own tile", () => {
    // The tile, not a message-panel coordinate: the whole feature is that the
    // bubble is attached to a person. A tile in the top-left of the view has its
    // origin at the panel origin, so the anchor is unambiguous.
    const { game, ui, map } = newFixture();
    setBubbles(true);
    ui.recordText = true;

    let seen: { x: number; y: number; size: number } | null = null;
    const probe = ui.UI_DrawSpeechBubble.bind(ui);
    ui.UI_DrawSpeechBubble = (
      _text: string, _tc: unknown, _bc: unknown, _fc: unknown,
      x: number, y: number, size: number, _maxWidth: number,
    ) => {
      seen = { x, y, size };
      probe(_text as never, _tc as never, _bc as never, _fc as never, x, y, size, 0);
    };

    game.DoEmote(npcAt(map, "npc", new Point(31, 30)), "anchored");
    game.DrawSpeechBubbles();

    const expected = game.MapToScreen(31, 30);
    expect(seen).not.toBeNull();
    expect(seen!.x).toBe(expected.x);
    expect(seen!.y).toBe(expected.y);
    expect(seen!.size).toBe(TILE_SIZE);
  });

  it("gives the renderer a wrap width, and leaves the measuring to it", () => {
    // The box cannot be sized by the engine: wrap width, box width and therefore
    // whether "above" fits all depend on measuring the text, which only the UI
    // layer can do. So the engine passes a width and the UI decides what that
    // means in glyphs.
    const { game, ui, map } = newFixture();
    setBubbles(true);

    let maxWidth = 0;
    const probe = ui.UI_DrawSpeechBubble.bind(ui);
    ui.UI_DrawSpeechBubble = (
      _text: string, _tc: unknown, _bc: unknown, _fc: unknown,
      x: number, y: number, size: number, w: number,
    ) => {
      maxWidth = w;
      probe(_text as never, _tc as never, _bc as never, _fc as never, x, y, size, w);
    };

    game.DoEmote(npcAt(map, "npc", new Point(31, 30)), "wrapped");
    game.DrawSpeechBubbles();

    expect(maxWidth).toBeGreaterThan(0);
    expect(maxWidth % TILE_SIZE).toBe(0); // a whole number of tiles
  });

  it("is drawn from inside the map's zoom scope, and only from there", () => {
    // The one thing a direct call to `DrawSpeechBubbles` cannot check is where it
    // is wired in. It has to be inside `RedrawPlayScreen`'s overlay pass: that
    // pass is the only thing that opens the scaled scope a bubble belongs in, and
    // drawn outside it a bubble would sit at 32px-tile coordinates unscaled — on
    // the wrong tiles at 2x zoom, which is the map-zoom bug this codebase has
    // already had once (`PopupOverlay`).
    //
    // Asserted on the source rather than by driving a real redraw, which needs a
    // whole played game (`HeadlessRunner` plus `StartNewGame`) — and the other half
    // of the risk needs no source scan at all, because the call's arity is checked
    // by `tsc` against `IRogueUI.UI_DrawSpeechBubble`.
    const src = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
    const overlayPass = src.slice(src.indexOf("withMapZoom(() => {\n\t\t\tfor (const o of this.m_Overlays)"));
    expect(overlayPass.length).toBeGreaterThan(0);
    // Inside the loop's scope, and before it closes.
    expect(overlayPass).toContain("this.DrawSpeechBubbles();");
    expect(overlayPass.indexOf("this.DrawSpeechBubbles();"))
      .toBeLessThan(overlayPass.indexOf("}, false);"));

    // And nowhere else: a bubble drawn from a second place would be drawn twice
    // per frame, at two different zooms.
    const calls = grepAll(join(SRC, "engine"), /this\.DrawSpeechBubbles\(\)/);
    expect(calls, "DrawSpeechBubbles should have exactly one caller").toEqual([
      "RogueGame.ts:" + (src.slice(0, src.indexOf("this.DrawSpeechBubbles();")).split("\n").length),
    ]);
  });

  it("is not an overlay, so a mouse move cannot wipe it", () => {
    // The reason for the separate collection. `ClearOverlays` runs on every mouse
    // move, so a bubble pushed onto `m_Overlays` would be destroyed the moment the
    // player moved the mouse — a feature that worked in a test and flickered out
    // in play.
    const src = readFileSync(join(SRC, "engine", "RogueGame.ts"), "utf-8");
    const field = src.slice(
      src.indexOf("m_SpeechBubbles: globalThis.Map"),
      src.indexOf("m_SpeechBubbles: globalThis.Map") + 400,
    );
    expect(field).not.toContain("Overlay");
    // Nothing in the speak or draw path clears the whole map, either.
    expect(
      src.slice(src.indexOf("SpeakOverhead(actor: Actor"), src.indexOf("ClearSpeechBubbles():")),
    ).not.toContain("ClearOverlays");
  });
});
/**
 * The bubble's box and the text in it, as the player sees them.
 *
 * Both properties below are visual, and both were wrong in ways nothing throws
 * about: a bubble the same colour as every other box on screen, and a bubble that
 * swells to twice its size the moment the map is zoomed in. Neither fails a test
 * that only checks a bubble was drawn, which is what every other test here does.
 */
describe("the bubble's appearance", () => {
  beforeEach(() => {
    resetOptions();
  });

  it("has its own colour, so it is not read as another popup", () => {
    const { game } = newFixture();

    // Distinct from the popups', which is the whole point: a bubble and a popup were
    // the same blue box at the same opacity, and the bubble is the one drawn *over*
    // the map. Green reads as a different kind of thing without needing a legend.
    expect(game.SPEECH_BUBBLE_FILLCOLOR).not.toBe(game.POPUP_FILLCOLOR);

    // Green rather than the popups' blue, asserted on the channels rather than by
    // naming a colour: the requirement is the hue moved, and which green is a
    // taste decision that should not fail a test.
    const bubble = game.SPEECH_BUBBLE_FILLCOLOR;
    const popup = game.POPUP_FILLCOLOR;
    expect(bubble.g).toBeGreaterThan(bubble.r);
    expect(bubble.g).toBeGreaterThan(bubble.b);
    expect(popup.b).toBeGreaterThan(popup.r);

    // And more transparent than the popups, because a bubble covers the actor it is
    // about and that actor is often what is being read while reading it.
    expect(bubble.a).toBeLessThan(popup.a);
    // Still opaque enough to read white text against.
    expect(bubble.a).toBeGreaterThanOrEqual(128);
  });

  it("passes its own colour down, rather than the popups'", () => {
    const { game, ui, map } = newFixture();
    const npc = npcAt(map, "speaker", new Point(30, 32));
    // `SpeakOverhead` is where the option is honoured, so `DrawSpeechBubbles` has
    // nothing to draw without it and the assertion below would pass on an empty
    // list if it only checked the list.
    setBubbles(true);
    game.SpeakOverhead(npc, "Look at my bubbles.");

    // A probe recording what the engine asked the UI to draw. `NullRogueUI` drops
    // every painting call, so the fill colour has to be caught at the call.
    const seen: (number | null)[] = [];
    const spy = Object.create(ui) as NullRogueUI;
    spy.UI_DrawSpeechBubble = (
      _text: string,
      _textColor: unknown,
      _borderColor: unknown,
      fillColor: { a: number },
    ): void => {
      seen.push(fillColor.a);
    };
    (game as unknown as { m_UI: unknown }).m_UI = spy;

    game.DrawSpeechBubbles();

    expect(seen.length).toBeGreaterThan(0);
    // The alpha the engine chose is the bubble's, not the popup's.
    expect(seen[0]).toBe(game.SPEECH_BUBBLE_FILLCOLOR.a);
    expect(seen[0]).not.toBe(game.POPUP_FILLCOLOR.a);
  });

  it("is sized in screen terms, so zooming in does not inflate it", () => {
    // The property, stated on the source: every *extent* is divided by the ambient
    // scale while every *position* is left alone. Asserted here because the bug it
    // fixes is invisible from the outside — a bubble drawn at the right place, the
    // right colour, covering twice the tile.
    const src = readFileSync(join(SRC, "ui", "CanvasUI.ts"), "utf-8");
    const start = src.indexOf("UI_DrawSpeechBubble(");
    const body = src.slice(start, src.indexOf("// ── Minimap", start));

    // The scale is read and inverted once, near the top...
    expect(body).toMatch(/const inv = 1 \/ scale;/);
    // ...the glyph is requested at the reduced size, so `measureText` reports scope
    // units and no measured value needs converting afterwards...
    expect(body).toContain("fontHudBoldSized(10 * inv)");
    // ...and the extents that place the box are divided to match.
    expect(body).toContain("maxTextWidth * inv");
    expect(body).toContain("this.BUBBLE_LINE_H * inv");

    // The positions are NOT divided. This is the half that is easy to get wrong: if
    // the anchor were divided too, the bubble would drift off its own tile.
    expect(body).not.toMatch(/anchorX \* inv|anchorY \* inv|anchorSize \* inv/);
  });
});
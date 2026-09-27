import { describe, it, expect, beforeAll } from "vitest";
import { RogueGame } from "@engine/RogueGame";
import { NullRogueUI } from "@ui/NullRogueUI";
import { NullMusicManager } from "@engine/audio/NullMusicManager";
import { SimRatio } from "@engine/GameOptions";
import { Session } from "@engine/Session";
import { SkillID } from "@gameplay/Skills";
import { Actor } from "@data/Actor";
import { Item } from "@data/Item";
import { ItemEntertainment } from "@engine/items/ItemMisc";
import { ItemTrap } from "@engine/items/ItemTrap";
import { ItemID } from "@gameplay/GameItems";
import { Models } from "@data/Models";

/**
 * `Item.OptimizeBeforeSaving`, which the C# calls across the whole graph before
 * serialising (`Session.Save` → `World` → `District` → `Map`/`Actor`/`Inventory`
 * → `Item`) and the port did not have at all.
 *
 * Its only two overrides drop references to dead actors, and the reachable
 * behaviour change is the one the C# bothers to spell out in a comment at
 * `ItemEntertainment.cs:53`: *"side effect: revived actors will forget about
 * boring items"*. Without the pass a save keeps dead actors in an entertainment
 * item's boredom list — the graph persists that list as a `refList` — so an
 * actor that died bored of a book and came back is still bored of it, forever,
 * and `isBoringFor` keeps answering true.
 *
 * The end-to-end test at the bottom is the one that matters. The unit tests
 * above it only prove the methods do what they say; this proves the defect was
 * reachable through `Session.save`, which is the only way a player could meet it.
 */

const SEED = 4242;
let game: RogueGame;

beforeAll(async () => {
  // Before constructing the game: `RogueGame`'s constructor builds `Rules` from
  // the session seed, so a seed applied later would only half-pin the run.
  Session.useSeed(SEED);
  game = new RogueGame(new NullRogueUI(), new NullMusicManager());
  await game.LoadData();
  const opts = RogueGame.options;
  opts.citySize = 1;
  opts.simulateDistricts = SimRatio.OFF;
  opts.isAnimDelayOn = false;
  opts.isAdvisorEnabled = false;
  game.session.gameMode = Session.get().gameMode;
  game.m_CharGen.isUndead = false;
  game.m_CharGen.isMale = true;
  game.m_CharGen.startingSkill = SkillID.AGILE;
  await game.StartNewGame();
}, 120_000);

/** A real entertainment item, from the loaded model table. */
function makeBook(): ItemEntertainment {
  return new ItemEntertainment(Models.items.get(ItemID.ENT_BOOK));
}

function makeTrap(): ItemTrap {
  return new ItemTrap(Models.items.get(ItemID.TRAP_BEAR_TRAP));
}

/** The trap's private owner, so the test pins the field and not the getter. */
function ownerField(trap: ItemTrap): Actor | null {
  return (trap as unknown as { _owner: Actor | null })._owner;
}

/**
 * A detached actor. Deliberately *not* placed on the map: `optimizeBeforeSaving`
 * only ever reads `isDead` on the actors an item refers to, so putting them in
 * the world would add a placement collision per test for no extra coverage. The
 * items under test are what has to be reachable, and those are placed explicitly.
 */
function makeActor(name: string, isDead = false): Actor {
  const player = game.m_Player!;
  const actor = new Actor(player.model, player.faction, name);
  actor.isDead = isDead;
  return actor;
}

describe("ItemEntertainment.optimizeBeforeSaving", () => {
  it("drops a dead actor and keeps a living one", () => {
    const book = makeBook();
    const living = makeActor("BoredLiving");
    const dead = makeActor("BoredDead", true);

    book.addBoringFor(living);
    book.addBoringFor(dead);
    expect(book.isBoringFor(living)).toBe(true);
    expect(book.isBoringFor(dead)).toBe(true);

    book.optimizeBeforeSaving();

    expect(book.isBoringFor(living), "a living actor must stay bored of it").toBe(true);
    expect(book.isBoringFor(dead), "the dead actor was not dropped").toBe(false);
  });

  it("is a no-op for an item nobody is bored of", () => {
    // The C# guards on `m_BoringFor != null`; the port's field is null until the
    // first `addBoringFor`, so the null case is the common one and must not throw.
    const book = makeBook();
    expect(() => book.optimizeBeforeSaving()).not.toThrow();
    expect(book.isBoringFor(game.m_Player!)).toBe(false);
  });

  it("drains the list completely when every actor in it is dead", () => {
    // The loop removes in place and only advances on a survivor, so an all-dead
    // list must be emptied rather than leaving its first entry behind — that is
    // the off-by-one a `filter` would have avoided and a `while` would not.
    const book = makeBook();
    const dead: Actor[] = [];
    for (const name of ["D1", "D2", "D3"]) {
      const a = makeActor(name, true);
      dead.push(a);
      book.addBoringFor(a);
    }
    book.optimizeBeforeSaving();
    for (const a of dead) expect(book.isBoringFor(a)).toBe(false);
  });
});

describe("ItemTrap.optimizeBeforeSaving", () => {
  it("nulls a dead owner and keeps a living one", () => {
    // The `owner` getter already self-cleans, so this is belt-and-braces in the
    // C# too. The test pins the *field*, because the getter is exactly what hid
    // the omission: the observable behaviour was already right and only the
    // serialised payload differed.
    const trap = makeTrap();
    const living = makeActor("TrapOwner");
    const dead = makeActor("DeadOwner", true);

    trap.activate(dead);
    expect(ownerField(trap)).not.toBeNull();
    trap.optimizeBeforeSaving();
    expect(ownerField(trap)).toBeNull();

    trap.activate(living);
    trap.optimizeBeforeSaving();
    expect(ownerField(trap)).toBe(living);
  });
});

describe("the base Item.optimizeBeforeSaving", () => {
  it("exists, and does nothing", () => {
    // C# `public virtual void OptimizeBeforeSaving() { }` — the base is empty and
    // every override calls it first, so if this throws, every override does.
    const item = new Item(Models.items.get(ItemID.ENT_BOOK));
    expect(() => item.optimizeBeforeSaving()).not.toThrow();
  });
});

describe("Session.save runs the pass over the whole world", () => {
  it("a revived actor forgets a boring item — the C#'s stated side effect", () => {
    // The end-to-end version. Everything above tests a method; this is the bug as
    // a player would meet it, and the only reason it is not a no-op is that
    // `Session.save` calls the traversal at all.
    const book = makeBook();
    const revived = makeActor("RevivedBore", true);
    book.addBoringFor(revived);
    game.m_Player!.location.map!.getOrCreateItemsAt(game.m_Player!.location.position)
      .addAll(book);

    expect(book.isBoringFor(revived), "setup: still bored before the save").toBe(true);

    // The C# runs the pass as the first statement of `Session.Save`
    // (`src/Engine/Session.cs:589`), so saving alone is what clears it.
    Session.save(game.session);

    expect(
      book.isBoringFor(revived),
      "Session.save did not run OptimizeBeforeSaving over the world",
    ).toBe(false);
  });

  it("reaches an item in an actor's own inventory", () => {
    // Guards against a traversal that only walks the ground and quietly misses
    // inventories, which is how a whole-graph pass goes wrong: it works on the
    // one container the test happened to use.
    const book = makeBook();
    const dead = makeActor("DeadInInventory", true);
    book.addBoringFor(dead);
    game.m_Player!.inventory!.addAll(book);

    Session.optimizeBeforeSaving(game.session);
    expect(book.isBoringFor(dead)).toBe(false);
  });

  it("leaves a living actor's boredom intact across a save", () => {
    // The other direction, and the one a careless `clear()` would fail. Optimising
    // before saving must not become "forget everyone", or the item is worthless.
    const book = makeBook();
    const living = makeActor("StillBored");
    book.addBoringFor(living);
    game.m_Player!.inventory!.addAll(book);

    Session.save(game.session);
    expect(book.isBoringFor(living)).toBe(true);
  });

  it("is safe on a session with no world", () => {
    // A traversal that dereferences `world` unguarded would turn a refused load
    // into a crash, which is the §1.1i bug 64 shape all over again.
    expect(game.session.world).not.toBeNull();
    const stub = { world: null } as unknown as Session;
    expect(() => Session.optimizeBeforeSaving(stub)).not.toThrow();
  });
});

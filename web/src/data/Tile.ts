import { Models } from "./Models";
import type { TileModel } from "./TileModel";

export const enum TileFlags {
  NONE = 0,
  IS_INSIDE = 1 << 0,
  IS_IN_VIEW = 1 << 1,
  IS_VISITED = 1 << 2,
  /**
   * A tile fire is burning here. Still Alive, Release 5-2.
   *
   * A flag rather than a set of decorations because the spread loop asks the
   * question hundreds of times per turn and decorates as a side effect of the
   * answer being yes. `EFFECT_ONFIRE` is added and removed alongside the flag, so
   * the two must always be changed together -- `setTileOnFire` and
   * `extinguishOnFireTile` are the only places that do.
   */
  IS_ON_FIRE = 1 << 3,
  /**
   * This tile has already burnt, so there is no flammable material left.
   * Still Alive, Release 6-1.
   *
   * Separate from `IS_ON_FIRE` and it matters: a burnt tile must not re-ignite by
   * spreading, or a single fire would creep across a whole building one layer at
   * a time and never stop.
   */
  IS_SCORCHED = 1 << 4,
  /**
   * World-decay phase, low bit (phase 1). Still Alive, Release 7-6.
   *
   * The three phases are 0 = none, 1, 2, 3, and the last two bits of the flags
   * word hold them as a two-bit number: bit 0 alone is phase 1, bit 1 alone is
   * phase 2, both is phase 3. Two bits rather than a bit each, because the value
   * is *ordered* — the sweep asks "is this tile already at phase 2 or past it?",
   * which a set of independent phase flags cannot answer.
   *
   * Read and written through `Tile.decayPhase` and nothing else; the two flags are
   * an encoding, not an API.
   */
  DECAY_PHASE_1 = 1 << 5,
  /** World-decay phase, high bit (phase 2). See `DECAY_PHASE_1`. */
  DECAY_PHASE_2 = 1 << 6,
}

export class Tile {
  private modelId: number;
  private flags: number = TileFlags.NONE;
  private decorations: string[] | null = null;

  constructor(model: TileModel) {
    this.modelId = model.id;
  }

  get model(): TileModel {
    return Models.tiles.get(this.modelId);
  }

  set model(value: TileModel) {
    this.modelId = value.id;
  }

  get isInside(): boolean {
    return (this.flags & TileFlags.IS_INSIDE) !== 0;
  }

  set isInside(value: boolean) {
    if (value) this.flags |= TileFlags.IS_INSIDE;
    else this.flags &= ~TileFlags.IS_INSIDE;
  }

  get isOnFire(): boolean {
    return (this.flags & TileFlags.IS_ON_FIRE) !== 0;
  }

  set isOnFire(value: boolean) {
    if (value) this.flags |= TileFlags.IS_ON_FIRE;
    else this.flags &= ~TileFlags.IS_ON_FIRE;
  }

  get isScorched(): boolean {
    return (this.flags & TileFlags.IS_SCORCHED) !== 0;
  }

  set isScorched(value: boolean) {
    if (value) this.flags |= TileFlags.IS_SCORCHED;
    else this.flags &= ~TileFlags.IS_SCORCHED;
  }

  /**
   * Burn this tile out: no flammable material left.
   *
   * Kept as a method rather than a bare `isScorched = true` so the flag and its
   * meaning stay together.
   *
   * **This is only the flag.** The scorch *decoration* is added by
   * `RogueGame.scorchBurntTile`, which is the C#'s method of the same name and
   * pairs the two deliberately: the flag means "no fuel left to burn", the drawing
   * is the temporary evidence that a fire was here, and `Map.isInflammableTile`
   * reads the flag while only the player ever sees the drawing. Calling this
   * directly scorches a tile with nothing to show for it -- which is what the port
   * did for its whole life before the drawing was wired, and why the damage tiers
   * had nowhere to go.
   */
  scorchTile(): void {
    this.isScorched = true;
  }

  /**
   * Which decay decoration level has been applied here. Still Alive, Release 7-6,
   * C# `Tile.cs:60-68` (`m_DecayPhase` / `DecayPhase`).
   *
   * 0 = none, 1 = light, 2 = moderate, 3 = heavy, and it is a *high-water mark*:
   * the decay pass skips any tile already at or past the phase it is about to
   * apply (`RogueGame.cs:9280`), so it only ever goes up.
   *
   * Carried rather than derived from the decoration list, because the list is
   * rewritten on every phase — the previous phase's drawing is removed before the
   * new one goes on (`RogueGame.cs:9336-9341`) — and can be cleared outright,
   * whereas the phase itself is only ever assigned the phase being applied
   * (`RogueGame.cs:9345`). The two answer different questions and neither is a
   * function of the other.
   *
   * **Two bits of the flags word, not a fourth field** — a deliberate divergence
   * from the C#, which has an `int` of its own. The reasons are both about the
   * save format. The tile grid is serialised as parallel dense arrays and the
   * flags word is written *whole*, once per tile, into one of them
   * (`specs.ts`, `tilesGrid`); a fourth per-tile number would mean a fourth array
   * over up to 10 000 tiles, or a format change, to carry four states that fit in
   * the word already being written. As bits, the phase rides along inside a value
   * the codec emits regardless, at no cost and with no format change — and an
   * older save that knows nothing about decay decodes as phase 0, which is the
   * correct meaning for a world that has not decayed yet.
   *
   * The `tilesGrid` codec also asserts that a `Tile` has exactly `modelId`,
   * `flags` and `decorations`, so a new own field would have to be registered
   * there before anything could save a map at all. That is worth knowing before
   * adding the next one to this class.
   */
  get decayPhase(): number {
    const low = (this.flags & TileFlags.DECAY_PHASE_1) !== 0 ? 1 : 0;
    const high = (this.flags & TileFlags.DECAY_PHASE_2) !== 0 ? 2 : 0;
    return low | high;
  }

  set decayPhase(value: number) {
    // Clamped to the four states the bits can hold rather than truncated, because
    // truncating 4 to `4 & 3` reads back as 0 and the sweep would then re-decay the
    // tile from nothing, forever. The C#'s three phases mean this cannot happen in
    // practice; the clamp is here so a future fourth phase is a visible clamp
    // rather than a silent reset.
    const phase = value < 0 ? 0 : value > 3 ? 3 : value;
    let f = this.flags & ~(TileFlags.DECAY_PHASE_1 | TileFlags.DECAY_PHASE_2);
    if ((phase & 1) !== 0) f |= TileFlags.DECAY_PHASE_1;
    if ((phase & 2) !== 0) f |= TileFlags.DECAY_PHASE_2;
    this.flags = f;
  }

  get isInView(): boolean {
    return (this.flags & TileFlags.IS_IN_VIEW) !== 0;
  }

  set isInView(value: boolean) {
    if (value) this.flags |= TileFlags.IS_IN_VIEW;
    else this.flags &= ~TileFlags.IS_IN_VIEW;
  }

  get isVisited(): boolean {
    return (this.flags & TileFlags.IS_VISITED) !== 0;
  }

  set isVisited(value: boolean) {
    if (value) this.flags |= TileFlags.IS_VISITED;
    else this.flags &= ~TileFlags.IS_VISITED;
  }

  get hasDecorations(): boolean {
    return this.decorations !== null && this.decorations.length > 0;
  }

  get getDecorations(): readonly string[] | null {
    return this.decorations;
  }

  addDecoration(imageId: string): void {
    if (!this.decorations) {
      this.decorations = [];
    }
    if (!this.decorations.includes(imageId)) {
      this.decorations.push(imageId);
    }
  }

  /**
   * Add a decoration *at* a position in the list. Still Alive, Release 7-6, C#
   * `InsertDecoration` (`Tile.cs:118-125`).
   *
   * **Why this exists at all, when `addDecoration` appends.** Decorations are
   * drawn in list order, so position 0 is the *bottom* of the pile. World decay
   * has to go there: a tile that has been rained on for a week should show its
   * cracks and grime with the blood splatters and the fire scorch drawn *over*
   * the top, and an append puts the decay drawing last, which is on top and
   * covers both. The C# says so on the method — "Priority for position 0 should
   * be given to world decay decorations" — and again at the call site, where it
   * inserts at 0 and explains that "decorations are drawn based on their position
   * in the tile's index of decorations. first one in is the first one drawn".
   *
   * The dedupe guard is `addDecoration`'s, unchanged, and that is the point: the
   * C# returns early on an id that is already there so that a phase re-run does
   * not accumulate duplicates, and the same has to hold here or a tile that decays
   * twice would gain a second copy of the same drawing. Position is therefore
   * ignored for an id that is already present, exactly as in the original.
   *
   * One difference from `List.Insert`, and it is deliberate: the C# throws
   * `ArgumentOutOfRangeException` for a position outside `[0, Count]`, whereas
   * `Array.splice` clamps. The only caller in the reference passes 0, so the
   * stricter behaviour would buy nothing and a throw in a world-decay sweep over
   * every tile in a district is a bad trade.
   *
   * **Not every decay decoration goes through here**, and that is the reference's
   * own asymmetry rather than an oversight to tidy up: an *interior* wall takes
   * the `addDecoration` arm and lands on top of the pile
   * (`RogueGame.cs:9346-9353`), because it has one generic drawing for the whole
   * building rather than a per-model one. Copying that split faithfully means
   * blood on an indoor wall draws under its decay grime, which is what the C#
   * does.
   */
  insertDecoration(imageId: string, position: number): void {
    if (!this.decorations) {
      this.decorations = [];
    }
    if (this.decorations.includes(imageId)) return;
    this.decorations.splice(position, 0, imageId);
  }

  hasDecoration(imageId: string): boolean {
    if (!this.decorations) return false;
    return this.decorations.includes(imageId);
  }

  removeDecoration(imageId: string): void {
    if (!this.decorations) return;
    const idx = this.decorations.indexOf(imageId);
    if (idx !== -1) {
      this.decorations.splice(idx, 1);
      if (this.decorations.length === 0) {
        this.decorations = null;
      }
    }
  }

  removeAllDecorations(): void {
    this.decorations = null;
  }
}

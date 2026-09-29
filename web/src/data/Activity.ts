export enum Activity {
  IDLE = 0,
  CHASING = 1,
  FIGHTING = 2,
  TRACKING = 3,
  FLEEING = 4,
  FOLLOWING = 5,
  SLEEPING = 6,
  FOLLOWING_ORDER = 7,
  FLEEING_FROM_EXPLOSIVE = 8,
  /**
   * Still Alive, Release 7-6 (`Data/Activity.cs:141`), appended after `RESTING`
   * in the C# — which is not where it is here, and the difference does not
   * matter: the C# never writes an `Activity` to a save at all (`Data/Actor.cs`
   * has no `AddValue("m_Activity")`), so the numbering is a per-run label rather
   * than a stored id.
   *
   * The port's graph writer *does* carry the field, being an own field of `Actor`,
   * so append-only is the rule here too: the values 0-8 are already in saves and
   * `FISHING = 9` is the only one that can be new. Inserting it after `RESTING`
   * would renumber `FLEEING_FROM_EXPLOSIVE` and an old save would come back
   * fleeing from a non-explosive.
   *
   * Nothing sets this yet. `CivilianAI`'s fishing arm (`CivilianAI.cs:754`) is
   * the only writer in the C# and it is the part of `Feature.Fishing` this port
   * has not landed; the two switches that read an activity are nevertheless
   * updated, because both `throw` on a value they do not know and an enum member
   * nothing can reach is still a landmine.
   */
  FISHING = 9,
}

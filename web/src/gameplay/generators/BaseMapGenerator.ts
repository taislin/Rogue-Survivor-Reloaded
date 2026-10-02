/**
 * BaseMapGenerator.
 * Ported from src/Gameplay/Generators/BaseMapGenerator.cs
 *
 * Shared helpers for all map generators: actor dressing/naming/skills,
 * common map objects, common items and small map tasks.
 */

import type { Actor } from '@data/Actor';
import { Doll, DollPart } from '@data/Doll';
import { Item } from '@data/Item';
import { Models } from '@data/Models';
import { Map as GameMap } from '@data/Map';
import { MapObject, MapObjectBreak, MapObjectFire } from '@data/MapObject';
import { Zone } from '@data/Zone';
import { DiceRoller } from '@engine/DiceRoller';
import { Rect } from '@engine/Rect';
import { Rules } from '@engine/Rules';
import { Session } from '@engine/Session';
import { WorldTime } from '@engine/WorldTime';
import { MapGenerator } from '@engine/MapGenerator';
import { ItemAmmo, ItemMeleeWeapon, ItemRangedWeapon } from '@engine/items/ItemWeapon';
import { ItemBodyArmor } from '@engine/items/ItemBodyArmor';
import { ItemBarricadeMaterial, ItemEntertainment, ItemSprayPaint, ItemSprayPaintModel, ItemSprayScent } from '@engine/items/ItemMisc';
import { ItemFood, ItemFoodModel } from '@engine/items/ItemFood';
import { ItemGrenade, ItemExplosive } from '@engine/items/ItemExplosive';
import { ItemLight } from '@engine/items/ItemLight';
import { ItemBackpack } from '@engine/items/ItemBackpack';
import { ItemMedicine } from '@engine/items/ItemMedicine';
import { ItemTracker } from '@engine/items/ItemTracker';
import { ItemTrap } from '@engine/items/ItemTrap';
import {
  Barrel,
  Board,
  Campfire,
  Car,
  DoorWindow,
  Fortification,
  PowerGenerator,
} from '@engine/mapobjects/MapObjects';
import { Feature, hasFeature } from '@engine/FeatureFlags';
import { GameImages } from '@gameplay/GameImages';
import { GangID } from '@gameplay/GameGangs';
import { ItemID } from '@gameplay/GameItems';
import { SkillID, Skills } from '@gameplay/Skills';
import { decorateOutsideWalls as decorateOutsideWallsOn } from './TownBuilding';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Game = any;

export abstract class BaseMapGenerator extends MapGenerator {
  protected readonly m_Game: Game;

  constructor(game: Game) {
    super(game.rules);
    this.m_Game = game;
  }

  // ── Actor dressing helpers ────────────────────────────────────────────────

  private static readonly MALE_SKINS = [
    GameImages.MALE_SKIN1,
    GameImages.MALE_SKIN2,
    GameImages.MALE_SKIN3,
    GameImages.MALE_SKIN4,
    GameImages.MALE_SKIN5,
  ];
  private static readonly MALE_HEADS = [
    GameImages.MALE_HAIR1,
    GameImages.MALE_HAIR2,
    GameImages.MALE_HAIR3,
    GameImages.MALE_HAIR4,
    GameImages.MALE_HAIR5,
    GameImages.MALE_HAIR6,
    GameImages.MALE_HAIR7,
    GameImages.MALE_HAIR8,
  ];
  private static readonly MALE_TORSOS = [
    GameImages.MALE_SHIRT1,
    GameImages.MALE_SHIRT2,
    GameImages.MALE_SHIRT3,
    GameImages.MALE_SHIRT4,
    GameImages.MALE_SHIRT5,
  ];
  private static readonly MALE_LEGS = [
    GameImages.MALE_PANTS1,
    GameImages.MALE_PANTS2,
    GameImages.MALE_PANTS3,
    GameImages.MALE_PANTS4,
    GameImages.MALE_PANTS5,
  ];
  private static readonly MALE_SHOES = [GameImages.MALE_SHOES1, GameImages.MALE_SHOES2, GameImages.MALE_SHOES3];
  private static readonly MALE_EYES = [
    GameImages.MALE_EYES1,
    GameImages.MALE_EYES2,
    GameImages.MALE_EYES3,
    GameImages.MALE_EYES4,
    GameImages.MALE_EYES5,
    GameImages.MALE_EYES6,
  ];

  private static readonly FEMALE_SKINS = [
    GameImages.FEMALE_SKIN1,
    GameImages.FEMALE_SKIN2,
    GameImages.FEMALE_SKIN3,
    GameImages.FEMALE_SKIN4,
    GameImages.FEMALE_SKIN5,
  ];
  private static readonly FEMALE_HEADS = [
    GameImages.FEMALE_HAIR1,
    GameImages.FEMALE_HAIR2,
    GameImages.FEMALE_HAIR3,
    GameImages.FEMALE_HAIR4,
    GameImages.FEMALE_HAIR5,
    GameImages.FEMALE_HAIR6,
    GameImages.FEMALE_HAIR7,
  ];
  private static readonly FEMALE_TORSOS = [
    GameImages.FEMALE_SHIRT1,
    GameImages.FEMALE_SHIRT2,
    GameImages.FEMALE_SHIRT3,
    GameImages.FEMALE_SHIRT4,
  ];
  private static readonly FEMALE_LEGS = [
    GameImages.FEMALE_PANTS1,
    GameImages.FEMALE_PANTS2,
    GameImages.FEMALE_PANTS3,
    GameImages.FEMALE_PANTS4,
    GameImages.FEMALE_PANTS5,
  ];
  private static readonly FEMALE_SHOES = [
    GameImages.FEMALE_SHOES1,
    GameImages.FEMALE_SHOES2,
    GameImages.FEMALE_SHOES3,
  ];
  private static readonly FEMALE_EYES = [
    GameImages.FEMALE_EYES1,
    GameImages.FEMALE_EYES2,
    GameImages.FEMALE_EYES3,
    GameImages.FEMALE_EYES4,
    GameImages.FEMALE_EYES5,
    GameImages.FEMALE_EYES6,
  ];

  /**
 * The six outfit layers available to a body, as the choices on offer.
 *
 * The character customiser offers exactly the set `dressCivilian` would have
 * rolled from, so a player cannot pick a look the generator cannot produce.
 *
 * **Copies, not the arrays themselves.** These are the catalogue every random
 * civilian in the game is dressed from, and a caller that sorted or spliced one
 * would change which sprite a survivor turns up in — a menu reaching into
 * generator state is exactly the coupling worth closing with a copy.
 */
static civilianOutfitChoices(isMale: boolean): Readonly<
  Record<"eyes" | "skin" | "head" | "torso" | "legs" | "shoes", readonly string[]>
> {
  return {
    eyes: [...(isMale ? BaseMapGenerator.MALE_EYES : BaseMapGenerator.FEMALE_EYES)],
    skin: [...(isMale ? BaseMapGenerator.MALE_SKINS : BaseMapGenerator.FEMALE_SKINS)],
    head: [...(isMale ? BaseMapGenerator.MALE_HEADS : BaseMapGenerator.FEMALE_HEADS)],
    torso: [...(isMale ? BaseMapGenerator.MALE_TORSOS : BaseMapGenerator.FEMALE_TORSOS)],
    legs: [...(isMale ? BaseMapGenerator.MALE_LEGS : BaseMapGenerator.FEMALE_LEGS)],
    shoes: [...(isMale ? BaseMapGenerator.MALE_SHOES : BaseMapGenerator.FEMALE_SHOES)],
  };
}

private static readonly BIKER_HEADS = [GameImages.BIKER_HAIR1, GameImages.BIKER_HAIR2, GameImages.BIKER_HAIR3];
  private static readonly BIKER_LEGS = [GameImages.BIKER_PANTS];
  private static readonly BIKER_SHOES = [GameImages.BIKER_SHOES];

  private static readonly CHARGUARD_HEADS = [GameImages.CHARGUARD_HAIR];
  private static readonly CHARGUARD_LEGS = [GameImages.CHARGUARD_PANTS];

  // Still Alive, Release 8-1 (`BaseMapGenerator.cs:47-49`). Single-element arrays
  // like the CHARGUARD ones above, but they exist for a different reason: the C#'s
  // `DressCHARScientist` does not read them (it names `GameImages.CHARSCIENTIST_*`
  // directly, `:175-177`). They are kept here anyway so the two files describe the
  // same set of decorations, and so `dressCHARScientist` has one spelling per part
  // rather than reaching past its own file's constants.
  private static readonly CHARSCIENTIST_HEAD = [GameImages.CHARSCIENTIST_HEAD];
  private static readonly CHARSCIENTIST_TORSO = [GameImages.CHARSCIENTIST_SHIRT];
  private static readonly CHARSCIENTIST_LEGS = [GameImages.CHARSCIENTIST_PANTS];

  private static readonly DOG_SKINS = [GameImages.DOG_SKIN1, GameImages.DOG_SKIN2, GameImages.DOG_SKIN3];

  dressCivilian(
    roller: DiceRoller,
    actor: Actor,
    eyes?: string[],
    skins?: string[],
    heads?: string[],
    torsos?: string[],
    legs?: string[],
    shoes?: string[]
  ): void {
    if (!eyes || !skins || !heads || !torsos || !legs || !shoes) {
      const male = actor.model.dollBody.isMale;
      BaseMapGenerator.dressActorDoll(
        roller,
        actor.doll,
        male ? BaseMapGenerator.MALE_EYES : BaseMapGenerator.FEMALE_EYES,
        male ? BaseMapGenerator.MALE_SKINS : BaseMapGenerator.FEMALE_SKINS,
        male ? BaseMapGenerator.MALE_HEADS : BaseMapGenerator.FEMALE_HEADS,
        male ? BaseMapGenerator.MALE_TORSOS : BaseMapGenerator.FEMALE_TORSOS,
        male ? BaseMapGenerator.MALE_LEGS : BaseMapGenerator.FEMALE_LEGS,
        male ? BaseMapGenerator.MALE_SHOES : BaseMapGenerator.FEMALE_SHOES
      );
      return;
    }
    BaseMapGenerator.dressActorDoll(roller, actor.doll, eyes, skins, heads, torsos, legs, shoes);
  }

  /**
   * The six layers, rolled from the given candidates and written to the doll.
   *
   * **Static, takes a `Doll`, and the instance methods above delegate to it**,
   * because none of this needs a `Game` — and the constructor demands one. That is
   * what lets the character customiser dress something to draw without building a
   * whole game, and it keeps the preview from becoming a second, drifting copy of
   * the dressing code.
   */
  static dressActorDoll(
    roller: DiceRoller,
    doll: Doll,
    eyes: string[],
    skins: string[],
    heads: string[],
    torsos: string[],
    legs: string[],
    shoes: string[],
  ): void {
    doll.removeAllDecorations();
    doll.addDecoration(DollPart.EYES, eyes[roller.roll(0, eyes.length)]);
    doll.addDecoration(DollPart.SKIN, skins[roller.roll(0, skins.length)]);
    doll.addDecoration(DollPart.HEAD, heads[roller.roll(0, heads.length)]);
    doll.addDecoration(DollPart.TORSO, torsos[roller.roll(0, torsos.length)]);
    doll.addDecoration(DollPart.LEGS, legs[roller.roll(0, legs.length)]);
    doll.addDecoration(DollPart.FEET, shoes[roller.roll(0, shoes.length)]);
  }

  skinNakedHuman(roller: DiceRoller, actor: Actor, eyes?: string[], skins?: string[], heads?: string[]): void {
    if (!eyes || !skins || !heads) {
      const male = actor.model.dollBody.isMale;
      BaseMapGenerator.skinActorDoll(
        roller,
        actor.doll,
        male ? BaseMapGenerator.MALE_EYES : BaseMapGenerator.FEMALE_EYES,
        male ? BaseMapGenerator.MALE_SKINS : BaseMapGenerator.FEMALE_SKINS,
        male ? BaseMapGenerator.MALE_HEADS : BaseMapGenerator.FEMALE_HEADS
      );
      return;
    }
    BaseMapGenerator.skinActorDoll(roller, actor.doll, eyes, skins, heads);
  }

  /** `skinNakedHuman`'s body, static for the reason `dressActorDoll` is. */
  static skinActorDoll(
    roller: DiceRoller,
    doll: Doll,
    eyes: string[],
    skins: string[],
    heads: string[],
  ): void {
    doll.removeAllDecorations();
    doll.addDecoration(DollPart.EYES, eyes[roller.roll(0, eyes.length)]);
    doll.addDecoration(DollPart.SKIN, skins[roller.roll(0, skins.length)]);
    doll.addDecoration(DollPart.HEAD, heads[roller.roll(0, heads.length)]);
  }

  skinDog(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.DOG_SKINS[roller.roll(0, BaseMapGenerator.DOG_SKINS.length)]);
  }

  dressArmy(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.HEAD, GameImages.ARMY_HELMET);
    actor.doll.addDecoration(DollPart.TORSO, GameImages.ARMY_SHIRT);
    actor.doll.addDecoration(DollPart.LEGS, GameImages.ARMY_PANTS);
    actor.doll.addDecoration(DollPart.FEET, GameImages.ARMY_SHOES);
  }

  dressPolice(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, BaseMapGenerator.MALE_EYES[roller.roll(0, BaseMapGenerator.MALE_EYES.length)]);
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.HEAD, BaseMapGenerator.MALE_HEADS[roller.roll(0, BaseMapGenerator.MALE_HEADS.length)]);
    actor.doll.addDecoration(DollPart.HEAD, GameImages.POLICE_HAT);
    actor.doll.addDecoration(DollPart.TORSO, GameImages.POLICE_UNIFORM);
    actor.doll.addDecoration(DollPart.LEGS, GameImages.POLICE_PANTS);
    actor.doll.addDecoration(DollPart.FEET, GameImages.POLICE_SHOES);
  }

  dressBiker(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, BaseMapGenerator.MALE_EYES[roller.roll(0, BaseMapGenerator.MALE_EYES.length)]);
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.HEAD, BaseMapGenerator.BIKER_HEADS[roller.roll(0, BaseMapGenerator.BIKER_HEADS.length)]);
    actor.doll.addDecoration(DollPart.LEGS, BaseMapGenerator.BIKER_LEGS[roller.roll(0, BaseMapGenerator.BIKER_LEGS.length)]);
    actor.doll.addDecoration(DollPart.FEET, BaseMapGenerator.BIKER_SHOES[roller.roll(0, BaseMapGenerator.BIKER_SHOES.length)]);
  }

  dressGangsta(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, BaseMapGenerator.MALE_EYES[roller.roll(0, BaseMapGenerator.MALE_EYES.length)]);
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.TORSO, GameImages.GANGSTA_SHIRT);
    actor.doll.addDecoration(DollPart.HEAD, BaseMapGenerator.MALE_HEADS[roller.roll(0, BaseMapGenerator.MALE_HEADS.length)]);
    actor.doll.addDecoration(DollPart.HEAD, GameImages.GANGSTA_HAT);
    actor.doll.addDecoration(DollPart.LEGS, GameImages.GANGSTA_PANTS);
    actor.doll.addDecoration(DollPart.FEET, BaseMapGenerator.MALE_SHOES[roller.roll(0, BaseMapGenerator.MALE_SHOES.length)]);
  }

  dressCHARGuard(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, BaseMapGenerator.MALE_EYES[roller.roll(0, BaseMapGenerator.MALE_EYES.length)]);
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.HEAD, BaseMapGenerator.CHARGUARD_HEADS[roller.roll(0, BaseMapGenerator.CHARGUARD_HEADS.length)]);
    actor.doll.addDecoration(DollPart.LEGS, BaseMapGenerator.CHARGUARD_LEGS[roller.roll(0, BaseMapGenerator.CHARGUARD_LEGS.length)]);
  }

  dressCHARScientist(roller: DiceRoller, actor: Actor): void {
    // Still Alive, Release 8-1 (`BaseMapGenerator.cs:171-178`).
    //
    // No EYES decoration, unlike `dressCHARGuard` above: the C# adds SKIN, TORSO,
    // HEAD and LEGS only, so the doll is left without eyes. Ported as written.
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.TORSO, BaseMapGenerator.CHARSCIENTIST_TORSO[0]);
    actor.doll.addDecoration(DollPart.HEAD, BaseMapGenerator.CHARSCIENTIST_HEAD[0]);
    actor.doll.addDecoration(DollPart.LEGS, BaseMapGenerator.CHARSCIENTIST_LEGS[0]);
  }

  dressBlackOps(roller: DiceRoller, actor: Actor): void {
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, BaseMapGenerator.MALE_EYES[roller.roll(0, BaseMapGenerator.MALE_EYES.length)]);
    actor.doll.addDecoration(DollPart.SKIN, BaseMapGenerator.MALE_SKINS[roller.roll(0, BaseMapGenerator.MALE_SKINS.length)]);
    actor.doll.addDecoration(DollPart.TORSO, GameImages.BLACKOP_SUIT);
  }

  randomSkin(roller: DiceRoller, isMale: boolean): string {
    const skins = isMale ? BaseMapGenerator.MALE_SKINS : BaseMapGenerator.FEMALE_SKINS;
    return skins[roller.roll(0, skins.length)];
  }

  // ── Actor naming helpers ──────────────────────────────────────────────────

  // alpha10.1 added new male first names
  private static readonly MALE_FIRST_NAMES = [
    'Aaron', 'Adam', 'Adrian', 'Alan', 'Albert', 'Alberto', 'Alex', 'Alexander', 'Alfred', 'Alfredo', 'Allan', 'Allen', 'Alvin', 'Andre', 'Andrew', 'Andy', 'Angel', 'Anton', 'Antonio', 'Anthony', 'Armando', 'Arnold', 'Arthur', 'Ashley', 'Axel',
    'Barry', 'Ben', 'Benjamin', 'Bernard', 'Bill', 'Billy', 'Bob', 'Bobby', 'Brad', 'Brandon', 'Bradley', 'Brent', 'Brett', 'Brian', 'Bryan', 'Bruce', 'Byron',
    'Caine', 'Calvin', 'Carl', 'Carlos', 'Carlton', 'Casey', 'Cecil', 'Chad', 'Charles', 'Charlie', 'Chester', 'Chris', 'Christian', 'Christopher', 'Clarence', 'Clark', 'Claude', 'Clayton', 'Clifford', 'Clifton', 'Clinton', 'Clyde', 'Cody', 'Corey', 'Cory', 'Craig', 'Cris', 'Cristobal', 'Curtis',
    'Dan', 'Daniel', 'Danny', 'Dale', 'Darrell', 'Darren', 'Darryl', 'Dave', 'David', 'Dean', 'Dennis', 'Derek', 'Derrick', 'Dirk', 'Don', 'Donald', 'Donovan', 'Doug', 'Douglas', 'Duane', 'Dustin', 'Dwayne', 'Dwight',
    'Earl', 'Ed', 'Eddie', 'Eddy', 'Edgar', 'Eduardo', 'Edward', 'Edwin', 'Elias', 'Elie', 'Elmer', 'Elton', 'Enrique', 'Eric', 'Erik', 'Ernest', 'Eugene', 'Everett',
    'Felix', 'Fernando', 'Floyd', 'Francis', 'Francisco', 'Frank', 'Franklin', 'Fred', 'Frederick', 'Freddie',
    'Gabriel', 'Gary', 'Gene', 'George', 'Georges', 'Gerald', 'Gilbert', 'Glenn', 'Gordon', 'Greg', 'Gregory', 'Guy',
    'Hank', 'Harold', 'Harvey', 'Harry', 'Hector', 'Henry', 'Herbert', 'Herman', 'Howard', 'Hubert', 'Hugh', 'Hughie',
    'Ian', 'Indy', 'Isaac', 'Ivan',
    'Jack', 'Jacob', 'Jaime', 'Jake', 'James', 'Jamie', 'Jared', 'Jarvis', 'Jason', 'Javier', 'Jay', 'Jeff', 'Jeffrey', 'Jeremy', 'Jerome', 'Jerry', 'Jesse', 'Jessie', 'Jesus', 'Jim', 'Jimmie', 'Jimmy', 'Joe', 'Joel', 'John', 'Johnnie', 'Johnny', 'Jon', 'Jonas', 'Jonathan', 'Jordan', 'Jorge', 'Jose', 'Joseph', 'Joshua', 'Juan', 'Julian', 'Julio', 'Justin',
    'Karl', 'Keith', 'Kelly', 'Ken', 'Kenneth', 'Kent', 'Kevin', 'Kirk', 'Kurt', 'Kyle',
    'Lance', 'Larry', 'Lars', 'Lawrence', 'Lee', 'Lennie', 'Leo', 'Leon', 'Leonard', 'Leroy', 'Leslie', 'Lester', 'Lewis', 'Lloyd', 'Lonnie', 'Louis', 'Luis',
    'Manuel', 'Marc', 'Marcus', 'Mario', 'Mark', 'Marshall', 'Martin', 'Marvin', 'Maurice', 'Matthew', 'Max', 'Melvin', 'Michael', 'Mickey', 'Miguel', 'Mike', 'Milton', 'Mitch', 'Mitchell', 'Morris',
    'Nathan', 'Nathaniel', 'Ned', 'Neil', 'Nelson', 'Nicholas', 'Nick', 'Norman',
    'Oliver', 'Orlando', 'Oscar',
    'Pablo', 'Patrick', 'Paul', 'Pedro', 'Perry', 'Pete', 'Peter', 'Phil', 'Phillip', 'Preston',
    'Quentin',
    'Rafael', 'Ralph', 'Ramon', 'Randall', 'Randy', 'Raul', 'Ray', 'Raymond', 'Reginald', 'Rene', 'Ricardo', 'Richard', 'Rick', 'Ricky', 'Rob', 'Robert', 'Roberto', 'Rodney', 'Roger', 'Roland', 'Ron', 'Ronald', 'Ronnie', 'Ross', 'Roy', 'Ruben', 'Rudy', 'Russell', 'Ryan',
    'Salvador', 'Sam', 'Samuel', 'Saul', 'Scott', 'Sean', 'Seth', 'Sergio', 'Shane', 'Shaun', 'Shawn', 'Sidney', 'Stan', 'Stanley', 'Stephen', 'Steve', 'Steven', 'Stuart',
    'Ted', 'Terrance', 'Terrence', 'Terry', 'Theodore', 'Thomas', 'Tim', 'Timothy', 'Toby', 'Todd', 'Tom', 'Tommy', 'Tony', 'Tracy', 'Travis', 'Trevor', 'Troy', 'Tyler', 'Tyrone',
    'Ulrich',
    'Val', 'Vernon', 'Vince', 'Vincent', 'Vinnie', 'Victor', 'Virgil',
    'Wade', 'Wallace', 'Walter', 'Warren', 'Wayne', 'Wesley', 'Willard', 'William', 'Willie',
    'Xavier',
    // Y
    'Zachary',
  ];

  // alpha10.1 added new female first names
  private static readonly FEMALE_FIRST_NAMES = [
    'Abigail', 'Agnes', 'Ali', 'Alice', 'Alicia', 'Allison', 'Alma', 'Amanda', 'Amber', 'Amy', 'Andrea', 'Angela', 'Anita', 'Ana', 'Ann', 'Anna', 'Anne', 'Annette', 'Annie', 'April', 'Arlene', 'Ashley', 'Audrey',
    'Barbara', 'Beatrice', 'Becky', 'Belinda', 'Bernice', 'Bertha', 'Bessie', 'Beth', 'Betty', 'Beverly', 'Billie', 'Bobbie', 'Bonnie', 'Brandy', 'Brenda', 'Britanny',
    'Carla', 'Carmen', 'Carol', 'Carole', 'Caroline', 'Carolyn', 'Carrie', 'Cassandra', 'Cassie', 'Cathy', 'Catherine', 'Charlene', 'Charlotte', 'Cherie', 'Cheryl', 'Christina', 'Christine', 'Christy', 'Cindy', 'Claire', 'Clara', 'Claudia', 'Colleen', 'Connie', 'Constance', 'Courtney', 'Cris', 'Crissie', 'Crystal', 'Cynthia',
    'Daisy', 'Dana', 'Danielle', 'Darlene', 'Dawn', 'Deanna', 'Debbie', 'Deborah', 'Debrah', 'Delores', 'Denise', 'Diana', 'Diane', 'Donna', 'Dolores', 'Dora', 'Doris', 'Dorothy',
    'Edith', 'Edna', 'Eileen', 'Elaine', 'Elayne', 'Eleanor', 'Eleonor', 'Elizabeth', 'Ella', 'Ellen', 'Elsie', 'Emily', 'Emma', 'Erica', 'Erika', 'Erin', 'Esther', 'Ethel', 'Eva', 'Evelyn',
    'Felicia', 'Fiona', 'Florence', 'Fran', 'Frances',
    'Gail', 'Georgia', 'Geraldine', 'Gertrude', 'Gina', 'Ginger', 'Gladys', 'Glenda', 'Gloria', 'Grace', 'Gwendolyn',
    'Hazel', 'Heather', 'Heidi', 'Helen', 'Helena', 'Hilary', 'Hilda', 'Holly', 'Holy',
    'Ida', 'Ingrid', 'Irene', 'Irma', 'Isabela',
    'Jackie', 'Jacqueline', 'Jamie', 'Jane', 'Janet', 'Janice', 'Jean', 'Jeanne', 'Jeanette', 'Jennie', 'Jennifer', 'Jenny', 'Jess', 'Jessica', 'Jessie', 'Jill', 'Jo', 'Joan', 'Joana', 'Joanne', 'Josephine', 'Joy', 'Joyce', 'Juanita', 'Judith', 'Judy', 'Julia', 'Julie', 'June',
    'Karen', 'Kate', 'Katherine', 'Kathleen', 'Kathy', 'Kathryn', 'Katie', 'Katrina', 'Kay', 'Kelly', 'Kim', 'Kimberly', 'Kira', 'Kristen', 'Kristin', 'Kristina',
    'Laura', 'Lauren', 'Laurie', 'Lea', 'Lena', 'Leona', 'Leonor', 'Leslie', 'Lillian', 'Lillie', 'Linda', 'Lindsay', 'Lisa', 'Liz', 'Lois', 'Loretta', 'Lori', 'Lorraine', 'Louise', 'Lucia', 'Lucille', 'Lucy', 'Lydia', 'Lynn',
    'Mabel', 'Mae', 'Maggie', 'Marcia', 'Margaret', 'Margie', 'Maria', 'Marian', 'Marie', 'Marion', 'Marjorie', 'Marlene', 'Marsha', 'Martha', 'Mary', 'Marylin', 'Mary-Ann', 'Mattie', 'Maureen', 'Maxine', 'Megan', 'Melanie', 'Melinda', 'Melissa', 'Michele', 'Mildred', 'Millie', 'Minnie', 'Miriam', 'Misty', 'Molly', 'Monica', 'Myrtle',
    'Naomi', 'Nancy', 'Natalie', 'Nelly', 'Nicole', 'Nina', 'Nora', 'Norma',
    'Olga', 'Ophelia',
    'Paquita', 'Page', 'Pamela', 'Patricia', 'Patsy', 'Patty', 'Paula', 'Pauline', 'Pearl', 'Peggy', 'Penny', 'Phyllis', 'Priscilla',
    // Q
    'Rachel', 'Ramona', 'Raquel', 'Rebecca', 'Regina', 'Renee', 'Rhonda', 'Rita', 'Roberta', 'Robin', 'Rosa', 'Rose', 'Rosemary', 'Ruby', 'Ruth',
    'Sabrina', 'Sally', 'Samantha', 'Sandra', 'Sara', 'Sarah', 'Shannon', 'Sharon', 'Sheila', 'Shelly', 'Sherry', 'Shirley', 'Sofia', 'Sonia', 'Stacey', 'Stacy', 'Stella', 'Stephanie', 'Sue', 'Susan', 'Suzanne', 'Sylvia',
    'Tabatha', 'Tamara', 'Tammy', 'Tanya', 'Tara', 'Terri', 'Terry', 'Tess', 'Thelma', 'Theresa', 'Tiffany', 'Tina', 'Toni', 'Tonya', 'Tori', 'Tracey', 'Tracy',
    // U
    'Valerie', 'Vanessa', 'Velma', 'Vera', 'Veronica', 'Vickie', 'Victoria', 'Viola', 'Violet', 'Virginia', 'Vivian',
    'Wanda', 'Wendy', 'Willie', 'Wilma', 'Winona',
    // X
    'Yolanda', 'Yvone',
    'Zora',
  ];

  // alpha10.1 added new names
  private static readonly LAST_NAMES = [
    'Adams', 'Alexander', 'Allen', 'Anderson', 'Austin',
    'Bailey', 'Baker', 'Barnes', 'Bell', 'Bennett', 'Bent', 'Black', 'Bradley', 'Brown', 'Brooks', 'Bryant', 'Bush', 'Butler',
    'Campbell', 'Carpenter', 'Carter', 'Clark', 'Coleman', 'Collins', 'Cook', 'Cooper', 'Cordell', 'Cox',
    'Davis', 'Diaz', 'Dobbs',
    'Edwards', 'Engels', 'Evans',
    'Finch', 'Flores', 'Ford', 'Forrester', 'Foster',
    'Garcia', 'Gates', 'Gonzales', 'Gonzalez', 'Gray', 'Green', 'Griffin',
    'Hall', 'Harris', 'Hayes', 'Henderson', 'Hernandez', 'Hewlett', 'Hill', 'Holtz', 'Howard', 'Hughes',
    'Irvin',
    'Jackson', 'James', 'Jenkins', 'Johnson', 'Jones',
    'Kelly', 'Kennedy', 'King',
    'Lambert', 'Lesaint', 'Lee', 'Lewis', 'Long', 'Lopez',
    'Malory', 'Martin', 'Martinez', 'McAllister', 'McGready', 'Miller', 'Mitchell', 'Moore', 'Morgan', 'Morris', 'Murphy',
    'Nelson', 'Norton',
    "O'Brien", 'Oswald',
    'Parker', 'Patterson', 'Paul', 'Perez', 'Perry', 'Peterson', 'Phillips', 'Pitt', 'Powell', 'Price',
    'Quinn',
    'Ramirez', 'Reed', 'Reeves', 'Richardson', 'Rivera', 'Roberts', 'Robinson', 'Rockwell', 'Rodriguez', 'Rogers', 'Robertson', 'Ross', 'Russell',
    'Sanchez', 'Sanders', 'Scott', 'Simmons', 'Smith', 'Stevens', 'Steward', 'Stewart',
    'Tarver', 'Taylor', 'Thomas', 'Thompson', 'Torres', 'Turner',
    'Ulrich',
    'Vance',
    'Walker', 'Ward', 'Walters', 'Washington', 'Watson', 'White', 'Williams', 'Wilson', 'Wood', 'Wright',
    // X
    'Young',
    // Z
  ];

  giveNameToActor(roller: DiceRoller, actor: Actor, firstNames?: string[], lastNames?: string[]): void {
    if (!firstNames || !lastNames) {
      const male = actor.model.dollBody.isMale;
      this.giveNameToActor(
        roller,
        actor,
        male ? BaseMapGenerator.MALE_FIRST_NAMES : BaseMapGenerator.FEMALE_FIRST_NAMES,
        BaseMapGenerator.LAST_NAMES
      );
      return;
    }
    actor.isProperName = true;
    const randomName =
      firstNames[roller.roll(0, firstNames.length)] + ' ' + lastNames[roller.roll(0, lastNames.length)];
    actor.name = randomName;
  }

  // ── Actor skills helpers ──────────────────────────────────────────────────

  giveRandomSkillsToActor(roller: DiceRoller, actor: Actor, count: number): void {
    for (let i = 0; i < count; i++) this.giveRandomSkillToActor(roller, actor);
  }

  giveRandomSkillToActor(roller: DiceRoller, actor: Actor): void {
    let randomID: SkillID;
    if (actor.model.abilities.isUndead) randomID = Skills.rollUndead(roller);
    else randomID = Skills.rollLiving(roller);
    this.giveStartingSkillToActor(actor, randomID);
  }

  giveStartingSkillToActor(actor: Actor, skillID: SkillID): void {
    if (actor.sheet.skillTable.getSkillLevel(skillID) >= Skills.maxSkillLevel(skillID)) return;

    actor.sheet.skillTable.addOrIncreaseSkill(skillID);

    // recompute starting stats.
    this.recomputeActorStartingStats(actor);
  }

  recomputeActorStartingStats(actor: Actor): void {
    actor.hitPoints = this.m_Rules.actorMaxHPs(actor);
    actor.staminaPoints = this.m_Rules.actorMaxSTA(actor);
    actor.foodPoints = this.m_Rules.actorMaxFood(actor);
    actor.sleepPoints = this.m_Rules.actorMaxSleep(actor);
    actor.sanity = this.m_Rules.actorMaxSanity(actor);
    if (actor.inventory) actor.inventory.maxCapacity = this.m_Rules.actorMaxInv(actor);
  }

  // ── Common map objects ────────────────────────────────────────────────────

  protected makeObjWoodenDoor(): DoorWindow {
    const door = new DoorWindow(
      'wooden door',
      GameImages.OBJ_WOODEN_DOOR_CLOSED,
      GameImages.OBJ_WOODEN_DOOR_OPEN,
      GameImages.OBJ_WOODEN_DOOR_BROKEN,
      DoorWindow.BASE_HITPOINTS
    );
    door.givesWood = true;
    return door;
  }

  protected makeObjHospitalDoor(): DoorWindow {
    const door = new DoorWindow(
      'door',
      GameImages.OBJ_HOSPITAL_DOOR_CLOSED,
      GameImages.OBJ_HOSPITAL_DOOR_OPEN,
      GameImages.OBJ_HOSPITAL_DOOR_BROKEN,
      DoorWindow.BASE_HITPOINTS
    );
    door.givesWood = true;
    return door;
  }

  protected makeObjCharDoor(): DoorWindow {
    return new DoorWindow(
      'CHAR door',
      GameImages.OBJ_CHAR_DOOR_CLOSED,
      GameImages.OBJ_CHAR_DOOR_OPEN,
      GameImages.OBJ_CHAR_DOOR_BROKEN,
      4 * DoorWindow.BASE_HITPOINTS
    );
  }

  protected makeObjGlassDoor(): DoorWindow {
    const door = new DoorWindow(
      'glass door',
      GameImages.OBJ_GLASS_DOOR_CLOSED,
      GameImages.OBJ_GLASS_DOOR_OPEN,
      GameImages.OBJ_GLASS_DOOR_BROKEN,
      Math.floor(DoorWindow.BASE_HITPOINTS / 4)
    );
    door.isMaterialTransparent = true;
    door.breaksWhenFiredThrough = true;
    return door;
  }

  protected makeObjIronDoor(): DoorWindow {
    const door = new DoorWindow(
      'iron door',
      GameImages.OBJ_IRON_DOOR_CLOSED,
      GameImages.OBJ_IRON_DOOR_OPEN,
      GameImages.OBJ_IRON_DOOR_BROKEN,
      8 * DoorWindow.BASE_HITPOINTS
    );
    door.isAn = true;
    return door;
  }

  protected makeObjWindow(): DoorWindow {
    // windows as transparent doors.
    const window = new DoorWindow(
      'window',
      GameImages.OBJ_WINDOW_CLOSED,
      GameImages.OBJ_WINDOW_OPEN,
      GameImages.OBJ_WINDOW_BROKEN,
      Math.floor(DoorWindow.BASE_HITPOINTS / 4)
    );
    window.isWindow = true;
    window.isMaterialTransparent = true;
    window.givesWood = true;
    window.breaksWhenFiredThrough = true;
    return window;
  }

  protected makeObjFence(
    fenceImageID: string,
    burnable: number = 0 /* MapObjectFire.UNINFLAMMABLE */,
    hitPoints: number = DoorWindow.BASE_HITPOINTS * 10
  ): MapObject {
    const fence = new MapObject('fence', fenceImageID, 1 /* MapObjectBreak.BREAKABLE */, burnable, hitPoints);
    fence.isMaterialTransparent = true;
    fence.jumpLevel = 1;
    fence.givesWood = true;
    fence.standOnFovBonus = true;
    return fence;
  }

  // alpha10
  protected makeObjWireFence(
    fenceImageID: string,
    burnable: number = 0 /* MapObjectFire.UNINFLAMMABLE */,
    hitPoints: number = DoorWindow.BASE_HITPOINTS
  ): MapObject {
    const fence = new MapObject('fence', fenceImageID, 1 /* MapObjectBreak.BREAKABLE */, burnable, hitPoints);
    fence.isMaterialTransparent = true;
    fence.jumpLevel = 1;
    fence.standOnFovBonus = true;
    return fence;
  }

  /**
   * C# `MakeObjWoodenFence(string)` — `BaseMapGenerator.cs:467-475`, Release 6-1.
   *
   * **Not the port's `makeObjFence` above, and not a duplicate of it.** The two
   * disagree on four of the fields that matter: the port's is called `fence` and
   * carries `BASE_HITPOINTS * 10` and a `burnable` parameter defaulting to
   * `UNINFLAMMABLE` and `standOnFovBonus`; this one is called `wooden fence`, is
   * `BURNABLE` outright, carries one `BASE_HITPOINTS` — forty, a tenth of the
   * other — and has no fov bonus. A farm fence that a survivor could not cut for
   * planks in one hit, and one that would not burn, would be a different building,
   * so this is a new method rather than a call with different arguments.
   *
   * `JumpLevel = 1` is what makes a farm fence hoppable, so the fence is a
   * perimeter rather than a wall: a survivor walks in over it and out under it.
   * `GivesWood` is why they would bother.
   *
   * **`static` is the C#'s (`protected static MakeObjWoodenFence`) and `public` is
   * the one word changed.** Every other factory in this class is an instance method,
   * but the C#'s is static and its only caller is a *building* file
   * (`./buildings/makeFarmBuilding`), which has a `TownBuildingContext` and no `this`
   * to call it on. `public static` is what lets that file use the one copy instead of
   * re-declaring it — which is the difference between a factory of record and the
   * ninth private copy this project has been collecting.
   */
  public static makeObjWoodenFence(fenceImageID: string): MapObject {
    const fence = new MapObject(
      'wooden fence',
      fenceImageID,
      MapObjectBreak.BREAKABLE,
      MapObjectFire.BURNABLE,
      DoorWindow.BASE_HITPOINTS
    );
    fence.isMaterialTransparent = true;
    fence.jumpLevel = 1;
    fence.givesWood = true;
    return fence;
  }

  protected makeObjIronFence(fenceImageID: string): MapObject {
    const fence = new MapObject('iron fence', fenceImageID);
    fence.isMaterialTransparent = true;
    fence.isAn = true;
    return fence;
  }

  /**
   * C# `MakeObjHelicopter(string)` — `BaseMapGenerator.cs:1097`.
   *
   * One tile of a three-tile sprite: the C# loads a 96x32 image and this method
   * is handed each third of it, so the three objects placed side by side read as
   * one helicopter (`RogueGame.cs:28864-28866`). The site picker therefore looks
   * for a 3x1 patch, and the C#'s own comments calling it 4x2 are stale from
   * before Release 7-3 shrank it.
   *
   * **`IsMetal` is set**, since `Feature.FuelStation` brought the field to the
   * port (`Data/MapObject.ts`, Release 5-4). C# `BaseMapGenerator.cs:1101` does
   * set it here; the omission was the field's absence and not a reading of the
   * C#. It only reaches the push/break sound effects (`RogueGame.cs:22607`,
   * `:22739`), and it is not fire or damage: the helicopter is UNBREAKABLE and
   * not walkable, so nothing ever asks what it is made of.
   *
   * Nothing else: UNBREAKABLE and not walkable, so the three tiles are walls the
   * player bumps into rather than floors they step onto, which is what puts them
   * inside `DoPlayerBump`'s special cases where the C# asks to board.
   */
  public makeObjHelicopter(heliImageID: string): MapObject {
    const heli = new MapObject('helicopter', heliImageID);
    heli.isMetal = true;
    return heli;
  }

  /**
   * C# `MakeObjFuelPump(string)` — `BaseMapGenerator.cs:1105`, Release 7-1.
   *
   * The 800 hitpoints are `DoorWindow.BASE_HITPOINTS * 20` (40 * 20). The
   * multiplication is the C#'s own way of writing "twenty doors' worth of
   * scenery", and it is load-bearing rather than decorative: a neighbouring
   * fuel pump's blast does at most 100 (`RogueGame.cs:19990`), so **no pump can
   * ever break another pump by hitpoints.** Pump-to-pump propagation in the
   * reference is entirely the tile-fire adjacency arm at `RogueGame.cs:24634`,
   * which is the arm `Feature.TileFires` still owes.
   *
   * `Fire.UNINFLAMMABLE` with a pump that explodes looks contradictory and is not:
   * nothing sets a map object alight and waits, `ExplodeFuelPump`
   * (`RogueGame.cs:20123`) fires on sight of a trigger, and the C# detects a pump
   * by `ImageID == GameImages.OBJ_FUEL_PUMP` in six places rather than by any fire
   * state. There is no `Fire.EXPLOSIVE`; the enum has four members
   * (`Data/MapObject.cs:24-31`) and this is the default one.
   *
   * `IsMetal` is sound only — see the header on `MapObject.isMetal`.
   */
  public makeObjFuelPump(fuelPumpImageID: string): MapObject {
    const pump = new MapObject(
      'fuel pump',
      fuelPumpImageID,
      MapObjectBreak.BREAKABLE,
      MapObjectFire.UNINFLAMMABLE,
      DoorWindow.BASE_HITPOINTS * 20
    );
    pump.isMetal = true;
    return pump;
  }

  /**
   * C# `MakeObjFuelPumpBroken(string)` — `BaseMapGenerator.cs:1113`, Release 7-3.
   *
   * `public` in the C# and in here, because `ExplodeFuelPump`
   * (`RogueGame.cs:20128`) reaches it through `m_TownGenerator` rather than
   * through the base class, and that is the only caller in the reference.
   *
   * The two-argument constructor leaves `HitPoints` at 0: `MapObject`'s guard
   * (`MapObject.ts:58`, mirroring `Data/MapObject.cs:279`) only assigns the
   * hitpoints when the object is breakable or burnable, and this is neither.
   *
   * **So the wreck is permanent, and that is the C#, not an oversight.** 0 HP
   * would make it destructible if anything damaged it, but the blast path gates
   * on `obj.IsBreakable` at `RogueGame.cs:19975` and this is UNBREAKABLE, so it
   * is skipped there; and `DoBreak` needs something to walk it into. It also
   * keeps `isWalkable` false and `isTransparent` false, so a detonated pump is
   * opaque, solid map furniture for the rest of the game. The C# never clears it.
   */
  public makeObjFuelPumpBroken(fuelPumpBrokenImageID: string): MapObject {
    const wreck = new MapObject('exploded fuel pump', fuelPumpBrokenImageID);
    wreck.isMetal = true;
    return wreck;
  }

  protected makeObjIronGate(gateImageID: string, isBreakable: boolean = true): MapObject {
    // alpha10.1 added param isBreakable
    const gate = new MapObject(
      'iron gate',
      gateImageID,
      isBreakable ? 1 /* BREAKABLE */ : 0 /* UNBREAKABLE */,
      0 /* UNINFLAMMABLE */,
      isBreakable ? DoorWindow.BASE_HITPOINTS * 20 : 0
    );
    gate.isMaterialTransparent = true;
    gate.isAn = true;
    return gate;
  }

  makeObjSmallFortification(imageID: string): Fortification {
    const fort = new Fortification('small fortification', imageID, Fortification.SMALL_BASE_HITPOINTS);
    fort.isMaterialTransparent = true;
    fort.givesWood = true;
    fort.isMovable = true;
    fort.weight = 4;
    fort.jumpLevel = 1;
    return fort;
  }

  makeObjLargeFortification(imageID: string): Fortification {
    const fort = new Fortification('large fortification', imageID, Fortification.LARGE_BASE_HITPOINTS);
    fort.givesWood = true;
    return fort;
  }

  protected makeObjTree(treeImageID: string): MapObject {
    const tree = new MapObject(
      'tree',
      treeImageID,
      1 /* BREAKABLE */,
      1 /* BURNABLE */,
      DoorWindow.BASE_HITPOINTS * 10
    );
    tree.givesWood = true;
    return tree;
  }

  /**
   * C# `MakeObjFarmPlant(string name, string plantImageID)` —
   * `BaseMapGenerator.cs:1155-1163`, whose doc comment calls it a "generic plant to
   * be used as a container for fruit or veggies".
   *
   * The port had no equivalent of any kind, so this is not a second copy of
   * anything: the farm's crops (a berry bush, a peanut plant, a grape vine) are
   * **map objects, one per inside-rect tile**, which is why `Feature.Farm` needs no
   * farming substrate at all. `TileID.FLOOR_PLANTED` is reached only from
   * `HandlePlayerPlantSeeds` (`RogueGame.cs:14208`), which is unported.
   *
   * Two hit points. `DoorWindow.BASE_HITPOINTS / 20` is `int / int` in the C#, and
   * `Math.floor` is what keeps it that way — the port's own `makeObjGlassDoor` and
   * `makeObjChair` write the same guard for the same reason. `UNBREAKABLE` with two
   * hit points is a contradiction on its face and is not one: `MapObject`'s
   * constructor only assigns the hit points because `BURNABLE` is set, and the
   * blast path gates on `IsBreakable` (`RogueGame.cs:19975`), so a crop cannot be
   * shot off its stalk by a neighbour's explosion. It can, however, be set alight,
   * and losing the crop is the point.
   *
   * `isWalkable` is the load-bearing flag and the reason this is a map object at
   * all: the plant *is* the floor. A tile carrying a walkable object is walkable
   * (`Map.ts:331-338`), so a farm's inside rect is a walkable field of crops rather
   * than a field of obstacles — which is also what lets the shed's door-front
   * rejection loop clear a plant instead of refusing the door.
   *
   * `public static` for the same reason as `makeObjWoodenFence` above: the C#'s is
   * `protected static`, and its only caller is a building file with no `this`.
   */
  public static makeObjFarmPlant(name: string, plantImageID: string): MapObject {
    const plant = new MapObject(
      name,
      plantImageID,
      MapObjectBreak.UNBREAKABLE,
      MapObjectFire.BURNABLE,
      Math.floor(DoorWindow.BASE_HITPOINTS / 20)
    );
    plant.isMaterialTransparent = true;
    plant.isContainer = true;
    plant.isWalkable = true;
    return plant;
  }

  private static readonly CARS = [GameImages.OBJ_CAR1, GameImages.OBJ_CAR2, GameImages.OBJ_CAR3, GameImages.OBJ_CAR4];

  /**
   * Makes a new wrecked car : transparent, not walkable but jumpable, movable.
   * Passing a DiceRoller picks a random car model.
   *
   * Under STILL_ALIVE this is a `Car` with a rolled fuel level (0-30, Release
   * 7-1). Note what does *not* change: `Car` is `UNINFLAMMABLE` with zero hit
   * points, which is exactly what the plain `MapObject` default constructor gave,
   * so the only difference is the extra tank.
   *
   * The roll itself is behind the flag and not just the class, because consuming
   * a `DiceRoller` value shifts every subsequent roll in world generation. Gating
   * only the class would quietly reseed a different CLASSIC world for every
   * player, which is a far worse regression than a missing fuel gauge.
   */
  protected makeObjWreckedCar(carOrRoller: DiceRoller | string): MapObject {
    const stillAlive = hasFeature(Session.get().ruleset, Feature.FireBarrels);
    const fuelUnits =
      stillAlive && carOrRoller instanceof DiceRoller ? carOrRoller.roll(0, 30) : 0;
    const carImageID =
      typeof carOrRoller === 'string'
        ? carOrRoller
        : BaseMapGenerator.CARS[carOrRoller.roll(0, BaseMapGenerator.CARS.length)];
    const car = stillAlive
      ? new Car('wrecked car', carImageID, MapObjectBreak.BROKEN, fuelUnits)
      : new MapObject('wrecked car', carImageID);
    car.breakState = MapObjectBreak.BROKEN;
    car.isMaterialTransparent = true;
    car.jumpLevel = 1;
    car.isMovable = true;
    car.weight = 100;
    car.standOnFovBonus = true;
    return car;
  }

  /**
   * A single fuel barrel, as opposed to `makeObjBarrels`'s plural stack of
   * unbreakable-in-practice drums. Still Alive, Release 7-6.
   *
   * Unbreakable, burnable, four kilos, and walkable, which is what makes it a
   * cooking spot rather than an obstacle. `isContainer` is set "in case items were
   * left there when the barrel was unlit", which is the C#'s own comment.
   *
   * Nothing calls this yet: where fire barrels appear is placement, and placement
   * is a balance decision this branch has been deferring rather than guessing --
   * the same reason the 67 imported item factories are uncalled.
   */
  protected makeObjFireBarrel(barrelImageID: string): Barrel {
    const barrel = new Barrel('receptacle', barrelImageID, MapObjectBreak.UNBREAKABLE, 0);
    barrel.isMaterialTransparent = true;
    barrel.isContainer = true;
    barrel.isMovable = true;
    barrel.isWalkable = true;
    barrel.weight = 4;
    barrel.fireState = MapObjectFire.BURNABLE;
    // `isMetal` (Release 5-4) and `hoverDescription` (Release 7-6) are not
    // carried by the port's `MapObject` yet. They are deliberately left off
    // rather than added here: `isMetal` is read by other features -- fuel
    // stations, the camp fuel-pump explosion -- and adding a flag field to a
    // core class as a side effect of a generator is how that goes wrong.
    return barrel;
  }

  /** An unlit campfire. Still Alive, Release 7-6. See `makeObjFireBarrel`. */
  makeObjCampfire(campfireImageID: string): Campfire {
    const campfire = new Campfire('campfire', campfireImageID, MapObjectBreak.BREAKABLE, 0);
    campfire.isMaterialTransparent = true;
    campfire.isContainer = true;
    campfire.isMovable = false;
    campfire.isWalkable = true;
    return campfire;
  }

  protected makeObjShelf(shelfImageID: string): MapObject {
    const shelf = new MapObject(
      'shelf',
      shelfImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS
    );
    shelf.isContainer = true;
    shelf.givesWood = true;
    shelf.isMovable = true;
    shelf.weight = 6;
    return shelf;
  }

  protected makeObjBench(benchImageID: string): MapObject {
    const bench = new MapObject(
      'bench',
      benchImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS * 2
    );
    bench.isMaterialTransparent = true;
    bench.jumpLevel = 1;
    bench.isCouch = true;
    bench.givesWood = true;
    return bench;
  }

  protected makeObjIronBench(benchImageID: string): MapObject {
    const bench = new MapObject('iron bench', benchImageID);
    bench.isMaterialTransparent = true;
    bench.jumpLevel = 1;
    bench.isCouch = true;
    bench.isAn = true;
    return bench;
  }

  protected makeObjBed(bedImageID: string): MapObject {
    const bed = new MapObject(
      'bed',
      bedImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS * 2
    );
    bed.isMaterialTransparent = true;
    bed.isWalkable = true;
    bed.isCouch = true;
    bed.givesWood = true;
    bed.isMovable = true;
    bed.weight = 6;
    return bed;
  }

  protected makeObjWardrobe(wardrobeImageID: string): MapObject {
    const wardrobe = new MapObject(
      'wardrobe',
      wardrobeImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS * 6
    );
    wardrobe.isMaterialTransparent = false;
    wardrobe.isContainer = true;
    wardrobe.givesWood = true;
    wardrobe.isMovable = true;
    wardrobe.weight = 10;
    return wardrobe;
  }

  protected makeObjDrawer(drawerImageID: string): MapObject {
    const drawer = new MapObject(
      'drawer',
      drawerImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS
    );
    drawer.isMaterialTransparent = true;
    drawer.isContainer = true;
    drawer.givesWood = true;
    drawer.isMovable = true;
    drawer.weight = 6;
    return drawer;
  }

  protected makeObjTable(tableImageID: string): MapObject {
    const table = new MapObject(
      'table',
      tableImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS
    );
    table.isMaterialTransparent = true;
    table.jumpLevel = 1;
    table.givesWood = true;
    table.isMovable = true;
    table.weight = 2;
    return table;
  }

  /**
   * C# `MakeObjWorkstation` — `BaseMapGenerator.cs:811`, Release 3.
   *
   * A table with `Weight = 10` rather than the table's 2, and the only thing in
   * the pair that is *flammable* (the table is `UNINFLAMMABLE`). Those two fields
   * are the whole difference and both are load-bearing: a workstation a survivor
   * cannot shift, or that burns the office down when a torch lands on it, is a
   * different object from the C#'s.
   */
  protected makeObjWorkstation(desktopImageID: string): MapObject {
    const workstation = new MapObject(
      'workstation',
      desktopImageID,
      1 /* BREAKABLE */,
      1 /* BURNABLE */,
      DoorWindow.BASE_HITPOINTS
    );
    workstation.isMaterialTransparent = true;
    workstation.jumpLevel = 1;
    workstation.givesWood = true;
    workstation.isMovable = true;
    workstation.weight = 10;
    return workstation;
  }

  /**
   * C# `IsADoorNSEW` — `MapGenerator.cs:450`, Release 3, made static in 5-7.
   *
   * Is the tile north, south, east or west of this one a door? Used to keep
   * furniture out of a doorway's swing, which is why it is a *neighbour* test and
   * not "is this tile a door": a workstation on the tile in front of a door
   * blocks the door, and the door is what makes the room enterable.
   *
   * Takes the map rather than reaching for a session global, because the C#'s is
   * `static bool IsADoorNSEW(Map map, int x, int y)` — the map is an argument for
   * exactly the reason that a generator placing furniture into a map under
   * construction has no business asking the session which map is current.
   */
  protected isADoorNSEW(map: GameMap, x: number, y: number): boolean {
    const isDoor = (dx: number, dy: number): boolean =>
      map.getMapObjectAt(x + dx, y + dy) instanceof DoorWindow;
    // north, south, east, west -- the C#'s order, which is also its comment's.
    return isDoor(0, 1) || isDoor(0, -1) || isDoor(1, 0) || isDoor(-1, 0);
  }

  /**
   * C# `MakeObjCouch` — `BaseMapGenerator.cs:927`.
   *
   * The port had this in two places already, privately: `makeShoppingMall.ts` and
   * `BarBuilding.ts` each declare their own. Rather than a third copy, it lives here
   * where the C# has it, and the two building modules can keep theirs until they are
   * next edited — this is not a refactor of them.
   *
   * `isCouch` is `@@MP (Release 6-6)` and is the field that matters: `Rules` reads it
   * to decide whether sleeping on this tile restores SLP faster, so an office full of
   * couches is a real gameplay difference and not furniture.
   */
  protected makeObjCouch(couchImageID: string): MapObject {
    const couch = new MapObject(
      'couch',
      couchImageID,
      MapObjectBreak.BREAKABLE,
      MapObjectFire.BURNABLE,
      DoorWindow.BASE_HITPOINTS * 4
    );
    couch.isMaterialTransparent = true;
    couch.jumpLevel = 1;
    couch.givesWood = true;
    couch.isMovable = true;
    couch.isCouch = true; //@@MP (Release 6-6)
    couch.weight = 3;
    return couch;
  }

  /**
   * C# `MakeObjReceptionDesk` — `BaseMapGenerator.cs:1038`.
   *
   * A container with no break or fire data in the initialiser, which is the C#: a
   * three-argument `MapObject` gets the defaults and nothing else. `isContainer` is
   * `@@MP (Release 5-3)`.
   */
  protected makeObjReceptionDesk(receptionDeskImageID: string): MapObject {
    const desk = new MapObject('reception desk', receptionDeskImageID);
    desk.isContainer = true; //@@MP (Release 5-3)
    desk.jumpLevel = 1;
    desk.isMaterialTransparent = true;
    desk.standOnFovBonus = true;
    return desk;
  }

  /**
   * C# `MakeObjCHARvat` — `BaseMapGenerator.cs:803` (Release 3).
   *
   * A bare two-argument `MapObject`: unbreakable, not flammable, and nothing else
   * set. The lab's vats line the walls and a breakable one would be a hole in the
   * room's silhouette rather than furniture, which is presumably why.
   */
  protected makeObjCHARvat(vatImageID: string): MapObject {
    const vat = new MapObject('CHAR vat', vatImageID);
    vat.isMaterialTransparent = true; //@@MP (Release 6-5)
    return vat;
  }

  /** C# `MakeObjCHARtrolley` — `BaseMapGenerator.cs:1290`. Metal and movable. */
  protected makeObjCHARtrolley(trolleyImageID: string): MapObject {
    const trolley = new MapObject(
      'CHAR trolley',
      trolleyImageID,
      MapObjectBreak.BREAKABLE,
      MapObjectFire.UNINFLAMMABLE,
      DoorWindow.BASE_HITPOINTS
    );
    trolley.isMaterialTransparent = true;
    trolley.jumpLevel = 1;
    trolley.isMetal = true;
    trolley.isMovable = true;
    return trolley;
  }

  /**
   * C# `MakeObjArmyRadioCupboard` — `BaseMapGenerator.cs:1069`.
   *
   * A container you can push, and `Weight = 15` for a reason: it is the base's
   * heaviest movable, so the shove ladder and the hauling rules both care about it.
   */
  protected makeObjArmyRadioCupboard(armyRadioCupboardImageID: string): MapObject {
    const cupboard = new MapObject(
      'radio equipment',
      armyRadioCupboardImageID,
      MapObjectBreak.BREAKABLE,
      MapObjectFire.BURNABLE,
      DoorWindow.BASE_HITPOINTS * 2
    );
    cupboard.isContainer = true;
    cupboard.givesWood = true;
    cupboard.isMovable = true;
    cupboard.weight = 15;
    return cupboard;
  }

  /** C# `MakeObjArmyFootlocker` — `BaseMapGenerator.cs:1080`. Unflammable, unlike the cupboard. */
  protected makeObjArmyFootlocker(armyFootlockerImageID: string): MapObject {
    const locker = new MapObject(
      'footlocker',
      armyFootlockerImageID,
      MapObjectBreak.BREAKABLE,
      MapObjectFire.UNINFLAMMABLE,
      DoorWindow.BASE_HITPOINTS
    );
    locker.isMaterialTransparent = true;
    locker.isContainer = true;
    locker.isMovable = true;
    locker.jumpLevel = 1;
    locker.weight = 5;
    return locker;
  }

  /**
   * C# `MakeItemFlaresKit` — `BaseMapGenerator.cs`, a box of forty.
   *
   * `isForbiddenToAI` carries the C#'s own `//TODO in the future?`, kept because a
   * TODO that changes behaviour is worth seeing rather than tidying.
   */
  makeItemFlaresKit(): Item {
    const item = new Item(Models.items.get(ItemID.FLARES_KIT));
    item.quantity = 40;
    item.isForbiddenToAI = true; //TODO in the future?
    return item;
  }

  /**
   * C# `MakeItemArmyRucksack` — the fifth and last backpack factory.
   *
   * Ungated for the same reason as its four siblings: the C#'s factory has no feature
   * check, and the gate belongs on the roll site that spawns it — here, the rec room's
   * 25% arm. That arm is in `MakeArmyRecRoom` and this factory is its only caller, so
   * this is the last backpack model to acquire a producer.
   */
  makeItemArmyRucksack(): Item {
    return this.makeUngatedBackpack(ItemID.BACKPACK_ARMY_RUCKSACK);
  }

  protected makeObjChair(chairImageID: string): MapObject {
    const chair = new MapObject(
      'chair',
      chairImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      Math.floor(DoorWindow.BASE_HITPOINTS / 3)
    );
    chair.isMaterialTransparent = true;
    chair.jumpLevel = 1;
    chair.givesWood = true;
    chair.isMovable = true;
    chair.weight = 1;
    return chair;
  }

  protected makeObjNightTable(nightTableImageID: string): MapObject {
    const nightTable = new MapObject(
      'night table',
      nightTableImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      Math.floor(DoorWindow.BASE_HITPOINTS / 3)
    );
    nightTable.isMaterialTransparent = true;
    nightTable.jumpLevel = 1;
    nightTable.givesWood = true;
    nightTable.isMovable = true;
    nightTable.weight = 1;
    return nightTable;
  }

  protected makeObjFridge(fridgeImageID: string): MapObject {
    const fridge = new MapObject(
      'fridge',
      fridgeImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS * 6
    );
    fridge.isContainer = true;
    fridge.isMovable = true;
    fridge.weight = 10;
    return fridge;
  }

  protected makeObjJunk(junkImageID: string): MapObject {
    const junk = new MapObject(
      'junk',
      junkImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      DoorWindow.BASE_HITPOINTS
    );
    junk.isPlural = true;
    junk.isMaterialTransparent = true;
    junk.isMovable = true;
    junk.givesWood = true;
    junk.weight = 6;
    return junk;
  }

  protected makeObjBarrels(barrelsImageID: string): MapObject {
    const barrels = new MapObject(
      'barrels',
      barrelsImageID,
      1 /* BREAKABLE */,
      0 /* UNINFLAMMABLE */,
      2 * DoorWindow.BASE_HITPOINTS
    );
    barrels.isPlural = true;
    barrels.isMaterialTransparent = true;
    barrels.isMovable = true;
    barrels.givesWood = true;
    barrels.weight = 10;
    return barrels;
  }

  protected makeObjPowerGenerator(offImageID: string, onImageID: string): PowerGenerator {
    return new PowerGenerator('power generator', offImageID, onImageID);
  }

  makeObjBoard(imageID: string, text: string[]): MapObject {
    return new Board('board', imageID, text);
  }

  // ── Common tile decorations ───────────────────────────────────────────────

  decorateOutsideWalls(map: GameMap, rect: Rect, decoFn: (x: number, y: number) => string | null): void {
    // Moved to `./TownBuilding` so a building generator in its own file can use
    // it. Every one of the fourteen C# building generators calls it, and it was
    // the only wall-decoration helper the town had.
    decorateOutsideWallsOn(map, rect, decoFn);
  }

  // ── Common items ──────────────────────────────────────────────────────────

  /**
   * C# `MakeItemFishingRod` -- `BaseMapGenerator.cs:2188-2191`, Release 7-6.
   *
   * The C# drops one at every pond (`BaseTownGenerator.cs:5709`) and sells one in
   * four shop rolls. The item model already landed with `Feature.Fishing`'s player
   * path; what was missing was the factory, which is why the player could equip a
   * rod but no map in the world contained one.
   */
  makeItemFishingRod(): Item {
    const model = Models.items.get(ItemID.FISHING_ROD);
    return new Item(model);
  }

  makeItemBandages(): Item {
    const model = Models.items.get(ItemID.MEDICINE_BANDAGES);
    return new ItemMedicine(model) as Item;
  }

  makeItemMedikit(): Item {
    return new ItemMedicine(Models.items.get(ItemID.MEDICINE_MEDIKIT)) as Item;
  }

  makeItemPillsSTA(): Item {
    const model = Models.items.get(ItemID.MEDICINE_PILLS_STA);
    return new ItemMedicine(model) as Item;
  }

  makeItemPillsSLP(): Item {
    const model = Models.items.get(ItemID.MEDICINE_PILLS_SLP);
    return new ItemMedicine(model) as Item;
  }

  makeItemPillsSAN(): Item {
    const model = Models.items.get(ItemID.MEDICINE_PILLS_SAN);
    return new ItemMedicine(model) as Item;
  }

  makeItemPillsAntiviral(): Item {
    const model = Models.items.get(ItemID.MEDICINE_PILLS_ANTIVIRAL);
    return new ItemMedicine(model) as Item;
  }

  makeItemGroceries(): Item {
    // FIXME: should be map local time.
    const timeNow = Session.get().worldTime.turnCounter;

    const model = Models.items.get(ItemID.FOOD_GROCERIES) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);

    return new ItemFood(model, freshUntil);
  }

  makeItemCannedFood(): Item {
    // canned food not perishable.
    const model = Models.items.get(ItemID.FOOD_CANNED_FOOD);
    const item = new ItemFood(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemCrowbar(): Item {
    const model = Models.items.get(ItemID.MELEE_CROWBAR);
    const item = new ItemMeleeWeapon(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemBaseballBat(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_BASEBALLBAT));
  }

  makeItemCombatKnife(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_COMBAT_KNIFE));
  }

  makeItemTruncheon(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_TRUNCHEON));
  }

  makeItemGolfClub(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_GOLFCLUB));
  }

  makeItemIronGolfClub(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_IRON_GOLFCLUB));
  }

  makeItemHugeHammer(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_HUGE_HAMMER));
  }

  makeItemSmallHammer(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SMALL_HAMMER));
  }

  makeItemJasonMyersAxe(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.UNIQUE_JASON_MYERS_AXE));
    item.isUnique = true;
    return item;
  }

  makeItemShovel(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SHOVEL));
  }

  makeItemShortShovel(): Item {
    return new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SHORT_SHOVEL));
  }

  makeItemWoodenPlank(): ItemBarricadeMaterial {
    return new ItemBarricadeMaterial(Models.items.get(ItemID.BAR_WOODEN_PLANK));
  }

  makeItemHuntingCrossbow(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_HUNTING_CROSSBOW));
  }

  makeItemBoltsAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_BOLTS));
  }

  makeItemHuntingRifle(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_HUNTING_RIFLE));
  }

  makeItemLightRifleAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_LIGHT_RIFLE));
  }

  makeItemPistol(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_PISTOL));
  }

  makeItemKoltRevolver(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_KOLT_REVOLVER));
  }

  makeItemRandomPistol(): Item {
    return this.m_Game.rules.rollChance(50) ? this.makeItemPistol() : this.makeItemKoltRevolver();
  }

  makeItemLightPistolAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_LIGHT_PISTOL));
  }

  makeItemShotgun(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_SHOTGUN));
  }

  makeItemShotgunAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_SHOTGUN));
  }

  makeItemCHARLightBodyArmor(): Item {
    return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_CHAR_LIGHT_BODYARMOR));
  }

  makeItemBikerGangJacket(gangId: GangID): Item {
    switch (gangId) {
      case GangID.BIKER_FREE_ANGELS:
        return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_FREE_ANGELS_JACKET));
      case GangID.BIKER_HELLS_SOULS:
        return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_HELLS_SOULS_JACKET));
      default:
        throw new Error('unhandled biker gang');
    }
  }

  makeItemPoliceJacket(): Item {
    return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_POLICE_JACKET));
  }

  makeItemPoliceRiotArmor(): Item {
    return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_POLICE_RIOT));
  }

  makeItemHunterVest(): Item {
    return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_HUNTER_VEST));
  }

  makeItemCellPhone(): Item {
    return new ItemTracker(Models.items.get(ItemID.TRACKER_CELL_PHONE));
  }

  makeItemSprayPaint(): Item {
    // random color.
    let paintModel: ItemSprayPaintModel;
    const roll = this.m_Game.rules.roll(0, 4);
    switch (roll) {
      case 0:
        paintModel = Models.items.get(ItemID.SPRAY_PAINT1) as ItemSprayPaintModel;
        break;
      case 1:
        paintModel = Models.items.get(ItemID.SPRAY_PAINT2) as ItemSprayPaintModel;
        break;
      case 2:
        paintModel = Models.items.get(ItemID.SPRAY_PAINT3) as ItemSprayPaintModel;
        break;
      case 3:
        paintModel = Models.items.get(ItemID.SPRAY_PAINT4) as ItemSprayPaintModel;
        break;
      default:
        throw new Error('unhandled roll');
    }

    return new ItemSprayPaint(paintModel);
  }

  makeItemStenchKiller(): Item {
    return new ItemSprayScent(Models.items.get(ItemID.SCENT_SPRAY_STENCH_KILLER));
  }

  /**
   * C# `MakeItemHikingPack` — `BaseMapGenerator.cs:2400` — the Release 8-2 half of
   * the hunting shop's `case 3`, and one of three backpack models the port had no
   * factory for at all.
   *
   * **Ungated**, and the C# is the reason. `MakeItemHikingPack` there is a bare
   * `new ItemBackpack(m_Game.GameItems.HIKING_PACK) { IsForbiddenToAI = true }` with
   * no `Feature` check, and neither is `MakeItemSatchel`, `MakeItemWaistPouch` or
   * `MakeItemDaypack`. The `Feature.ShelterBackpacks` gate lives on the *roll sites*
   * — the eight places that decide whether a backpack spawns in the world — which is
   * why `makeBackpack` in `gameplay/Backpacks.ts` is gated and this is not.
   *
   * Gating the factory instead was the first attempt and it is wrong twice over: it
   * makes these three return `null` under CLASSIC, and it would have put the gate in
   * two places, so a future site that forgets the feature check would silently ship
   * a pack. `item-factories.test.ts` enumerates the prototype chain, so the gated
   * version failed it with "returns an item with no real model" — which is the guard
   * working, and is the reason this comment is here rather than a shorter one.
   */
  makeItemHikingPack(): Item {
    return this.makeUngatedBackpack(ItemID.BACKPACK_HIKING_PACK);
  }

  /**
   * C# `MakeItemDaypack` — `BaseMapGenerator.cs:2392`.
   *
   * The fourth of the five backpack factories, and the one the ordinary office's
   * `case 5` names at 25%. Ungated, for the reason the other three are: the C#'s
   * factory has no feature check and the gate belongs on the roll sites.
   */
  makeItemDaypack(): Item {
    return this.makeUngatedBackpack(ItemID.BACKPACK_DAYPACK);
  }

  /**
   * C# `MakeItemMatches` — `BaseMapGenerator.cs:2308`. A box of twenty.
   *
   * Needed by the ordinary office's item table, which the port had no version of.
   */
  makeItemMatches(): Item {
    const item = new Item(Models.items.get(ItemID.MATCHES));
    item.quantity = 20;
    return item;
  }

  /** C# `MakeItemSatchel`. */
  makeItemSatchel(): Item {
    return this.makeUngatedBackpack(ItemID.BACKPACK_SATCHEL);
  }

  /** C# `MakeItemWaistPouch`. */
  makeItemWaistPouch(): Item {
    return this.makeUngatedBackpack(ItemID.BACKPACK_WAIST_POUCH);
  }

  /**
   * A backpack, with the C#'s `IsForbiddenToAI` and without the feature gate.
   *
   * Private rather than a fourth copy of the two-line initialiser, and separate from
   * the exported `makeBackpack` in `gameplay/Backpacks.ts`, which *is* gated. The
   * two look alike and mean different things: this one builds the item, that one
   * builds the item *if the feature is on*.
   */
  private makeUngatedBackpack(modelId: ItemID): Item {
    const pack = new ItemBackpack(Models.items.get(modelId));
    pack.isForbiddenToAI = true;
    return pack;
  }

  /**
   * C# `MakeItemCandlesBox` — the bedroom's `case 2`.
   *
   * A plain `ItemModel`, deliberately, and *not* an `ItemLight`. The model docblock
   * in `GameItems` explains it at length: the flavour text promises light, and the
   * C# has no light field on the initialiser at all. A candles box is light because
   * dropping one places a `DECO_LIT_CANDLE` decoration (`RogueGame.cs:21203`) —
   * a path not yet ported — so here it is a box of nothing, which is recorded on
   * the model rather than invented around. `new ItemLight(...)` throws on this model,
   * which is the correct outcome and the reason this is worth a comment.
   */
  makeItemCandlesBox(): Item {
    return new Item(Models.items.get(ItemID.CANDLES_BOX));
  }

  makeItemArmyRifle(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_ARMY_RIFLE));
  }

  makeItemPrecisionRifle(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_PRECISION_RIFLE));
  }

  //@@MP (Release 6-6)
  makeItemPrecisionRifleAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_PRECISION_RIFLE));
  }

  makeItemHeavyRifleAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_HEAVY_RIFLE));
  }

  makeItemArmyPistol(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_ARMY_PISTOL));
  }

  makeItemHeavyPistolAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_HEAVY_PISTOL));
  }

  makeItemArmyBodyArmor(): Item {
    return new ItemBodyArmor(Models.items.get(ItemID.ARMOR_ARMY_BODYARMOR));
  }

  makeItemArmyRation(): Item {
    // army rations fresh for 5 days.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_ARMY_RATION) as ItemFoodModel;
    const freshUntil = timeNow + WorldTime.TURNS_PER_DAY * model.bestBeforeDays;

    return new ItemFood(model, freshUntil);
  }

  makeItemFlashlight(): Item {
    return new ItemLight(Models.items.get(ItemID.LIGHT_FLASHLIGHT));
  }

  makeItemBigFlashlight(): Item {
    return new ItemLight(Models.items.get(ItemID.LIGHT_BIG_FLASHLIGHT));
  }

  makeItemZTracker(): Item {
    return new ItemTracker(Models.items.get(ItemID.TRACKER_ZTRACKER));
  }

  // Still Alive, Release 8-1 (`BaseMapGenerator.cs:2370-2373`). A bare `Item`:
  // the laptop has no behaviour of its own, so there is no subclass to construct
  // the way the factories above have one.
  makeItemCHARLaptop(): Item {
    return new Item(Models.items.get(ItemID.CHAR_LAPTOP));
  }

  makeItemBlackOpsGPS(): Item {
    return new ItemTracker(Models.items.get(ItemID.TRACKER_BLACKOPS));
  }

  makeItemPoliceRadio(): Item {
    return new ItemTracker(Models.items.get(ItemID.TRACKER_POLICE_RADIO));
  }

  makeItemGrenade(): Item {
    const model = Models.items.get(ItemID.EXPLOSIVE_GRENADE);
    const item = new ItemGrenade(model, Models.items.get(ItemID.EXPLOSIVE_GRENADE_PRIMED));
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemBearTrap(): Item {
    return new ItemTrap(Models.items.get(ItemID.TRAP_BEAR_TRAP));
  }

  makeItemSpikes(): Item {
    const model = Models.items.get(ItemID.TRAP_SPIKES);
    const item = new ItemTrap(model);
    item.quantity = this.m_Rules.roll(1, Models.items.get(ItemID.TRAP_BARBED_WIRE).stackingLimit);
    return item;
  }

  makeItemBarbedWire(): Item {
    const model = Models.items.get(ItemID.TRAP_BARBED_WIRE);
    const item = new ItemTrap(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemBook(): Item {
    return new ItemEntertainment(Models.items.get(ItemID.ENT_BOOK));
  }

  makeItemMagazines(): Item {
    const model = Models.items.get(ItemID.ENT_MAGAZINE);
    const item = new ItemEntertainment(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }


  makeItemArmyPrecisionRifle(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_ARMY_PRECISION_RIFLE));
    return item;
  }

  makeItemBarbedWireBat(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_BARBED_WIRE_BAT));
    return item;
  }

  makeItemBinoculars(): Item {
    const item = new ItemLight(Models.items.get(ItemID.LIGHT_BINOCULARS));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemBioForceGun(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_BIO_FORCE_GUN));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemBioForceGunAmmo(): Item {
    const item = new ItemAmmo(Models.items.get(ItemID.AMMO_PLASMA));
    // because there is only 1 BFG per game
    item.isForbiddenToAI = true;
    // only ever spawn one at a time, to avoid it being too plentiful.
    // it must be super rare
    item.quantity = 1;
    return item;
  }

  makeItemBiohazardSuit(): Item {
    const item = new ItemBodyArmor(Models.items.get(ItemID.ARMOR_BIOHAZARD_SUIT));
    return item;
  }

  makeItemBrassKnuckles(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_BRASS_KNUCKLES));
    return item;
  }

  makeItemC4Explosive(): Item {
    const item = new ItemExplosive(Models.items.get(ItemID.EXPLOSIVE_C4), Models.items.get(ItemID.EXPLOSIVE_C4_PRIMED));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemFuelAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_FUEL));
  }

  makeItemChainsaw(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_CHAINSAW));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemChickenEgg(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_CHICKEN_EGG) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemCigarettes(): Item {
    const model = Models.items.get(ItemID.MEDICINE_CIGARETTES);
    const item = new ItemMedicine(model);
    item.quantity = 20;
    return item;
  }

  makeItemCleaver(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_CLEAVER));
    return item;
  }

  makeItemCookedChicken(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_COOKED_CHICKEN) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemCookedDogMeat(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_COOKED_DOG_MEAT) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemCookedFish(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_COOKED_FISH) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemCookedHumanFlesh(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_COOKED_HUMAN_FLESH) as ItemFoodModel;
    // C#: the shelf life comes off RAW_HUMAN_FLESH, not from
    // this item -- the quirk is preserved rather than tidied away.
    const life = (Models.items.get(ItemID.FOOD_RAW_HUMAN_FLESH) as ItemFoodModel).bestBeforeDays;
    const max = WorldTime.TURNS_PER_DAY * life;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemCookedRabbit(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_COOKED_RABBIT) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemDoubleBarrel(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_DOUBLE_BARREL));
    return item;
  }

  makeItemDynamite(): Item {
    const item = new ItemGrenade(Models.items.get(ItemID.EXPLOSIVE_DYNAMITE), Models.items.get(ItemID.EXPLOSIVE_DYNAMITE_PRIMED));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemEnergyDrink(): Item {
    const model = Models.items.get(ItemID.MEDICINE_ENERGY_DRINK);
    const item = new ItemMedicine(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemFireAxe(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_FIRE_AXE));
    return item;
  }

  makeItemFireExtinguisher(): Item {
    const item = new ItemSprayPaint(Models.items.get(ItemID.FIRE_EXTINGUISHER));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemFireHazardSuit(): Item {
    const item = new ItemBodyArmor(Models.items.get(ItemID.ARMOR_FIRE_HAZARD_SUIT));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemFlail(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_FLAIL));
    return item;
  }

  makeItemFlamethrower(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_FLAMETHROWER));
    return item;
  }

  makeItemFlashbang(): Item {
    const item = new ItemGrenade(Models.items.get(ItemID.EXPLOSIVE_FLASHBANG), Models.items.get(ItemID.EXPLOSIVE_FLASHBANG_PRIMED));
    return item;
  }

  makeItemFryingPan(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_FRYING_PAN));
    return item;
  }

  makeItemGrenadeLauncher(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_GRENADE_LAUNCHER));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemGrenadeLauncherAmmo(): Item {
    const item = new ItemAmmo(Models.items.get(ItemID.AMMO_GRENADES));
    // because there is only 1 launcher per game
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemRandomCommonAmmo(): Item {
    // The six common ammo types, in the C#'s order and off one `Roll(0, 6)`.
    // The order is the C#'s and is load-bearing: it is a seeded generator, so
    // reordering the cases would move every common-ammo spawn in every run
    // generated from here on. The `default` throw is the C#'s
    // `InvalidOperationException` and is unreachable for a `Roll(0, 6)`.
    const roll = this.m_Game.rules.roll(0, 6);
    switch (roll) {
      case 0:
        return this.makeItemHeavyRifleAmmo();
      case 1:
        return this.makeItemPrecisionRifleAmmo();
      case 2:
        return this.makeItemLightPistolAmmo();
      case 3:
        return this.makeItemLightRifleAmmo();
      case 4:
        return this.makeItemHeavyPistolAmmo();
      case 5:
        return this.makeItemShotgunAmmo();
      default:
        throw new Error('unhandled roll');
    }
  }

  makeItemHockeyStick(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_HOCKEY_STICK));
    return item;
  }

  makeItemHolyHandGrenade(): Item {
    const model = Models.items.get(ItemID.EXPLOSIVE_HOLY_HAND_GRENADE);
    const item = new ItemGrenade(model, Models.items.get(ItemID.EXPLOSIVE_HOLY_HAND_GRENADE_PRIMED));
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemKatana(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_KATANA));
    return item;
  }

  makeItemKeyboard(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_KEYBOARD));
    return item;
  }

  makeItemKitchenKnife(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_KITCHEN_KNIFE));
    return item;
  }

  makeItemLargeMedikit(): Item {
    const item = new ItemMedicine(Models.items.get(ItemID.MEDICINE_LARGE_MEDIKIT));
    return item;
  }

  makeItemLitFlare(): Item {
    const item = new ItemLight(Models.items.get(ItemID.LIGHT_FLARE));
    return item;
  }

  makeItemLitGlowstick(): Item {
    const item = new ItemLight(Models.items.get(ItemID.LIGHT_GLOWSTICK));
    return item;
  }

  makeItemMace(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_MACE));
    return item;
  }

  makeItemMachete(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_MACHETE));
    return item;
  }

  makeItemMinigun(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_MINIGUN));
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemMinigunAmmo(): Item {
    const item = new ItemAmmo(Models.items.get(ItemID.AMMO_MINIGUN));
    // because there is only 1 minigun per game
    item.isForbiddenToAI = true;
    return item;
  }

  makeItemMolotov(): Item {
    const item = new ItemGrenade(Models.items.get(ItemID.EXPLOSIVE_MOLOTOV), Models.items.get(ItemID.EXPLOSIVE_MOLOTOV_PRIMED));
    return item;
  }

  makeItemNailGun(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_NAIL_GUN));
    return item;
  }

  makeItemNailGunAmmo(): Item {
    return new ItemAmmo(Models.items.get(ItemID.AMMO_NAILS));
  }

  makeItemNightVisionGoggles(): Item {
    const item = new ItemLight(Models.items.get(ItemID.LIGHT_NIGHT_VISION));
    return item;
  }

  makeItemNunchaku(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_NUNCHAKU));
    return item;
  }

  makeItemPickaxe(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_PICKAXE));
    return item;
  }

  makeItemPipeWrench(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_PIPE_WRENCH));
    return item;
  }

  makeItemPitchFork(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_PITCH_FORK));
    return item;
  }

  makeItemRawChicken(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_RAW_CHICKEN) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemRawDogMeat(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_RAW_DOG_MEAT) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemRawFish(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_RAW_FISH) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemRawHumanFlesh(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_RAW_HUMAN_FLESH) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemRawRabbit(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_RAW_RABBIT) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemRevolver(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_REVOLVER));
    return item;
  }

  makeItemSMG(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_SMG));
    return item;
  }

  makeItemScimitar(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SCIMITAR));
    return item;
  }

  makeItemScythe(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SCYTHE));
    return item;
  }

  makeItemSickle(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SICKLE));
    return item;
  }

  makeItemSmallMedikit(): Item {
    const model = Models.items.get(ItemID.MEDICINE_SMALL_MEDIKIT);
    const item = new ItemMedicine(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemSmokeGrenade(): Item {
    const model = Models.items.get(ItemID.EXPLOSIVE_SMOKE_GRENADE);
    const item = new ItemGrenade(model, Models.items.get(ItemID.EXPLOSIVE_SMOKE_GRENADE_PRIMED));
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemSnackBar(): Item {
    const model = Models.items.get(ItemID.FOOD_SNACK_BAR);
    const item = new ItemFood(model);
    item.quantity = this.m_Rules.roll(1, model.stackingLimit);
    return item;
  }

  makeItemSpear(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SPEAR));
    return item;
  }

  makeItemSpikedMace(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_SPIKED_MACE));
    return item;
  }

  makeItemStandardAxe(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_STANDARD_AXE));
    return item;
  }

  makeItemStunGun(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_STUN_GUN));
    return item;
  }

  makeItemTacticalShotgun(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_TACTICAL_SHOTGUN));
    return item;
  }

  makeItemTennisRacket(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_TENNIS_RACKET));
    return item;
  }

  makeItemVegetables(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_VEGETABLES) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  makeItemVintagePistol(): Item {
    const item = new ItemRangedWeapon(Models.items.get(ItemID.RANGED_VINTAGE_PISTOL));
    return item;
  }

  // replaces Jason Myer's axe
  makeItemBonesaw(): Item {
    const item = new ItemMeleeWeapon(Models.items.get(ItemID.MELEE_BONESAW));
    // `IsUnique = true`, as the C# has it. The bonesaw is the deranged patient's
    // own weapon and there is exactly one of him, so the flag is what stops a second
    // copy being treated as the unique item it is.
    item.isUnique = true;
    return item;
  }

  makeItemWildBerries(): Item {
    // FIXME: should be map local time. As makeItemGroceries.
    const timeNow = Session.get().worldTime.turnCounter;
    const model = Models.items.get(ItemID.FOOD_WILD_BERRIES) as ItemFoodModel;
    const max = WorldTime.TURNS_PER_DAY * model.bestBeforeDays;
    const min = Math.floor(max / 2);
    const freshUntil = timeNow + this.m_Rules.roll(min, max);
    return new ItemFood(model, freshUntil);
  }

  // ── Still Alive factories ──────────────────────────────────────────────────
  //
  // Transcribed from the fork's MakeItem* by scripts/port-item-factories.py.
  // The bodies were near-identical one-liners there, which is exactly why
  // they are generated rather than retyped: a katana that spawns as a
  // ranged weapon, or a molotov with no primed sprite, would be invisible.
  //
  // Five C# property names are a suffix of more than one ItemID, so the choice
  // is written down in the script's OVERRIDES rather than guessed. It was
  // guessed at first, and `KATANA` picked `UNIQUE_FAMU_FATARU_KATANA` -- the
  // sword you win from a unique NPC, spawned by a factory that means to hand
  // out a shop katana. Every field was a valid item and it was the wrong one.
  //
  // Absent, because the item does not exist in the port yet: the still-Alive-only
  // items with no
  // merged CSV row -- matches, sleeping bag,
  // flares kit, glowstick box, candle box, vegetable seeds,
  // police riot shield. Also the four
  // roll-and-branch bodies (beer, alcohol, liquor-for-molotov and the two
  // random-weapon pickers), which are content decisions about what a
  // "random antique weapon" is rather than transliterations.
  //
  // The 6 Ammo ids and the 5 backpacks were on that list and are not any more.
  // The ammo landed with the factories that make them (the callers in
  // `BaseTownGenerator` are still absent, which is the narrower truth now), and
  // the backpacks are made by `makeBackpack` in `gameplay/Backpacks.ts` rather
  // than by five factories here — a deliberate collapse, so there is one place a
  // pack can come into being and that place answers `null` under Classic. Three of
  // the five models now have a placement site; the hiking pack and the army
  // rucksack do not, and `tests/shelter-backpacks-placement.test.ts` says why.
  //
  // Nothing calls most of these yet: the town generators still place only the
  // vanilla set. They exist so the spawn wiring is a one-line change per item.

  // ── Common tasks ──────────────────────────────────────────────────────────

  protected barricadeDoors(map: GameMap, rect: Rect, barricadeLevel: number): void {
    barricadeLevel = Math.min(Rules.BARRICADING_MAX, barricadeLevel);

    for (let x = rect.left; x < rect.right; x++) {
      for (let y = rect.top; y < rect.bottom; y++) {
        const obj = map.getMapObjectAt(x, y);
        if (!(obj instanceof DoorWindow)) continue;
        obj.barricadePoints = barricadeLevel;
      }
    }
  }

  // ── Zones ─────────────────────────────────────────────────────────────────

  protected makeUniqueZone(basename: string, rect: Rect): Zone {
    const name = `${basename}@${rect.left + Math.floor(rect.width / 2)}-${rect.top + Math.floor(rect.height / 2)}`;
    return new Zone(name, rect);
  }
}

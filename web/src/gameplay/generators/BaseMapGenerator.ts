/**
 * BaseMapGenerator.
 * Ported from src/Gameplay/Generators/BaseMapGenerator.cs
 *
 * Shared helpers for all map generators: actor dressing/naming/skills,
 * common map objects, common items and small map tasks.
 */

import type { Actor } from '@data/Actor';
import { DollPart } from '@data/Doll';
import { Item } from '@data/Item';
import { Models } from '@data/Models';
import { Map as GameMap } from '@data/Map';
import { MapObject } from '@data/MapObject';
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
import { ItemGrenade } from '@engine/items/ItemExplosive';
import { ItemLight } from '@engine/items/ItemLight';
import { ItemMedicine } from '@engine/items/ItemMedicine';
import { ItemTracker } from '@engine/items/ItemTracker';
import { ItemTrap } from '@engine/items/ItemTrap';
import { DoorWindow, Fortification, PowerGenerator, Board } from '@engine/mapobjects/MapObjects';
import { GameImages } from '@gameplay/GameImages';
import { GangID } from '@gameplay/GameGangs';
import { ItemID } from '@gameplay/GameItems';
import { SkillID, Skills } from '@gameplay/Skills';

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

  private static readonly BIKER_HEADS = [GameImages.BIKER_HAIR1, GameImages.BIKER_HAIR2, GameImages.BIKER_HAIR3];
  private static readonly BIKER_LEGS = [GameImages.BIKER_PANTS];
  private static readonly BIKER_SHOES = [GameImages.BIKER_SHOES];

  private static readonly CHARGUARD_HEADS = [GameImages.CHARGUARD_HAIR];
  private static readonly CHARGUARD_LEGS = [GameImages.CHARGUARD_PANTS];

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
      this.dressCivilian(
        roller,
        actor,
        male ? BaseMapGenerator.MALE_EYES : BaseMapGenerator.FEMALE_EYES,
        male ? BaseMapGenerator.MALE_SKINS : BaseMapGenerator.FEMALE_SKINS,
        male ? BaseMapGenerator.MALE_HEADS : BaseMapGenerator.FEMALE_HEADS,
        male ? BaseMapGenerator.MALE_TORSOS : BaseMapGenerator.FEMALE_TORSOS,
        male ? BaseMapGenerator.MALE_LEGS : BaseMapGenerator.FEMALE_LEGS,
        male ? BaseMapGenerator.MALE_SHOES : BaseMapGenerator.FEMALE_SHOES
      );
      return;
    }
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, eyes[roller.roll(0, eyes.length)]);
    actor.doll.addDecoration(DollPart.SKIN, skins[roller.roll(0, skins.length)]);
    actor.doll.addDecoration(DollPart.HEAD, heads[roller.roll(0, heads.length)]);
    actor.doll.addDecoration(DollPart.TORSO, torsos[roller.roll(0, torsos.length)]);
    actor.doll.addDecoration(DollPart.LEGS, legs[roller.roll(0, legs.length)]);
    actor.doll.addDecoration(DollPart.FEET, shoes[roller.roll(0, shoes.length)]);
  }

  skinNakedHuman(roller: DiceRoller, actor: Actor, eyes?: string[], skins?: string[], heads?: string[]): void {
    if (!eyes || !skins || !heads) {
      const male = actor.model.dollBody.isMale;
      this.skinNakedHuman(
        roller,
        actor,
        male ? BaseMapGenerator.MALE_EYES : BaseMapGenerator.FEMALE_EYES,
        male ? BaseMapGenerator.MALE_SKINS : BaseMapGenerator.FEMALE_SKINS,
        male ? BaseMapGenerator.MALE_HEADS : BaseMapGenerator.FEMALE_HEADS
      );
      return;
    }
    actor.doll.removeAllDecorations();
    actor.doll.addDecoration(DollPart.EYES, eyes[roller.roll(0, eyes.length)]);
    actor.doll.addDecoration(DollPart.SKIN, skins[roller.roll(0, skins.length)]);
    actor.doll.addDecoration(DollPart.HEAD, heads[roller.roll(0, heads.length)]);
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

  protected makeObjIronFence(fenceImageID: string): MapObject {
    const fence = new MapObject('iron fence', fenceImageID);
    fence.isMaterialTransparent = true;
    fence.isAn = true;
    return fence;
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

  private static readonly CARS = [GameImages.OBJ_CAR1, GameImages.OBJ_CAR2, GameImages.OBJ_CAR3, GameImages.OBJ_CAR4];

  /**
   * Makes a new wrecked car : transparent, not walkable but jumpable, movable.
   * Passing a DiceRoller picks a random car model.
   */
  protected makeObjWreckedCar(carOrRoller: DiceRoller | string): MapObject {
    const carImageID =
      typeof carOrRoller === 'string'
        ? carOrRoller
        : BaseMapGenerator.CARS[carOrRoller.roll(0, BaseMapGenerator.CARS.length)];
    const car = new MapObject('wrecked car', carImageID);
    car.breakState = 2 /* MapObjectBreak.BROKEN */;
    car.isMaterialTransparent = true;
    car.jumpLevel = 1;
    car.isMovable = true;
    car.weight = 100;
    car.standOnFovBonus = true;
    return car;
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
    for (let x = rect.left; x < rect.right; x++) {
      for (let y = rect.top; y < rect.bottom; y++) {
        const tile = map.getTileAt(x, y);
        if (!tile) continue;
        if (tile.model.isWalkable) continue;
        if (tile.isInside) continue;

        const deco = decoFn(x, y);
        if (deco) tile.addDecoration(deco);
      }
    }
  }

  // ── Common items ──────────────────────────────────────────────────────────

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

  makeItemArmyRifle(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_ARMY_RIFLE));
  }

  makeItemPrecisionRifle(): Item {
    return new ItemRangedWeapon(Models.items.get(ItemID.RANGED_PRECISION_RIFLE));
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

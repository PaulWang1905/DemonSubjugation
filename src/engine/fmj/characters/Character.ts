// Port of fmj/characters/Character.kt
import { ResBase } from "../lib/ResBase";
import { Canvas, Point } from "../../graphics";
import { Direction } from "./Direction";
import type { WalkingSprite } from "./WalkingSprite";

export enum CharacterState {
  /** Not driven. */
  STOP = 0,
  /** Forced movement (behaves like WALKING). */
  FORCE_MOVE = 1,
  /** Patrol: walks around freely. */
  WALKING = 2,
  /** Paused; turns into WALKING after the delay. */
  PAUSE = 3,
  /** Animates in place without moving (e.g. lamps). */
  ACTIVE = 4,
}

export function stateFromInt(v: number): CharacterState {
  if (v >= 0 && v <= 4) return v as CharacterState;
  console.warn("State.fromInt invalid v=" + v);
  return CharacterState.STOP;
}

export abstract class Character extends ResBase {
  name = "";
  state = CharacterState.STOP;
  /** Position in the map (tiles). */
  readonly posInMap = new Point();
  private _direction = Direction.South;
  private mWalkingSprite: WalkingSprite | null = null;

  get direction(): Direction {
    return this._direction;
  }
  set direction(d: Direction) {
    this._direction = d;
    this.mWalkingSprite!.setDirection(d);
  }

  get walkingSpriteId(): number {
    return this.mWalkingSprite!.id;
  }

  /** 0 = left foot, 1 = standing, 2 = right foot */
  get step(): number {
    return this.mWalkingSprite!.step;
  }
  set step(s: number) {
    this.mWalkingSprite!.step = s;
  }

  setPosInMap(x: number, y: number): void {
    this.posInMap.set(x, y);
  }

  getPosOnScreen(posMapScreen: Point): Point {
    return new Point(this.posInMap.x - posMapScreen.x, this.posInMap.y - posMapScreen.y);
  }

  setPosOnScreen(x: number, y: number, posMapScreen: Point): void {
    this.posInMap.set(x + posMapScreen.x, y + posMapScreen.y);
  }

  setWalkingSprite(sprite: WalkingSprite): void {
    this.mWalkingSprite = sprite;
    sprite.setDirection(this._direction);
  }

  /** Walk one tile; with `d`, turn first when needed. */
  walk(d?: Direction): void {
    if (d === undefined) {
      this.mWalkingSprite!.walk();
      this.updatePosInMap(this._direction);
      return;
    }
    if (d === this._direction) {
      this.mWalkingSprite!.walk();
    } else {
      this.mWalkingSprite!.walkTo(d);
      this.direction = d;
    }
    this.updatePosInMap(d);
  }

  private updatePosInMap(d: Direction): void {
    switch (d) {
      case Direction.East: this.posInMap.x++; break;
      case Direction.West: this.posInMap.x--; break;
      case Direction.North: this.posInMap.y--; break;
      case Direction.South: this.posInMap.y++; break;
    }
  }

  /** Step in place; with `d`, turn to face it. */
  walkStay(d?: Direction): void {
    if (d === undefined) {
      this.mWalkingSprite!.walk();
      return;
    }
    if (d === this._direction) {
      this.mWalkingSprite!.walk();
    } else {
      this.mWalkingSprite!.walkTo(d);
      this.direction = d;
    }
  }

  drawWalkingSprite(canvas: Canvas, posMapScreen: Point): void {
    const p = this.getPosOnScreen(posMapScreen);
    this.mWalkingSprite!.draw(canvas, p.x * 16, p.y * 16);
  }
}

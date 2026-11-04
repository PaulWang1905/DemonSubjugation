// Port of fmj/characters/FightingCharacter.kt
import type { BaseMagic } from "../magic/BaseMagic";
import type { ResMagicChain } from "../magic/ResMagicChain";
import { Character } from "./Character";
import type { FightingSprite } from "./FightingSprite";

const INT_MAX = 2147483647;

export abstract class FightingCharacter extends Character {
  static readonly BUFF_MASK_ALL = 16;
  static readonly BUFF_MASK_DU = 8; // poison
  static readonly BUFF_MASK_LUAN = 4; // confusion
  static readonly BUFF_MASK_FENG = 2; // seal
  static readonly BUFF_MASK_MIAN = 1; // sleep
  static readonly BUFF_MASK_GONG = 32;
  static readonly BUFF_MASK_FANG = 64;
  static readonly BUFF_MASK_SU = 128;

  fightingSprite: FightingSprite | null = null;
  magicChain: ResMagicChain | null = null;
  level = 0;
  isVisiable = true;

  private _maxHP = 0;
  private _maxMP = 0;
  private _hp = 0;
  private _mp = 0;
  private _attack = 0;
  private _defend = 0;
  private _speed = 0;
  private _lingli = 0;
  private _luck = 0;

  get maxHP(): number { return this._maxHP; }
  set maxHP(v: number) { this._maxHP = Math.min(999, v); }
  get maxMP(): number { return this._maxMP; }
  set maxMP(v: number) { this._maxMP = Math.min(999, v); }
  get hp(): number { return this._hp; }
  set hp(v: number) { this._hp = Math.min(this._maxHP, v); }
  get mp(): number { return this._mp; }
  set mp(v: number) { this._mp = Math.min(this._maxMP, v); }
  get attack(): number { return this._attack; }
  set attack(v: number) { this._attack = Math.min(999, v); }
  get defend(): number { return this._defend; }
  set defend(v: number) { this._defend = Math.min(999, v); }
  get speed(): number { return this._speed; }
  set speed(v: number) { this._speed = Math.min(99, v); }
  get lingli(): number { return this._lingli; }
  set lingli(v: number) { this._lingli = Math.min(99, v); }
  get luck(): number { return this._luck; }
  set luck(v: number) { this._luck = Math.min(99, v); }

  get isAlive(): boolean { return this.hp > 0; }

  /** Centre coordinates in combat. */
  get combatX(): number { return this.fightingSprite!.combatX; }
  get combatY(): number { return this.fightingSprite!.combatY; }
  get combatLeft(): number { return this.fightingSprite!.combatX - Math.trunc(this.fightingSprite!.width / 2); }
  get combatTop(): number { return this.fightingSprite!.combatY - Math.trunc(this.fightingSprite!.height / 2); }

  /** Immunities to poison/confusion/seal/sleep (stacked by equipment). */
  private mBuff = new Int32Array(4);
  private mBuffRound = new Int32Array(4);
  /** Afflicted poison/confusion/seal/sleep. */
  private mDebuff = 0;
  private mDebuffRound = new Int32Array(4);
  /** Statuses inflicted by normal attacks. */
  protected mAtbuff = 0;
  private mAtbuffRound = new Int32Array(4);

  setCombatPos(x: number, y: number): void {
    this.fightingSprite!.setCombatPos(x, y);
  }

  hasBuff(mask: number): boolean {
    const F = FightingCharacter;
    const b = this.mBuff as unknown as (number | undefined)[];
    if ((mask & F.BUFF_MASK_DU) === F.BUFF_MASK_DU && (b[0] as number) <= 0) return false;
    if ((mask & F.BUFF_MASK_LUAN) === F.BUFF_MASK_LUAN && (b[1] as number) <= 0) return false;
    if ((mask & F.BUFF_MASK_FENG) === F.BUFF_MASK_FENG && (b[2] as number) <= 0) return false;
    if ((mask & F.BUFF_MASK_MIAN) === F.BUFF_MASK_MIAN && (b[3] as number) <= 0) return false;
    // mBuff[4] is out of range (undefined) in the original, so this never fails.
    if ((mask & F.BUFF_MASK_ALL) === F.BUFF_MASK_ALL && (b[4] as number) <= 0) return false;
    return true;
  }

  /** True for party members (overridden by Player). */
  get isPlayer(): boolean {
    return false;
  }

  /** Chose Defend this round (cleared when the next round starts). */
  defending = false;

  /** Poisoned, confused, sealed or asleep. */
  get hasAilment(): boolean {
    return (this.mDebuff & 0x0f) !== 0;
  }

  hasDebuff(mask: number): boolean {
    return (this.mDebuff & mask) !== 0;
  }

  hasAtbuff(mask: number): boolean {
    return (this.mAtbuff & mask) === mask;
  }

  addBuff(mask: number, rounds = INT_MAX): void {
    const F = FightingCharacter;
    if ((mask & F.BUFF_MASK_DU) === F.BUFF_MASK_DU) { ++this.mBuff[0]; this.mBuffRound[0] = rounds; }
    if ((mask & F.BUFF_MASK_LUAN) === F.BUFF_MASK_LUAN) { ++this.mBuff[1]; this.mBuffRound[1] = rounds; }
    if ((mask & F.BUFF_MASK_FENG) === F.BUFF_MASK_FENG) { ++this.mBuff[2]; this.mBuffRound[2] = rounds; }
    if ((mask & F.BUFF_MASK_MIAN) === F.BUFF_MASK_MIAN) { ++this.mBuff[3]; this.mBuffRound[3] = rounds; }
  }

  delBuff(mask: number): void {
    const F = FightingCharacter;
    const masks = [F.BUFF_MASK_DU, F.BUFF_MASK_LUAN, F.BUFF_MASK_FENG, F.BUFF_MASK_MIAN];
    for (let i = 0; i < 4; i++) {
      if ((mask & masks[i]) === masks[i]) {
        if (--this.mBuff[i] < 0) this.mBuff[i] = 0;
      }
    }
  }

  getBuffRound(mask: number): number {
    const F = FightingCharacter;
    if ((mask & F.BUFF_MASK_DU) === F.BUFF_MASK_DU) return this.mBuffRound[0];
    if ((mask & F.BUFF_MASK_LUAN) === F.BUFF_MASK_LUAN) return this.mBuffRound[1];
    if ((mask & F.BUFF_MASK_FENG) === F.BUFF_MASK_FENG) return this.mBuffRound[2];
    if ((mask & F.BUFF_MASK_MIAN) === F.BUFF_MASK_MIAN) return this.mBuffRound[3];
    return 0;
  }

  addDebuff(mask: number, rounds: number): void {
    const F = FightingCharacter;
    this.mDebuff |= mask;
    if ((mask & F.BUFF_MASK_DU) === F.BUFF_MASK_DU) this.mDebuffRound[0] = rounds;
    if ((mask & F.BUFF_MASK_LUAN) === F.BUFF_MASK_LUAN) this.mDebuffRound[1] = rounds;
    if ((mask & F.BUFF_MASK_FENG) === F.BUFF_MASK_FENG) this.mDebuffRound[2] = rounds;
    if ((mask & F.BUFF_MASK_MIAN) === F.BUFF_MASK_MIAN) this.mDebuffRound[3] = rounds;
  }

  delDebuff(mask: number): void {
    this.mDebuff &= ~mask;
  }

  addAtbuff(mask: number, rounds: number): void {
    const F = FightingCharacter;
    this.mAtbuff |= mask;
    if ((mask & F.BUFF_MASK_DU) === F.BUFF_MASK_DU) this.mAtbuffRound[0] = rounds;
    if ((mask & F.BUFF_MASK_LUAN) === F.BUFF_MASK_LUAN) this.mAtbuffRound[1] = rounds;
    if ((mask & F.BUFF_MASK_FENG) === F.BUFF_MASK_FENG) this.mAtbuffRound[2] = rounds;
    if ((mask & F.BUFF_MASK_MIAN) === F.BUFF_MASK_MIAN) this.mAtbuffRound[3] = rounds;
  }

  delAtbuff(mask: number): void {
    this.mAtbuff &= ~mask;
  }

  getAllMagics(): BaseMagic[] {
    return this.magicChain?.getAllLearntMagics() ?? [];
  }
}

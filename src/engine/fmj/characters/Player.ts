// Port of fmj/characters/Player.kt
import type { GoodsEquipment } from "../goods/GoodsEquipment";
import { T } from "../i18n";
import { GoodsManage } from "../goods/GoodsManage";
import { TextRender } from "../graphics/TextRender";
import { Util } from "../graphics/Util";
import { DatLib, ResType } from "../lib/DatLib";
import { ResBase } from "../lib/ResBase";
import type { ResImage } from "../lib/ResImage";
import type { BaseMagic } from "../magic/BaseMagic";
import type { Canvas } from "../../graphics";
import type { Coder, ObjectInput, ObjectOutput } from "../../java";
import { directionFromInt } from "./Direction";
import { FightingCharacter } from "./FightingCharacter";
import { FightingSprite } from "./FightingSprite";
import { ResLevelupChain } from "./ResLevelupChain";
import { WalkingSprite } from "./WalkingSprite";

export class Player extends FightingCharacter implements Coder {
  /** Equipment types of the slots, left to right on the equipment screen. */
  static readonly sEquipTypes = [6, 6, 5, 3, 7, 2, 4, 1];
  static sGoodsList = new GoodsManage();
  static sMoney = 0;

  private mImgHead: ResImage | null = null;
  levelupChain!: ResLevelupChain;
  currentExp = 0;
  /** 0/1 decorations, 2 bracers, 3 boots, 4 hand-held, 5 body, 6 cape, 7 head */
  readonly equipmentsArray: (GoodsEquipment | null)[] = [null, null, null, null, null, null, null, null];
  privateLearntMagics: BaseMagic[] = [];

  drawHead(canvas: Canvas, x: number, y: number): void {
    this.mImgHead?.draw(canvas, 1, x, y);
  }

  setFrameByState(): void {
    if (this.isAlive) {
      if (this.hasDebuff(FightingCharacter.BUFF_MASK_MIAN) || this.hp < Math.trunc(this.maxHP / 10)) {
        this.fightingSprite!.currentFrame = 11;
      } else {
        this.fightingSprite!.currentFrame = 1;
      }
    } else {
      this.fightingSprite!.currentFrame = 12;
    }
  }

  private loadLevelupChain(): void {
    this.levelupChain = (DatLib.getRes(ResType.MLR, 2, this.index, true) as ResLevelupChain | null) ?? new ResLevelupChain();
  }

  setData(buf: Int8Array, offset: number): void {
    const g2 = ResBase.get2BytesInt;
    this.type = buf[offset] & 0xff;
    this.index = buf[offset + 1] & 0xff;
    if (this.index > 0) this.mImgHead = DatLib.getRes(ResType.PIC, 1, this.index) as ResImage | null;
    this.setWalkingSprite(new WalkingSprite(this.type, buf[offset + 0x16] & 0xff));
    this.fightingSprite = new FightingSprite(ResType.PIC, this.index);
    this.direction = directionFromInt(buf[offset + 2] & 0xff);
    this.step = buf[offset + 3] & 0xff;
    this.setPosInMap(buf[offset + 5] & 0xff, buf[offset + 6] & 0xff);
    this.magicChain = DatLib.getMlr(1, buf[offset + 0x17] & 0xff, true);
    if (this.magicChain) this.magicChain.learnNum = buf[offset + 9] & 0xff;
    this.name = ResBase.getString(buf, offset + 0x0a);
    this.level = buf[offset + 0x20] & 0xff;
    this.maxHP = g2(buf, offset + 0x26);
    this.hp = g2(buf, offset + 0x28);
    this.maxMP = g2(buf, offset + 0x2a);
    this.mp = g2(buf, offset + 0x2c);
    this.attack = g2(buf, offset + 0x2e);
    this.defend = g2(buf, offset + 0x30);
    this.speed = buf[offset + 0x36] & 0xff;
    this.lingli = buf[offset + 0x37] & 0xff;
    this.luck = buf[offset + 0x38] & 0xff;
    this.currentExp = g2(buf, offset + 0x32);
    this.loadLevelupChain();

    // [slot, byte offset, goods type]
    const slots: [number, number, number][] = [
      [0, 0x1e, 6],
      [1, 0x1f, 6],
      [2, 0x1b, 5],
      [3, 0x1d, 3],
      [4, 0x1c, 7],
      [5, 0x19, 2],
      [6, 0x1a, 4],
      [7, 0x18, 1],
    ];
    for (const [slot, off, gtype] of slots) {
      const tmp = buf[offset + off] & 0xff;
      if (tmp !== 0) {
        this.equipmentsArray[slot] = DatLib.getRes(ResType.GRS, gtype, tmp) as unknown as GoodsEquipment | null;
      }
    }
  }

  getCurrentEquipment(type: number): GoodsEquipment | null {
    for (let i = 0; i <= 7; i++) {
      if (Player.sEquipTypes[i] === type) return this.equipmentsArray[i];
    }
    return null;
  }

  /** Whether this equipment is worn (for decorations: checks the first slot, as the original does). */
  hasEquipt(type: number, id: number): boolean {
    if (type === 6) {
      const e = this.equipmentsArray[0];
      return e != null && e.type === type && e.index === id;
    }
    for (let i = 2; i <= 7; i++) {
      const e = this.equipmentsArray[i];
      if (e && e.type === type && e.index === id) return true;
    }
    return false;
  }

  putOn(goods: GoodsEquipment): void {
    for (let i = 0; i <= 7; i++) {
      if (goods.type === Player.sEquipTypes[i] && this.equipmentsArray[i] == null) {
        goods.putOn(this);
        this.equipmentsArray[i] = goods;
        break;
      }
    }
  }

  takeOff(type: number): void {
    for (let i = 0; i <= 7; i++) {
      if (type === Player.sEquipTypes[i] && this.equipmentsArray[i] != null) {
        this.equipmentsArray[i]!.takeOff(this);
        this.equipmentsArray[i] = null;
        break;
      }
    }
  }

  hasSpace(type: number): boolean {
    if (type === 6) return this.equipmentsArray[0] == null || this.equipmentsArray[1] == null;
    for (let i = 0; i <= 7; i++) {
      if (Player.sEquipTypes[i] === type && this.equipmentsArray[i] == null) return true;
    }
    return false;
  }

  drawState(canvas: Canvas, page: number): void {
    canvas.drawLine(37, 10, 37, 87, Util.sBlackPaint);
    if (page === 0) {
      TextRender.drawText(canvas, `${T.statLevel}${this.level}`, 41, 4);
      TextRender.drawText(canvas, `${T.statHP}${this.hp}/${this.maxHP}`, 41, 23);
      TextRender.drawText(canvas, `${T.statMP}${this.mp}/${this.maxMP}`, 41, 41);
      TextRender.drawText(canvas, `${T.statAttack}${this.attack}`, 41, 59);
      TextRender.drawText(canvas, `${T.statDefend}${this.defend}`, 41, 77);
    } else if (page === 1) {
      TextRender.drawText(canvas, T.statExp, 41, 4);
      const w = Util.drawSmallNum(canvas, this.currentExp, 97, 4);
      TextRender.drawText(canvas, "/", 97 + w + 2, 4);
      Util.drawSmallNum(canvas, this.levelupChain.getNextLevelExp(this.level), 97 + w + 9, 10);
      TextRender.drawText(canvas, `${T.statSpeed}${this.speed}`, 41, 23);
      TextRender.drawText(canvas, `${T.statSpirit}${this.lingli}`, 41, 41);
      TextRender.drawText(canvas, `${T.statLuck}${this.luck}`, 41, 59);
      let tmp = "";
      if (this.hasBuff(FightingCharacter.BUFF_MASK_DU)) tmp += T.stPoison;
      if (this.hasBuff(FightingCharacter.BUFF_MASK_LUAN)) tmp += T.stConfuse;
      if (this.hasBuff(FightingCharacter.BUFF_MASK_FENG)) tmp += T.stSeal;
      if (this.hasBuff(FightingCharacter.BUFF_MASK_MIAN)) tmp += T.stSleep;
      TextRender.drawText(canvas, T.statImmune + (tmp.length > 0 ? tmp : T.statNone), 41, 77);
    }
  }

  decode(coder: ObjectInput): void {
    this.type = coder.readInt();
    this.index = coder.readInt();
    if (this.index > 0) this.mImgHead = DatLib.getRes(ResType.PIC, 1, this.index) as ResImage | null;
    this.loadLevelupChain();
    this.setWalkingSprite(new WalkingSprite(this.type, coder.readInt()));
    this.fightingSprite = new FightingSprite(ResType.PIC, this.index);
    this.direction = directionFromInt(coder.readInt());
    this.step = coder.readInt();
    this.setPosInMap(coder.readInt(), coder.readInt());
    this.magicChain = DatLib.getMlr(1, coder.readInt(), true);
    const learnNum = coder.readInt();
    if (this.magicChain) this.magicChain.learnNum = learnNum;
    this.name = coder.readString();
    this.level = coder.readInt();
    this.maxHP = coder.readInt();
    this.hp = coder.readInt();
    this.maxMP = coder.readInt();
    this.mp = coder.readInt();
    this.attack = coder.readInt();
    this.defend = coder.readInt();
    this.speed = coder.readInt();
    this.lingli = coder.readInt();
    this.luck = coder.readInt();
    this.currentExp = coder.readInt();
    for (let i = 0; i <= 7; i++) {
      const type = coder.readInt();
      const index = coder.readInt();
      if (type !== 0 && index !== 0) {
        this.equipmentsArray[i] = DatLib.getRes(ResType.GRS, type, index) as unknown as GoodsEquipment | null;
      }
    }
    const size = coder.readInt();
    for (let i = 0; i < size; i++) {
      const type = coder.readInt();
      const index = coder.readInt();
      this.privateLearntMagics.push(DatLib.getMrs(type, index));
    }
  }

  encode(out: ObjectOutput): void {
    out.writeInt(this.type);
    out.writeInt(this.index);
    out.writeInt(this.walkingSpriteId);
    out.writeInt(this.direction);
    out.writeInt(this.step);
    out.writeInt(this.posInMap.x);
    out.writeInt(this.posInMap.y);
    out.writeInt(this.magicChain?.index ?? 0);
    // The original skipped this field without a magic chain, which made such
    // saves unreadable; always writing it keeps decode() in sync.
    out.writeInt(this.magicChain?.learnNum ?? 0);
    out.writeString(this.name);
    out.writeInt(this.level);
    out.writeInt(this.maxHP);
    out.writeInt(this.hp);
    out.writeInt(this.maxMP);
    out.writeInt(this.mp);
    out.writeInt(this.attack);
    out.writeInt(this.defend);
    out.writeInt(this.speed);
    out.writeInt(this.lingli);
    out.writeInt(this.luck);
    out.writeInt(this.currentExp);
    for (let i = 0; i <= 7; i++) {
      const e = this.equipmentsArray[i];
      out.writeInt(e ? e.type : 0);
      out.writeInt(e ? e.index : 0);
    }
    out.writeInt(this.privateLearntMagics.length);
    for (const m of this.privateLearntMagics) {
      out.writeInt(m.type);
      out.writeInt(m.index);
    }
  }

  setLevel(level: number): void {
    this.level = Math.min(level, this.levelupChain.maxLevel);
  }

  getAllMagics(): BaseMagic[] {
    return [...this.privateLearntMagics, ...super.getAllMagics()];
  }

  learnMagic(magic: BaseMagic): void {
    this.privateLearntMagics.push(magic);
  }

  levelUp(to: number): void {
    if (to <= this.level) return;
    const cl = this.level;
    const c = this.levelupChain;
    this.level = to;
    this.maxHP = this.maxHP + c.getMaxHP(to) - c.getMaxHP(cl);
    this.hp = this.maxHP;
    this.maxMP = this.maxMP + c.getMaxMP(to) - c.getMaxMP(cl);
    this.mp = this.maxMP;
    this.attack = this.attack + c.getAttack(to) - c.getAttack(cl);
    this.defend = this.defend + c.getDefend(to) - c.getDefend(cl);
    if (this.magicChain) this.magicChain.learnNum = c.getLearnMagicNum(to);
    this.speed = this.speed + c.getSpeed(to) - c.getSpeed(cl);
    this.lingli = this.lingli + c.getLingli(to) - c.getLingli(cl);
    this.luck = this.luck + c.getLuck(to) - c.getLuck(cl);
  }
}

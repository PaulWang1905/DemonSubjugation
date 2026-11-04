// Port of fmj/combat/Combat.kt — battle controller (random and scripted fights).
import { EngineSettings } from "../config/EngineSettings";
import { Global, ScreenViewType } from "../Global";
import { FightingCharacter } from "../characters/FightingCharacter";
import type { Monster } from "../characters/Monster";
import { Player } from "../characters/Player";
import type { BaseGoods } from "../goods/BaseGoods";
import { GoodsManage } from "../goods/GoodsManage";
import { DatLib, ResType } from "../lib/DatLib";
import type { ResImage } from "../lib/ResImage";
import type { ResSrs } from "../lib/ResSrs";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Bitmap, Canvas, Point } from "../../graphics";
import { Random, type ObjectInput, type ObjectOutput } from "../../java";
import { ActionExecutor } from "./ActionExecutor";
import type { Action } from "./actions/Action";
import { ActionCoopMagic } from "./actions/ActionCoopMagic";
import { ActionFlee } from "./actions/ActionFlee";
import { ActionPhysicalAttackAll } from "./actions/ActionPhysicalAttackAll";
import { ActionPhysicalAttackOne } from "./actions/ActionPhysicalAttackOne";
import { CombatSuccess } from "./ui/CombatSuccess";
import { CombatUI, type CombatUICallBack } from "./ui/CombatUI";

enum CombatState {
  SelectAction, // players choose actions
  PerformAction, // run the action queue, play animations
  Win,
  Loss,
  Exit,
}

const COMBAT_PROBABILITY = 20;
const sRandom = new Random();

/** Centre coordinates of the party members. */
const sPlayerPos = [new Point(64 + 12, 52 + 18), new Point(96 + 12, 48 + 18), new Point(128 + 12, 40 + 18)];

let sIsEnable = false;
let globalDisableFighting = false;
let sIsFighting = false;
let sInstance: Combat | null = null;
let sInstanceBk: Combat | null = null;
let sIsRandomFight = false;

export class Combat extends BaseScreen implements CombatUICallBack {
  private mScrb = 0;
  private mScrl = 0;
  private mScrR = 0;
  private mCombatState = CombatState.SelectAction;
  /** Debug view of the battle state. */
  get stateName(): string {
    return CombatState[this.mCombatState];
  }
  static get current(): Combat | null {
    return sInstance;
  }
  /** Auto-attack ("siege") mode. */
  private mIsAutoAttack = false;
  /** Both sides' decisions for the current round. */
  private readonly mActionQueue: Action[] = [];
  private readonly mActionExecutor: ActionExecutor;
  private readonly mCombatUI: CombatUI;
  /** Monster types that may appear in random fights. */
  private mMonsterType: number[] | null = null;
  private mMonsterList: Monster[] = [];
  private mPlayerList: Player[] = [];
  private mCurSelActionPlayerIndex = 0;
  private mRoundCnt = 0;
  private mHasEventExed = false;
  /** Max rounds, 0 = unlimited. */
  public mMaxRound = 0;
  private mEventRound: number[] | null = null;
  private mEventNum: number[] | null = null;
  private mLossAddr = 0;
  private mWinAddr = 0;
  private readonly mFlyPeach: ResSrs;
  private mIsWin = false;
  mBackground: Bitmap = new Bitmap(0, 0);
  private mWinMoney = 0;
  private mWinExp = 0;
  private mCombatSuccess: CombatSuccess | null = null;
  private mTimeCnt = 0;

  private constructor(readonly parent: GameNode) {
    super();
    this.mActionExecutor = new ActionExecutor(this.mActionQueue, this);
    this.mCombatUI = new CombatUI(this, this, 0);
    this.mFlyPeach = DatLib.getRes(ResType.SRS, 1, 249) as ResSrs;
  }

  private get isAnyPlayerAlive(): boolean {
    return this.mPlayerList.some((p) => p.hp > 0);
  }

  private get isAllMonsterDead(): boolean {
    return this.firstAliveMonster == null;
  }

  private get nextAlivePlayerIndex(): number {
    for (let i = this.mCurSelActionPlayerIndex + 1; i < this.mPlayerList.length; i++) {
      if (this.mPlayerList[i].isAlive) return i;
    }
    return -1;
  }

  private get preAlivePlayerIndex(): number {
    for (let i = this.mCurSelActionPlayerIndex - 1; i >= 0; i--) {
      if (this.mPlayerList[i].isAlive) return i;
    }
    return -1;
  }

  private get firstAlivePlayerIndex(): number {
    return this.mPlayerList.findIndex((p) => p.isAlive);
  }

  get firstAliveMonster(): Monster | null {
    return this.mMonsterList.find((m) => m.isAlive) ?? null;
  }

  get randomAlivePlayer(): Player | null {
    const alive = this.mPlayerList.filter((p) => p.isAlive);
    if (alive.length === 0) return null;
    return alive[sRandom.nextInt(alive.length)];
  }

  private createBackgroundBitmap(scrb: number, scrl: number, scrr: number): void {
    this.mBackground = Bitmap.createBitmap(160, 96);
    const canvas = new Canvas(this.mBackground);
    let img = DatLib.getRes(ResType.PIC, 4, scrb) as ResImage;
    img.draw(canvas, 1, 0, 0); // background
    img = DatLib.getRes(ResType.PIC, 4, scrl) as ResImage;
    img.draw(canvas, 1, 0, 96 - img.height); // bottom-left
    img = DatLib.getRes(ResType.PIC, 4, scrr) as ResImage;
    img.draw(canvas, 1, 160 - img.width, 0); // top-right
    this.mScrb = scrb;
    this.mScrl = scrl;
    this.mScrR = scrr;
  }

  private prepareForNewCombat(): void {
    this.mActionQueue.length = 0;
    this.mIsAutoAttack = false;
    this.mCombatState = CombatState.SelectAction;
    this.mCurSelActionPlayerIndex = 0;
    this.mPlayerList = this.game.playerList;

    this.mCombatUI.reset();
    this.mCombatUI.setCurrentPlayerIndex(0);
    this.mCombatUI.setMonsterList(this.mMonsterList);
    this.mCombatUI.setPlayerList(this.mPlayerList);

    this.setOriginalPlayerPos();
    this.setOriginalMonsterPos();
    this.mRoundCnt = 0;
    this.mHasEventExed = false;

    for (const p of this.mPlayerList) {
      if (p.hp <= 0) p.hp = 1;
      p.setFrameByState();
    }
    for (const m of this.mMonsterList) m.hp = m.maxHP;

    this.mWinMoney = 0;
    this.mWinExp = 0;
    for (const m of this.mMonsterList) {
      this.mWinMoney += m.money;
      this.mWinExp += m.exp;
    }

    if (!sIsRandomFight && this.mMonsterList.length === 1) {
      // Scripted fight with a single monster: keep it in the middle slot by
      // inserting an invisible one in front of it.
      const m = this.mMonsterList[0];
      const n = DatLib.getRes(ResType.ARS, m.type, m.index) as Monster;
      n.hp = -1;
      n.isVisiable = false;
      this.mMonsterList.unshift(n);
      this.setOriginalMonsterPos();
    }

    this.mFlyPeach.start();
    this.mFlyPeach.setIteratorNum(5);
  }

  private exitCurrentCombat(): void {
    if (!sIsRandomFight) {
      this.game.gotoAddress(this.mIsWin ? this.mWinAddr : this.mLossAddr);
      this.game.mainScene.scriptProcess.goonExecute = true;
      sIsRandomFight = true;
      sInstance = sInstanceBk;
      sInstanceBk = null;
    } else if (!this.mIsWin) {
      // party wiped out: game over
      this.game.changeScreen(ScreenViewType.SCREEN_MENU);
    }

    sIsFighting = false;
    this.mActionQueue.length = 0;
    this.mActionExecutor.reset();
    this.mCombatUI.reset();
    this.mIsAutoAttack = false;

    // Recover a little after the fight.
    for (const p of this.mPlayerList) {
      if (p.hp <= 0) p.hp = 1;
      if (p.mp <= 0) p.mp = 1;
      p.hp = p.hp + Math.trunc((p.maxHP - p.hp) / 10);
      p.mp = p.mp + Math.trunc(p.maxMP / 5);
      if (p.mp > p.maxMP) p.mp = p.maxMP;
    }
  }

  private setOriginalPlayerPos(): void {
    this.mPlayerList.forEach((p, i) => {
      const pos = sPlayerPos[i] ?? sPlayerPos[sPlayerPos.length - 1];
      p.setCombatPos(pos.x, pos.y);
    });
  }

  private setOriginalMonsterPos(): void {
    this.mMonsterList.forEach((m, i) => m.setOriginalCombatPos(i));
  }

  update(delta: number): void {
    this.mTimeCnt += delta;
    switch (this.mCombatState) {
      case CombatState.SelectAction:
        if (!this.mHasEventExed && !sIsRandomFight) {
          this.mHasEventExed = true;
          const rounds = this.mEventRound ?? [];
          for (let i = 0; i < rounds.length; i++) {
            if (this.mRoundCnt === rounds[i] && this.mEventNum![i] !== 0) {
              this.game.triggerEvent(this.mEventNum![i]);
            }
          }
        }
        if (this.mIsAutoAttack) {
          this.generateAutoActionQueue();
          this.mCombatState = CombatState.PerformAction;
        } else {
          this.mCombatUI.update(delta);
        }
        break;

      case CombatState.PerformAction:
        if (!this.mActionExecutor.update(delta)) {
          if (this.isAllMonsterDead) {
            this.onVictory();
          } else if (this.isAnyPlayerAlive) {
            ++this.mRoundCnt;
            this.updateFighterState();
            this.mCombatState = CombatState.SelectAction;
            this.mCurSelActionPlayerIndex = this.firstAlivePlayerIndex;
            this.mCombatUI.setCurrentPlayerIndex(this.mCurSelActionPlayerIndex);
            for (const p of this.mPlayerList) p.setFrameByState();
          } else {
            this.mTimeCnt = 0;
            this.mCombatState = CombatState.Loss;
          }
        }
        break;

      case CombatState.Win:
        this.mIsWin = true;
        if (this.mCombatSuccess?.update(delta) ?? true) this.mCombatState = CombatState.Exit;
        break;

      case CombatState.Loss:
        if (!(sIsRandomFight && this.mFlyPeach.update(delta))) {
          this.mIsWin = false;
          this.mCombatState = CombatState.Exit;
        }
        break;

      case CombatState.Exit:
        this.exitCurrentCombat();
        break;
    }
  }

  private onVictory(): void {
    this.mTimeCnt = 0;
    this.mCombatState = CombatState.Win;
    Player.sMoney += this.mWinMoney;

    const lvuplist: Player[] = [];
    for (const p of this.mPlayerList) {
      if (!p.isAlive) continue;
      if (p.level >= p.levelupChain.maxLevel) break; // max level (original behaviour)
      const nextExp = p.levelupChain.getNextLevelExp(p.level);
      const exp = this.mWinExp + p.currentExp;
      if (exp < nextExp) {
        p.currentExp = exp;
      } else {
        const cl = p.level;
        const c = p.levelupChain;
        p.currentExp = exp - nextExp;
        p.level = cl + 1;
        p.maxHP = p.maxHP + c.getMaxHP(cl + 1) - c.getMaxHP(cl);
        p.hp = p.maxHP;
        p.maxMP = p.maxMP + c.getMaxMP(cl + 1) - c.getMaxMP(cl);
        p.mp = p.maxMP;
        p.attack = p.attack + c.getAttack(cl + 1) - c.getAttack(cl);
        p.defend = p.defend + c.getDefend(cl + 1) - c.getDefend(cl);
        if (p.magicChain) p.magicChain.learnNum = c.getLearnMagicNum(cl + 1);
        p.speed = p.speed + c.getSpeed(cl + 1) - c.getSpeed(cl);
        p.lingli = p.lingli + c.getLingli(cl + 1) - c.getLingli(cl);
        p.luck = p.luck + c.getLuck(cl + 1) - c.getLuck(cl);
        lvuplist.push(p);
      }
    }

    // Drop chance from the best luck in the party.
    let ppt = 10;
    for (const p of this.mPlayerList) if (p.luck > ppt) ppt = p.luck;
    ppt -= 10;
    if (ppt > 100) ppt = 100;
    else if (ppt < 0) ppt = 10;

    const gm = new GoodsManage();
    for (const m of this.mMonsterList) {
      const g = m.dropGoods;
      if (g != null && sRandom.nextInt(101) < ppt) {
        gm.addGoods(g.type, g.index, g.goodsNum);
        Player.sGoodsList.addGoods(g.type, g.index, g.goodsNum);
      }
    }
    const gl: BaseGoods[] = [...gm.goodsList, ...gm.equipList];
    this.mCombatSuccess = new CombatSuccess(this, this.mWinExp, this.mWinMoney, gl, lvuplist);
  }

  draw(canvas: Canvas): void {
    canvas.drawBitmap(this.mBackground, 0, 0);
    for (const m of this.mMonsterList) if (m.isVisiable) m.fightingSprite!.draw(canvas);
    for (let i = this.mPlayerList.length - 1; i >= 0; i--) this.mPlayerList[i].fightingSprite!.draw(canvas);

    if (this.mCombatState === CombatState.SelectAction && !this.mIsAutoAttack) {
      this.mCombatUI.draw(canvas);
    } else if (this.mCombatState === CombatState.PerformAction) {
      this.mActionExecutor.draw(canvas);
    } else if (this.mCombatState === CombatState.Win) {
      this.mCombatSuccess?.draw(canvas);
    } else if (this.mCombatState === CombatState.Loss && sIsRandomFight) {
      this.mFlyPeach.draw(canvas, 0, 0);
    }
  }

  onKeyDown(key: number): void {
    if (this.mCombatState === CombatState.SelectAction) {
      if (!this.mIsAutoAttack) this.mCombatUI.onKeyDown(key);
    } else if (this.mCombatState === CombatState.Win) {
      this.mCombatSuccess?.onKeyDown(key);
    }
  }

  onKeyUp(key: number): void {
    if (this.mCombatState === CombatState.SelectAction) {
      if (!this.mIsAutoAttack) this.mCombatUI.onKeyUp(key);
    } else if (this.mCombatState === CombatState.Win) {
      this.mCombatSuccess?.onKeyUp(key);
    }
    if (this.mIsAutoAttack && key === Global.KEY_CANCEL) this.mIsAutoAttack = false;
  }

  private generateAutoActionQueue(): void {
    const monster = this.firstAliveMonster;
    this.mActionQueue.length = 0;
    for (const p of this.mPlayerList) {
      if (p.isAlive) {
        this.mActionQueue.push(
          p.hasAtbuff(FightingCharacter.BUFF_MASK_ALL)
            ? new ActionPhysicalAttackAll(p, this.mMonsterList)
            : new ActionPhysicalAttackOne(p, monster!),
        );
      }
    }
    this.generateMonstersActions();
    this.sortActionQueue();
  }

  private generateMonstersActions(): void {
    for (const m of this.mMonsterList) {
      if (m.isAlive) {
        const p = this.randomAlivePlayer;
        if (p) {
          this.mActionQueue.push(
            m.hasAtbuff(FightingCharacter.BUFF_MASK_ALL)
              ? new ActionPhysicalAttackAll(m, this.mPlayerList)
              : new ActionPhysicalAttackOne(m, p),
          );
        }
      }
    }
  }

  /** Sort by agility, highest first (stable). */
  private sortActionQueue(): void {
    this.mActionQueue.sort((a, b) => b.priority - a.priority);
  }

  private isPlayerBehindDead(index: number): boolean {
    for (let i = index + 1; i < this.mPlayerList.length; i++) if (this.mPlayerList[i].isAlive) return false;
    return true;
  }

  private updateFighterState(): void {
    // TODO (original): decrease the buffs' round counts
  }

  onActionSelected(action: Action): void {
    this.mActionQueue.push(action);
    this.mCombatUI.reset();
    if (action instanceof ActionCoopMagic) {
      // a combined attack replaces everyone's actions
      this.mActionQueue.length = 0;
      this.mActionQueue.push(action);
      this.generateMonstersActions();
      this.sortActionQueue();
      this.mCombatState = CombatState.PerformAction;
    } else if (
      this.mCurSelActionPlayerIndex >= this.mPlayerList.length - 1 ||
      this.isPlayerBehindDead(this.mCurSelActionPlayerIndex)
    ) {
      this.generateMonstersActions();
      this.sortActionQueue();
      this.mCombatState = CombatState.PerformAction;
    } else {
      this.mCurSelActionPlayerIndex = this.nextAlivePlayerIndex;
      this.mCombatUI.setCurrentPlayerIndex(this.mCurSelActionPlayerIndex);
    }
  }

  onAutoAttack(): void {
    this.mCombatUI.reset();
    this.mActionQueue.length = 0;
    this.mIsAutoAttack = true;
    this.mCombatState = CombatState.SelectAction;
  }

  onFlee(): void {
    this.mCombatUI.reset();
    for (let i = this.mCurSelActionPlayerIndex; i < this.mPlayerList.length; i++) {
      if (this.mPlayerList[i].isAlive && sRandom.nextBoolean() && sIsRandomFight) {
        // 50% chance to escape
        this.mActionQueue.push(
          new ActionFlee(this.mPlayerList[i], true, () => {
            this.mIsWin = true;
            this.mCombatState = CombatState.Exit;
          }),
        );
        break;
      } else {
        this.mActionQueue.push(new ActionFlee(this.mPlayerList[i], false, null));
      }
    }
    this.generateMonstersActions();
    this.sortActionQueue();
    this.mCombatState = CombatState.PerformAction;
  }

  onCancel(): void {
    const i = this.preAlivePlayerIndex;
    if (i >= 0) {
      this.mActionQueue.pop();
      this.mCurSelActionPlayerIndex = i;
      this.mCombatUI.setCurrentPlayerIndex(i);
      this.mCombatUI.reset();
    }
  }

  // -- static API (Kotlin companion object) ----------------------------------

  static IsActive(): boolean {
    return sIsEnable && sInstance != null && sIsFighting;
  }

  /** Enable random fights. */
  static FightEnable(): void {
    sIsEnable = true;
  }

  /** Disable random fights. */
  static FightDisable(): void {
    sIsEnable = false;
    sInstance = null;
  }

  /** Debug switch: suppress random encounters entirely. */
  static setGlobalDisableFighting(v: boolean): void {
    globalDisableFighting = v;
  }

  /** Reset all combat globals (used when a new game is booted). */
  static resetAll(): void {
    sIsEnable = false;
    globalDisableFighting = false;
    sIsFighting = false;
    sInstance = null;
    sInstanceBk = null;
    sIsRandomFight = false;
  }

  /**
   * Set up random fights.
   * @param monstersType 0-7 possible monster types
   * @param scrb background, scrl bottom-left image, scrr top-right image
   */
  static InitFight(parent: GameNode, monstersType: number[], scrb: number, scrl: number, scrr: number): void {
    sIsEnable = true;
    sIsRandomFight = true;
    sIsFighting = false;
    const c = new Combat(parent);
    sInstance = c;
    sInstanceBk = null;
    c.mMonsterType = monstersType.filter((t) => t !== 0);
    c.mRoundCnt = 0;
    c.mMaxRound = 0;
    c.createBackgroundBitmap(scrb, scrl, scrr);
  }

  static write(out: ObjectOutput): void {
    const fightEnabled = sIsEnable && sInstance != null;
    out.writeBoolean(fightEnabled);
    if (fightEnabled) {
      const c = sInstance!;
      out.writeIntArray(c.mMonsterType ?? []);
      out.writeInt(c.mScrb);
      out.writeInt(c.mScrl);
      out.writeInt(c.mScrR);
    }
  }

  static read(parent: GameNode, coder: ObjectInput): void {
    sIsEnable = coder.readBoolean();
    if (sIsEnable) {
      const monsterType = coder.readIntArray();
      const scrb = coder.readInt();
      const scrl = coder.readInt();
      const scrr = coder.readInt();
      Combat.InitFight(parent, monsterType, scrb, scrl, scrr);
    }
  }

  /**
   * Scripted fight.
   * @param roundMax max rounds, 0 = unlimited
   * @param monstersType 0-3 enemies
   * @param scr background, bottom-left, top-right images
   * @param evtRnds rounds at which events fire, evts the matching events
   * @param lossto / winto script addresses to jump to afterwards
   */
  static EnterFight(
    parent: GameNode,
    roundMax: number,
    monstersType: number[],
    scr: number[],
    evtRnds: number[],
    evts: number[],
    lossto: number,
    winto: number,
  ): void {
    sIsRandomFight = false;
    sInstanceBk = sInstance;
    const c = new Combat(parent);
    sInstance = c;
    c.mMonsterList = monstersType
      .filter((t) => t > 0)
      .map((t) => DatLib.getRes(ResType.ARS, 3, t) as Monster);
    c.mMaxRound = roundMax;
    c.mRoundCnt = 0;
    Combat.PrepareForNewCombat();
    c.createBackgroundBitmap(scr[0], scr[1], scr[2]);
    c.mEventRound = evtRnds;
    c.mEventNum = evts;
    c.mLossAddr = lossto;
    c.mWinAddr = winto;
  }

  private static PrepareForNewCombat(): void {
    sIsEnable = true;
    sIsFighting = true;
    sInstance!.prepareForNewCombat();
  }

  /** @returns true when a new random fight starts */
  static StartNewRandomCombat(): boolean {
    const c = sInstance;
    if (
      globalDisableFighting ||
      EngineSettings.noRandomBattles ||
      !sIsEnable ||
      c == null ||
      !c.mMonsterType ||
      c.mMonsterType.length === 0 ||
      sRandom.nextInt(COMBAT_PROBABILITY) !== 0
    ) {
      sIsFighting = false;
      return false;
    }
    c.mMonsterList.length = 0;
    const n = sRandom.nextInt(3);
    for (let k = 0; k <= n; k++) {
      const x = sRandom.nextInt(c.mMonsterType.length);
      c.mMonsterList.push(DatLib.getRes(ResType.ARS, 3, c.mMonsterType[x]) as Monster);
    }
    c.mRoundCnt = 0;
    c.mMaxRound = 0;
    Combat.PrepareForNewCombat();
    return true;
  }

  static Update(delta: number): void {
    sInstance!.update(delta);
  }

  static Draw(canvas: Canvas): void {
    sInstance!.draw(canvas);
  }

  static KeyDown(key: number): void {
    sInstance!.onKeyDown(key);
  }

  static KeyUp(key: number): void {
    sInstance!.onKeyUp(key);
  }

  static readonly sPlayerPos = sPlayerPos;

  static ForceWin(): void {
    if (sInstance) sInstance.mCombatState = CombatState.Win;
  }
}

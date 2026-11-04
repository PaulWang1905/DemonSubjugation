// Port of fmj/scene/ScreenMainGame.kt — the map / exploration screen.
import { Global } from "../Global";
import { Direction } from "../characters/Direction";
import { NPC, type ICanWalk } from "../characters/NPC";
import { Player } from "../characters/Player";
import type { SceneObj } from "../characters/SceneObj";
import { Combat } from "../combat/Combat";
import { ScreenGameMainMenu } from "../gamemenu/ScreenGameMainMenu";
import { Util } from "../graphics/Util";
import { DatLib, ResType } from "../lib/DatLib";
import { ResMap } from "../lib/ResMap";
import type { ScriptProcess } from "../script/ScriptProcess";
import { ScriptResources } from "../script/ScriptResources";
import type { ScriptVM } from "../script/ScriptVM";
import { BaseScreen, type GameNode } from "../views/BaseScreen";
import { Canvas, Point } from "../../graphics";
import { SaveLoadGame } from "./SaveLoadGame";

function emptyNpcs(): NPC[] {
  return Array.from({ length: 41 }, () => NPC.empty);
}

export class ScreenMainGame extends BaseScreen {
  player: Player | null = null;
  currentMap: ResMap | null = null;
  /** Map position of the screen's top-left corner. */
  private readonly mMapScreenPos = new Point();
  scriptProcess!: ScriptProcess;
  private _sceneName = "";
  /** NPCs and scene objects by id (1-40). */
  private mNPCObj: NPC[] = emptyNpcs();

  private readonly mCanWalk: ICanWalk = {
    canWalk: (x: number, y: number): boolean => {
      const pp = this.player!.posInMap;
      return this.currentMap!.canWalk(x, y) && this.getNpcFromPosInMap(x, y).isEmpty && !(pp.x === x && pp.y === y);
    },
  };

  constructor(
    readonly parent: GameNode,
    private readonly vm: ScriptVM,
  ) {
    super();
    if (SaveLoadGame.startNewGame) {
      Combat.FightDisable();
      ScriptResources.initGlobalVar();
      ScriptResources.initGlobalEvents();
      SaveLoadGame.NpcObjs = this.mNPCObj;
      this.playerList.length = 0;
      Player.sGoodsList.clear();
      Player.sMoney = 0;
      this.scriptProcess = this.doStartChapter(1, 1);
      this.scriptProcess.start();
    } else {
      this.loadMap(SaveLoadGame.MapType, SaveLoadGame.MapIndex, SaveLoadGame.MapScreenX, SaveLoadGame.MapScreenY);
      this.mNPCObj = SaveLoadGame.NpcObjs;
      for (const n of this.mNPCObj) if (!n.isEmpty) n.setICanWalk(this.mCanWalk);
      // fmj.kt threw "存档读取出错" here; a save made before the party
      // exists is legitimate (some games save during the intro).
      this.player = this.playerList.length > 0 ? this.playerList[0] : null;
      this.scriptProcess = SaveLoadGame.scriptProcess!;
      this.scriptProcess.goonExecute = true;
    }
  }

  get sceneName(): string {
    return this._sceneName;
  }
  set sceneName(name: string) {
    this._sceneName = name;
    SaveLoadGame.SceneName = name;
  }

  /** Sorted by y descending so that nearer objects overlap farther ones. */
  private get sortedNpcObjs(): NPC[] {
    return this.mNPCObj.filter((n) => !n.isEmpty).sort((a, b) => b.posInMap.y - a.posInMap.y);
  }

  get playerList(): Player[] {
    return this.game.playerList;
  }

  callChapter(type: number, index: number): void {
    const process = this.vm.loadScript(type, index);
    process.prev = this.scriptProcess;
    this.scriptProcess = process;
    process.start();
  }

  exitScript(): void {
    this.scriptProcess.stop();
  }

  private doStartChapter(type: number, index: number): ScriptProcess {
    const process = this.vm.loadScript(type, index);
    for (let i = 1; i <= 40; i++) this.mNPCObj[i] = NPC.empty;
    ScriptResources.initLocalVar();
    SaveLoadGame.ScriptType = type;
    SaveLoadGame.ScriptIndex = index;
    return process;
  }

  startChapter(type: number, index: number): void {
    this.scriptProcess.stop();
    this.scriptProcess = this.doStartChapter(type, index);
    this.scriptProcess.start();
  }

  update(delta: number): void {
    if (this.scriptProcess.running) {
      this.scriptProcess.process();
      this.scriptProcess.update(delta);
      this.scriptProcess.timerStep(delta);
    } else if (Combat.IsActive()) {
      Combat.Update(delta);
    } else {
      for (const n of this.mNPCObj) if (!n.isEmpty) n.update(delta);
      this.scriptProcess.timerStep(delta);
    }
  }

  draw(canvas: Canvas): void {
    if (this.scriptProcess.running) {
      if (Combat.IsActive()) Combat.Draw(canvas);
      this.scriptProcess.draw(canvas);
    } else if (Combat.IsActive()) {
      Combat.Draw(canvas);
    } else {
      this.drawScene(canvas);
    }
  }

  drawScene(canvas: Canvas): void {
    this.currentMap?.drawMap(canvas, this.mMapScreenPos.x, this.mMapScreenPos.y);
    const playY = this.player ? this.player.posInMap.y : 10000;
    let hasPlayerBeenDrawn = false;
    const npcs = this.sortedNpcObjs;
    for (let i = npcs.length - 1; i >= 0; i--) {
      if (!hasPlayerBeenDrawn && playY < npcs[i].posInMap.y) {
        this.player!.drawWalkingSprite(canvas, this.mMapScreenPos);
        hasPlayerBeenDrawn = true;
      }
      npcs[i].drawWalkingSprite(canvas, this.mMapScreenPos);
    }
    if (this.player && !hasPlayerBeenDrawn) this.player.drawWalkingSprite(canvas, this.mMapScreenPos);
    Util.drawSideFrame(canvas);
  }

  onKeyDown(key: number): void {
    if (this.scriptProcess.running) {
      this.scriptProcess.keyDown(key);
    } else if (Combat.IsActive()) {
      Combat.KeyDown(key);
    } else if (this.player) {
      switch (key) {
        case Global.KEY_LEFT: this.walkLeft(); break;
        case Global.KEY_RIGHT: this.walkRight(); break;
        case Global.KEY_UP: this.walkUp(); break;
        case Global.KEY_DOWN: this.walkDown(); break;
        case Global.KEY_ENTER: this.triggerSceneObjEvent(); break;
      }
    }
  }

  onKeyUp(key: number): void {
    if (this.scriptProcess.running) {
      this.scriptProcess.keyUp(key);
    } else if (Combat.IsActive()) {
      Combat.KeyUp(key);
    } else if (key === Global.KEY_CANCEL) {
      this.pushScreen(new ScreenGameMainMenu(this));
    }
  }

  gotoAddress(address: number): void {
    this.scriptProcess.gotoAddress(address);
  }

  triggerEvent(eventId: number): void {
    this.scriptProcess.triggerEvent(eventId);
  }

  /** ENTER: trigger the event of whatever the player faces (NPC talk, chest...). */
  private triggerSceneObjEvent(): void {
    const p = this.player!;
    let x = p.posInMap.x;
    let y = p.posInMap.y;
    switch (p.direction) {
      case Direction.East: ++x; break;
      case Direction.North: --y; break;
      case Direction.South: ++y; break;
      case Direction.West: --x; break;
    }
    const npcId = this.getNpcIdFromPosInMap(x, y);
    if (npcId !== 0) {
      this.scriptProcess.triggerEvent(npcId);
      return;
    }
    this.triggerMapEvent(x, y);
  }

  /** Trigger the map event at (x, y); otherwise maybe start a random fight. */
  private triggerMapEvent(x: number, y: number): boolean {
    if (this.currentMap) {
      const id = this.currentMap.getEventNum(x, y);
      if (id !== 0) {
        this.scriptProcess.triggerEvent(id + 40);
        return true;
      }
    }
    Combat.StartNewRandomCombat();
    return false;
  }

  private canPlayerWalk(x: number, y: number): boolean {
    return this.currentMap ? this.currentMap.canPlayerWalk(x, y) && this.getNpcFromPosInMap(x, y).isEmpty : false;
  }

  private walkLeft(): void {
    const { x, y } = this.player!.posInMap;
    this.triggerMapEvent(x - 1, y);
    if (this.canPlayerWalk(x - 1, y)) {
      this.player!.walk(Direction.West);
      --this.mMapScreenPos.x;
      SaveLoadGame.MapScreenX = this.mMapScreenPos.x;
    } else {
      this.player!.walkStay(Direction.West);
    }
  }

  private walkUp(): void {
    const { x, y } = this.player!.posInMap;
    this.triggerMapEvent(x, y - 1);
    if (this.canPlayerWalk(x, y - 1)) {
      this.player!.walk(Direction.North);
      --this.mMapScreenPos.y;
      SaveLoadGame.MapScreenY = this.mMapScreenPos.y;
    } else {
      this.player!.walkStay(Direction.North);
    }
  }

  private walkRight(): void {
    const { x, y } = this.player!.posInMap;
    this.triggerMapEvent(x + 1, y);
    if (this.canPlayerWalk(x + 1, y)) {
      ++this.mMapScreenPos.x;
      SaveLoadGame.MapScreenX = this.mMapScreenPos.x;
      this.player!.walk(Direction.East);
    } else {
      this.player!.walkStay(Direction.East);
    }
  }

  private walkDown(): void {
    const { x, y } = this.player!.posInMap;
    this.triggerMapEvent(x, y + 1);
    if (this.canPlayerWalk(x, y + 1)) {
      ++this.mMapScreenPos.y;
      SaveLoadGame.MapScreenY = this.mMapScreenPos.y;
      this.player!.walk(Direction.South);
    } else {
      this.player!.walkStay(Direction.South);
    }
  }

  /** Load map (type, index) with the screen's top-left at (x, y). */
  loadMap(type: number, index: number, x: number, y: number): void {
    let tmpP: Point | null = null;
    if (this.player && this.currentMap) tmpP = this.player.getPosOnScreen(this.mMapScreenPos);
    this.currentMap = DatLib.getRes(ResType.MAP, type, index) as ResMap;
    this.mMapScreenPos.set(x, y);
    if (tmpP) this.player!.setPosOnScreen(tmpP.x, tmpP.y, this.mMapScreenPos);
    SaveLoadGame.MapType = type;
    SaveLoadGame.MapIndex = index;
    SaveLoadGame.MapScreenX = x;
    SaveLoadGame.MapScreenY = y;
  }

  setMapScreenPos(x: number, y: number): void {
    this.mMapScreenPos.set(x, y);
  }

  createActor(actorId: number, x: number, y: number): void {
    const p = DatLib.getRes(ResType.ARS, 1, actorId) as Player;
    this.playerList.push(p);
    p.setPosOnScreen(x, y, this.mMapScreenPos);
    this.player = this.playerList[0];
  }

  deleteActor(actorId: number): void {
    const i = this.playerList.findIndex((p) => p.index === actorId);
    if (i >= 0) this.playerList.splice(i, 1);
    this.player = this.playerList.length === 0 ? null : this.playerList[0];
  }

  getPlayer(actorId: number): Player | null {
    return this.playerList.find((p) => p.index === actorId) ?? null;
  }

  createNpc(id: number, npc: number, x: number, y: number): NPC {
    const npcobj = DatLib.getRes(ResType.ARS, 2, npc) as NPC;
    npcobj.setPosInMap(x, y);
    npcobj.setICanWalk(this.mCanWalk);
    this.mNPCObj[id] = npcobj;
    return npcobj;
  }

  deleteNpc(id: number): void {
    this.mNPCObj[id] = NPC.empty;
  }

  deleteAllNpc(): void {
    for (let i = 0; i <= 40; i++) this.mNPCObj[i] = NPC.empty;
  }

  getNPC(id: number): NPC {
    return this.mNPCObj[id];
  }

  setControlPlayer(id: number): void {
    const i = this.playerList.findIndex((p) => p.index === id);
    if (i >= 0) {
      const [p] = this.playerList.splice(i, 1);
      this.playerList.unshift(p);
    }
  }

  isNpcVisible(npc: NPC): boolean {
    const { x, y } = npc.getPosOnScreen(this.mMapScreenPos);
    return x >= 0 && x < ResMap.WIDTH && y >= 0 && y <= ResMap.HEIGHT;
  }

  getNpcFromPosInMap(x: number, y: number): NPC {
    return this.mNPCObj[this.getNpcIdFromPosInMap(x, y)];
  }

  private getNpcIdFromPosInMap(x: number, y: number): number {
    const id = this.mNPCObj.findIndex((n) => !n.isEmpty && n.posInMap.x === x && n.posInMap.y === y);
    return id === -1 ? 0 : id;
  }

  /** Create a chest/scene object (ARS type 4), sharing ids with NPCs. */
  createBox(id: number, boxIndex: number, x: number, y: number): SceneObj {
    const box = DatLib.getRes(ResType.ARS, 4, boxIndex) as SceneObj;
    box.setPosInMap(x, y);
    this.mNPCObj[id] = box;
    return box;
  }

  deleteBox(id: number): void {
    this.mNPCObj[id] = NPC.empty;
  }

  /** Read-only view of the current screen origin (for tooling). */
  get mapScreenPos(): Point {
    return this.mMapScreenPos;
  }
}

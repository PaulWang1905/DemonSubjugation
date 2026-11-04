// Port of fmj/scene/SaveLoadGame.kt — save-file (de)serialisation.
import { NPC } from "../characters/NPC";
import { Player } from "../characters/Player";
import { SceneObj } from "../characters/SceneObj";
import { Combat } from "../combat/Combat";
import type { ScriptProcess } from "../script/ScriptProcess";
import type { Game } from "../views/BaseScreen";
import { readArray, writeArray, type ObjectInput, type ObjectOutput } from "../../java";

export const SaveLoadGame = {
  /** Start a new game (true) or continue from the loaded save (false). */
  startNewGame: true,
  MapType: 1,
  MapIndex: 1,
  /** Map position of the top-left corner of the screen. */
  MapScreenX: 1,
  MapScreenY: 1,
  ScriptType: 1,
  ScriptIndex: 1,
  SceneName: "",
  NpcObjs: [] as NPC[],
  scriptProcess: null as ScriptProcess | null,

  reset(): void {
    SaveLoadGame.startNewGame = true;
    SaveLoadGame.MapType = 1;
    SaveLoadGame.MapIndex = 1;
    SaveLoadGame.MapScreenX = 1;
    SaveLoadGame.MapScreenY = 1;
    SaveLoadGame.ScriptType = 1;
    SaveLoadGame.ScriptIndex = 1;
    SaveLoadGame.SceneName = "";
    SaveLoadGame.NpcObjs = [];
    SaveLoadGame.scriptProcess = null;
  },

  write(game: Game, out: ObjectOutput): void {
    out.writeString(SaveLoadGame.SceneName);
    out.writeInt(game.playerList.length);
    for (const p of game.playerList) out.writeInt(p.index);
    out.writeInt(SaveLoadGame.MapType);
    out.writeInt(SaveLoadGame.MapIndex);
    out.writeInt(SaveLoadGame.MapScreenX);
    out.writeInt(SaveLoadGame.MapScreenY);
    out.writeInt(SaveLoadGame.ScriptType);
    out.writeInt(SaveLoadGame.ScriptIndex);
    game.mainScene.scriptProcess.encode(out);

    out.writeInt(game.playerList.length);
    for (const p of game.playerList) p.encode(out);
    out.writeInt(Player.sMoney);
    Player.sGoodsList.write(out);
    writeArray(out, SaveLoadGame.NpcObjs, (io, obj) => {
      if (obj.isEmpty) {
        io.writeByte(0);
      } else {
        io.writeByte(obj instanceof SceneObj ? 2 : 1);
        obj.encode(io);
      }
    });
    Combat.write(out);
  },

  read(game: Game, coder: ObjectInput): void {
    SaveLoadGame.SceneName = coder.readString();
    let actorNum = coder.readInt();
    while (actorNum-- > 0) coder.readInt();
    SaveLoadGame.MapType = coder.readInt();
    SaveLoadGame.MapIndex = coder.readInt();
    SaveLoadGame.MapScreenX = coder.readInt();
    SaveLoadGame.MapScreenY = coder.readInt();
    SaveLoadGame.ScriptType = coder.readInt();
    SaveLoadGame.ScriptIndex = coder.readInt();
    SaveLoadGame.scriptProcess = game.vm.loadScript(SaveLoadGame.ScriptType, SaveLoadGame.ScriptIndex);
    SaveLoadGame.scriptProcess.decode(coder);

    const size = coder.readInt();
    game.playerList.length = 0;
    for (let i = 0; i < size; i++) {
      const p = new Player();
      p.decode(coder);
      game.playerList.push(p);
    }
    Player.sMoney = coder.readInt();
    Player.sGoodsList.read(coder);

    SaveLoadGame.NpcObjs = readArray(coder, (io) => {
      const type = io.readByte();
      let npc: NPC;
      if (type === 0 || type === 1) npc = new NPC();
      else if (type === 2) npc = new SceneObj();
      else throw new Error("Bad obj type");
      if (type !== 0) npc.decode(io);
      return npc;
    });

    Combat.read(game, coder);
  },
};

// English menus for the RPG kit's engine (RpgA100.eng) inside a .gam.
//
// A game made with BBK's RPG kit keeps its story in its library, but its
// menus and messages (属性 魔法 物品 系统, the battle commands, 获得经验…)
// are strings in the engine's own code, so a translated library still shows
// them in Chinese on Fulu and the original OS. Each string is replaced in
// place by English of exactly the same length in bytes (padded with spaces):
// the code is not changed, nor where anything is, nor how long any text is.
// The words follow FMJ React's English menus (src/engine/fmj/i18n.ts), which
// were fitted to the same widths. A string is only replaced where it is whole
// (it ends at its 0 and is not the end of a longer Chinese string), and only
// in the program part, before the library.

import { gbkBytes } from "../engine/java";
import { findLib, isGam } from "./gam";

/**
 * The engine's strings (as the builds of 伏魔记 and 英雄坛说 have them) and
 * their English. Lists the code reads at fixed widths (the menus) are one
 * string, their items at the same widths.
 */
const STRINGS: [string, string][] = [
  // the main menu, the status and equipment pages, the system menu
  ["属性魔法物品系统", "StatMag ItemSys "],
  ["状态穿戴", "StatGear"],
  ["使用装备", "Use Gear"],
  ["读入进度存储进度游戏设置结束游戏", "Load    Save    Setup   Quit    "],
  ["音乐开音乐关", "Snd onSndoff"],
  ["金钱：", "Gold: "],
  ["金钱:", "Gold:"],
  ["目前不能存档!", "Can't save!"],
  ["等级", "Lv"],
  ["生命", "HP"],
  ["真气", "MP"],
  ["攻击力", "Attack"],
  ["防御力", "Defend"],
  ["经验值", "Exp"],
  ["身法", "Spd"],
  ["灵力", "Spi"],
  ["幸运", "Luck"],
  ["免疫", "Imm"],
  // statuses: poison, confusion, seal, sleep, none
  ["毒", "Ps"],
  ["乱", "Cf"],
  ["封", "Se"],
  ["眠", "Sl"],
  ["无", "--"],
  ["耗真气:", "MP use:"],
  // equipment slots
  ["装饰", "Acc"],
  ["护腕", "Arms"],
  ["脚蹬", "Feet"],
  ["手持", "Hand"],
  ["身穿", "Body"],
  ["肩披", "Back"],
  ["头戴", "Head"],
  // battle
  ["围攻道具防御逃跑状态", "AutoItemDef Run Stat"],
  ["装备投掷使用", "GearTossUse "],
  ["真气不足!", "No MP!"],
  ["真气不足！", "No MP!"],
  ["获得经验", "Exp +"],
  ["战斗获得 ", "Won "],
  ["得到 ", "Got "],
  ["修行提升", "Level up"],
  ["偷得 ", "Stole"],
  ["钱", "G"],
  // items and shops
  ["获得:", "Got:"],
  ["已满载！", "Bag full"],
  ["不能装备！", "Can't wear"],
  ["已装备！", "Equipped"],
  ["战斗中才能使用！", "Battle only!"],
  ["无效！", "No use"],
  ["此处无法使用！", "Can't use here"],
  ["卖出个数  ：", "Sell:"],
  ["买入个数  ：", "Buy:"],
  ["金钱不足！", "Need gold!"],
  ["没携带物品！", "No items!"],
  ["不可卖物品！", "Can't sell!"],
  ["数量：", "Qty:"],
  ["价：", "$:"],
  ["名：", "N:"],
  // saving
  ["空档案", "Empty"],
  ["档案储存中…", "Saving..."],
  ["档案储存中… ", "Saving..."],
  ["是", "OK"],
  ["否", "No"],
  ["覆盖原进度？", "Overwrite?"],
  ["错误指令...", "Bad command"],
];

const bytesOf = (s: string) => Uint8Array.from(gbkBytes(s), (b) => b & 0xff);

/** The table as bytes, the English padded to the Chinese's length (a longer English is a mistake in the table). */
const PATCHES = STRINGS.map(([zh, en]) => {
  const from = bytesOf(zh), to = new Uint8Array(from.length).fill(0x20);
  const e = new TextEncoder().encode(en);
  if (e.length > from.length) throw new Error(`kitEnglish: "${en}" is longer than "${zh}"`);
  to.set(e);
  return { zh, from, to };
});

/** Whether `gam` has the RPG kit's engine (a library in its data area) to translate. */
export function hasKitEngine(gam: Uint8Array): boolean {
  const lib = findLib(gam);
  return isGam(gam) && lib > 0 && lib === (gam[0x42] | (gam[0x43] << 8) | (gam[0x44] << 16));
}

/** A copy of `gam` with the engine's menus and messages in English, and how many strings were replaced. */
export function englishMenus(gam: Uint8Array): { gam: Uint8Array; replaced: number; strings: string[] } {
  if (!hasKitEngine(gam)) throw new Error("This .gam has no RPG kit engine to translate.");
  const out = gam.slice(), end = findLib(gam), strings: string[] = [];
  let replaced = 0;
  for (const { zh, from, to } of PATCHES) {
    let found = false;
    for (let i = 0x46; i + from.length < end; i++) {
      if (out[i + from.length] !== 0 || out[i] !== from[0]) continue;
      let same = true;
      for (let k = 1; k < from.length && same; k++) same = out[i + k] === from[k];
      // whole: not the end of a longer Chinese string (whose last character would come just before)
      // (in GB2312 both bytes of a character are $A1 or more)
      if (!same || (i >= 2 && out[i - 2] >= 0xa1 && out[i - 1] >= 0xa1)) continue;
      out.set(to, i);
      replaced++;
      found = true;
    }
    if (found) strings.push(zh);
  }
  return { gam: out, replaced, strings };
}

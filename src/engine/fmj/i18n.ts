// Interface text built into the engine (menus, battle, shops, saves).
// Game text (dialogue, names) comes from the archive itself.
//
// Many engine screens draw text in fixed-width boxes laid out for Chinese,
// where one character is as wide as two ASCII letters. The English strings
// are chosen to fit those boxes (e.g. 4 letters where Chinese has 2 chars).

export type UiLanguage = "zh" | "en";

const zh = {
  statLevel: "等级   ",
  statHP: "生命   ",
  statMP: "真气   ",
  statAttack: "攻击力 ",
  statDefend: "防御力 ",
  statExp: "经验值",
  statSpeed: "身法   ",
  statSpirit: "灵力   ",
  statLuck: "幸运   ",
  statImmune: "免疫   ",
  statNone: "无",
  stPoison: "毒",
  stConfuse: "乱",
  stSeal: "封",
  stSleep: "眠",
  got: "获得 ",
  gotColon: "获得:",
  gotItem: (name: string, n: number) => `得到 ${name} x${n}`,
  expLine: (e: string) => "获得经验     ".substring(0, 9 - e.length) + e,
  moneyLine: (m: string) => "战斗获得        ".substring(0, 10 - m.length) + m + "钱",
  levelUp: (name: string) => name + "修行提升",
  learnedMagic: "学会了魔法:",
  battleMisc: ["围攻", "道具", "防御", "逃跑", "状态"],
  battleGoods: ["装备", "投掷", "使用"],
  cannotEquip: "不能装备!",
  alreadyEquipped: "已装备!",
  slots: ["装饰", "装饰", "护腕", "脚蹬", "手持", "身穿", "肩披", "头戴"],
  mainMenu: ["属性", "魔法", "物品", "系统"],
  money: "金钱:",
  moneyWide: "金钱：",
  cannotUseHere: "此处无法使用!",
  goodsName: "名:",
  goodsPrice: "价:",
  goodsCount: "数量:",
  useEquip: ["使用", "装备"],
  battleOnly: "战斗中才能使用!",
  cannotUseNow: "当前无法使用!",
  statusEquip: ["状态", "穿戴"],
  systemMenu: ["读入进度", "存储进度", "游戏设置", "结束游戏"],
  cannotSave: "当前不能存档",
  cannotSaveHere: "副本中不能存档",
  mpCost: "耗真气:",
  buyCount: "买入个数　：",
  sellCount: "卖出个数　：",
  noMoney: "金钱不足!",
  questItem: "任务物品!",
  yes: "是 ",
  no: "否 ",
  emptySlot: "空档案    ",
  overwrite: "覆盖原进度?",
};

export type UiText = typeof zh;

const en: UiText = {
  statLevel: "Level  ",
  statHP: "HP     ",
  statMP: "MP     ",
  statAttack: "Attack ",
  statDefend: "Defend ",
  statExp: "Exp   ",
  statSpeed: "Speed  ",
  statSpirit: "Spirit ",
  statLuck: "Luck   ",
  statImmune: "Immune ",
  statNone: "none",
  stPoison: "Ps",
  stConfuse: "Cf",
  stSeal: "Se",
  stSleep: "Sl",
  got: "Got ",
  gotColon: "Got ",
  gotItem: (name: string, n: number) => `Got ${name} x${n}`,
  expLine: (e: string) => `Exp +${e}`,
  moneyLine: (m: string) => `Gold +${m}`,
  levelUp: (name: string) => `${name} grew!`,
  learnedMagic: "Learned:",
  battleMisc: ["Auto", "Item", "Def", "Run", "Stat"],
  battleGoods: ["Gear", "Toss", "Use"],
  cannotEquip: "Can't equip!",
  alreadyEquipped: "Equipped!",
  slots: ["Acc", "Acc", "Arms", "Feet", "Hand", "Body", "Back", "Head"],
  mainMenu: ["Stat", "Mag", "Item", "Sys"],
  money: "Gold:",
  moneyWide: "Gold: ",
  cannotUseHere: "Not usable here!",
  goodsName: "N:",
  goodsPrice: "$:",
  goodsCount: "Qty:",
  useEquip: ["Use", "Gear"],
  battleOnly: "Battle only!",
  cannotUseNow: "Can't use now!",
  statusEquip: ["Stat", "Gear"],
  systemMenu: ["Load", "Save", "Setup", "Quit"],
  cannotSave: "Can't save now",
  cannotSaveHere: "Can't save here",
  mpCost: "MP cost:",
  buyCount: "Buy:  ",
  sellCount: "Sell: ",
  noMoney: "Not enough gold!",
  questItem: "Quest item!",
  yes: "Yes",
  no: "No ",
  emptySlot: "Empty     ",
  overwrite: "Overwrite?",
};

const TABLES: Record<UiLanguage, UiText> = { zh, en };

/** The active interface text. */
export let T: UiText = zh;
let current: UiLanguage = "zh";

export function setUiLanguage(lang: UiLanguage): void {
  current = lang;
  T = TABLES[lang];
}

export function uiLanguage(): UiLanguage {
  return current;
}


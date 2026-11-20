// Fulu's progress over the programs it should run: the bbk-games
// collection's 138 programs for the Longman 4988 (eebbk/roms; the seven of
// docs/fulu-plan.md among them). One source for the Fulu page and for
// docs/fulu-games.md (written from this file by
// `npx tsx scripts/bbk/fulu-games-doc.mts`; tests/fulu-games.test.ts checks
// that the document is up to date). Kept by hand:
//
// - GAMES: each program's status. onFulu is from the latest play of all 138
//   on Fulu alone (180 s of random keys each: scripts and numbers in
//   docs/fulu-report.md §16); firmware is how far it has been compared with
//   BBK's firmware (the shadow run, tests/fulu-shadow.test.ts).
// - HAND_TESTS: what the owner played by hand and reported, as reported.
// - PROBLEMS: what is known not to work, or not to work as on the device,
//   with the decision on it where the owner has made one.

/** How a program does on Fulu alone. */
export type OnFulu = "plays" | "ends" | "stops";
/** How far it has been compared with the firmware: its code traced and its play, saves and typing compared ("full"); a minute of play compared ("play"); not yet. */
export type FirmwareCheck = "full" | "play" | "none";

export interface FuluGame {
  name: string;
  /** Made with BBK's RPG kit (its library in its data area): the FMJ React engine plays it too. */
  kit: boolean;
  /** plays: ran the whole 180 s; ends: its main returned (a game-over box, its menu's quit), as on the device; stops: at something Fulu lacks. */
  onFulu: OnFulu;
  /** What it stops at: an OS function or routine Fulu lacks, or input methods. */
  stopsAt?: string;
  firmware: FirmwareCheck;
  /** Problems (PROBLEMS ids) it shows. */
  problems?: string[];
}

export const GAMES: FuluGame[] = [
  { name: "Eros方块", kit: false, onFulu: "plays", firmware: "play", problems: ["sound"] },
  { name: "一中传奇", kit: true, onFulu: "plays", firmware: "none", problems: ["game-bugs"] },
  { name: "一中传奇2", kit: true, onFulu: "plays", firmware: "none" },
  { name: "七剑", kit: true, onFulu: "plays", firmware: "none" },
  { name: "三国霸业", kit: false, onFulu: "plays", firmware: "full" },
  { name: "中国象棋", kit: false, onFulu: "stops", stopsAt: "$E94D", firmware: "play", problems: ["e94d"] },
  { name: "丰收", kit: false, onFulu: "plays", firmware: "play" },
  { name: "乒乓球", kit: false, onFulu: "plays", firmware: "none" },
  { name: "二十一点", kit: false, onFulu: "plays", firmware: "none" },
  { name: "二十四点", kit: false, onFulu: "plays", firmware: "play", problems: ["sound"] },
  { name: "五子棋", kit: false, onFulu: "plays", firmware: "play" },
  { name: "仙三外传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "仙剑三", kit: true, onFulu: "plays", firmware: "none" },
  { name: "仙剑奇侠传二之虎啸飞剑", kit: true, onFulu: "plays", firmware: "none" },
  { name: "仙剑奇侠传四回梦游仙", kit: true, onFulu: "plays", firmware: "none" },
  { name: "仙界传说", kit: true, onFulu: "plays", firmware: "none" },
  { name: "伏魔记-1.0", kit: true, onFulu: "plays", firmware: "full" },
  { name: "伏魔记-1.2", kit: true, onFulu: "plays", firmware: "full" },
  { name: "伏魔记-1.3", kit: true, onFulu: "plays", firmware: "full", problems: ["game-bugs"] },
  { name: "伏魔记完美版1.0", kit: true, onFulu: "plays", firmware: "full" },
  { name: "伏魔记怀旧终曲v1.0(原版精修)", kit: true, onFulu: "plays", firmware: "full" },
  { name: "体闲麻将", kit: false, onFulu: "plays", firmware: "play" },
  { name: "侠客行", kit: true, onFulu: "plays", firmware: "none" },
  { name: "侠客行4988(终曲版)", kit: true, onFulu: "plays", firmware: "none" },
  { name: "公路快车", kit: false, onFulu: "plays", firmware: "none" },
  { name: "冒险岛", kit: true, onFulu: "plays", firmware: "none" },
  { name: "剑缘-第一部", kit: true, onFulu: "plays", firmware: "none" },
  { name: "十字之门", kit: true, onFulu: "plays", firmware: "none" },
  { name: "升级", kit: false, onFulu: "plays", firmware: "play" },
  { name: "华容道", kit: false, onFulu: "plays", firmware: "play" },
  { name: "同福奇缘", kit: true, onFulu: "plays", firmware: "none" },
  { name: "地牢围攻", kit: true, onFulu: "plays", firmware: "none" },
  { name: "坦克大战", kit: false, onFulu: "ends", firmware: "play" },
  { name: "基督山传奇", kit: true, onFulu: "plays", firmware: "none" },
  { name: "大乱斗之火影忍者", kit: true, onFulu: "plays", firmware: "none" },
  { name: "大话三国", kit: true, onFulu: "plays", firmware: "none" },
  { name: "天之骄子", kit: true, onFulu: "plays", firmware: "none" },
  { name: "天之骄子终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "妖 传说", kit: true, onFulu: "plays", firmware: "none" },
  { name: "妖·传说终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "娱乐无极限之无影奸细", kit: true, onFulu: "plays", firmware: "none" },
  { name: "宠物精灵", kit: false, onFulu: "stops", stopsAt: "input methods", firmware: "play", problems: ["input-methods", "unexplained-reads"] },
  { name: "对对碰", kit: false, onFulu: "plays", firmware: "play", problems: ["input-methods"] },
  { name: "封魔录", kit: true, onFulu: "plays", firmware: "none" },
  { name: "将门风云", kit: true, onFulu: "plays", firmware: "none" },
  { name: "少年行", kit: true, onFulu: "plays", firmware: "none" },
  { name: "屠魔", kit: true, onFulu: "plays", firmware: "none" },
  { name: "平面魔方", kit: false, onFulu: "plays", firmware: "play" },
  { name: "幸运花", kit: false, onFulu: "stops", stopsAt: "$E99E", firmware: "play", problems: ["e99e"] },
  { name: "异世大陆", kit: true, onFulu: "plays", firmware: "none" },
  { name: "异时空游记", kit: true, onFulu: "plays", firmware: "none" },
  { name: "异时空游记2-纵横之旅", kit: true, onFulu: "plays", firmware: "none" },
  { name: "志在青云", kit: true, onFulu: "plays", firmware: "none" },
  { name: "恶龙传说", kit: false, onFulu: "ends", firmware: "play", problems: ["input-methods"] },
  { name: "我的世界", kit: true, onFulu: "plays", firmware: "none" },
  { name: "战国争霸", kit: true, onFulu: "plays", firmware: "none" },
  { name: "扫雷", kit: false, onFulu: "plays", firmware: "none" },
  { name: "投篮游戏", kit: false, onFulu: "plays", firmware: "play" },
  { name: "抗日小兵", kit: true, onFulu: "plays", firmware: "none" },
  { name: "拱猪", kit: false, onFulu: "plays", firmware: "play" },
  { name: "挖金子", kit: false, onFulu: "stops", stopsAt: "$E9AD", firmware: "play", problems: ["e9ad"] },
  { name: "接龙", kit: false, onFulu: "plays", firmware: "none" },
  { name: "搬运工", kit: false, onFulu: "plays", firmware: "play" },
  { name: "新仙剑奇侠传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "新仙剑奇侠传终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "新能源危机", kit: true, onFulu: "plays", firmware: "none" },
  { name: "智多星", kit: false, onFulu: "plays", firmware: "play" },
  { name: "最终幻想", kit: true, onFulu: "plays", firmware: "none" },
  { name: "末日传说", kit: true, onFulu: "plays", firmware: "none" },
  { name: "校园传奇", kit: true, onFulu: "plays", firmware: "none" },
  { name: "梦幻校园", kit: true, onFulu: "plays", firmware: "none" },
  { name: "梦幻西游", kit: true, onFulu: "plays", firmware: "none" },
  { name: "步步高网友俱乐部", kit: true, onFulu: "plays", firmware: "none" },
  { name: "武林新传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "比大小", kit: false, onFulu: "plays", firmware: "none" },
  { name: "泡泡侠", kit: false, onFulu: "plays", firmware: "play" },
  { name: "泡泡侠 加速版", kit: false, onFulu: "plays", firmware: "none" },
  { name: "洛克人", kit: true, onFulu: "plays", firmware: "none" },
  { name: "洛特传奇", kit: true, onFulu: "plays", firmware: "none" },
  { name: "海盗船", kit: false, onFulu: "plays", firmware: "none" },
  { name: "混战三国", kit: true, onFulu: "plays", firmware: "none" },
  { name: "滑雪", kit: false, onFulu: "plays", firmware: "play", problems: ["sound"] },
  { name: "潜艇大战", kit: false, onFulu: "ends", firmware: "play" },
  { name: "炸弹小子", kit: false, onFulu: "plays", firmware: "none" },
  { name: "烈中轶事", kit: true, onFulu: "plays", firmware: "none" },
  { name: "热血传奇", kit: true, onFulu: "plays", firmware: "none", problems: ["game-bugs"] },
  { name: "牛妞历险记", kit: true, onFulu: "plays", firmware: "none" },
  { name: "猪小弟", kit: false, onFulu: "plays", firmware: "play" },
  { name: "猫狗大战", kit: false, onFulu: "plays", firmware: "play" },
  { name: "王氏传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "生命女神之暗之诅咒", kit: true, onFulu: "plays", firmware: "none" },
  { name: "电子宠物", kit: false, onFulu: "stops", stopsAt: "input methods", firmware: "play", problems: ["input-methods", "file-place"] },
  { name: "疯狂校园", kit: true, onFulu: "plays", firmware: "none" },
  { name: "疯狂盗墓人", kit: true, onFulu: "plays", firmware: "none" },
  { name: "白中传奇", kit: true, onFulu: "plays", firmware: "none" },
  { name: "碰碰车", kit: false, onFulu: "plays", firmware: "play", problems: ["input-methods"] },
  { name: "秘密潜入", kit: false, onFulu: "plays", firmware: "none" },
  { name: "紫璇刀", kit: true, onFulu: "plays", firmware: "none" },
  { name: "纯蓝记", kit: true, onFulu: "plays", firmware: "none" },
  { name: "英雄剑", kit: true, onFulu: "plays", firmware: "none" },
  { name: "英雄剑1", kit: true, onFulu: "plays", firmware: "none" },
  { name: "英雄剑2", kit: true, onFulu: "plays", firmware: "none" },
  { name: "英雄坛", kit: true, onFulu: "plays", firmware: "none" },
  { name: "英雄坛说", kit: true, onFulu: "plays", firmware: "full" },
  { name: "英雄坛说终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "英雄战士", kit: true, onFulu: "plays", firmware: "none" },
  { name: "落世沉浮", kit: true, onFulu: "plays", firmware: "none" },
  { name: "蜘蛛侠三", kit: true, onFulu: "plays", firmware: "none" },
  { name: "螃蟹回家", kit: false, onFulu: "plays", firmware: "play" },
  { name: "诸神黄昏", kit: true, onFulu: "plays", firmware: "none" },
  { name: "豪斯", kit: false, onFulu: "plays", firmware: "play", problems: ["sound"] },
  { name: "贪食蛇", kit: false, onFulu: "plays", firmware: "none" },
  { name: "赛马", kit: false, onFulu: "plays", firmware: "play" },
  { name: "赤壁之战 乱世枭雄", kit: true, onFulu: "plays", firmware: "none" },
  { name: "赤壁之战乱世枭雄终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "跟花", kit: false, onFulu: "plays", firmware: "play" },
  { name: "跳蛋", kit: false, onFulu: "ends", firmware: "none" },
  { name: "过关斩将", kit: true, onFulu: "plays", firmware: "none" },
  { name: "过关斩将4988(终曲版)", kit: true, onFulu: "plays", firmware: "none" },
  { name: "过关斩将4988改主角", kit: true, onFulu: "plays", firmware: "none" },
  { name: "迷宫游戏", kit: false, onFulu: "plays", firmware: "none" },
  { name: "遗忘传说", kit: true, onFulu: "plays", firmware: "none" },
  { name: "遗忘传说终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "释厄传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "金庸群侠传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "金庸群侠传终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "金庸群侠黑暗时代终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "钓鱼", kit: false, onFulu: "plays", firmware: "none" },
  { name: "钓鲨鱼", kit: false, onFulu: "ends", firmware: "play" },
  { name: "问道", kit: true, onFulu: "plays", firmware: "none" },
  { name: "阶梯小子", kit: false, onFulu: "plays", firmware: "play" },
  { name: "飞行特训", kit: false, onFulu: "plays", firmware: "play" },
  { name: "魔塔", kit: false, onFulu: "plays", firmware: "none" },
  { name: "魔塔BT版", kit: false, onFulu: "plays", firmware: "none" },
  { name: "魔塔超级版", kit: false, onFulu: "plays", firmware: "none" },
  { name: "魔法学院", kit: true, onFulu: "plays", firmware: "none" },
  { name: "黑暗之心", kit: true, onFulu: "plays", firmware: "none" },
  { name: "黑白子", kit: false, onFulu: "plays", firmware: "none" },
];

/** A game the owner played by hand, and what they found. */
export interface HandTest {
  /** The game, or what was tried when no game was named. */
  game: string;
  date: string;
  /** Where: on Fulu, the original OS (firmware) or the FMJ React engine. */
  engine: "fulu" | "firmware" | "react";
  /** What was played or tried. */
  tested: string;
  result: "works" | "problems";
  notes?: string;
}

export const HAND_TESTS: HandTest[] = [
  {
    game: "(not named)",
    date: "2026-11-19",
    engine: "fulu",
    tested: "Battles with the wider map view",
    result: "works",
    notes: "The border goes as it should in battles (docs/fulu-plan.md §12).",
  },
  {
    game: "(not named)",
    date: "2026-11-19",
    engine: "fulu",
    tested: "More text, past the openings",
    result: "works",
    notes: "Dialogues and message boxes work (docs/fulu-plan.md §13).",
  },
];

export type ProblemStatus = "open" | "decided" | "fixed";

export interface Problem {
  id: string;
  title: { en: string; zh: string };
  detail: { en: string; zh: string };
  status: ProblemStatus;
  /** The owner's decision, once made. */
  decision?: { en: string; zh: string };
  /** Not Fulu's: the game's or the original OS's own behaviour, kept. */
  notFulu?: boolean;
}

export const PROBLEMS: Problem[] = [
  {
    id: "sound",
    title: { en: "Sound", zh: "声音" },
    detail: {
      en: "Fulu plays no sound, and keeps the sound off. Programs that switch the sound on ($EA52, $EA64: Eros方块, 二十四点, 滑雪, 豪斯 on the original OS) run as if it were off; their sound-on paths are not written, and the firmware comparison leaves those calls out.",
      zh: "符箓不发声，声音始终关闭。打开声音的程序（$EA52、$EA64：原版系统上的 Eros方块、二十四点、滑雪、豪斯）按声音关闭运行；声音打开时的路径没有实现，与固件的对比也不计这些调用。",
    },
    status: "decided",
    decision: {
      en: "Keep the sound off; ignore sound-on for games that ask for it. The owner will decide later whether to do more.",
      zh: "保持关闭；需要声音的游戏也不处理声音打开的情况。以后由作者决定是否继续。",
    },
  },
  {
    id: "input-methods",
    title: { en: "Chinese input methods", zh: "中文输入法" },
    detail: {
      en: "Typing Chinese (the input modes 4 and 8, $E919, $E925…) is not written. 宠物精灵 and 电子宠物 switch to it at once and stop on Fulu; 恶龙传说, 碰碰车 and 对对碰 reach it in the firmware comparison.",
      zh: "中文输入（输入模式 4 和 8，$E919、$E925 等）尚未实现。宠物精灵、电子宠物一开始就切换过去，在符箓上停止；恶龙传说、碰碰车、对对碰在与固件的对比中会用到。",
    },
    status: "open",
  },
  {
    id: "e94d",
    title: { en: "$E94D (a GUI dialog)", zh: "$E94D（一个对话框）" },
    detail: { en: "About 3,900 instructions with what it calls; only 中国象棋 needs it, at its start.", zh: "连同调用的函数约 3,900 条指令；只有中国象棋需要，一开始就用到。" },
    status: "open",
  },
  {
    id: "e99e",
    title: { en: "$E99E", zh: "$E99E" },
    detail: { en: "About 1,800 instructions with what it calls; only 幸运花 needs it, at its start.", zh: "连同调用的函数约 1,800 条指令；只有幸运花需要，一开始就用到。" },
    status: "open",
  },
  {
    id: "e9ad",
    title: { en: "$E9AD", zh: "$E9AD" },
    detail: { en: "About 870 instructions; only 挖金子 needs it, at its start.", zh: "约 870 条指令；只有挖金子需要，一开始就用到。" },
    status: "open",
  },
  {
    id: "help-dialog",
    title: { en: "$E980 (probably a help screen)", zh: "$E980（可能是帮助画面）" },
    detail: {
      en: "43 programs can call it, none did in play; it calls a 1,969-instruction dialog ($F262) and 13 more functions. A program that opens it stops on Fulu.",
      zh: "43 个程序可能调用，试玩中都没有调用；它调用一个 1,969 条指令的对话框（$F262）和另外 13 个函数。打开它的程序会在符箓上停止。",
    },
    status: "open",
  },
  {
    id: "file-place",
    title: { en: "Where a new save goes in the flash", zh: "新存档在闪存中的位置" },
    detail: {
      en: "The original OS places a new file by pages among its own files; Fulu gives it sectors of its own. Games see only a different file id (电子宠物 in the firmware comparison); saving and loading work.",
      zh: "原版系统按页把新文件放在它自己的文件之间；符箓给它独立的扇区。游戏只会看到不同的文件编号（与固件对比时的电子宠物）；存档和读档都正常。",
    },
    status: "open",
  },
  {
    id: "unexplained-reads",
    title: { en: "Unexplained reads in 宠物精灵", zh: "宠物精灵中未解释的读取" },
    detail: {
      en: "In the firmware comparison the OS reads two of its scratch bytes ($2088, $20C8) before writing them, in one of the game's own calls; the results match.",
      zh: "与固件对比时，系统在游戏自己的一次调用中先读后写两个暂存字节（$2088、$20C8）；结果一致。",
    },
    status: "open",
  },
  {
    id: "wrapped-drawing",
    title: { en: "Drawing that wraps past the screen", zh: "超出屏幕回绕的绘图" },
    detail: {
      en: "A bitmap window whose sizes wrap past 255 passes the OS's checks, and the OS then draws into its own variables; Fulu draws nothing. No game seen doing it.",
      zh: "尺寸超过 255 回绕的位图窗口能通过系统的检查，系统随后会画进自己的变量；符箓不画。尚未见到游戏这样做。",
    },
    status: "open",
  },
  {
    id: "pace",
    title: { en: "Pace", zh: "速度" },
    detail: {
      en: "Fulu charges each OS call the firmware's measured time, within a few percent on the games measured; some openings run about a second longer (三国霸业).",
      zh: "符箓为每次系统调用计入固件实测的耗时，在测过的游戏上相差几个百分点以内；有些开场多约一秒（三国霸业）。",
    },
    status: "open",
  },
  {
    id: "game-bugs",
    title: { en: "The games' own bugs, kept", zh: "游戏自身的错误，保留原样" },
    detail: {
      en: "一中传奇 and 热血传奇 show 烫烫烫 (uninitialised memory) in places; 伏魔记 1.3 stops with RunErr:12 after 结束游戏 → 新的征程. Both as on the original OS.",
      zh: "一中传奇、热血传奇有些地方显示「烫烫烫」（未初始化的内存）；伏魔记 1.3 在「结束游戏 → 新的征程」后出现 RunErr:12。原版系统上也一样。",
    },
    status: "decided",
    decision: { en: "Kept as on the device.", zh: "保持与设备一致。" },
    notFulu: true,
  },
  {
    id: "os-bugs",
    title: { en: "The original OS's bugs", zh: "原版系统的错误" },
    detail: {
      en: "$E86B with the cursor off the screen returns into the stack (a crash on the device): Fulu returns 0. The circles' carry and $E8C5's 0-wide windows are kept as the OS does them.",
      zh: "光标在屏幕外时 $E86B 会返回到栈里的任意地址（设备上会崩溃）：符箓返回 0。画圆的进位问题和 $E8C5 的零宽窗口保持与系统一致。",
    },
    status: "decided",
    decision: { en: "Crashes are not copied; harmless quirks are.", zh: "不复制崩溃；无害的怪异行为照样复制。" },
    notFulu: true,
  },
];

/** What Fulu answers (tests/fulu-games.test.ts checks these against src/fulu). */
export const FULU_COUNTS = { functions: 112, routines: 74 };

/** Counts for the summaries. */
export function fuluSummary() {
  const count = (f: (g: FuluGame) => boolean) => GAMES.filter(f).length;
  return {
    total: GAMES.length,
    plays: count((g) => g.onFulu === "plays"),
    ends: count((g) => g.onFulu === "ends"),
    stops: count((g) => g.onFulu === "stops"),
    full: count((g) => g.firmware === "full"),
    play: count((g) => g.firmware === "play"),
    kit: count((g) => g.kit),
    handTested: new Set(HAND_TESTS.map((t) => t.game)).size,
    open: PROBLEMS.filter((p) => p.status === "open").length,
  };
}

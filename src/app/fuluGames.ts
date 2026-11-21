// Fulu's progress over the programs it should run: the bbk-games
// collection's 138 programs for the Longman 4988 (eebbk/roms; the seven of
// docs/fulu-plan.md among them). One source for the Fulu progress report (/fulu/progress) and for
// docs/fulu-games.md (written from this file by
// `npx tsx scripts/bbk/fulu-games-doc.mts`; tests/fulu-games.test.ts checks
// that the document is up to date). Kept by hand:
//
// - GAMES: each program's status. onFulu is from the latest play of all 138
//   on Fulu alone (scripts/bbk/fulu-play.mts: 180 s each of random keys from
//   every key a player can press but the four system keys, a program that
//   ends started again; numbers in docs/fulu-report.md §16); firmware is how far it has been compared with
//   BBK's firmware (the shadow run, tests/fulu-shadow.test.ts).
// - HAND_TESTS: what the owner played by hand and reported, as reported.
// - PROBLEMS: what is known not to work, or not to work as on the device,
//   with the decision on it where the owner has made one.

/** How a program does on Fulu alone. */
export type OnFulu = "plays" | "ends" | "stops";
/**
 * How far it has been compared with the firmware (the shadow run, call by
 * call): its code traced and its play, saves and typing compared ("full");
 * 30 minutes of each of the two key scripts compared ("long"); a minute of
 * each compared ("play"); not yet ("none"). The differences found are the
 * program's problems.
 */
export type FirmwareCheck = "full" | "long" | "play" | "none";

export interface FuluGame {
  name: string;
  /** Made with BBK's RPG kit (its library in its data area): the FMJ React engine plays it too. */
  kit: boolean;
  /** plays: ran the whole 180 s; ends: its main returned (a game-over box, its menu's quit, Exit), as on the device; stops: at something Fulu lacks. */
  onFulu: OnFulu;
  /** What it stops at: an OS function or routine Fulu lacks, or input methods. */
  stopsAt?: string;
  /** What its code can call that Fulu lacks (scripts/bbk/fulu-coverage.mts --programs): a call on a path not taken in play counts. */
  scan?: string[];
  firmware: FirmwareCheck;
  /** Problems (PROBLEMS ids) it shows. */
  problems?: string[];
}

export const GAMES: FuluGame[] = [
  { name: "Eros方块", kit: false, onFulu: "ends", firmware: "play", problems: ["sound"] },
  { name: "一中传奇", kit: true, onFulu: "plays", firmware: "play", problems: ["game-bugs"] },
  { name: "一中传奇2", kit: true, onFulu: "plays", firmware: "play" },
  { name: "七剑", kit: true, onFulu: "plays", firmware: "play" },
  { name: "三国霸业", kit: false, onFulu: "plays", firmware: "full" },
  { name: "中国象棋", kit: false, onFulu: "plays", firmware: "play" },
  { name: "丰收", kit: false, onFulu: "ends", firmware: "play" },
  { name: "乒乓球", kit: false, onFulu: "plays", firmware: "play" },
  { name: "二十一点", kit: false, onFulu: "ends", firmware: "play" },
  { name: "二十四点", kit: false, onFulu: "plays", firmware: "play", problems: ["sound"] },
  { name: "五子棋", kit: false, onFulu: "ends", firmware: "play" },
  { name: "仙三外传", kit: true, onFulu: "plays", firmware: "play", problems: ["file-place"] },
  { name: "仙剑三", kit: true, onFulu: "plays", firmware: "play" },
  { name: "仙剑奇侠传二之虎啸飞剑", kit: true, onFulu: "plays", firmware: "play" },
  { name: "仙剑奇侠传四回梦游仙", kit: true, onFulu: "plays", firmware: "play" },
  { name: "仙界传说", kit: true, onFulu: "plays", firmware: "play" },
  { name: "伏魔记-1.0", kit: true, onFulu: "plays", firmware: "full" },
  { name: "伏魔记-1.2", kit: true, onFulu: "plays", firmware: "full" },
  { name: "伏魔记-1.3", kit: true, onFulu: "plays", firmware: "full", problems: ["game-bugs"] },
  { name: "伏魔记完美版1.0", kit: true, onFulu: "plays", firmware: "full" },
  { name: "伏魔记怀旧终曲v1.0(原版精修)", kit: true, onFulu: "plays", firmware: "full" },
  { name: "体闲麻将", kit: false, onFulu: "plays", firmware: "long" },
  { name: "侠客行", kit: true, onFulu: "plays", firmware: "play" },
  { name: "侠客行4988(终曲版)", kit: true, onFulu: "plays", firmware: "play" },
  { name: "公路快车", kit: false, onFulu: "ends", firmware: "play" },
  { name: "冒险岛", kit: true, onFulu: "plays", firmware: "play" },
  { name: "剑缘-第一部", kit: true, onFulu: "plays", firmware: "play" },
  { name: "十字之门", kit: true, onFulu: "plays", firmware: "play" },
  { name: "升级", kit: false, onFulu: "ends", firmware: "play" },
  { name: "华容道", kit: false, onFulu: "ends", firmware: "long" },
  { name: "同福奇缘", kit: true, onFulu: "plays", firmware: "play" },
  { name: "地牢围攻", kit: true, onFulu: "plays", firmware: "play" },
  { name: "坦克大战", kit: false, onFulu: "ends", firmware: "play" },
  { name: "基督山传奇", kit: true, onFulu: "plays", firmware: "play" },
  { name: "大乱斗之火影忍者", kit: true, onFulu: "plays", firmware: "play" },
  { name: "大话三国", kit: true, onFulu: "plays", firmware: "play" },
  { name: "天之骄子", kit: true, onFulu: "plays", firmware: "play" },
  { name: "天之骄子终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "妖 传说", kit: true, onFulu: "plays", firmware: "play" },
  { name: "妖·传说终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "娱乐无极限之无影奸细", kit: true, onFulu: "plays", firmware: "play" },
  { name: "宠物精灵", kit: false, onFulu: "ends", firmware: "long", problems: ["file-place", "input-methods", "unexplained-reads"] },
  { name: "对对碰", kit: false, onFulu: "ends", firmware: "long", problems: ["input-methods"] },
  { name: "封魔录", kit: true, onFulu: "plays", firmware: "play" },
  { name: "将门风云", kit: true, onFulu: "plays", firmware: "play" },
  { name: "少年行", kit: true, onFulu: "plays", firmware: "play" },
  { name: "屠魔", kit: true, onFulu: "plays", firmware: "play" },
  { name: "平面魔方", kit: false, onFulu: "plays", firmware: "long", problems: ["input-methods"] },
  { name: "幸运花", kit: false, onFulu: "plays", firmware: "long" },
  { name: "异世大陆", kit: true, onFulu: "plays", firmware: "play" },
  { name: "异时空游记", kit: true, onFulu: "plays", firmware: "play" },
  { name: "异时空游记2-纵横之旅", kit: true, onFulu: "plays", firmware: "play" },
  { name: "志在青云", kit: true, onFulu: "plays", firmware: "play" },
  { name: "恶龙传说", kit: false, onFulu: "ends", firmware: "long", problems: ["input-methods"] },
  { name: "我的世界", kit: true, onFulu: "plays", firmware: "play" },
  { name: "战国争霸", kit: true, onFulu: "plays", firmware: "play" },
  { name: "扫雷", kit: false, onFulu: "ends", firmware: "play" },
  { name: "投篮游戏", kit: false, onFulu: "ends", firmware: "play" },
  { name: "抗日小兵", kit: true, onFulu: "plays", firmware: "play" },
  { name: "拱猪", kit: false, onFulu: "ends", firmware: "play" },
  { name: "挖金子", kit: false, onFulu: "plays", firmware: "play" },
  { name: "接龙", kit: false, onFulu: "ends", firmware: "play" },
  { name: "搬运工", kit: false, onFulu: "ends", firmware: "long" },
  { name: "新仙剑奇侠传", kit: true, onFulu: "plays", firmware: "play" },
  { name: "新仙剑奇侠传终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "新能源危机", kit: true, onFulu: "plays", firmware: "play" },
  { name: "智多星", kit: false, onFulu: "plays", firmware: "long" },
  { name: "最终幻想", kit: true, onFulu: "plays", firmware: "play" },
  { name: "末日传说", kit: true, onFulu: "plays", firmware: "play" },
  { name: "校园传奇", kit: true, onFulu: "plays", firmware: "play" },
  { name: "梦幻校园", kit: true, onFulu: "plays", firmware: "play" },
  { name: "梦幻西游", kit: true, onFulu: "plays", firmware: "play" },
  { name: "步步高网友俱乐部", kit: true, onFulu: "plays", firmware: "play" },
  { name: "武林新传", kit: true, onFulu: "plays", firmware: "play", problems: ["msgbox-timer", "file-place"] },
  { name: "比大小", kit: false, onFulu: "ends", firmware: "play" },
  { name: "泡泡侠", kit: false, onFulu: "plays", firmware: "play" },
  { name: "泡泡侠 加速版", kit: false, onFulu: "plays", firmware: "play" },
  { name: "洛克人", kit: true, onFulu: "plays", firmware: "play", problems: ["file-place"] },
  { name: "洛特传奇", kit: true, onFulu: "plays", firmware: "play", problems: ["file-place"] },
  { name: "海盗船", kit: false, onFulu: "ends", firmware: "play" },
  { name: "混战三国", kit: true, onFulu: "plays", firmware: "play" },
  { name: "滑雪", kit: false, onFulu: "ends", firmware: "long", problems: ["sound"] },
  { name: "潜艇大战", kit: false, onFulu: "ends", firmware: "play" },
  { name: "炸弹小子", kit: false, onFulu: "plays", firmware: "play" },
  { name: "烈中轶事", kit: true, onFulu: "plays", firmware: "play" },
  { name: "热血传奇", kit: true, onFulu: "plays", firmware: "play", problems: ["game-bugs"] },
  { name: "牛妞历险记", kit: true, onFulu: "plays", firmware: "play" },
  { name: "猪小弟", kit: false, onFulu: "ends", firmware: "play" },
  { name: "猫狗大战", kit: false, onFulu: "plays", firmware: "play" },
  { name: "王氏传", kit: true, onFulu: "plays", firmware: "play" },
  { name: "生命女神之暗之诅咒", kit: true, onFulu: "plays", firmware: "play" },
  { name: "电子宠物", kit: false, onFulu: "ends", firmware: "long", problems: ["input-methods", "file-place"] },
  { name: "疯狂校园", kit: true, onFulu: "plays", firmware: "play" },
  { name: "疯狂盗墓人", kit: true, onFulu: "plays", firmware: "play" },
  { name: "白中传奇", kit: true, onFulu: "ends", firmware: "play" },
  { name: "碰碰车", kit: false, onFulu: "plays", firmware: "long", problems: ["input-methods"] },
  { name: "秘密潜入", kit: false, onFulu: "plays", firmware: "play" },
  { name: "紫璇刀", kit: true, onFulu: "plays", firmware: "play" },
  { name: "纯蓝记", kit: true, onFulu: "plays", firmware: "play" },
  { name: "英雄剑", kit: true, onFulu: "plays", firmware: "play" },
  { name: "英雄剑1", kit: true, onFulu: "plays", firmware: "play" },
  { name: "英雄剑2", kit: true, onFulu: "plays", firmware: "play" },
  { name: "英雄坛", kit: true, onFulu: "plays", firmware: "play" },
  { name: "英雄坛说", kit: true, onFulu: "plays", firmware: "full" },
  { name: "英雄坛说终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "英雄战士", kit: true, onFulu: "plays", firmware: "play" },
  { name: "落世沉浮", kit: true, onFulu: "plays", firmware: "play" },
  { name: "蜘蛛侠三", kit: true, onFulu: "plays", firmware: "play" },
  { name: "螃蟹回家", kit: false, onFulu: "plays", firmware: "play" },
  { name: "诸神黄昏", kit: true, onFulu: "plays", firmware: "play" },
  { name: "豪斯", kit: false, onFulu: "ends", firmware: "play", problems: ["sound"] },
  { name: "贪食蛇", kit: false, onFulu: "plays", firmware: "play" },
  { name: "赛马", kit: false, onFulu: "plays", firmware: "play" },
  { name: "赤壁之战 乱世枭雄", kit: true, onFulu: "plays", firmware: "play" },
  { name: "赤壁之战乱世枭雄终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "跟花", kit: false, onFulu: "ends", firmware: "play" },
  { name: "跳蛋", kit: false, onFulu: "ends", firmware: "play" },
  { name: "过关斩将", kit: true, onFulu: "plays", firmware: "play" },
  { name: "过关斩将4988(终曲版)", kit: true, onFulu: "plays", firmware: "play" },
  { name: "过关斩将4988改主角", kit: true, onFulu: "plays", firmware: "play" },
  { name: "迷宫游戏", kit: false, onFulu: "plays", firmware: "play" },
  { name: "遗忘传说", kit: true, onFulu: "plays", firmware: "play" },
  { name: "遗忘传说终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "释厄传", kit: true, onFulu: "plays", firmware: "play" },
  { name: "金庸群侠传", kit: true, onFulu: "plays", firmware: "play" },
  { name: "金庸群侠传终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "金庸群侠黑暗时代终曲版", kit: true, onFulu: "plays", firmware: "play" },
  { name: "钓鱼", kit: false, onFulu: "ends", firmware: "play" },
  { name: "钓鲨鱼", kit: false, onFulu: "ends", firmware: "play" },
  { name: "问道", kit: true, onFulu: "plays", firmware: "play" },
  { name: "阶梯小子", kit: false, onFulu: "ends", firmware: "play" },
  { name: "飞行特训", kit: false, onFulu: "plays", firmware: "play" },
  { name: "魔塔", kit: false, onFulu: "ends", firmware: "play" },
  { name: "魔塔BT版", kit: false, onFulu: "ends", firmware: "play" },
  { name: "魔塔超级版", kit: false, onFulu: "ends", firmware: "play" },
  { name: "魔法学院", kit: true, onFulu: "plays", firmware: "play" },
  { name: "黑暗之心", kit: true, onFulu: "plays", firmware: "play" },
  { name: "黑白子", kit: false, onFulu: "ends", firmware: "play" },
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

/**
 * The OS's own input bar for Chinese, in instructions: its entries ($E913,
 * $E916, $E919, $E91C, $E91F, $E922, $E925) with $E8F5, which only they call,
 * each instruction once (scripts/bbk/fulu-size.mts <0E00.DAT> e913 e916 e919
 * e91c e91f e922 e925: 2,035, of which 1,931 are not in what Fulu answers).
 */
export const INPUT_BAR_SIZE = 2000;

/** The programs the Shift key stopped before it was written as GuiTranslateMsg has it, and those whose Exit reached $E8E0. */
const SHIFT_STOPPED = ["平面魔方", "碰碰车", "对对碰", "搬运工", "滑雪", "宠物精灵", "电子宠物"];
const EXIT_E8E0 = ["华容道", "滑雪"];
/** How many programs the play test missed something in while it pressed only Enter, the arrows and space. */
export const MISSED_BY_FEW_KEYS = new Set([...SHIFT_STOPPED, ...EXIT_E8E0]).size;

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
    title: { en: "Chinese input: the computer's own input method", zh: "中文输入：用电脑自己的输入法" },
    detail: {
      en: `The OS's own input method (its pinyin bar, about ${INPUT_BAR_SIZE.toLocaleString("en-US")} instructions, and its tables of pinyin and hanzi, which Fulu cannot copy) is not written. Instead, when a program switches to Chinese input (modes 4 and 8), the player shows a box under the screen: what is typed there with the computer's or phone's own input method (pinyin, handwriting, any) goes to the program as the OS's input method gives a chosen character (a message of type 3 with its GB2312 code). The mode changes, their icon and messages are the OS's; BBK's bar is not drawn, and letters pressed on the device go to the box's place (not to the program, as on the device while typing). In the firmware comparison, once a program is in Chinese input, what differs is the bar's own memory and the screen it draws. In the play test with every key, 宠物精灵 ends (once in 180 s: it was quit) and 电子宠物 plays until it ends, as on the device.`,
      zh: `系统自带的输入法（拼音输入栏约 ${INPUT_BAR_SIZE.toLocaleString("en-US")} 条指令，以及符箓不能照搬的拼音与汉字表）没有实现。改为：程序切换到中文输入（模式 4 和 8）时，播放器在屏幕下方显示一个输入框，用电脑或手机自己的输入法（拼音、手写都可以）在框里输入的文字，按系统输入法交出选定汉字的方式交给程序（类型 3 的消息，内容为 GB2312 码）。模式切换、相应图标和消息与系统一致；不绘制步步高的输入栏；在掌机上按下的字母不交给程序（和掌机输入时一样）。与固件对比时，程序进入中文输入后，不同的是输入栏自己的内存和它绘制的画面；在按每个键的试玩测试中，宠物精灵会结束（180 秒内一次：被退出），电子宠物运行到它自行结束，与设备上一样。`,
    },
    status: "decided",
    decision: {
      en: "Use the computer's or phone's own input method (the owner's choice).",
      zh: "使用电脑或手机自己的输入法（作者的选择）。",
    },
  },
  {
    id: "e94d",
    title: { en: "$E94D (a menu)", zh: "$E94D（菜单）" },
    detail: {
      en: "A menu of items in a grid with its own key loop (5,278 instructions with its nine key cases; the first count, 3,400, missed them). Done in round 3: compared with the firmware on 300 random menus and key sequences, and in 中国象棋's play; 中国象棋 plays. Its help key ($E96B) shows a text in memory through $E980; one of the OS's own help texts, which Fulu does not have, would stop it (not seen).",
      zh: "一个网格排列、自带按键循环的菜单（连同九个按键分支共 5,278 条指令；最初估计的 3,400 条漏掉了这些分支）。第 3 轮完成：用 300 个随机菜单和按键序列与固件对比，并在中国象棋的试玩中对比；中国象棋可以运行。它的帮助键（$E96B）通过 $E980 显示内存中的文字；若是系统自带的帮助文字（符箓没有），会停止（尚未见到）。",
    },
    status: "fixed",
  },
  {
    id: "e99e",
    title: { en: "$E99E", zh: "$E99E" },
    detail: {
      en: "Today's date, from the clock's day counter, through seven more of the OS's calendar functions (about 1,750 instructions). Done in round 3 and compared with the firmware on random dates.",
      zh: "从时钟的日计数得到今天的日期，经过系统另外七个日历函数（约 1,750 条指令）。第 3 轮完成，并已用随机日期与固件对比。",
    },
    status: "fixed",
  },
  {
    id: "e9ad",
    title: { en: "$E9AD", zh: "$E9AD" },
    detail: {
      en: "A number drawn in a radix (about 870 instructions). Done in round 3: 挖金子 plays, and its calls, and 跳蛋's, match the firmware.",
      zh: "按进制绘制一个数字（约 870 条指令）。第 3 轮完成：挖金子可以运行，它和跳蛋的调用都与固件一致。",
    },
    status: "fixed",
  },
  {
    id: "help-dialog",
    title: { en: "$E980 (a help screen)", zh: "$E980（帮助画面）" },
    detail: {
      en: "A text shown a page at a time and scrolled by the keys (2,429 instructions with its key cases, and $E8CB, $E8CE, $E8E9). Done in round 3: compared with the firmware on 200 random texts and key sequences, and 幸运花, which opens it 28 times a minute, matches the firmware and plays. The 43 programs that can call it no longer stop there.",
      zh: "一页一页显示文字、用按键滚动的画面（连同按键分支共 2,429 条指令，另有 $E8CB、$E8CE、$E8E9）。第 3 轮完成：用 200 段随机文字和按键序列与固件对比过；一分钟打开它 28 次的幸运花与固件一致，可以运行。可能调用它的 43 个程序不会再停在这里。",
    },
    status: "fixed",
  },
  {
    id: "shift-launcher",
    title: { en: "The Shift key, and the state the launcher leaves", zh: "Shift 键，以及启动器留下的状态" },
    detail: {
      en: `The play test pressed Enter, the arrows and space at random, and never Shift (中英) or Exit. Played with every key, Shift stopped ${SHIFT_STOPPED.length} programs (${SHIFT_STOPPED.join(", ")}): Fulu's GuiTranslateMsg had only some of Shift's cases, and programs started with the OS's variables at 0, where BBK's launcher leaves input mode 2, the keyboard state, the help word and the year. Now Shift is written as GuiTranslateMsg has it (compared with the firmware on random input modes, keyboard states and keys), programs start in the state the launcher leaves (measured on nine launches), and the player sets the device's clock to the computer's date and time, so 幸运花's calendar shows today. The play test now presses every key a player can, Shift and Exit included, and none of the ${GAMES.length} stops.`,
      zh: `原来的试玩测试只随机按确认键、方向键和空格，从没按过 Shift（中英）或“跳出”。按所有键试玩时，Shift 让 ${SHIFT_STOPPED.length} 个程序停下（${SHIFT_STOPPED.join("、")}）：符箓的 GuiTranslateMsg 只有 Shift 的部分分支，而且程序启动时系统变量都是 0，而步步高的启动器会留下输入模式 2、键盘状态、帮助字和年份。现在 Shift 按 GuiTranslateMsg 原样实现（已用随机输入模式、键盘状态和按键与固件对比），程序启动时的状态与启动器留下的一致（在九次启动上测得），播放器把设备的时钟设为电脑的日期和时间，所以幸运花的日历显示今天。试玩测试现在会按玩家能按的每个键，包括 Shift 和“跳出”，${GAMES.length} 个程序都没有停下。`,
    },
    status: "fixed",
  },
  {
    id: "unreached",
    title: { en: "Functions a program can call but none did in random play", zh: "程序可能调用、随机试玩中没有调用的函数" },
    detail: {
      en: "Found by the code scans and traced to what a player does: $E8E0 (Exit in 华容道 and 滑雪 blanks the status bar's number), $E706 (atol: 宠物精灵's cheat box, 体闲麻将's high scores), $E7BE (one double-byte character drawn: 智多星's answer field) and the link cable's serial port ($E8D1, and the resident $E90D and $E910, which the byte scan's list had missed), from 宠物精灵's and 恶龙传说's two-player link menus. All written and compared with the firmware on random arguments; the link as the device with nothing plugged in: sends go out, nothing comes back, and each game shows its own \"could not connect\" (宠物精灵's 建立连接失败 matches the firmware's screens exactly). The firmware emulator itself hangs there, having no transmitter.",
      zh: "由代码扫描发现，并追查到玩家的操作：$E8E0（华容道和滑雪按“跳出”时清除状态栏数字）、$E706（atol：宠物精灵的作弊框、体闲麻将的排行榜）、$E7BE（画一个双字节汉字：智多星的答案输入框），以及联机线的串口（$E8D1，以及字节扫描清单漏掉的常驻例程 $E90D 和 $E910），来自宠物精灵和恶龙传说的双人联机菜单。全部已实现，并用随机参数与固件对比过；联机按设备未插线时的情况处理：数据发出去，没有回应，每个游戏显示自己的“连接失败”（宠物精灵的“建立连接失败”与固件画面完全一致）。固件模拟器本身没有发送器，会卡在那里。",
    },
    decision: {
      en: "The link cable: as the device with no cable plugged in.",
      zh: "联机线：按设备未插线时的情况处理。",
    },
    status: "fixed",
  },
  {
    id: "file-place",
    title: { en: "Where a new save goes in the flash", zh: "新存档在闪存中的位置" },
    detail: {
      en: "The original OS places a new file by pages among its own files; Fulu gives it sectors of its own. A game that saves sees one byte differ: the first of the new file's directory entry, $FF on the device and $D0 on Fulu (in the firmware comparison: 电子宠物, 宠物精灵, 武林新传, 洛特传奇, 仙三外传 and 洛克人, the programs whose minute of play made a new save). Saving and loading work.",
      zh: "原版系统按页把新文件放在它自己的文件之间；符箓给它独立的扇区。存档的游戏会看到一个字节不同：新文件目录项的第一个字节，设备上是 $FF，符箓上是 $D0（与固件对比时，一分钟试玩中新建了存档的程序：电子宠物、宠物精灵、武林新传、洛特传奇、仙三外传和洛克人）。存档和读档都正常。",
    },
    status: "open",
  },
  {
    id: "msgbox-timer",
    title: { en: "A message box's timer count in 武林新传", zh: "武林新传中消息框的定时器计数" },
    detail: {
      en: "In the one-minute firmware comparison (its typing script), once in 13 calls of $E953, the message box that closes itself after a time, the timer's count ($2018) was 7 on Fulu and 1 on the device when it returned. The game played on in both; not looked into yet.",
      zh: "在一分钟的固件对比中（输入脚本），$E953（会自行关闭的消息框）的 13 次调用里有一次，返回时定时器计数（$2018）在符箓上是 7，在设备上是 1。两边的游戏都继续运行；尚未查明原因。",
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

/** When this file was last brought up to date. */
export const UPDATED = "2026-11-21";

/** What Fulu answers (tests/fulu-games.test.ts checks these against src/fulu). */
export const FULU_COUNTS = { functions: 135, routines: 77 };

/**
 * How much of the OS the collection needs, by the code scan
 * (scripts/bbk/fulu-coverage.mts): the API entries and resident routines its
 * 138 programs can call, and the OS code's size in instructions, written and
 * left. written: the firmware code Fulu answers, each instruction counted
 * once (its 135 OS entries with the switches' cases, and its runtime
 * routines), from scripts/bbk/fulu-size.mts (35,587), rounded; left: what the
 * missing entries take with what they call (the input method not counted).
 */
export const COVERAGE = { apiUsed: 106, residentUsed: 76, written: 35600, left: 0 };

/**
 * Fulu's speed against emulating BBK's firmware: CPU time per emulated
 * second, the same random keys on both, after a warm-up, in Node. Measured
 * on 伏魔记-1.0, 英雄坛说, 三国霸业, 中国象棋, 华容道, 五子棋, 贪食蛇, 跳蛋,
 * 体闲麻将, 幸运花, 搬运工 and Eros方块 (docs/fulu-report.md §14.2): from
 * about the same (英雄坛说's title screen, 1.0×) to 6.6× (幸运花), shown as
 * whole numbers.
 */
export const FULU_SPEED = { from: 1, to: 6 };

/**
 * What the code-flow scan (scripts/bbk/fulu-flow.mts, its last lines) cannot
 * follow in the 138 programs: places, and programs with any.
 */
export const FLOW_UNFOLLOWED = {
  all: { places: 142, programs: 106 },
  /** far calls whose target is worked out while running (3), or through a record naming an OS segment (1) */
  farCalls: { places: 4, programs: 4 },
  /** JMP (a,X) */
  jumpTables: { places: 38, programs: 31 },
  /** JMP (a) (3) and calls through $D572 with a pointer not known (2) */
  pointers: { places: 5, programs: 2 },
  /** JSR or JMP into RAM */
  ram: { places: 84, programs: 76 },
  /** places where the followed code leaves the program (an address outside it) */
  outside: { places: 11, programs: 4 },
};

/**
 * The firmware log: all 138 played 180 s each with every key on BBK's
 * firmware; of the OS functions (COVERAGE.apiUsed) and runtime routines
 * (COVERAGE.residentUsed less the far call) in their code, how many they entered.
 */
export const FIRMWARE_LOG = { api: 102, routines: 69 };

/**
 * What else Fulu answers (tests/fulu-games.test.ts checks the sums against
 * src/fulu): OS functions only Fulu's own functions call (the help screen's
 * $F262, $E8CB / $E8CE, the calendar's parts, $E96B...), the status bar's
 * icon functions written with the rest of their set though nothing calls
 * them ($E806, $E809, $E82D-$E842, $E84E), and runtime routines only Fulu's
 * own functions use ($D90B, $D93F). Of the runtime routines the programs
 * call, the far call itself ($D2F6) is Fulu's core, not a routine.
 */
export const FULU_OTHERS = { forFulu: 17, iconSet: 12, routinesForFulu: 2 };

/**
 * The programs that played 180 s of random keys after each step (and those
 * that ended, as on the device). Up to Chinese input the keys were Enter, the
 * arrows and space; from F9 every key a player can press (scripts/bbk/fulu-play.mts),
 * Exit and the menus' quit among them, so more programs end (each is started
 * again for the rest of its 180 s).
 */
export const PLAY_HISTORY: { step: { en: string; zh: string }; plays: number; ends: number }[] = [
  { step: { en: "First play of all 138", zh: "首次试玩全部 138 个" }, plays: 103, ends: 1 },
  { step: { en: "Round 1", zh: "第 1 轮" }, plays: 114, ends: 3 },
  { step: { en: "Round 2", zh: "第 2 轮" }, plays: 128, ends: 5 },
  { step: { en: "Round 3, first part", zh: "第 3 轮（前半）" }, plays: 129, ends: 5 },
  { step: { en: "Round 3, the help screen", zh: "第 3 轮，帮助画面" }, plays: 130, ends: 5 },
  { step: { en: "Round 3, the menu", zh: "第 3 轮，菜单" }, plays: 131, ends: 5 },
  { step: { en: "Chinese typed with the computer's input method", zh: "用电脑的输入法输入中文" }, plays: 132, ends: 6 },
  { step: { en: "Every key, Shift and Exit included", zh: "按每个键，包括 Shift 和“跳出”" }, plays: 105, ends: 33 },
];

export interface Milestone {
  date: string;
  /** The plan's step (docs/fulu-plan.md), if it has one. */
  step?: string;
  title: { en: string; zh: string };
  detail: { en: string; zh: string };
}

/** What has been done, oldest first. */
export const MILESTONES: Milestone[] = [
  {
    date: "2026-11-08",
    step: "F1",
    title: { en: "The foundation", zh: "基础" },
    detail: {
      en: "The OS's memory filled with one trapping byte; the far call, the C runtime and the interrupts reach TypeScript. The shadow run compares Fulu with BBK's firmware from the same machine state.",
      zh: "系统所在的内存填满一个会陷入的字节；远调用、C 运行库和中断都转到 TypeScript。影子运行从同一机器状态比较符箓与步步高固件。",
    },
  },
  {
    date: "2026-11-08",
    step: "F2",
    title: { en: "The six games' OS functions", zh: "六款游戏用到的系统函数" },
    detail: {
      en: "The functions the 伏魔记 series and 英雄坛说 call (51 in all; the file functions and the Yes/No dialog came next): screen, text, keys and messages, the heap, the GUI's start-up, the message box. A minute of play of each: 0 differences.",
      zh: "伏魔记系列和英雄坛说调用的函数（共 51 个；文件函数和是/否对话框随后完成）：屏幕、文字、按键与消息、堆、GUI 启动、消息框。每款玩一分钟：0 处差异。",
    },
  },
  {
    date: "2026-11-08",
    step: "F3",
    title: { en: "Play without firmware, on the site", zh: "在网站上无需固件即可玩" },
    detail: { en: "Fulu becomes an engine on the Games page.", zh: "符箓成为游戏库页面上的一个引擎。" },
  },
  {
    date: "2026-11-09",
    title: { en: "Saving, the Yes/No dialog, the device's pace", zh: "存档、是/否对话框、真机的节奏" },
    detail: {
      en: "The file functions (saves stay in the browser), the dialog, and a cost model that charges each call the firmware's measured time.",
      zh: "文件函数（存档保存在浏览器里）、对话框，以及按固件实测耗时计算每次调用的时间模型。",
    },
  },
  {
    date: "2026-11-09",
    step: "F4, F7",
    title: { en: "HD text and the debug menu", zh: "高清文字和调试菜单" },
    detail: {
      en: "Every character Fulu draws can be redrawn in a real font; a menu reads and changes party, items and story flags.",
      zh: "符箓绘制的每个字都能用真正的字体重画；一个菜单可以查看和修改队伍、物品和剧情标志。",
    },
  },
  {
    date: "2026-11-19",
    step: "F5, F6",
    title: { en: "Wider map view and More text", zh: "更宽的地图视野和更多文字" },
    detail: {
      en: "For the RPG kit's games: more of the map around the device's screen, and dialogues and message boxes in smaller type, more per page. Both checked by hand by the owner.",
      zh: "用于 RPG 工具制作的游戏：在设备屏幕周围显示更多地图；对话和消息框用更小的字，一页显示更多。作者都亲手检查过。",
    },
  },
  {
    date: "2026-11-20",
    title: { en: "三国霸业, the seventh game", zh: "三国霸业，第七款游戏" },
    detail: {
      en: "三国霸业 calls 4 OS functions and 14 runtime routines that the other six games do not. Written here: the last 3 of those functions ($E7FA, $E8BF, $E9E3) and 10 runtime routines (floating point, and calls through a pointer, $D572); checked against the firmware in full.",
      zh: "三国霸业调用的系统函数中有 4 个、运行库例程中有 14 个是其他六款游戏不用的。这里完成了其中最后 3 个函数（$E7FA、$E8BF、$E9E3）和 10 个运行库例程（浮点运算，以及通过指针的调用 $D572）；已与固件完整对比。",
    },
  },
  {
    date: "2026-11-20",
    step: "F8",
    title: { en: "The whole collection, in rounds", zh: "整个合集，分轮推进" },
    detail: {
      en: "All 138 programs played on Fulu: 103 ran the whole time. Round 1 (small OS functions, the runtime's divides) took it to 114; round 2 (bitmaps, circles, the text cursor, the status bar, the message queue) to 128, and 5 more end on their own.",
      zh: "在符箓上试玩全部 138 个程序：103 个全程运行。第 1 轮（小的系统函数、运行库的除法）达到 114；第 2 轮（位图、画圆、文字光标、状态栏、消息队列）达到 128，另有 5 个自行结束。",
    },
  },
  {
    date: "2026-11-20",
    step: "F8",
    title: { en: "Round 3, first part", zh: "第 3 轮（前半）" },
    detail: {
      en: "A number drawn in a radix ($E9AD: 挖金子 plays), today's date and the calendar under it ($E99E and seven more), a whole screen from memory ($E791) and taking a message from the queue ($EA25), each compared with the firmware on random arguments. 幸运花 now gets past its date to the help screen ($E980). Measured on the way: $E94D is 5,278 instructions with its key cases, and the input methods need the OS's pinyin tables.",
      zh: "按进制绘制数字（$E9AD：挖金子可以运行）、今天的日期及其下的日历（$E99E 和另外七个函数）、从内存绘制整屏（$E791）、从队列取消息（$EA25），每个都用随机参数与固件对比过。幸运花现在能越过日期，到达帮助画面（$E980）。同时测得：$E94D 连同按键分支有 5,278 条指令，输入法需要系统的拼音表。",
    },
  },
  {
    date: "2026-11-20",
    step: "F8",
    title: { en: "Round 3: the help screen", zh: "第 3 轮：帮助画面" },
    detail: {
      en: "$E980, a text shown a page at a time and scrolled by the keys, with the screen saved and put back ($E8CB, $E8CE) and the cursor's state ($E8E9): compared with the firmware on 200 random texts and key sequences, and in 幸运花's play. 幸运花 plays; the 43 programs that can call it no longer stop there.",
      zh: "$E980：一页一页显示文字、用按键滚动，并保存和恢复屏幕（$E8CB、$E8CE）及光标状态（$E8E9）。已用 200 段随机文字和按键序列与固件对比，并在幸运花的试玩中对比。幸运花可以运行；可能调用它的 43 个程序不会再停在这里。",
    },
  },
  {
    date: "2026-11-20",
    step: "F8",
    title: { en: "Round 3: the menu", zh: "第 3 轮：菜单" },
    detail: {
      en: "$E94D, a menu of items in a grid with its own key loop (arrows, page keys, 1-9 and A-Z, Enter, Exit, help), with $E96B for its help key: compared with the firmware on 300 random menus and key sequences, and in 中国象棋's play. 中国象棋 plays: every program now plays but the two that type Chinese.",
      zh: "$E94D：网格排列、自带按键循环的菜单（方向键、翻页键、1-9 与 A-Z、确认、退出、帮助），以及帮助键用的 $E96B。已用 300 个随机菜单和按键序列与固件对比，并在中国象棋的试玩中对比。中国象棋可以运行：除了两个需要输入中文的程序，所有程序都能运行。",
    },
  },
  {
    date: "2026-11-20",
    title: { en: "Continue past a stop", zh: "停下后可以继续" },
    detail: {
      en: "A program that meets something Fulu lacks no longer ends there: Continue skips it (the call returns as if done) and the game plays on.",
      zh: "程序遇到符箓尚缺的功能时不再就此结束：选择“继续”即可跳过（这次调用当作已完成返回），游戏接着运行。",
    },
  },
  {
    date: "2026-11-20",
    title: { en: "Chinese typed with the computer's own input method", zh: "用电脑自己的输入法输入中文" },
    detail: {
      en: "When a program switches to Chinese input, the player shows a box for the computer's or phone's own input method, and Fulu gives what is typed to the program as the OS's input method gives a chosen character; with $E929 and $D7F1, 宠物精灵 plays and 电子宠物 plays until it ends. Every program of the collection now plays or ends as on the device.",
      zh: "程序切换到中文输入时，播放器显示一个输入框，使用电脑或手机自己的输入法；符箓按系统输入法交出选定汉字的方式，把输入的文字交给程序。加上 $E929 和 $D7F1，宠物精灵可以运行，电子宠物运行到自行结束。合集中的每个程序现在都能运行，或像在设备上一样自行结束。",
    },
  },
  {
    date: "2026-11-20",
    title: { en: "This progress report; sound kept off", zh: "本进展报告；声音保持关闭" },
    detail: {
      en: "The games list, the owner's hand tests and the problems in one place. The owner decided to keep the sound off for now.",
      zh: "游戏清单、作者的人工测试和问题集中在一处。作者决定暂时保持声音关闭。",
    },
  },
  {
    date: "2026-11-21",
    step: "F9",
    title: { en: "Every key, and every path the scans find", zh: "每一个键，扫描找到的每一条路径" },
    detail: {
      en: `A check of all 138 with two code scans (the byte search and a new code-flow scan), a play test pressing every key and a log of all 138 played on BBK's firmware found what random play with Enter, the arrows and space had missed. Done: the Shift key as GuiTranslateMsg has it; programs start in the state BBK's launcher leaves, with the device's clock set to the computer's date and time; $E8E0 (Exit in 华容道 and 滑雪), $E706 (atol: 宠物精灵's cheat box, 体闲麻将's high scores), $E7BE (智多星's answer field), and the link cable as the device with no cable plugged in, each compared with the firmware. Now both scans find nothing Fulu lacks in any program, the every-key play test finds no stop in any, and the firmware log found nothing a program entered that Fulu lacks: in 180 s of play each they entered ${FIRMWARE_LOG.api} of the ${COVERAGE.apiUsed} OS functions in their code and ${FIRMWARE_LOG.routines} of the ${COVERAGE.residentUsed - 1} runtime routines (the rest, such as $E706 and $E7BE, are on paths random keys did not reach), and nothing outside their code, so no call through a pointer leads anywhere the scans had not found.`,
      zh: `用两种代码扫描（字节搜索和新的代码流扫描）、按每个键的试玩测试，以及在步步高固件上运行全部 138 个程序的记录，检查了全部程序，找到了只随机按确认键、方向键和空格时漏掉的东西。已完成：Shift 键按 GuiTranslateMsg 原样实现；程序启动时的状态与步步高启动器留下的一致，设备时钟设为电脑的日期和时间；$E8E0（华容道和滑雪的“跳出”）、$E706（atol：宠物精灵的作弊框、体闲麻将的排行榜）、$E7BE（智多星的答案输入框），以及按设备未插线处理的联机线，每个都与固件对比过。现在两种扫描在任何程序里都找不到符箓缺少的功能，按每个键的试玩测试没有程序停下，固件记录中也没有程序进入符箓缺少的功能：每个程序玩 180 秒，共进入了它们代码中 ${COVERAGE.apiUsed} 个系统函数里的 ${FIRMWARE_LOG.api} 个、${COVERAGE.residentUsed - 1} 个运行库例程里的 ${FIRMWARE_LOG.routines} 个（其余的，如 $E706 和 $E7BE，在随机按键走不到的路径上），而且没有进入代码之外的任何地方，所以通过指针的调用也没有通向扫描没找到的地方。`,
    },
  },
];

/** What is left: each OS function Fulu lacks that the collection needs, and the input methods. */
export interface Remaining {
  /** The function (as GAMES' stopsAt and scan name it), or "input methods". */
  what: string;
  /** What it is, where known. */
  about?: { en: string; zh: string };
  /** The OS entries it calls that Fulu also lacks. */
  calls?: string[];
  /** Instructions, with what it calls; unknown if not measured. */
  size?: number;
  /** When: the next round, after it, or not planned. */
  plan: "next" | "later";
  problem: string;
}

export const REMAINING: Remaining[] = [
];

/** The programs that stop at, and that can call, a remaining item. */
export function remainingGames(what: string) {
  return {
    stop: GAMES.filter((g) => g.stopsAt === what).map((g) => g.name),
    canCall: GAMES.filter((g) => g.scan?.includes(what)).map((g) => g.name),
  };
}

/** Counts for the summaries. */
export function fuluSummary() {
  const count = (f: (g: FuluGame) => boolean) => GAMES.filter(f).length;
  return {
    total: GAMES.length,
    plays: count((g) => g.onFulu === "plays"),
    ends: count((g) => g.onFulu === "ends"),
    stops: count((g) => g.onFulu === "stops"),
    full: count((g) => g.firmware === "full"),
    long: count((g) => g.firmware === "long"),
    play: count((g) => g.firmware === "play"),
    kit: count((g) => g.kit),
    handTested: new Set(HAND_TESTS.map((t) => t.game)).size,
    scanClean: count((g) => !g.scan?.length),
    open: PROBLEMS.filter((p) => p.status === "open").length,
  };
}

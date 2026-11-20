// Fulu's progress over the programs it should run: the bbk-games
// collection's 138 programs for the Longman 4988 (eebbk/roms; the seven of
// docs/fulu-plan.md among them). One source for the Fulu progress report (/fulu/progress) and for
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
  /** What its code can call that Fulu lacks (scripts/bbk/fulu-coverage.mts --programs): a call on a path not taken in play counts. */
  scan?: string[];
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
  { name: "中国象棋", kit: false, onFulu: "plays", firmware: "play" },
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
  { name: "体闲麻将", kit: false, onFulu: "plays", scan: ["$E706"], firmware: "play" },
  { name: "侠客行", kit: true, onFulu: "plays", firmware: "none" },
  { name: "侠客行4988(终曲版)", kit: true, onFulu: "plays", firmware: "none" },
  { name: "公路快车", kit: false, onFulu: "plays", firmware: "none" },
  { name: "冒险岛", kit: true, onFulu: "plays", firmware: "none" },
  { name: "剑缘-第一部", kit: true, onFulu: "plays", firmware: "none" },
  { name: "十字之门", kit: true, onFulu: "plays", firmware: "none" },
  { name: "升级", kit: false, onFulu: "plays", firmware: "play" },
  { name: "华容道", kit: false, onFulu: "plays", scan: ["$E8E0"], firmware: "play" },
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
  { name: "宠物精灵", kit: false, onFulu: "plays", scan: ["$E706", "$E8D1"], firmware: "play", problems: ["input-methods", "unexplained-reads"] },
  { name: "对对碰", kit: false, onFulu: "plays", firmware: "play", problems: ["input-methods"] },
  { name: "封魔录", kit: true, onFulu: "plays", firmware: "none" },
  { name: "将门风云", kit: true, onFulu: "plays", firmware: "none" },
  { name: "少年行", kit: true, onFulu: "plays", firmware: "none" },
  { name: "屠魔", kit: true, onFulu: "plays", firmware: "none" },
  { name: "平面魔方", kit: false, onFulu: "plays", firmware: "play" },
  { name: "幸运花", kit: false, onFulu: "plays", firmware: "play" },
  { name: "异世大陆", kit: true, onFulu: "plays", firmware: "none" },
  { name: "异时空游记", kit: true, onFulu: "plays", firmware: "none" },
  { name: "异时空游记2-纵横之旅", kit: true, onFulu: "plays", firmware: "none" },
  { name: "志在青云", kit: true, onFulu: "plays", firmware: "none" },
  { name: "恶龙传说", kit: false, onFulu: "ends", scan: ["$E8D1"], firmware: "play", problems: ["input-methods"] },
  { name: "我的世界", kit: true, onFulu: "plays", firmware: "none" },
  { name: "战国争霸", kit: true, onFulu: "plays", firmware: "none" },
  { name: "扫雷", kit: false, onFulu: "plays", firmware: "none" },
  { name: "投篮游戏", kit: false, onFulu: "plays", firmware: "play" },
  { name: "抗日小兵", kit: true, onFulu: "plays", firmware: "none" },
  { name: "拱猪", kit: false, onFulu: "plays", firmware: "play" },
  { name: "挖金子", kit: false, onFulu: "plays", firmware: "play" },
  { name: "接龙", kit: false, onFulu: "plays", firmware: "none" },
  { name: "搬运工", kit: false, onFulu: "plays", firmware: "play" },
  { name: "新仙剑奇侠传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "新仙剑奇侠传终曲版", kit: true, onFulu: "plays", firmware: "none" },
  { name: "新能源危机", kit: true, onFulu: "plays", firmware: "none" },
  { name: "智多星", kit: false, onFulu: "plays", scan: ["$E7BE"], firmware: "play" },
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
  { name: "滑雪", kit: false, onFulu: "plays", scan: ["$E8E0"], firmware: "play", problems: ["sound"] },
  { name: "潜艇大战", kit: false, onFulu: "ends", firmware: "play" },
  { name: "炸弹小子", kit: false, onFulu: "plays", firmware: "none" },
  { name: "烈中轶事", kit: true, onFulu: "plays", firmware: "none" },
  { name: "热血传奇", kit: true, onFulu: "plays", firmware: "none", problems: ["game-bugs"] },
  { name: "牛妞历险记", kit: true, onFulu: "plays", firmware: "none" },
  { name: "猪小弟", kit: false, onFulu: "plays", firmware: "play" },
  { name: "猫狗大战", kit: false, onFulu: "plays", firmware: "play" },
  { name: "王氏传", kit: true, onFulu: "plays", firmware: "none" },
  { name: "生命女神之暗之诅咒", kit: true, onFulu: "plays", firmware: "none" },
  { name: "电子宠物", kit: false, onFulu: "ends", firmware: "play", problems: ["input-methods", "file-place"] },
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
  { name: "跳蛋", kit: false, onFulu: "ends", firmware: "play" },
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
    title: { en: "Chinese input: the computer's own input method", zh: "中文输入：用电脑自己的输入法" },
    detail: {
      en: "The OS's own input method (its pinyin bar, about 3,800 instructions, and its tables of pinyin and hanzi, which Fulu cannot copy) is not written. Instead, when a program switches to Chinese input (modes 4 and 8), the player shows a box under the screen: what is typed there with the computer's or phone's own input method (pinyin, handwriting, any) goes to the program as the OS's input method gives a chosen character (a message of type 3 with its GB2312 code). The mode changes, their icon and messages are the OS's; BBK's bar is not drawn, and letters pressed on the device go to the box's place (not to the program, as on the device while typing). In the firmware comparison those calls differ in the input method's own scratch only. 宠物精灵 plays; 电子宠物 plays until it ends, as on the device.",
      zh: "系统自带的输入法（拼音输入栏约 3,800 条指令，以及符箓不能照搬的拼音与汉字表）没有实现。改为：程序切换到中文输入（模式 4 和 8）时，播放器在屏幕下方显示一个输入框，用电脑或手机自己的输入法（拼音、手写都可以）在框里输入的文字，按系统输入法交出选定汉字的方式交给程序（类型 3 的消息，内容为 GB2312 码）。模式切换、相应图标和消息与系统一致；不绘制步步高的输入栏；在掌机上按下的字母不交给程序（和掌机输入时一样）。与固件对比时，这些调用只在输入法自己的暂存数据上不同。宠物精灵可以运行；电子宠物运行到它自行结束，与设备上一样。",
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
    id: "unreached",
    title: { en: "Functions a program can call but none did in play", zh: "程序可能调用、试玩中没有调用的函数" },
    detail: {
      en: "$E706, $E7BE, $E8D1 and $E8E0 are in the code of one or two programs each (about 1,450 instructions in all), on paths 180 s of random keys never took. A program that takes one stops on Fulu and names it; Continue goes on past it.",
      zh: "$E706、$E7BE、$E8D1 和 $E8E0 各出现在一两个程序的代码里（合计约 1,450 条指令），随机按键 180 秒都没有走到。程序一旦调用，就会在符箓上停止并说出函数名；选择“继续”即可跳过。",
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

/** When this file was last brought up to date. */
export const UPDATED = "2026-11-20";

/** What Fulu answers (tests/fulu-games.test.ts checks these against src/fulu). */
export const FULU_COUNTS = { functions: 131, routines: 75 };

/**
 * How much of the OS the collection needs, by the code scan
 * (scripts/bbk/fulu-coverage.mts): the API entries and resident routines its
 * 138 programs can call, and the OS code's size in instructions, written and
 * left (left: what the missing entries take with what they call; input
 * methods not measured).
 */
export const COVERAGE = { apiUsed: 107, residentUsed: 61, written: 46800, left: 1449 };

/** The programs that played 180 s of random keys after each step (and those that ended on their own). */
export const PLAY_HISTORY: { step: { en: string; zh: string }; plays: number; ends: number }[] = [
  { step: { en: "First play of all 138", zh: "首次试玩全部 138 个" }, plays: 103, ends: 0 },
  { step: { en: "Round 1", zh: "第 1 轮" }, plays: 114, ends: 3 },
  { step: { en: "Round 2", zh: "第 2 轮" }, plays: 128, ends: 5 },
  { step: { en: "Round 3, first part", zh: "第 3 轮（前半）" }, plays: 129, ends: 5 },
  { step: { en: "Round 3, the help screen", zh: "第 3 轮，帮助画面" }, plays: 130, ends: 5 },
  { step: { en: "Round 3, the menu", zh: "第 3 轮，菜单" }, plays: 131, ends: 5 },
  { step: { en: "Chinese typed with the computer's input method", zh: "用电脑的输入法输入中文" }, plays: 132, ends: 6 },
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
    title: { en: "The seven games' OS functions", zh: "七款游戏用到的系统函数" },
    detail: {
      en: "The 55 functions the 伏魔记 series and 英雄坛说 call: screen, text, keys and messages, the heap, the GUI's start-up, the message box. A minute of play of each: 0 differences.",
      zh: "伏魔记系列和英雄坛说调用的 55 个函数：屏幕、文字、按键与消息、堆、GUI 启动、消息框。每款玩一分钟：0 处差异。",
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
    date: "2026-11-18",
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
      en: "Three more OS functions and eight floating-point routines; checked against the firmware in full.",
      zh: "又三个系统函数和八个浮点例程；已与固件完整对比。",
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
  { what: "$E7BE", size: 718, plan: "later", problem: "unreached" },
  { what: "$E706", size: 528, plan: "later", problem: "unreached" },
  { what: "$E8E0", size: 138, plan: "later", problem: "unreached" },
  { what: "$E8D1", size: 65, plan: "later", problem: "unreached" },
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
    play: count((g) => g.firmware === "play"),
    kit: count((g) => g.kit),
    handTested: new Set(HAND_TESTS.map((t) => t.game)).size,
    scanClean: count((g) => !g.scan?.length),
    open: PROBLEMS.filter((p) => p.status === "open").length,
  };
}

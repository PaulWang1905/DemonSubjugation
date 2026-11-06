// The site's text in English and Simplified Chinese: the top bar, the front
// page, the footer and the browser tab titles. (The Guide, About, Games and
// editor pages are still English only.)
import type { SiteLang } from "./siteLang";

/** The site's pages (as in router.tsx). */
type Page = "home" | "games" | "guide" | "about" | "editor" | "notfound";

const en = {
  nav: { home: "Home", games: "Games", guide: "Guide", about: "About", editor: "Editor", notfound: "" } as Record<Page, string>,
  navPlay: "▶ Play",
  menu: "Menu",
  switchTo: "中文",
  switchTitle: "切换到简体中文",
  titles: {
    home: "FMJ React: play and make pocket RPGs in your browser",
    games: "Games · FMJ React",
    guide: "Guide · FMJ React",
    about: "About · FMJ React",
    editor: "Editor · FMJ React",
    notfound: "Page not found · FMJ React",
  } as Record<Page, string>,

  eyebrow: "BBK electronic-dictionary RPG engine",
  heroTitle: "Play and make pocket RPGs in your browser.",
  /** The headline in three lines; the second is set in the accent colour. */
  heroLines: ["Play and make", "pocket RPGs", "in your browser."],
  kicker: ["FMJ / REACT", "BBK RPG engine · 2004 → the web"],
  monitor: { live: "Live", title: "Lantern Path", res: "160 × 96 px" },
  ticker: ["伏魔记", "The Silent Bell", "Lantern Path", "HD text", "LCD screen", "Wider maps", "More text", "Game editor", "Nothing uploaded"],
  wordmark: "FMJ REACT",
  heroLead: [
    "The engine behind 伏魔记 and the many community games made for it, rebuilt for the web. Start with ",
    "The Silent Bell",
    ", a twenty-minute adventure made for this site, open a game you own, or build your own.",
  ],
  playBell: "▶ Play The Silent Bell",
  browse: "Browse your games",
  makeOwn: "Or make your own game in the editor →",
  highlightsLabel: "Highlights",
  highlights: ["Runs in the browser", "Keyboard and touch", "Saves on your device", "Free, nothing uploaded"],
  caption: ["Lantern Path", ", the short demo, playing itself."],

  startTitle: "Two games to start with",
  startSub: "Both were made for this site with its own editor, and both are free to play.",
  bellMeta: "About 20 minutes · two heroes · four bosses",
  bellText:
    "Every dawn the great bell of Bellhaven rings the fog away. This morning it was silent. Bring back the three shards of its heartstone from the forest, the old quarry and the mire.",
  lanternMeta: "About 3 minutes · a first taste",
  lanternText: "The hamlet's great lantern has gone dark. Find the Spark Stone in the glade to the east and light it again.",
  play: "▶ Play",

  betterTitle: "Better than the handheld",
  betterSub: "The games play by the original rules. Around them, the player adds what a 160×96 screen could not.",
  better: [
    { icon: "Aa", stat: "HD", title: "Sharp HD text", text: "Characters redrawn at your screen's full resolution, in 黑体, 宋体 or 楷体, with a choice of English fonts. Or keep the pixel fonts." },
    { icon: "▦", stat: "LCD", title: "LCD screen look", text: "Every pixel a cell of a handheld screen, with fine gaps and a soft shadow; or a smoothing filter that rounds off edges." },
    { icon: "⤢", stat: "17×10", title: "See more of the map", text: "Wider (13×8 tiles) and Widest (17×10) views instead of 9×6. Dialogue and battles stay in the middle, as on the device." },
    { icon: "¶", stat: "10 px", title: "More text per page", text: "12- and 10-pixel fonts drawn for the purpose, so dialogue and descriptions need less paging, with a ▼ when there is more." },
    { icon: "±", stat: "1:1", title: "Any size, still crisp", text: "Zoom in whole-pixel steps, play full screen, or on a phone with a big on-screen keypad. 2× and 4× speed." },
    { icon: "✓", stat: "✓", title: "Faithful, and fixed", text: "Battles, items and scripts checked against a reconstruction of the original engine, with its missing parts filled in and English menus for every game." },
  ],

  doTitle: "What you can do",
  doSub: "Play the classics you own, try the demos, or make a game of your own.",
  doPlay: {
    title: "Play",
    text: "Keyboard or on-screen keypad, three save slots per game, LCD colour palettes, 2× and 4× speed, and English or Chinese menus.",
    link: "Your games →",
  },
  doMake: {
    title: "Make",
    text: ["Paint maps, write story scripts, design characters, items and spells, draw sprites and time spell effects. Playtest in one click and export a ", ".lib", "."],
    link: "Open the editor →",
  },
  doPrivate: {
    title: "Private",
    text: "Nothing is uploaded. Games, saves and projects stay in this browser, and the site ships no game content apart from its own demos.",
    link: "About the project →",
  },
  ctaTitle: "New to BBK games?",
  ctaText: "The guide covers the controls, saving, playing on a phone and the options worth knowing.",
  ctaButton: "Read the guide",

  footerTagline: "Play and make pocket RPGs in your browser.",
  footerLabel: "Footer",
  footerPlay: "Play the demo",
  footerSource: "Source on GitHub",
  footerIssue: "Report a problem",
  guide: {
    eyebrow: "Guide",
    title: "How to play",
    lead: "Everything you need to pick up a game, play it on any device and keep your progress.",
    stepsTitle: "Three steps",
    step1: { title: "Pick a game", text: ["Start with ", "The Silent Bell", " or ", "Lantern Path", ", open a ", ".lib", " archive you own, or add one from a link on the ", "Games", " page."] },
    step2: { title: "Play anywhere", text: "Keyboard on a computer, a full-screen keypad on a phone. Save at any time; saves stay in this browser." },
    step3: { title: "Make your own", text: ["On a computer, open the ", "editor", ": paint maps, write the story, draw sprites, playtest in one click and export a ", ".lib", "."] },
    controlsTitle: "Controls",
    controlsSub: "On a phone the keypad appears by itself: slide your thumb on the d-pad to turn, and hold a direction with A.",
    keysHead: ["Action", "Keyboard", "Phone keypad"],
    /** action, keyboard, phone keypad */
    keys: [
      ["Move / select", "Arrow keys · WASD", "D-pad"],
      ["Confirm", "Enter · J · Z", "A (OK)"],
      ["Back / menu", "Esc · Space · K · X", "B (Back)"],
      ["Page up / down", "[ ] · Q E · PgUp PgDn", "PgUp / PgDn"],
    ],
    tipsTitle: "Tips",
    tips: [
      { title: "Saving", text: "Press Back on the map to open the menu, then Sys → Save (系统 → 存储进度 in Chinese games). Each game has three save slots, kept in this browser." },
      { title: "Size and full screen", text: "Size − / + zooms the screen in whole-pixel steps, and the ⛶ button shows only the game. On an iPhone, add the site to your home screen to play without the browser bars." },
      { title: "Pixel or HD text", text: "Text is Pixel (the handheld's 16×16 bitmap look) or HD (redrawn at your screen's full resolution); pick a font for Chinese and one for English. Have the device's HZK16 and ASC16 files? Add them on the Games page for the original font." },
      { title: "Screen look", text: "Screen picks the colours, Effect gives an LCD look (with or without a shadow) or smooths the pixels, and Map shows more of the map around you." },
      { title: "More text per page", text: "The experimental More text option fits more words into dialogue, menus and descriptions, so there is less paging. A ▼ shows when a description goes on." },
      { title: "Original engine rules", text: "On by default: battles, items and scripts follow the original device's engine. Turn it off for fmj.kt's simpler rules." },
    ],
  },

  about: {
    eyebrow: "About",
    title: "A pocket RPG engine, rebuilt for the web",
    p1: ["In the 2000s, BBK electronic dictionaries shipped with a small role-playing game engine. ", "伏魔记", " was its best-known game, and fans went on to make many more for it."],
    p2: "FMJ React brings that engine to the web. It is a TypeScript port of the open-source fmj.kt re-implementation, checked against a reconstruction of the original engine so that battles, scripts and items behave as they did on the device. On top it adds HD text, an LCD screen look, wider map views, more text per page, a phone layout and a complete game editor.",
    facts: [
      ["Engine", "TypeScript and React, no plugins"],
      ["Licence", "GPL-2.0, like fmj.kt"],
      ["Game data", "None included apart from the demos"],
      ["Source", "GitHub"],
    ],
    builtTitle: "Built on",
    fmjkt: "An open-source re-implementation of the BBK engine. FMJ React's engine is ported from it (GPL-2.0).",
    fmjEngine: "A reconstruction of the original engine from its machine code, used to check how the device really behaved.",
    baye: "A fork of the engine whose fixes and extra script commands were taken in.",
    privacyTitle: "Privacy",
    privacy: "Nothing you open is uploaded: games, saves, fonts and editor projects stay in this browser. The site counts page visits with Vercel Web Analytics, without cookies. Game content belongs to its respective owners.",
    issue: ["Found a problem or have an idea? ", "Open an issue on GitHub", "."],
  },
  footerCredit: [
    "Engine ported from ",
    " (GPL-2.0) with fixes from the baye-fmj-app fork, and checked against ",
    ", a reconstruction of the original engine. Game content belongs to its respective owners.",
  ],
};

export type SiteText = typeof en;

const zh: SiteText = {
  nav: { home: "首页", games: "游戏", guide: "指南", about: "关于", editor: "编辑器", notfound: "" },
  navPlay: "▶ 开始玩",
  menu: "菜单",
  switchTo: "EN",
  switchTitle: "Switch to English",
  titles: {
    home: "FMJ React：在浏览器里畅玩和制作掌上 RPG",
    games: "游戏 · FMJ React",
    guide: "指南 · FMJ React",
    about: "关于 · FMJ React",
    editor: "编辑器 · FMJ React",
    notfound: "找不到页面 · FMJ React",
  },

  eyebrow: "步步高电子词典 RPG 引擎",
  heroTitle: "在浏览器里畅玩和制作掌上 RPG。",
  heroLines: ["在浏览器里", "畅玩和制作", "掌上 RPG。"],
  kicker: ["FMJ / REACT", "步步高 RPG 引擎 · 2004 → 网页"],
  monitor: { live: "实时", title: "Lantern Path", res: "160 × 96 像素" },
  ticker: ["伏魔记", "The Silent Bell", "Lantern Path", "高清文字", "液晶屏效果", "更宽的地图", "一页更多文字", "游戏编辑器", "不上传任何内容"],
  wordmark: "FMJ REACT",
  heroLead: [
    "《伏魔记》和众多玩家自制游戏背后的引擎，现在搬到了网页上。可以先玩为本站制作的二十分钟冒险 ",
    "The Silent Bell",
    "，也可以打开你自己的游戏，或者亲手做一款。",
  ],
  playBell: "▶ 开始玩 The Silent Bell",
  browse: "浏览你的游戏",
  makeOwn: "或者用编辑器做一款自己的游戏 →",
  highlightsLabel: "亮点",
  highlights: ["浏览器直接运行", "键盘和触屏都能玩", "存档保存在本机", "免费，不上传任何内容"],
  caption: ["Lantern Path", "（短篇演示）正在自动游玩。"],

  startTitle: "两款入门游戏",
  startSub: "都由本站自带的编辑器制作，都可以免费畅玩。",
  bellMeta: "约 20 分钟 · 两位主角 · 四个首领",
  bellText: "每天清晨，钟港镇的大钟都会敲响，驱散晨雾。可今天早上，钟声没有响起。去森林、旧采石场和沼泽，找回钟心石的三块碎片吧。",
  lanternMeta: "约 3 分钟 · 浅尝一下",
  lanternText: "小村的大灯笼熄灭了。到东边的林间空地找到火花石，把它重新点亮。",
  play: "▶ 开始玩",

  betterTitle: "比掌机更好玩",
  betterSub: "游戏按原版规则运行；在此之外，播放器补上了 160×96 小屏幕做不到的东西。",
  better: [
    { icon: "Aa", stat: "HD", title: "清晰的高清文字", text: "文字按屏幕的实际分辨率重新绘制，可选黑体、宋体或楷体，英文也有多种字体可选；也可以保留像素字体。" },
    { icon: "▦", stat: "LCD", title: "液晶屏效果", text: "每个像素都像掌机屏幕上的一个点，带细小的格线和柔和的阴影；也可以用平滑滤镜让边缘更圆润。" },
    { icon: "⤢", stat: "17×10", title: "看到更多地图", text: "除了原版的 9×6 格，还有更宽（13×8）和最宽（17×10）的视野。对话和战斗仍在中间，和掌机上一样。" },
    { icon: "¶", stat: "10 px", title: "一页显示更多文字", text: "专门绘制的 12 和 10 像素字体，让对话和说明少翻页；还有下文时会显示 ▼。" },
    { icon: "±", stat: "1:1", title: "任意大小，依然清晰", text: "按整像素缩放，也可以全屏玩，或者在手机上用大号屏幕按键玩。支持 2 倍和 4 倍速。" },
    { icon: "✓", stat: "✓", title: "忠于原版，也修好了问题", text: "战斗、道具和脚本都对照原版引擎的还原项目校验，补全了缺失的部分，每款游戏都可以用英文菜单。" },
  ],

  doTitle: "你可以做什么",
  doSub: "玩你拥有的经典游戏、试试演示，或者做一款自己的游戏。",
  doPlay: {
    title: "游玩",
    text: "键盘或屏幕按键操作，每款游戏三个存档位，多种液晶屏配色，2 倍和 4 倍速，中英文菜单。",
    link: "你的游戏 →",
  },
  doMake: {
    title: "制作",
    text: ["绘制地图、编写剧情脚本，设计角色、道具和法术，画精灵图并调整法术特效的时间。一键试玩，导出 ", ".lib", " 文件。"],
    link: "打开编辑器 →",
  },
  doPrivate: {
    title: "隐私",
    text: "不上传任何内容。游戏、存档和项目都保存在这个浏览器里；除了本站自己的演示，网站不附带任何游戏内容。",
    link: "关于本项目 →",
  },
  ctaTitle: "第一次玩步步高游戏？",
  ctaText: "指南介绍了操作方式、存档、在手机上怎么玩，以及值得了解的选项。",
  ctaButton: "阅读指南",

  footerTagline: "在浏览器里畅玩和制作掌上 RPG。",
  footerLabel: "页脚",
  footerPlay: "玩演示",
  footerSource: "GitHub 源代码",
  footerIssue: "反馈问题",
  guide: {
    eyebrow: "指南",
    title: "怎么玩",
    lead: "拿起一款游戏、在任何设备上玩、保存进度，你需要知道的都在这里。",
    stepsTitle: "三步上手",
    step1: { title: "选一款游戏", text: ["先玩 ", "The Silent Bell", " 或 ", "Lantern Path", "，也可以打开你自己的 ", ".lib", " 游戏文件，或者在", "游戏", "页面通过链接添加。"] },
    step2: { title: "随处可玩", text: "电脑上用键盘，手机上用全屏按键。随时可以存档，存档保存在这个浏览器里。" },
    step3: { title: "自己做游戏", text: ["在电脑上打开", "编辑器", "：绘制地图、编写剧情、画精灵图，一键试玩，导出 ", ".lib", " 文件。"] },
    controlsTitle: "操作",
    controlsSub: "在手机上按键会自动出现：拇指在方向键上滑动即可转向，按住方向的同时可以按 A。",
    keysHead: ["动作", "键盘", "手机按键"],
    keys: [
      ["移动 / 选择", "方向键 · WASD", "方向键"],
      ["确认", "Enter · J · Z", "A（确定）"],
      ["返回 / 菜单", "Esc · 空格 · K · X", "B（返回）"],
      ["上一页 / 下一页", "[ ] · Q E · PgUp PgDn", "PgUp / PgDn"],
    ],
    tipsTitle: "小提示",
    tips: [
      { title: "存档", text: "在地图上按返回键打开菜单，选择「系统 → 存储进度」（英文游戏里是 Sys → Save）。每款游戏有三个存档位，保存在这个浏览器里。" },
      { title: "画面大小和全屏", text: "「大小」的 − / + 按整像素缩放画面，⛶ 按钮只显示游戏画面。在 iPhone 上，把网站添加到主屏幕，就可以不带浏览器栏来玩。" },
      { title: "像素文字或高清文字", text: "「文字」可以选像素（掌机的 16×16 点阵效果）或高清（按屏幕的实际分辨率重新绘制），再分别选中文和英文的字体。有掌机的 HZK16 和 ASC16 字库文件？在游戏页面添加后就能用原版字体。" },
      { title: "画面效果", text: "「配色」选择屏幕颜色，「效果」可以加液晶屏效果（带或不带阴影）或让像素更平滑，「地图」可以看到周围更多的地图。" },
      { title: "一页显示更多文字", text: "实验性的「更多文字」选项让对话、菜单和说明一页放下更多字，少翻页。说明还有下文时会显示 ▼。" },
      { title: "原版引擎规则", text: "「原版引擎规则」默认开启：战斗、道具和脚本都按原版掌机的引擎运行。关闭后使用 fmj.kt 较简单的规则。" },
    ],
  },

  about: {
    eyebrow: "关于",
    title: "掌上 RPG 引擎，为网页重新打造",
    p1: ["2000 年代，步步高电子词典里内置了一个小型角色扮演游戏引擎。", "《伏魔记》", "是其中最有名的游戏，玩家们后来又为它制作了许多新游戏。"],
    p2: "FMJ React 把这个引擎带到了网页上。它是开源重制版 fmj.kt 的 TypeScript 移植，并对照原版引擎的还原项目校验，让战斗、脚本和道具的表现和掌机上一致。在此之上，它还加入了高清文字、液晶屏效果、更宽的地图视野、一页更多文字、手机布局，以及一个完整的游戏编辑器。",
    facts: [
      ["引擎", "TypeScript 和 React，无需插件"],
      ["许可证", "GPL-2.0，与 fmj.kt 相同"],
      ["游戏数据", "除演示外不包含任何游戏"],
      ["源代码", "GitHub"],
    ],
    builtTitle: "基于这些项目",
    fmjkt: "步步高引擎的开源重制版。FMJ React 的引擎就是从它移植而来（GPL-2.0）。",
    fmjEngine: "根据机器码还原的原版引擎，用来核对掌机上的真实表现。",
    baye: "这个引擎的一个分支，吸收了它的修复和新增的脚本命令。",
    privacyTitle: "隐私",
    privacy: "你打开的任何内容都不会上传：游戏、存档、字库和编辑器项目都保存在这个浏览器里。网站使用 Vercel Web Analytics 统计页面访问量，不使用 Cookie。游戏内容版权归各自所有者。",
    issue: ["发现问题或有想法？", "在 GitHub 上提交 issue", "。"],
  },
  footerCredit: ["引擎移植自 ", "（GPL-2.0），吸收了 baye-fmj-app 分支的修复，并对照原版引擎的还原项目 ", " 校验。游戏内容版权归各自所有者。"],
};

export const SITE_TEXT: Record<SiteLang, SiteText> = { en, zh };

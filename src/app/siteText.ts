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
    { icon: "Aa", title: "Sharp HD text", text: "Characters redrawn at your screen's full resolution, in 黑体, 宋体 or 楷体, with a choice of English fonts. Or keep the pixel fonts." },
    { icon: "▦", title: "LCD screen look", text: "Every pixel a cell of a handheld screen, with fine gaps and a soft shadow; or a smoothing filter that rounds off edges." },
    { icon: "⤢", title: "See more of the map", text: "Wider (13×8 tiles) and Widest (17×10) views instead of 9×6. Dialogue and battles stay in the middle, as on the device." },
    { icon: "¶", title: "More text per page", text: "12- and 10-pixel fonts drawn for the purpose, so dialogue and descriptions need less paging, with a ▼ when there is more." },
    { icon: "±", title: "Any size, still crisp", text: "Zoom in whole-pixel steps, play full screen, or on a phone with a big on-screen keypad. 2× and 4× speed." },
    { icon: "✓", title: "Faithful, and fixed", text: "Battles, items and scripts checked against a reconstruction of the original engine, with its missing parts filled in and English menus for every game." },
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
    { icon: "Aa", title: "清晰的高清文字", text: "文字按屏幕的实际分辨率重新绘制，可选黑体、宋体或楷体，英文也有多种字体可选；也可以保留像素字体。" },
    { icon: "▦", title: "液晶屏效果", text: "每个像素都像掌机屏幕上的一个点，带细小的格线和柔和的阴影；也可以用平滑滤镜让边缘更圆润。" },
    { icon: "⤢", title: "看到更多地图", text: "除了原版的 9×6 格，还有更宽（13×8）和最宽（17×10）的视野。对话和战斗仍在中间，和掌机上一样。" },
    { icon: "¶", title: "一页显示更多文字", text: "专门绘制的 12 和 10 像素字体，让对话和说明少翻页；还有下文时会显示 ▼。" },
    { icon: "±", title: "任意大小，依然清晰", text: "按整像素缩放，也可以全屏玩，或者在手机上用大号屏幕按键玩。支持 2 倍和 4 倍速。" },
    { icon: "✓", title: "忠于原版，也修好了问题", text: "战斗、道具和脚本都对照原版引擎的还原项目校验，补全了缺失的部分，每款游戏都可以用英文菜单。" },
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
  footerCredit: ["引擎移植自 ", "（GPL-2.0），吸收了 baye-fmj-app 分支的修复，并对照原版引擎的还原项目 ", " 校验。游戏内容版权归各自所有者。"],
};

export const SITE_TEXT: Record<SiteLang, SiteText> = { en, zh };

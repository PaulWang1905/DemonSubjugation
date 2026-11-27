// The site's text in English and Simplified Chinese: the top bar, the front
// page, the footer, the browser tab titles and page descriptions, the
// page-not-found page and the editor's small-screen note. (The Guide and About pages have
// theirs in InfoPages.tsx, the Games page in gamesText.ts, the Fulu pages in
// FuluPage.tsx and FuluProgressPage.tsx; the editor is still English only.)
import type { SiteLang } from "./siteLang";
import { fuluSummary } from "./fuluGames";
import { mapTiles, SPEEDS } from "./playerOptions";

const TOP_SPEED = Math.max(...SPEEDS);

// How many of the 4988 game collection's programs run on Fulu (from its progress list).
const FULU = fuluSummary();
const FULU_RUN = FULU.plays + FULU.ends;
const FULU_ALL = FULU_RUN === FULU.total;

/** The site's pages (as in router.tsx). */
type Page = "home" | "games" | "guide" | "fulu" | "fulu-progress" | "about" | "editor" | "notfound";

const en = {
  nav: { home: "Home", games: "Games", guide: "Guide", fulu: "Fulu", "fulu-progress": "Progress", about: "About", editor: "BBK Maker", notfound: "" } as Record<Page, string>,
  navPlay: "▶ Play",
  menu: "Menu",
  navLabel: "Site",
  switchTo: "中文",
  switchTitle: "切换到简体中文",
  titles: {
    home: "BUBU: BUBU's Unofficial BBK Universe",
    games: "Games · BUBU",
    guide: "Guide · BUBU",
    fulu: "Fulu: the 4988's OS, rewritten · BUBU",
    "fulu-progress": "Fulu progress report · BUBU",
    about: "About · BUBU",
    editor: "BBK Maker · BUBU",
    notfound: "Page not found · BUBU",
  } as Record<Page, string>,
  /** Each page's description, for search engines and link previews. */
  descriptions: {
    home: "BUBU's Unofficial BBK Universe: play BBK electronic-dictionary games in your browser. FMJ React, the RPG engine behind 伏魔记 rebuilt for the web; the Longman 4988's own games on Fulu, no firmware needed; and BBK Maker to make your own.",
    games: "Your games: the two free demos and the .lib and .gam games you add, each played on the engine you choose. Nothing leaves your browser.",
    guide: "How to play: add a game, pick an engine, play with a keyboard or a phone, type Chinese, and keep your saves.",
    fulu: `Fulu (符箓) is a new operating system for the Longman 4988 pocket dictionary, so its games play in your browser without BBK's firmware: ${FULU_ALL ? "all" : `${FULU_RUN} of the`} ${FULU.total} programs of its game collection.`,
    "fulu-progress": "Fulu's progress report: every program of the 4988 game collection, how it was checked, what is left and every known problem.",
    about: "About BUBU (BUBU's Unofficial BBK Universe), a fan project: FMJ React, an open-source web port of the BBK pocket RPG engine; Fulu, a new OS for the Longman 4988; the 4988 emulated; and BBK Maker, a game editor.",
    editor: "BBK Maker: make your own pocket RPG in the browser: maps, story scripts, sprites and spells, then export a .lib or a .gam.",
    notfound: "This page does not exist.",
  } as Record<Page, string>,

  heroTitle: "Pocket RPGs, in your browser.",
  /** The headline: two lines, the second in the accent colour. */
  heroLines: ["Pocket RPGs,", "in your browser."],
  kicker: ["BUBU", "BUBU's Unofficial BBK Universe"],
  monitor: { live: "Live", title: "Lantern Path", res: "160 × 96 px" },
  scrollHint: "Scroll",
  wordmark: "BUBU",
  heroLead: ["FMJ React: the engine behind ", "伏魔记", ", rebuilt for the web."],
  uploadCta: "Upload your game",
  tryBell: "Try The Silent Bell",
  upload: {
    title: "Bring your own game.",
    text: ["Drop ", "伏魔记", " or any BBK RPG here (a .lib file), or a program for the Longman 4988 (a .gam). It never leaves your browser."],
    button: "Choose a game file",
    drop: "Or drop it anywhere here",
    hint: "*.lib or *.gam · HZK16 and ASC16 fonts too, if you have them",
    busy: "Opening…",
  },
  playBell: "▶ Play The Silent Bell",
  browse: "Your games",
  makeOwn: "Or open BBK Maker →",
  caption: ["Lantern Path", ", playing itself."],

  startTitle: "No game at hand? Try ours.",
  startSub: "Two free games, made with our own editor.",
  bellMeta: "20 minutes · 2 heroes · 4 bosses",
  bellText: "Bellhaven's bell fell silent. Find out why.",
  lanternMeta: "3 minutes · a first taste",
  lanternText: "The hamlet's lantern went dark. Light it again.",
  play: "▶ Play",

  betterTitle: "Better than the handheld.",
  betterSub: "Same games. Same rules. Seen anew.",
  better: [
    { img: "/home/hd.webp", title: "Sharp as print.", text: "Text redrawn at your screen's full resolution. 黑体, 宋体 or 楷体.", alt: "The Silent Bell with HD text" },
    { img: "/home/lcd.webp", title: "Every pixel, a real LCD cell.", text: "Fine gaps. A soft shadow. The screen you remember.", alt: "The Silent Bell with the LCD effect" },
    { img: "/home/wide.webp", title: "See more of the world.", text: `Up to ${mapTiles("widest")} tiles, not ${mapTiles("normal")}.`, alt: "The Silent Bell in the widest map view" },
    { img: "/home/more.webp", title: "More words. Fewer pages.", text: "Fonts drawn for 12 and 10 pixels. Four or five lines where there were two.", alt: "Four lines of dialogue in one box" },
    { img: "/home/faithful.webp", title: "True to the original.", text: "Battles, items and scripts, checked against the device's own engine.", alt: "The game menu" },
  ],

  doTitle: "Yours to play. And to make.",
  doSub: "",
  doPlay: { title: "Play", text: `Your games. Three save slots each. Up to ${TOP_SPEED}× speed.`, link: "Your games →" },
  doMake: { title: "Make", text: ["Maps, scripts, sprites, spells. Export a ", ".lib", " or a .gam."], link: "Open BBK Maker →" },
  do4988: {
    title: "4988 games",
    text: `${FULU_ALL ? "All" : `${FULU_RUN} of the`} ${FULU.total} programs of the Longman 4988's game collection, on Fulu. No firmware needed.`,
    link: "About Fulu →",
  },
  doPrivate: { title: "Private", text: "Nothing leaves your browser.", link: "About →" },

  notFound: {
    eyebrow: "Page not found",
    title: "This road leads nowhere",
    text: ["There is no page at ", ". It may have moved, or the link may be mistyped."],
    home: "Go to the home page",
    games: "Your games",
    play: "Or play The Silent Bell →",
  },
  smallScreen: {
    title: "The editor needs a bigger screen",
    text: "Making a game means painting maps, editing scripts and drawing sprites, which needs more room than a phone has. Open this site on a computer or a tablet to use the editor.",
    note: "Your phone is great for playing: games, saves and the built-in demos all work here.",
    back: "Back to the games",
    anyway: "Continue anyway",
  },

  footerTagline: "BUBU's Unofficial BBK Universe. A fan project, not affiliated with BBK (步步高).",
  footerLabel: "Footer",
  footerPlay: "Play the demo",
  footerSource: "Source on GitHub",
  footerIssue: "Report a problem",
  guide: {
    keysHead: ["Action", "Keyboard", "Phone keypad"],
    /** action, keyboard, phone keypad */
    keys: [
      ["Move / select", "Arrow keys · WASD", "D-pad"],
      ["Confirm", "Enter · J · Z", "A (OK)"],
      ["Back / menu", "Esc · Space · Backspace · K · X", "B (Back)"],
      ["Page up / down", "[ ] · Q E · PgUp PgDn", "PgUp / PgDn"],
    ],
  },

  footerCredit: [
    "Engine ported from ",
    " (GPL-2.0) with fixes from the baye-fmj-app fork, and checked against ",
    ", a reconstruction of the original engine. Game content belongs to its respective owners.",
  ],
};

export type SiteText = typeof en;

const zh: SiteText = {
  nav: { home: "首页", games: "游戏", guide: "指南", fulu: "符箓", "fulu-progress": "进展", about: "关于", editor: "BBK Maker", notfound: "" },
  navPlay: "▶ 开始玩",
  menu: "菜单",
  navLabel: "网站",
  switchTo: "EN",
  switchTitle: "Switch to English",
  titles: {
    home: "步步 BUBU：步步的步步高游戏世界",
    games: "游戏 · BUBU",
    guide: "指南 · BUBU",
    fulu: "符箓：重写的 4988 系统 · BUBU",
    "fulu-progress": "符箓进展报告 · BUBU",
    about: "关于 · BUBU",
    editor: "BBK Maker · BUBU",
    notfound: "找不到页面 · BUBU",
  },
  descriptions: {
    home: "步步的步步高游戏世界：在浏览器里玩步步高电子词典游戏。FMJ React 是《伏魔记》RPG 引擎的网页重制；朗文 4988 自己的游戏在符箓上运行，不需要固件；还能用 BBK Maker 制作你自己的游戏。",
    games: "你的游戏：两款免费演示，以及你添加的 .lib 和 .gam 游戏，每款都用你选择的引擎来玩。文件不会离开你的浏览器。",
    guide: "怎么玩：添加游戏、选择引擎、用键盘或手机游玩、输入中文、保存进度。",
    fulu: `符箓是为朗文 4988 电子词典重新编写的操作系统，让它的游戏不需要步步高的固件就能在浏览器里运行：游戏合集的 ${FULU.total} 个程序${FULU_ALL ? "全部" : `中有 ${FULU_RUN} 个`}能玩。`,
    "fulu-progress": "符箓进展报告：4988 游戏合集的每个程序、它们是怎么检查的、还剩什么，以及所有已知问题。",
    about: "关于步步 BUBU（步步的步步高游戏世界），一个爱好者项目：FMJ React 是步步高掌上 RPG 引擎的开源网页版；符箓是为朗文 4988 编写的新操作系统；还有模拟的 4988 和游戏编辑器 BBK Maker。",
    editor: "BBK Maker：在浏览器里制作你自己的掌上 RPG：地图、剧情脚本、角色和法术，然后导出 .lib 或 .gam。",
    notfound: "这个页面不存在。",
  },

  heroTitle: "掌上 RPG，就在浏览器里。",
  heroLines: ["掌上 RPG，", "就在浏览器里。"],
  kicker: ["步步 BUBU", "步步的步步高游戏世界"],
  monitor: { live: "实时", title: "Lantern Path", res: "160 × 96 像素" },
  scrollHint: "向下滚动",
  wordmark: "BUBU",
  heroLead: ["FMJ React：", "《伏魔记》", "背后的引擎，为网页重新打造。"],
  uploadCta: "上传你的游戏",
  tryBell: "试玩 The Silent Bell",
  upload: {
    title: "带上你的游戏。",
    text: ["把", "《伏魔记》", "或任何步步高 RPG（.lib 文件），或朗文 4988 的程序（.gam 文件）放到这里。文件不会离开你的浏览器。"],
    button: "选择游戏文件",
    drop: "或者直接拖到这里",
    hint: "*.lib 或 *.gam · 如果有 HZK16 和 ASC16 字库，也可以一起添加",
    busy: "正在打开…",
  },
  playBell: "▶ 开始玩 The Silent Bell",
  browse: "你的游戏",
  makeOwn: "或者打开 BBK Maker →",
  caption: ["Lantern Path", "，正在自动游玩。"],

  startTitle: "手边没有游戏？试试我们的。",
  startSub: "两款免费游戏，用本站自己的编辑器制作。",
  bellMeta: "20 分钟 · 2 位主角 · 4 个首领",
  bellText: "钟港镇的大钟沉默了。去找出原因。",
  lanternMeta: "3 分钟 · 浅尝一下",
  lanternText: "小村的灯笼熄灭了。把它重新点亮。",
  play: "▶ 开始玩",

  betterTitle: "比掌机更好。",
  betterSub: "同样的游戏，同样的规则，全新的样子。",
  better: [
    { img: "/home/hd.webp", title: "清晰如印刷。", text: "文字按屏幕的实际分辨率重新绘制。黑体、宋体、楷体任选。", alt: "使用高清文字的 The Silent Bell" },
    { img: "/home/lcd.webp", title: "每个像素，都是液晶的一格。", text: "细腻的格线，柔和的阴影。就是记忆里的那块屏幕。", alt: "使用液晶屏效果的 The Silent Bell" },
    { img: "/home/wide.webp", title: "看见更大的世界。", text: `最多 ${mapTiles("widest")} 格，而不是 ${mapTiles("normal")}。`, alt: "最宽地图视野下的 The Silent Bell" },
    { img: "/home/more.webp", title: "字更多，页更少。", text: "专为 12 和 10 像素绘制的字体。原来两行，现在四到五行。", alt: "一个对话框里放下四行对话" },
    { img: "/home/faithful.webp", title: "忠于原版。", text: "战斗、道具和脚本，都对照原版引擎校验。", alt: "游戏菜单" },
  ],

  doTitle: "可以玩，也可以做。",
  doSub: "",
  doPlay: { title: "游玩", text: `你的游戏。每款三个存档位。最高 ${TOP_SPEED} 倍速。`, link: "你的游戏 →" },
  doMake: { title: "制作", text: ["地图、脚本、精灵图、法术。导出 ", ".lib", " 或 .gam 文件。"], link: "打开 BBK Maker →" },
  do4988: {
    title: "4988 游戏",
    text: `朗文 4988 游戏合集的 ${FULU.total} 个程序${FULU_ALL ? "全部" : `中有 ${FULU_RUN} 个`}能在符箓上玩。不需要固件。`,
    link: "了解符箓 →",
  },
  doPrivate: { title: "隐私", text: "什么都不会离开你的浏览器。", link: "关于 →" },

  notFound: {
    eyebrow: "找不到页面",
    title: "此路不通",
    text: ["本站没有 ", " 这个页面。它可能已经移走，或者链接拼错了。"],
    home: "回到首页",
    games: "你的游戏",
    play: "或者玩 The Silent Bell →",
  },
  smallScreen: {
    title: "编辑器需要更大的屏幕",
    text: "制作游戏要画地图、编辑脚本、绘制角色，手机屏幕放不下。请在电脑或平板上打开本站来使用编辑器。",
    note: "手机很适合玩：游戏、存档和内置演示在这里都能用。",
    back: "返回游戏",
    anyway: "仍然继续",
  },

  footerTagline: "步步的步步高游戏世界。爱好者项目，与步步高公司无关。",
  footerLabel: "页脚",
  footerPlay: "玩演示",
  footerSource: "GitHub 源代码",
  footerIssue: "反馈问题",
  guide: {
    keysHead: ["动作", "键盘", "手机按键"],
    /** action, keyboard, phone keypad */
    keys: [
      ["移动 / 选择", "方向键 · WASD", "方向键"],
      ["确认", "Enter · J · Z", "A（确定）"],
      ["返回 / 菜单", "Esc · 空格 · Backspace · K · X", "B（返回）"],
      ["上一页 / 下一页", "[ ] · Q E · PgUp PgDn", "PgUp / PgDn"],
    ],
  },

  footerCredit: ["引擎移植自 ", "（GPL-2.0），吸收了 baye-fmj-app 分支的修复，并对照原版引擎的还原项目 ", " 校验。游戏内容版权归各自所有者。"],
};

export const SITE_TEXT: Record<SiteLang, SiteText> = { en, zh };

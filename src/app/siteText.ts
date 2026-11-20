// The site's text in English and Simplified Chinese: the top bar, the front
// page, the footer and the browser tab titles. (The Guide, About, Games and
// editor pages are still English only.)
import type { SiteLang } from "./siteLang";

/** The site's pages (as in router.tsx). */
type Page = "home" | "games" | "guide" | "fulu" | "fulu-progress" | "about" | "editor" | "notfound";

const en = {
  nav: { home: "Home", games: "Games", guide: "Guide", fulu: "Fulu", "fulu-progress": "Progress", about: "About", editor: "Editor", notfound: "" } as Record<Page, string>,
  navPlay: "▶ Play",
  menu: "Menu",
  switchTo: "中文",
  switchTitle: "切换到简体中文",
  titles: {
    home: "FMJ React: play and make pocket RPGs in your browser",
    games: "Games · FMJ React",
    guide: "Guide · FMJ React",
    fulu: "Fulu: the 4988's OS, rewritten · FMJ React",
    "fulu-progress": "Fulu progress report · FMJ React",
    about: "About · FMJ React",
    editor: "Editor · FMJ React",
    notfound: "Page not found · FMJ React",
  } as Record<Page, string>,

  heroTitle: "Pocket RPGs, in your browser.",
  /** The headline: two lines, the second in the accent colour. */
  heroLines: ["Pocket RPGs,", "in your browser."],
  kicker: ["FMJ / REACT", "The BBK engine, rebuilt for the web"],
  monitor: { live: "Live", title: "Lantern Path", res: "160 × 96 px" },
  scrollHint: "Scroll",
  wordmark: "FMJ REACT",
  heroLead: ["The engine behind ", "伏魔记", ", rebuilt for the web."],
  uploadCta: "Upload your game",
  tryBell: "Try The Silent Bell",
  upload: {
    title: "Bring your own game.",
    text: ["Drop ", "伏魔记", " or any BBK RPG here, as a .lib file. It never leaves your browser."],
    button: "Choose a .lib file",
    drop: "Or drop it anywhere here",
    hint: "DAT.LIB or any *.lib · HZK16 and ASC16 fonts too, if you have them",
    busy: "Opening…",
  },
  playBell: "▶ Play The Silent Bell",
  browse: "Your games",
  makeOwn: "Or open the editor →",
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
    { img: "/home/wide.webp", title: "See more of the world.", text: "Up to 17 × 10 tiles, not 9 × 6.", alt: "The Silent Bell in the widest map view" },
    { img: "/home/more.webp", title: "More words. Fewer pages.", text: "Fonts drawn for 12 and 10 pixels. Four lines where there were two.", alt: "Four lines of dialogue in one box" },
    { img: "/home/faithful.webp", title: "True to the original.", text: "Battles, items and scripts, checked against the device's own engine.", alt: "The game menu" },
  ],

  doTitle: "Yours to play. And to make.",
  doSub: "",
  doPlay: { title: "Play", text: "Your games. Three save slots each. Up to 4× speed.", link: "Your games →" },
  doMake: { title: "Make", text: ["Maps, scripts, sprites, spells. Export a ", ".lib", "."], link: "Open the editor →" },
  doPrivate: { title: "Private", text: "Nothing leaves your browser.", link: "About →" },

  footerTagline: "Play and make pocket RPGs in your browser.",
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
      ["Back / menu", "Esc · Space · K · X", "B (Back)"],
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
  nav: { home: "首页", games: "游戏", guide: "指南", fulu: "符箓", "fulu-progress": "进展", about: "关于", editor: "编辑器", notfound: "" },
  navPlay: "▶ 开始玩",
  menu: "菜单",
  switchTo: "EN",
  switchTitle: "Switch to English",
  titles: {
    home: "FMJ React：在浏览器里畅玩和制作掌上 RPG",
    games: "游戏 · FMJ React",
    guide: "指南 · FMJ React",
    fulu: "符箓：重写的 4988 系统 · FMJ React",
    "fulu-progress": "符箓进展报告 · FMJ React",
    about: "关于 · FMJ React",
    editor: "编辑器 · FMJ React",
    notfound: "找不到页面 · FMJ React",
  },

  heroTitle: "掌上 RPG，就在浏览器里。",
  heroLines: ["掌上 RPG，", "就在浏览器里。"],
  kicker: ["FMJ / REACT", "步步高引擎，为网页重新打造"],
  monitor: { live: "实时", title: "Lantern Path", res: "160 × 96 像素" },
  scrollHint: "向下滚动",
  wordmark: "FMJ REACT",
  heroLead: ["", "《伏魔记》", "背后的引擎，为网页重新打造。"],
  uploadCta: "上传你的游戏",
  tryBell: "试玩 The Silent Bell",
  upload: {
    title: "带上你的游戏。",
    text: ["把", "《伏魔记》", "或任何步步高 RPG 的 .lib 文件放到这里。文件不会离开你的浏览器。"],
    button: "选择 .lib 文件",
    drop: "或者直接拖到这里",
    hint: "DAT.LIB 或任何 *.lib · 如果有 HZK16 和 ASC16 字库，也可以一起添加",
    busy: "正在打开…",
  },
  playBell: "▶ 开始玩 The Silent Bell",
  browse: "你的游戏",
  makeOwn: "或者打开编辑器 →",
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
    { img: "/home/wide.webp", title: "看见更大的世界。", text: "最多 17 × 10 格，而不是 9 × 6。", alt: "最宽地图视野下的 The Silent Bell" },
    { img: "/home/more.webp", title: "字更多，页更少。", text: "专为 12 和 10 像素绘制的字体。原来两行，现在四行。", alt: "一个对话框里放下四行对话" },
    { img: "/home/faithful.webp", title: "忠于原版。", text: "战斗、道具和脚本，都对照原版引擎校验。", alt: "游戏菜单" },
  ],

  doTitle: "可以玩，也可以做。",
  doSub: "",
  doPlay: { title: "游玩", text: "你的游戏。每款三个存档位。最高 4 倍速。", link: "你的游戏 →" },
  doMake: { title: "制作", text: ["地图、脚本、精灵图、法术。导出 ", ".lib", " 文件。"], link: "打开编辑器 →" },
  doPrivate: { title: "隐私", text: "什么都不会离开你的浏览器。", link: "关于 →" },

  footerTagline: "在浏览器里畅玩和制作掌上 RPG。",
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
      ["返回 / 菜单", "Esc · 空格 · K · X", "B（返回）"],
      ["上一页 / 下一页", "[ ] · Q E · PgUp PgDn", "PgUp / PgDn"],
    ],
  },

  footerCredit: ["引擎移植自 ", "（GPL-2.0），吸收了 baye-fmj-app 分支的修复，并对照原版引擎的还原项目 ", " 校验。游戏内容版权归各自所有者。"],
};

export const SITE_TEXT: Record<SiteLang, SiteText> = { en, zh };

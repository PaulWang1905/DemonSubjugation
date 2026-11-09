// The Games page's text in English and Simplified Chinese: the library, the
// locked game card, adding games from a link, and the messages from adding
// files.
import { currentSiteLang, type SiteLang } from "./siteLang";

const en = {
  eyebrow: "Games",
  title: "Your games",
  lead: "The demos, and the games you add. Each plays on the engine you choose for it, and everything stays in this browser.",
  dropHint: "or drop .lib and .gam files anywhere",
  reading: "Reading files…",
  library: "Library",
  count: (n: number) => `${n} game${n === 1 ? "" : "s"}`,
  bellMeta: "Built-in demo · about 20 minutes",
  bellDesc: "Bring back the three shards of Bellhaven's bell before the fog wins.",
  lanternMeta: "Built-in short demo · 3 minutes",
  lanternDesc: "Relight the hamlet's lantern with a stone from the glade.",
  play: "Play",
  remove: "Remove",
  removeConfirm: (name: string) => `Remove “${name}” and its save slots from this browser?`,
  originalFrom: "Original from ",
  addGame: "Add a game",
  addGameHint: ".lib or .gam",
  kind: { lib: "Game · .lib", gam: "4988 program · .gam" },
  noStorage: "Browser storage is unavailable, so imported files last for this tab only.",
  dropHere: "Drop to add games or fonts",

  device: {
    name: "Longman 4988",
    meta: "The dictionary itself · its own firmware",
    desc: "Turn on the emulated device: its dictionaries, tools and built-in games.",
    turnOn: "Turn on",
  },

  engines: {
    label: "Engine",
    title: "Three engines",
    sub: "A game made for BBK's RPG kit can play on any of them; choose one on its tile.",
    builtIn: "Built in",
    react: {
      name: "FMJ React",
      what: "This site's own engine, a port of 伏魔记's: .lib games, and the game inside a .gam, remastered with HD text, wider maps, more text per page and the debug menu.",
      short: "This site's engine: remastered",
    },
    fulu: {
      name: "Fulu",
      what: "Our stand-in for the 4988's operating system: .gam programs run as written, without BBK's firmware. The 伏魔记 series and 英雄坛说 play and save.",
      short: "The 4988, on our stand-in OS",
      state: "Built in · 6 games tested",
    },
    original: {
      name: "Original OS",
      what: "BBK's own firmware, emulated: the 4988 exactly as it was. It is not ours to share: add its files (0E00.DAT and 4988.font at least) by dropping them on this page.",
      short: "The 4988, on BBK's firmware",
      ready: (n: number) => `Ready · ${n} of 13 files`,
      missing: "Needs its files",
      needs: "Add the 4988's firmware files first (below)",
    },
    fonts: {
      name: "Original fonts",
      what: "Optional: the handheld's own bitmap fonts (HZK16, ASC16) for pixel text in FMJ React. Without them it uses fonts that come with the site.",
      have: "HZK16 and ASC16 added",
      missing: (have: string[]) => (have.length ? `${have.join(", ")} added` : "Optional"),
    },
  },

  locked: {
    status: "Locked · needs a password",
    update: "New version · needs the password",
    password: "Password",
    passwordFor: (name: string) => `Password for ${name}`,
    unlock: "Unlock",
    unlocking: "Unlocking…",
    wrong: "Wrong password.",
    download: (status: number) => `Could not download the game (${status}).`,
  },

  remote: {
    label: "Add from a link",
    open: "Open",
    hint: "A GitHub folder or file, a direct link to a .lib file, or a web folder that lists them. The games are downloaded into this browser only.",
    downloading: "Downloading…",
    opening: "Opening the folder…",
    downloadingOne: (name: string, i: number, n: number) => `Downloading ${name}${n > 1 ? ` (${i} of ${n})` : ""}…`,
    up: "Up one folder",
    close: "Close the folder",
    files: (n: number) => `${n} game file${n === 1 ? "" : "s"}`,
    empty: "No .lib files in this folder.",
    added: "Added",
    add: "Add",
    addSelected: (n: number) => `Add ${n} selected`,
    // errors
    rateLimit: "GitHub's limit for listing folders without signing in was reached (60 an hour). Try again later, or open a file link directly.",
    theFolder: "The folder",
    theFile: "The file",
    notFound: (what: string) => `${what} was not found (404). Check the link; private repositories cannot be read.`,
    unreadable: (what: string, status: number) => `${what} could not be read (HTTP ${status}).`,
    notUrl: "That is not a web address. Paste a link starting with https://",
    isFile: "That link is a file, not a folder.",
    corsList: "That server does not let other websites read its files (CORS). GitHub links work; so do servers that allow it.",
    noGames: "No .lib files were found at that link.",
    corsDownload: "That server does not let other websites download its files (CORS).",
  },

  imported: {
    font: (font: string) => `Added font ${font}.`,
    game: (name: string, maps: number, scripts: number) => `Added ${name}: ${maps} maps, ${scripts} scripts.`,
    program: (name: string) => `Added ${name}, a program for the 4988.`,
    firmware: (file: string) => `Added firmware file ${file}.`,
    noStart: "it has no starting script (GUT 1-1), so it is not a BBK RPG archive or it is damaged",
    invalid: (file: string, why: string) => `${file}: not a valid game archive (${why})`,
    unknown: (file: string) => `${file}: unrecognised file (expected a .lib or .gam game, a font or a 4988 firmware file)`,
    noRom: (file: string) => `${file}: no fmj.rom["…"] entries found`,
  },
};

export type GamesText = typeof en;

const zh: GamesText = {
  eyebrow: "游戏",
  title: "你的游戏",
  lead: "内置的演示，和你添加的游戏。每款游戏都可以选用自己的引擎来玩，所有内容都只保存在这个浏览器里。",
  dropHint: "也可以把 .lib 和 .gam 文件拖到页面任意位置",
  reading: "正在读取文件…",
  library: "游戏库",
  count: (n: number) => `${n} 款游戏`,
  bellMeta: "内置演示 · 约 20 分钟",
  bellDesc: "在大雾吞没一切之前，找回钟港镇大钟的三块碎片。",
  lanternMeta: "内置短篇演示 · 3 分钟",
  lanternDesc: "用林间空地里的石头，重新点亮小村的灯笼。",
  play: "开始玩",
  remove: "移除",
  removeConfirm: (name: string) => `要从这个浏览器中移除「${name}」和它的存档吗？`,
  originalFrom: "原版来自 ",
  addGame: "添加游戏",
  addGameHint: ".lib 或 .gam",
  kind: { lib: "游戏 · .lib", gam: "4988 程序 · .gam" },
  noStorage: "浏览器存储不可用，导入的文件只在这个标签页里有效。",
  dropHere: "松开即可添加游戏或字库",

  device: {
    name: "朗文 4988",
    meta: "电子词典本身 · 原机固件",
    desc: "打开模拟的电子词典：里面的词典、工具和自带游戏都能用。",
    turnOn: "开机",
  },

  engines: {
    label: "引擎",
    title: "三种引擎",
    sub: "用步步高 RPG 开发包做的游戏，三种引擎都能玩；在游戏卡片上选择。",
    builtIn: "内置",
    react: {
      name: "FMJ React",
      what: "本站自己的引擎，移植自伏魔记的引擎：可以玩 .lib 游戏，以及 .gam 里自带的游戏，并加入高清文字、更宽的地图、每页更多文字和调试菜单。",
      short: "本站引擎：重制版",
    },
    fulu: {
      name: "符箓",
      what: "本站代替 4988 操作系统的程序：.gam 程序按原样运行，不需要步步高的固件。伏魔记系列和英雄坛说可以玩，也可以存档。",
      short: "4988，运行在本站的代替系统上",
      state: "内置 · 已测试 6 款游戏",
    },
    original: {
      name: "原机系统",
      what: "步步高自己的固件，模拟运行：和当年的 4988 一模一样。固件不能由本站提供：请把它的文件（至少 0E00.DAT 和 4988.font）拖到这个页面来添加。",
      short: "4988，运行在步步高的固件上",
      ready: (n: number) => `可用 · 已添加 ${n}/13 个文件`,
      missing: "需要固件文件",
      needs: "请先添加 4988 的固件文件（见下方）",
    },
    fonts: {
      name: "原版字库",
      what: "可选：掌机自己的点阵字库（HZK16、ASC16），FMJ React 的像素文字会用它们。没有的话就用本站自带的字体。",
      have: "已添加 HZK16 和 ASC16",
      missing: (have: string[]) => (have.length ? `已添加 ${have.join("、")}` : "可选"),
    },
  },

  locked: {
    status: "已加密 · 需要密码",
    update: "新版本 · 需要密码",
    password: "密码",
    passwordFor: (name: string) => `${name} 的密码`,
    unlock: "解锁",
    unlocking: "正在解锁…",
    wrong: "密码不对。",
    download: (status: number) => `无法下载游戏（${status}）。`,
  },

  remote: {
    label: "通过链接添加",
    open: "打开",
    hint: "可以是 GitHub 上的文件夹或文件、.lib 文件的直接链接，或者列出这些文件的网页目录。游戏只会下载到这个浏览器里。",
    downloading: "正在下载…",
    opening: "正在打开文件夹…",
    downloadingOne: (name: string, i: number, n: number) => `正在下载 ${name}${n > 1 ? `（第 ${i} 个，共 ${n} 个）` : ""}…`,
    up: "上一级文件夹",
    close: "关闭文件夹",
    files: (n: number) => `${n} 个游戏文件`,
    empty: "这个文件夹里没有 .lib 文件。",
    added: "已添加",
    add: "添加",
    addSelected: (n: number) => `添加选中的 ${n} 个`,
    rateLimit: "已达到 GitHub 未登录时列出文件夹的次数上限（每小时 60 次）。请稍后再试，或者直接打开文件链接。",
    theFolder: "文件夹",
    theFile: "文件",
    notFound: (what: string) => `找不到${what}（404）。请检查链接；私有仓库无法读取。`,
    unreadable: (what: string, status: number) => `无法读取${what}（HTTP ${status}）。`,
    notUrl: "这不是网址。请粘贴以 https:// 开头的链接。",
    isFile: "这个链接是文件，不是文件夹。",
    corsList: "这个服务器不允许其他网站读取它的文件（CORS）。GitHub 链接可以用；允许跨站读取的服务器也可以。",
    noGames: "这个链接里没有找到 .lib 文件。",
    corsDownload: "这个服务器不允许其他网站下载它的文件（CORS）。",
  },

  imported: {
    font: (font: string) => `已添加字库 ${font}。`,
    game: (name: string, maps: number, scripts: number) => `已添加 ${name}：${maps} 张地图，${scripts} 个脚本。`,
    program: (name: string) => `已添加 ${name}（4988 程序）。`,
    firmware: (file: string) => `已添加固件文件 ${file}。`,
    noStart: "它没有起始脚本（GUT 1-1），所以不是步步高 RPG 游戏文件，或者文件已损坏",
    invalid: (file: string, why: string) => `${file}：不是有效的游戏文件（${why}）`,
    unknown: (file: string) => `${file}：无法识别的文件（应为 .lib 或 .gam 游戏、字库或 4988 固件文件）`,
    noRom: (file: string) => `${file}：没有找到 fmj.rom["…"] 条目`,
  },
};

export const GAMES_TEXT: Record<SiteLang, GamesText> = { en, zh };

/** The Games text in the site's current language (for code outside components). */
export const gamesText = (): GamesText => GAMES_TEXT[currentSiteLang()];

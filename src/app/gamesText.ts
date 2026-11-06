// The Games page's text in English and Simplified Chinese: the library, the
// locked game card, adding games from a link, and the messages from adding
// files.
import { currentSiteLang, type SiteLang } from "./siteLang";

const en = {
  eyebrow: "Games",
  title: "Your games",
  lead: ["The built-in demos and the games you have added. Everything stays in this browser; drop ", ".lib", " files anywhere on this page to add more."],
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
  addGameHint: ["DAT.LIB", " or any ", "*.lib"],
  fontsLabel: "Original bitmap fonts (optional):",
  fontsHave: "Games use the original fonts.",
  fontsMissing: "Without them, games use the pixel fonts that come with the player. Drop the files here to add them.",
  noStorage: "Browser storage is unavailable, so imported files last for this tab only.",
  dropHere: "Drop to add games or fonts",

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
    noStart: "it has no starting script (GUT 1-1), so it is not a BBK RPG archive or it is damaged",
    invalid: (file: string, why: string) => `${file}: not a valid game archive (${why})`,
    unknown: (file: string) => `${file}: unrecognised file (expected a .lib archive, HZK16 or ASC16)`,
    noRom: (file: string) => `${file}: no fmj.rom["…"] entries found`,
  },
};

export type GamesText = typeof en;

const zh: GamesText = {
  eyebrow: "游戏",
  title: "你的游戏",
  lead: ["内置的演示和你添加的游戏。所有内容都保存在这个浏览器里；把 ", ".lib", " 文件拖到这个页面的任何地方就能添加。"],
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
  addGameHint: ["DAT.LIB", " 或任何 ", "*.lib"],
  fontsLabel: "原版点阵字库（可选）：",
  fontsHave: "游戏会使用原版字体。",
  fontsMissing: "没有字库时，游戏使用播放器自带的像素字体。把字库文件拖到这里即可添加。",
  noStorage: "浏览器存储不可用，导入的文件只在这个标签页里有效。",
  dropHere: "松开即可添加游戏或字库",

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
    noStart: "它没有起始脚本（GUT 1-1），所以不是步步高 RPG 游戏文件，或者文件已损坏",
    invalid: (file: string, why: string) => `${file}：不是有效的游戏文件（${why}）`,
    unknown: (file: string) => `${file}：无法识别的文件（应为 .lib 游戏文件、HZK16 或 ASC16）`,
    noRom: (file: string) => `${file}：没有找到 fmj.rom["…"] 条目`,
  },
};

export const GAMES_TEXT: Record<SiteLang, GamesText> = { en, zh };

/** The Games text in the site's current language (for code outside components). */
export const gamesText = (): GamesText => GAMES_TEXT[currentSiteLang()];

// The Guide and About pages, in the site's look (the home page's type and
// buttons, the Fulu page's head, figures and numbered rows).
import { fuluSummary } from "./fuluGames";
import { REPO_URL } from "./links";
import { LOCKED_GAMES } from "./lockedGame";
import { SLOTS } from "./deviceStore";
import { mapTiles } from "./playerOptions";
import { Link } from "./router";
import { PLAYER_TEXT } from "./playerText";
import { useSiteLang } from "./siteLang";
import { SITE_TEXT } from "./siteText";
import { Arrow } from "./Tile";

type Row = [title: string, text: string];

// How many of the 4988 game collection's programs run on Fulu (from its progress list).
const FULU = fuluSummary();
const FULU_RUN = FULU.plays + FULU.ends;
const FULU_EN = `${FULU_RUN === FULU.total ? "All" : `${FULU_RUN} of the`} ${FULU.total} programs of the 4988 game collection run on it.`;
const FULU_ZH = `4988 游戏合集的 ${FULU.total} 个程序${FULU_RUN === FULU.total ? "全部" : `中有 ${FULU_RUN} 个`}能在上面运行。`;

const GUIDE = {
  en: {
    kicker: "Guide",
    title: "How to play",
    lead: "Add a game, pick the engine it runs on, play with a keyboard or a phone's keypad, and keep your progress. Everything stays in this browser.",
    cta: "Open your games",
    demo: "Play The Silent Bell",
    stats: [
      ["3", "engines to play on"],
      ["2", "demo games built in"],
      ["0", "files uploaded anywhere"],
      ["3", "save slots per game, plus states"],
    ],
    startTitle: "Start in three steps",
    start: [
      ["Add a game", "The two demos are already there. Add your own on the Games page: a .lib (a game for BBK's RPG engine, like 伏魔记's DAT.LIB) or a .gam (a program for the Longman 4988), from a file, by dropping it, or from a link."],
      ["Pick an engine", "Each game shows the engines it can run on. Choose once; the game remembers it."],
      ["Play, and save", "Save in the game's own menu whenever you like. For 4988 games you can also keep save states and export everything to a file."],
    ] as Row[],
    enginesTitle: "Three engines",
    enginesText: "A game made with the RPG kit (the 伏魔记 series, 英雄坛说) can play on any of them; other .gam programs on Fulu or the original OS.",
    engines: [
      ["FMJ React", "The site's own engine: the game's data remastered, with HD text, wider maps, More text and the debug menu. Plays .lib files and the library inside a kit .gam."],
      ["Fulu", `The site's stand-in for the 4988's operating system: the game's own code runs as on the device, no firmware needed. ${FULU_EN}`],
      ["Original OS", "BBK's firmware, emulated. Add its files on the Games page and every .gam runs exactly as it did on the device."],
    ] as Row[],
    fuluTitle: "4988 games on Fulu",
    fuluMore: "More about Fulu",
    fulu: [
      ["Typing Chinese", "When a game asks for Chinese, a box appears under the screen. Type in it with your computer's or phone's own input method (pinyin, handwriting, any) and press Enter: the game gets the characters. BBK's own input bar is not shown."],
      ["If a game stops", "Our checks find nothing Fulu lacks in the collection's programs, but if a game still reaches something Fulu does not have, it stops and says what. Choose Continue to skip it and play on; if the same thing comes up again, Fulu skips it by itself."],
      ["Sound", "Fulu keeps the sound off. The games play the same without it."],
      ["Keys that do nothing", "The power, 目录 and dictionary keys open the device's own menus and dictionaries, which Fulu does not have."],
    ] as Row[],
    controlsTitle: "Controls",
    controlsText: "On a phone the keypad appears by itself: slide your thumb on the d-pad to turn, and hold a direction with A.",
    deviceKeysTitle: "4988 games",
    deviceKeysText: "On Fulu or the original OS, the device's own keys are on your keyboard. On a phone, the keypad gives the arrows, the page keys, 输入 Enter (A) and 跳出 Exit (B).",
    deviceKeysHead: ["Device key", "Keyboard"],
    savesTitle: "Keeping your progress",
    saves: [
      ["In-game saves", "Open the game's menu with Back and choose save (系统 → 存储进度 in Chinese games). They are kept with the game, also when you restart it or it ends."],
      ["Save states", `For 4988 games: Options → Saves keeps the whole device at a moment, in ${SLOTS} slots, to load back any time.`],
      ["Export and import", "Write a game's saves (and its state) to a file, to keep or to move to another browser or computer."],
    ] as Row[],
    lookTitle: "Make it look your way",
    look: [
      ["Pixel or HD text", "The handheld's 16-pixel bitmap text, or the same characters redrawn sharp in a real font."],
      ["Screen and effect", "Colour themes, an LCD look with or without a shadow, or smoothed pixels."],
      ["Wider map", `More of the map around the screen, ${mapTiles("wide")} or ${mapTiles("widest")} tiles. Dialogues and menus stay where the game draws them.`],
      ["More text", "Smaller 12 or 10-pixel text in dialogues and message boxes, so a page holds more."],
      ["Size and full screen", "Zoom in whole-pixel steps; ⛶ shows only the game. On an iPhone, add the site to the home screen to play without the browser bars."],
      ["Debug menu", "Hold the screen to open it: the party's stats, money, items, story flags and random battles, changed in the running game."],
    ] as Row[],
    makeTitle: "Make your own",
    make: "The editor paints maps, writes the story, draws sprites and playtests in one click. Export the game as a .lib, or as a .gam that opens on FMJ React by default.",
    makeCta: "Open BBK Maker",
  },
  zh: {
    kicker: "指南",
    title: "怎么玩",
    lead: "添加游戏，选择运行它的引擎，用键盘或手机按键游玩，并保存进度。所有内容都只保存在这个浏览器里。",
    cta: "打开你的游戏",
    demo: "试玩 The Silent Bell",
    stats: [
      ["3", "种引擎可选"],
      ["2", "款内置演示游戏"],
      ["0", "个文件被上传"],
      ["3", "个存档位，另有即时存档"],
    ],
    startTitle: "三步开始",
    start: [
      ["添加游戏", "两款演示游戏已经在了。在“游戏”页添加你自己的：.lib（步步高 RPG 引擎的游戏，例如伏魔记的 DAT.LIB）或 .gam（朗文 4988 的程序），可以选择文件、拖放，或通过链接添加。"],
      ["选择引擎", "每个游戏会列出它能运行的引擎。选一次即可，游戏会记住。"],
      ["游玩并存档", "随时在游戏自己的菜单里存档。4988 游戏还可以使用即时存档，并把一切导出到文件。"],
    ] as Row[],
    enginesTitle: "三种引擎",
    enginesText: "用 RPG 工具制作的游戏（伏魔记系列、英雄坛说）可以在任何一种上运行；其他 .gam 程序可在符箓或原版系统上运行。",
    engines: [
      ["FMJ React", "本站自己的引擎：重制游戏数据，带高清文字、更宽地图、更多文字和调试菜单。可玩 .lib 文件，以及 RPG 工具 .gam 里的资源库。"],
      ["符箓", `本站替代 4988 操作系统的实现：游戏自己的代码像在掌机上一样运行，不需要固件。${FULU_ZH}`],
      ["原版系统", "模拟步步高的固件。在“游戏”页添加它的文件后，每个 .gam 都和在掌机上完全一样。"],
    ] as Row[],
    fuluTitle: "在符箓上玩 4988 游戏",
    fuluMore: "进一步了解符箓",
    fulu: [
      ["输入中文", "游戏需要中文时，屏幕下方会出现一个输入框。用电脑或手机自己的输入法（拼音、手写都可以）在框里输入，按回车，文字就交给游戏。不显示步步高自带的输入栏。"],
      ["游戏停下时", "我们的检查在合集的程序里找不到符箓缺少的功能；如果游戏仍然遇到符箓没有的功能，会停下并说明缺少什么。选择“继续”即可跳过它接着玩；同样的情况再出现时，符箓会自动跳过。"],
      ["声音", "符箓保持声音关闭。没有声音，游戏玩起来也一样。"],
      ["不起作用的键", "开关、目录和词典键会打开设备自己的菜单和词典，符箓没有这些。"],
    ] as Row[],
    controlsTitle: "操作",
    controlsText: "在手机上按键会自动出现：用拇指在方向键上滑动来转向，按住 A 可以持续走。",
    deviceKeysTitle: "4988 游戏",
    deviceKeysText: "在符箓或原版系统上，掌机自己的按键都在键盘上。在手机上，屏幕按键提供方向键、翻页键、输入（A）和跳出（B）。",
    deviceKeysHead: ["掌机按键", "键盘"],
    savesTitle: "保存进度",
    saves: [
      ["游戏内存档", "按“返回”打开游戏菜单并选择存档（中文游戏为 系统 → 存储进度）。存档跟着游戏保存，重新开机或游戏结束后也不会丢。"],
      ["即时存档", `4988 游戏：选项 → 存档，可在 ${SLOTS} 个位置保存整台掌机的某一刻，随时读回。`],
      ["导出与导入", "把一个游戏的存档（和它的状态）写成文件，留作备份，或转移到另一个浏览器或电脑。"],
    ] as Row[],
    lookTitle: "按你的喜好显示",
    look: [
      ["像素或高清文字", "掌机的 16 像素点阵文字，或用真实字体清晰重绘的同样文字。"],
      ["画面与效果", "配色主题、带或不带阴影的液晶效果，或平滑像素。"],
      ["更宽的地图", `在画面周围显示更多地图，${mapTiles("wide")} 或 ${mapTiles("widest")} 格。对话和菜单仍在游戏绘制的位置。`],
      ["更多文字", "对话和消息框使用 12 或 10 像素的小字，一页能放下更多内容。"],
      ["大小与全屏", "按整像素缩放；⛶ 只显示游戏。在 iPhone 上把本站添加到主屏幕，可以去掉浏览器栏。"],
      ["调试菜单", "按住画面打开：在运行中的游戏里修改队伍属性、金钱、物品、剧情标志和随机战斗。"],
    ] as Row[],
    makeTitle: "做你自己的游戏",
    make: "编辑器可以画地图、写剧情、画角色，一键试玩。可以把游戏导出为 .lib，或导出为默认用 FMJ React 打开的 .gam。",
    makeCta: "打开 BBK Maker",
  },
};

const ABOUT = {
  en: {
    kicker: "About",
    title: "A pocket RPG engine, rebuilt for the web",
    lead: "In the 2000s, BBK's electronic dictionaries came with a small role-playing game engine. 伏魔记 was its best-known game, and fans went on to make many more. BUBU (BUBU's Unofficial BBK Universe) brings them to the browser: a fan project, not affiliated with BBK.",
    facts: [
      ["TS", "TypeScript and React, no plugins"],
      ["GPL-2.0", "the licence, like fmj.kt"],
      [String(LOCKED_GAMES.length), `game${LOCKED_GAMES.length === 1 ? "" : "s"} bundled besides the demos, locked with a password`],
      ["3", "engines, one site"],
    ],
    storyTitle: "What it is",
    story: [
      "The site's own engine, FMJ React, is a TypeScript port of fmj.kt, the open-source re-implementation, checked against a reconstruction of the original engine so that battles, scripts and items behave as they did on the device. On top it adds HD text, an LCD look, wider maps, more text per page, a phone layout and a complete game editor, BBK Maker.",
      "For the games as they were, it also emulates the Longman 4988 handheld, with either BBK's own firmware or Fulu, an operating system written for this site so the games run without it.",
    ],
    enginesTitle: "Three engines",
    engines: [
      ["FMJ React", "The game's data, remastered: HD text, wider maps, More text, the debug menu."],
      ["Fulu", `A new OS for the 4988, in TypeScript: the game's own code, no firmware. ${FULU_EN}`],
      ["Original OS", "BBK's firmware, emulated, for the device exactly."],
    ] as Row[],
    fuluMore: "How Fulu works",
    builtTitle: "Built on",
    built: [
      ["fmj.kt", "An open-source re-implementation of the BBK engine. FMJ React's engine is ported from it (GPL-2.0)."],
      ["fmj-engine", "A reconstruction of the original engine from its machine code, used to check how the device really behaved."],
      ["baye-fmj-app", "A fork of the engine whose fixes and extra script commands were taken in."],
    ] as Row[],
    privacyTitle: "Privacy",
    privacy: "Nothing you open is uploaded: games, saves, fonts and editor projects stay in this browser. The site counts page visits with Vercel Web Analytics, without cookies. Game content belongs to its respective owners.",
    openTitle: "Open source",
    open: "Read the code, run its tests, report a problem or suggest an idea.",
    source: "Source on GitHub",
    issue: "Report a problem",
  },
  zh: {
    kicker: "关于",
    title: "掌上 RPG 引擎，为网页重建",
    lead: "2000 年代，步步高电子词典自带一个小型角色扮演游戏引擎。伏魔记是其中最有名的游戏，玩家们后来又做了许多。步步 BUBU（步步的步步高游戏世界）把它们带到浏览器里：一个爱好者项目，与步步高公司无关。",
    facts: [
      ["TS", "TypeScript 和 React，无需插件"],
      ["GPL-2.0", "许可证，与 fmj.kt 相同"],
      [String(LOCKED_GAMES.length), "款除演示外附带的游戏，需密码解锁"],
      ["3", "种引擎，一个网站"],
    ],
    storyTitle: "这是什么",
    story: [
      "本站自己的引擎 FMJ React 是开源重实现 fmj.kt 的 TypeScript 移植，并与原版引擎的还原代码逐项对照，让战斗、脚本和物品的表现和掌机上一样。在此之上，它增加了高清文字、液晶效果、更宽的地图、每页更多文字、手机布局和完整的游戏编辑器 BBK Maker。",
      "为了原汁原味地玩，它还模拟了朗文 4988 掌机，可以使用步步高自己的固件，或使用符箓：一个为本站编写的操作系统，让游戏不需要固件也能运行。",
    ],
    enginesTitle: "三种引擎",
    engines: [
      ["FMJ React", "重制的游戏数据：高清文字、更宽地图、更多文字、调试菜单。"],
      ["符箓", `用 TypeScript 为 4988 写的新操作系统：游戏自己的代码，无需固件。${FULU_ZH}`],
      ["原版系统", "模拟步步高的固件，与掌机完全一致。"],
    ] as Row[],
    fuluMore: "符箓是怎么工作的",
    builtTitle: "基于",
    built: [
      ["fmj.kt", "步步高引擎的开源重实现。FMJ React 的引擎由它移植而来（GPL-2.0）。"],
      ["fmj-engine", "根据机器码还原的原版引擎，用来核对掌机的真实行为。"],
      ["baye-fmj-app", "引擎的一个分支，吸收了它的修复和额外的脚本指令。"],
    ] as Row[],
    privacyTitle: "隐私",
    privacy: "你打开的任何内容都不会上传：游戏、存档、字体和编辑器项目都保存在这个浏览器里。本站用 Vercel Web Analytics 统计访问量，不使用 Cookie。游戏内容归各自的所有者。",
    openTitle: "开源",
    open: "阅读代码、运行测试、报告问题或提出建议。",
    source: "GitHub 上的源代码",
    issue: "报告问题",
  },
};

const LINKS: Record<string, string> = {
  "fmj.kt": "https://gitee.com/bgwp/fmj.kt",
  "fmj-engine": "https://gitee.com/BA4988/fmj-engine",
  "baye-fmj-app": "https://github.com/erduoniba/baye-fmj-app",
};

/** Numbered rows: a title and its text. */
function Rows({ rows, links }: { rows: Row[]; links?: Record<string, string> }) {
  return (
    <div className="g-rows">
      {rows.map(([title, text], i) => (
        <div key={title} className="f-row">
          <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
          <span className="f-row-title">
            {links?.[title] ? (
              <a href={links[title]} target="_blank" rel="noreferrer">
                {title}
              </a>
            ) : (
              title
            )}
          </span>
          <span className="g-row-text">{text}</span>
        </div>
      ))}
    </div>
  );
}

function Stats({ items }: { items: string[][] }) {
  return (
    <dl className="f-stats">
      {items.map(([n, what]) => (
        <div key={what}>
          <dt>{n}</dt>
          <dd>{what}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GuidePage({ onPlayDemo }: { onPlayDemo: () => void }) {
  const lang = useSiteLang();
  const t = GUIDE[lang], keys = SITE_TEXT[lang].guide;
  return (
    <div className="f-page library page">
      <header className="f-head">
        <p className="h-kicker">{t.kicker}</p>
        <h1>{t.title}</h1>
        <p className="f-lead">{t.lead}</p>
        <div className="f-cta">
          <Link to="games" className="h-btn h-btn-dark">
            {t.cta}
            <Arrow />
          </Link>
          <button className="h-btn f-btn-line" onClick={onPlayDemo}>
            {t.demo}
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </header>
      <Stats items={t.stats} />

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.startTitle}</h2>
        </header>
        <Rows rows={t.start} />
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.enginesTitle}</h2>
          <p>{t.enginesText}</p>
        </header>
        <Rows rows={t.engines} />
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.fuluTitle}</h2>
          <p>
            <Link to="fulu" className="i-more">
              {t.fuluMore}
              <Arrow />
            </Link>
          </p>
        </header>
        <Rows rows={t.fulu} />
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.controlsTitle}</h2>
          <p>{t.controlsText}</p>
        </header>
        <table className="i-keys">
          <thead>
            <tr>
              {keys.keysHead.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.keys.map(([what, kb, pad]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td>
                  {kb.split(" · ").map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </td>
                <td>
                  <kbd>{pad}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="i-keys-title">{t.deviceKeysTitle}</h3>
        <p className="i-keys-text">{t.deviceKeysText}</p>
        <table className="i-keys i-keys-device">
          <thead>
            <tr>
              {t.deviceKeysHead.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAYER_TEXT[lang].device.keys.map(([what, kb]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td>
                  {kb.split(" · ").map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.savesTitle}</h2>
        </header>
        <Rows rows={t.saves} />
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.lookTitle}</h2>
        </header>
        <ul className="i-cards">
          {t.look.map(([title, text]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="f-open">
        <h2>{t.makeTitle}</h2>
        <p>{t.make}</p>
        <div className="f-cta">
          <Link to="editor" className="h-btn h-btn-primary">
            {t.makeCta}
            <Arrow />
          </Link>
        </div>
      </section>
    </div>
  );
}

export function AboutPage() {
  const t = ABOUT[useSiteLang()];
  return (
    <div className="f-page library page">
      <header className="f-head">
        <p className="h-kicker">{t.kicker}</p>
        <h1 className="i-title">{t.title}</h1>
        <p className="f-lead">{t.lead}</p>
      </header>
      <Stats items={t.facts} />

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.storyTitle}</h2>
        </header>
        <div className="f-prose i-prose">
          {t.story.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.enginesTitle}</h2>
          <p>
            <Link to="fulu" className="i-more">
              {t.fuluMore}
              <Arrow />
            </Link>
          </p>
        </header>
        <Rows rows={t.engines} />
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.builtTitle}</h2>
        </header>
        <Rows rows={t.built} links={LINKS} />
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.privacyTitle}</h2>
        </header>
        <div className="f-prose i-prose">
          <p>{t.privacy}</p>
        </div>
      </section>

      <section className="f-open">
        <h2>{t.openTitle}</h2>
        <p>{t.open}</p>
        <div className="f-cta">
          <a className="h-btn h-btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
            {t.source}
            <span aria-hidden="true">↗</span>
          </a>
          <a className="h-btn h-btn-line" href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            {t.issue}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
    </div>
  );
}

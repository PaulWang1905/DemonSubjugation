// The Fulu page (/fulu): Fulu, the site's stand-in for the Longman 4988's
// operating system, for everyone: what it is, what it plays, what it adds, how
// it works and how we know it is right, with two diagrams. The detail, program
// by program, is its other tab, the progress report (FuluProgressPage.tsx).
import { Link } from "./router";
import { REPO_URL } from "./links";
import { useSiteLang, type SiteLang } from "./siteLang";
import { Arrow } from "./Tile";
import { fuluSummary, GAMES } from "./fuluGames";
import { FuluTabs } from "./FuluProgressPage";

const SUMMARY = fuluSummary();
const runs = (f: (g: (typeof GAMES)[number]) => boolean) => GAMES.filter((g) => f(g) && g.onFulu !== "stops").length;
const KIT = { all: SUMMARY.kit, run: runs((g) => g.kit) };
const OWN = { all: SUMMARY.total - SUMMARY.kit, run: runs((g) => !g.kit) };
const RUN = SUMMARY.plays + SUMMARY.ends;

const TEXT = {
  en: {
    kicker: "Engine · open source",
    title: "Fulu",
    lead: "The games of a 2004 pocket dictionary, playing in your browser with no firmware needed. Fulu is a new operating system for the device, written from scratch.",
    play: "Play a game on Fulu",
    progress: "See the progress report",
    stats: [
      [`${RUN}/${SUMMARY.total}`, "4988 programs run on Fulu"],
      [String(SUMMARY.full), "games checked call by call against the original"],
      ["0", "firmware files needed"],
      ["16×", "faster than emulating the original OS"],
    ],
    whyTitle: "Old games, a new operating system",
    why: [
      "The Longman 4988 is an electronic dictionary BBK (步步高) made in 2004. Besides its dictionaries it played games, and its players wrote many of their own, a lot of them with BBK's RPG kit: 伏魔记 is one of the best known.",
      "Those games ask the device's operating system for everything: drawing, text, keys, timers, saving. To play them today you need the device, or an emulator and BBK's firmware, and the firmware is BBK's to share, not ours.",
      "So Fulu takes the firmware's place. The game runs exactly as it was written; whenever it asks the operating system for something, Fulu answers, just as BBK's would.",
      "符箓 (fúlù) are the written charms of Chinese folklore, the kind 伏魔记's demon hunters carry. This one brings the games back.",
    ],
    stackTitle: "Where Fulu sits",
    stack: ["The game", "its own code, unchanged", "Fulu", "a new operating system, in place of BBK's", "The emulated 4988", "its chips: processor, memory, screen, keys", "Your browser"],
    gamesTitle: "What you can play",
    gamesLead: `${RUN} of the ${SUMMARY.total} programs in the bbk-games collection for the 4988 run on Fulu. You add the game files (.gam) yourself on the Games page.`,
    cards: [
      ["伏魔记, 英雄坛说, 三国霸业", `The whole 伏魔记 series (1.0, 1.2, 1.3, 完美版, 怀旧终曲), 英雄坛说 and 三国霸业: compared with the original OS call by call, saving included.`, `${SUMMARY.full} checked in full`],
      ["Games made with the RPG kit", "RPGs built on BBK's kit, like 伏魔记: on Fulu they also get the wider map view, HD text and more text per page.", `${KIT.run} of ${KIT.all} run`],
      ["Puzzles, board and arcade games", "Mahjong, chess, falling-block and pet games, each with its own code. A few still stop at something Fulu has not learned yet.", `${OWN.run} of ${OWN.all} run`],
    ],
    barLabel: (n: number, of: number) => `${n} of ${of} programs run`,
    seeAll: "Every program, one by one",
    extrasTitle: "What Fulu adds",
    extras: [
      ["HD text", "Fulu draws every character, so it can draw them again in real fonts, sharp on any screen."],
      ["More text per page", "Dialogues and message boxes in smaller type, more on each page."],
      ["A wider map", "More of the map around the device's small screen, in RPG-kit games."],
      ["Steadier keys", "Keys pressed while a scene plays are dropped instead of skipping dialogue."],
      ["A debug menu", "Party, items and story flags, read and changed in the running game."],
      ["Saves in your browser", "Each game saves as on the device; export them to keep a copy."],
    ],
    howTitle: "How it works",
    how: [
      ["The game runs as it is", "Its own machine code runs, unchanged, on an emulated copy of the 4988's chips."],
      ["Fulu answers its calls", "Whenever the game asks for something (draw this, which key was pressed, save), Fulu answers and leaves the machine just as BBK's system would."],
      ["At the device's pace", "Each answer takes as long as it did on the real device, so games keep their original speed."],
    ],
    checkTitle: "How we know it is right",
    checkText: "We ran BBK's original system and Fulu side by side. From the same moment of a game, the original answers a call, then Fulu answers it, and the two machines are compared, down to every byte of memory. Over hundreds of thousands of calls: no differences.",
    check: ["Same moment of a game", "The original answers", "Fulu answers", "Compare everything", "0 differences"],
    faqTitle: "Good to know",
    faq: [
      ["Do I need anything from BBK?", "No firmware. You need only the game itself, a .gam file, added on the Games page."],
      ["Is there sound?", "Not yet: Fulu keeps the sound off for now. Games play the same without it."],
      ["Where are my saves?", "In this browser, as they were on the device. Export them from the player's options to keep a copy."],
      ["What does not work yet?", `${SUMMARY.stops} programs stop at something Fulu lacks, and typing Chinese is not written yet. When a game stops like that, choose Continue to skip it and keep playing. The progress report lists every program and every known problem.`],
      ["Can I play on the original system instead?", "Yes: add the 4988's firmware files on the Games page and choose Original OS on a game's tile."],
      ["Why do some keys do nothing?", "The power, 目录 and dictionary keys open the device's own menus and dictionaries, which Fulu does not have."],
    ],
    openTitle: "Open for everyone",
    open: "Fulu is part of FMJ React and its source is public: read it, run its tests, extend it to more 4988 programs. The technical report explains every part, for the curious.",
    source: "Source on GitHub",
    report: "Read the technical report",
  },
  zh: {
    kicker: "引擎 · 开源",
    title: "符箓",
    lead: "2004 年一台掌上词典里的游戏，不需要固件，就能在浏览器里玩。符箓是为这台机器从零重写的操作系统。",
    play: "用符箓玩一款游戏",
    progress: "查看进展报告",
    stats: [
      [`${RUN}/${SUMMARY.total}`, "个 4988 程序能在符箓上运行"],
      [String(SUMMARY.full), "款游戏已与原版逐个调用对比"],
      ["0", "个固件文件"],
      ["16×", "比模拟原版系统快"],
    ],
    whyTitle: "老游戏，新系统",
    why: [
      "朗文 4988 是步步高 2004 年出的电子词典。除了查词典，它还能玩游戏；玩家们也写了很多自己的游戏，不少是用步步高的 RPG 工具做的，伏魔记就是最有名的之一。",
      "这些游戏画图、文字、按键、计时、存档，全都要向机器的操作系统请求。今天要玩它们，得有这台机器，或者模拟器加上步步高的固件，而固件属于步步高，本站不能提供。",
      "于是由符箓代替固件。游戏完全按原样运行；每当它向系统请求什么，就由符箓来回答，和步步高的系统一样。",
      "符箓是中国民间传说里写成的符咒，伏魔记里的降妖人就随身带着。这一道符，让这些游戏重新活过来。",
    ],
    stackTitle: "符箓在哪一层",
    stack: ["游戏", "它自己的代码，原样运行", "符箓", "新的操作系统，代替步步高的", "模拟的 4988", "它的芯片：处理器、内存、屏幕、按键", "你的浏览器"],
    gamesTitle: "能玩什么",
    gamesLead: `bbk-games 合集中 ${SUMMARY.total} 个 4988 程序，有 ${RUN} 个能在符箓上运行。游戏文件（.gam）需要你自己在游戏库页面添加。`,
    cards: [
      ["伏魔记、英雄坛说、三国霸业", "整个伏魔记系列（1.0、1.2、1.3、完美版、怀旧终曲）、英雄坛说和三国霸业：已与原版系统逐个调用对比，包括存档。", `${SUMMARY.full} 款完整对比`],
      ["用 RPG 工具制作的游戏", "像伏魔记一样用步步高工具做的 RPG：在符箓上还能用更宽的地图、高清文字和每页更多文字。", `${KIT.all} 个中 ${KIT.run} 个能运行`],
      ["益智、棋牌和街机游戏", "麻将、象棋、方块和宠物游戏，各有各的代码。少数还会停在符箓尚未学会的功能上。", `${OWN.all} 个中 ${OWN.run} 个能运行`],
    ],
    barLabel: (n: number, of: number) => `${of} 个程序中 ${n} 个能运行`,
    seeAll: "逐个查看全部程序",
    extrasTitle: "符箓带来了什么",
    extras: [
      ["高清文字", "每个字都由符箓绘制，所以能用真正的字体重画，在任何屏幕上都清晰。"],
      ["每页更多文字", "对话和消息框用更小的字，一页显示更多。"],
      ["更宽的地图", "在设备的小屏幕周围显示更多地图，适用于 RPG 工具制作的游戏。"],
      ["更稳的按键", "过场时按下的键会被丢弃，不会跳过后面的对话。"],
      ["调试菜单", "队伍、物品和剧情标志，在运行中的游戏里查看和修改。"],
      ["存档在浏览器里", "每个游戏都和在设备上一样存档；可以导出保留一份。"],
    ],
    howTitle: "工作原理",
    how: [
      ["游戏原样运行", "它自己的机器码不加改动，运行在模拟的 4988 芯片上。"],
      ["符箓回答它的请求", "每当游戏请求什么（画这个、按了哪个键、存档），符箓就回答，并让机器的状态和步步高的系统留下的完全一样。"],
      ["真机的节奏", "每次回答花的时间和真机一样，游戏保持原来的速度。"],
    ],
    checkTitle: "怎么知道它是对的",
    checkText: "我们让步步高的原版系统和符箓并排运行。从游戏的同一时刻出发，先让原版回答一次调用，再让符箓回答，然后比较两台机器，直到内存的每一个字节。数十万次调用：没有任何差异。",
    check: ["游戏的同一时刻", "原版回答", "符箓回答", "全部比较", "0 处差异"],
    faqTitle: "须知",
    faq: [
      ["需要步步高的什么东西吗？", "不需要固件。只需要游戏本身，一个 .gam 文件，在游戏库页面添加。"],
      ["有声音吗？", "暂时没有：符箓目前保持声音关闭。没有声音，游戏玩起来也一样。"],
      ["存档在哪里？", "在这个浏览器里，就像在设备上一样。可以在播放器的选项里导出，保留一份。"],
      ["哪些还不能用？", `${SUMMARY.stops} 个程序会停在符箓尚缺的功能上，中文输入也还没有实现。游戏这样停下时，可以选择“继续”跳过它接着玩。进展报告列出了每个程序和每个已知问题。`],
      ["可以改用原版系统吗？", "可以：在游戏库页面添加 4988 的固件文件，然后在游戏卡片上选择“原机系统”。"],
      ["为什么有些键没有反应？", "开关、目录和词典键会打开设备自己的菜单和词典，符箓没有这些。"],
    ],
    openTitle: "向所有人开放",
    open: "符箓是 FMJ React 的一部分，源代码公开：可以阅读、运行测试，把它扩展到更多 4988 程序。想了解细节，技术报告解释了每一部分。",
    source: "GitHub 上的源代码",
    report: "阅读技术报告",
  },
};

const REPORT_URL = `${REPO_URL}/blob/main/docs/fulu-report.md`;
const SOURCE_URL = `${REPO_URL}/tree/main/src/fulu`;

/** The layers: the game on Fulu on the emulated hardware, in the browser. */
function StackDiagram({ labels }: { labels: string[] }) {
  const [game, gameSub, fulu, fuluSub, hw, hwSub, browser] = labels;
  const rows: [string, string, string][] = [
    [game, gameSub, "plain"],
    [fulu, fuluSub, "lit"],
    [hw, hwSub, "plain"],
  ];
  return (
    <svg className="f-svg" viewBox="0 0 640 300" role="img" aria-label={labels.filter((_, i) => i % 2 === 0).join(" / ")}>
      {rows.map(([title, sub, kind], i) => (
        <g key={title} transform={`translate(0 ${i * 84})`}>
          <rect x="1" y="1" width="638" height="70" className={`f-box ${kind}`} />
          <text x="24" y="32" className="f-t">
            {title}
          </text>
          <text x="24" y="54" className="f-s">
            {sub}
          </text>
        </g>
      ))}
      <rect x="1" y="253" width="638" height="44" className="f-box dashed" />
      <text x="320" y="281" textAnchor="middle" className="f-s">
        {browser}
      </text>
    </svg>
  );
}

/** The shadow run: one state, two answers, compared. */
function CheckDiagram({ steps }: { steps: string[] }) {
  const [state, firmware, fulu, compare, result] = steps;
  return (
    <svg className="f-svg" viewBox="0 0 640 230" role="img" aria-label={steps.join(" → ")}>
      <rect x="1" y="80" width="170" height="70" className="f-box plain" />
      <text x="86" y="120" textAnchor="middle" className="f-s strong">
        {state}
      </text>
      <path d="M171 115 C 196 115, 196 45, 220 45" className="f-line" />
      <path d="M171 115 C 196 115, 196 185, 220 185" className="f-line" />
      <rect x="220" y="12" width="190" height="66" className="f-box plain" />
      <text x="315" y="50" textAnchor="middle" className="f-s strong">
        {firmware}
      </text>
      <rect x="220" y="152" width="190" height="66" className="f-box lit" />
      <text x="315" y="190" textAnchor="middle" className="f-s strong">
        {fulu}
      </text>
      <path d="M410 45 C 450 45, 450 115, 490 115" className="f-line" />
      <path d="M410 185 C 450 185, 450 115, 490 115" className="f-line" />
      <rect x="490" y="72" width="148" height="86" className="f-box ink" />
      <text x="564" y="108" textAnchor="middle" className="f-s inv">
        {compare}
      </text>
      <text x="564" y="136" textAnchor="middle" className="f-t inv">
        {result}
      </text>
    </svg>
  );
}

export function FuluPage() {
  const lang: SiteLang = useSiteLang();
  const t = TEXT[lang];
  return (
    <div className="f-page library page">
      <FuluTabs lang={lang} />
      <header className="f-head">
        <p className="h-kicker">{t.kicker}</p>
        <h1>
          {t.title}
          <span className="f-glyph" aria-hidden="true">
            {lang === "zh" ? "Fulu" : "符箓"}
          </span>
        </h1>
        <p className="f-lead">{t.lead}</p>
        <div className="f-cta">
          <Link to="games" className="h-btn h-btn-dark">
            {t.play}
            <Arrow />
          </Link>
          <Link to="fulu-progress" className="h-btn f-btn-line">
            {t.progress}
            <Arrow />
          </Link>
        </div>
      </header>

      <dl className="f-stats">
        {t.stats.map(([n, what]) => (
          <div key={what}>
            <dt>{n}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.whyTitle}</h2>
        </header>
        <div className="f-two">
          <div className="f-prose">
            {t.why.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <figure className="f-fig">
            <StackDiagram labels={t.stack} />
            <figcaption className="h-meta">{t.stackTitle}</figcaption>
          </figure>
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.gamesTitle}</h2>
          <p>{t.gamesLead}</p>
        </header>
        <div className="fl-cards">
          {t.cards.map(([title, text, count]) => (
            <div key={title} className="fl-card">
              <span className="fl-count">{count}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="fl-progress">
          <div className="fp-bar" role="img" aria-label={t.barLabel(RUN, SUMMARY.total)}>
            <span className="fp-seg good" style={{ flexGrow: RUN }} />
            <span className="fp-seg empty" style={{ flexGrow: SUMMARY.total - RUN }} />
          </div>
          <div className="fl-progress-foot">
            <span className="h-meta">{t.barLabel(RUN, SUMMARY.total)}</span>
            <Link to="fulu-progress" className="fl-more">
              {t.seeAll} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.extrasTitle}</h2>
        </header>
        <ul className="fl-extras">
          {t.extras.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.howTitle}</h2>
        </header>
        <div className="g-rows">
          {t.how.map(([title, text], i) => (
            <div key={title} className="f-row">
              <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="f-row-title">{title}</span>
              <span className="g-row-text">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.checkTitle}</h2>
          <p>{t.checkText}</p>
        </header>
        <figure className="f-fig wide">
          <CheckDiagram steps={t.check} />
        </figure>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.faqTitle}</h2>
        </header>
        <div className="fl-faq">
          {t.faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="f-open">
        <h2>{t.openTitle}</h2>
        <p>{t.open}</p>
        <div className="f-cta">
          <a className="h-btn h-btn-primary" href={SOURCE_URL} target="_blank" rel="noreferrer">
            {t.source}
            <span aria-hidden="true">↗</span>
          </a>
          <a className="h-btn h-btn-line" href={REPORT_URL} target="_blank" rel="noreferrer">
            {t.report}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
    </div>
  );
}

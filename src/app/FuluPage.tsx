// The Fulu page (/fulu): Fulu, the site's stand-in for the Longman 4988's
// operating system, for everyone: what it is, what it plays, what it adds, how
// it works and how we know it is right, with two diagrams. The detail, program
// by program, is its other tab, the progress report (FuluProgressPage.tsx).
import { Link } from "./router";
import { REPO_URL } from "./links";
import { useSiteLang, type SiteLang } from "./siteLang";
import { Arrow } from "./Tile";
import { FULU_COUNTS, FULU_SPEED, fuluSummary, GAMES, REMAINING } from "./fuluGames";
import { FuluTabs } from "./FuluProgressPage";

const SUMMARY = fuluSummary();
const runs = (f: (g: (typeof GAMES)[number]) => boolean) => GAMES.filter((g) => f(g) && g.onFulu !== "stops").length;
const KIT = { all: SUMMARY.kit, run: runs((g) => g.kit) };
const OWN = { all: SUMMARY.total - SUMMARY.kit, run: runs((g) => !g.kit) };
const RUN = SUMMARY.plays + SUMMARY.ends;
const ALL_RUN = RUN === SUMMARY.total;
const SPEED = `${FULU_SPEED.from}–${FULU_SPEED.to}×`;

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
      [SPEED, "as fast as emulating the original OS, by game"],
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
    gamesLead: `${ALL_RUN ? "All" : `${RUN} of the`} ${SUMMARY.total} programs in the bbk-games collection for the 4988 run on Fulu. In our three-minute test, pressing every key at random, ${SUMMARY.plays} play right through and ${SUMMARY.ends} more end as they do on the device (a game over, or quit with Exit)${SUMMARY.stops ? `; ${SUMMARY.stops} stop` : ": none stops"}. You add the game files (.gam) yourself on the Games page.`,
    cards: [
      ["伏魔记, 英雄坛说, 三国霸业", `The whole 伏魔记 series (1.0, 1.2, 1.3, 完美版, 怀旧终曲), 英雄坛说 and 三国霸业: compared with the original OS call by call, saving included.`, `${SUMMARY.full} checked in full`],
      ["Games made with the RPG kit", "RPGs built on BBK's kit, like 伏魔记: on Fulu they also get the wider map view, HD text and more text per page.", `${KIT.run} of ${KIT.all} run`],
      ["Puzzles, board and arcade games", "Mahjong, chess, falling-block and pet games, each with its own code. Chinese is typed with your own input method.", `${OWN.run} of ${OWN.all} run`],
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
      ["Fulu answers its calls", `Whenever the game asks for something (draw this, which key was pressed, save), Fulu answers and leaves the machine just as BBK's system would. It answers ${FULU_COUNTS.functions} of the system's functions and ${FULU_COUNTS.routines} routines of its C runtime.`],
      ["At the device's pace", "Each answer takes as long as it did on the real device, so games keep their original speed."],
    ],
    checkTitle: "How we know it is right",
    checkText: `We ran BBK's original system and Fulu side by side. From the same moment of a game, the original answers a call, then Fulu answers it, and the two machines are compared, down to every byte of memory. In the ${SUMMARY.full} games compared in full, over hundreds of thousands of calls: no differences. Every other program has been compared too, for a minute of play or longer. The only differences found: the original's own input bar for Chinese, which Fulu does not draw (the owner's choice); one byte of a new save file's directory entry; and once, in 武林新传, a message box's timer count. All are listed in the progress report.`,
    check: ["Same moment of a game", "The original answers", "Fulu answers", "Compare everything", "byte by byte"],
    faqTitle: "Good to know",
    faq: [
      ["Do I need anything from BBK?", "No firmware. You need only the game itself, a .gam file, added on the Games page."],
      ["Is there sound?", "No: Fulu keeps the sound off, and games that would switch it on play as if it were off. They play the same without it."],
      ["Where are my saves?", "In this browser, as they were on the device. Export them from the player's options to keep a copy."],
      ["How do I type Chinese?", "When a game asks for Chinese, a box shows under the screen: type in it with your computer's or phone's own input method (pinyin, handwriting, any) and press Enter. BBK's own input bar is not drawn."],
      ["What if a game stops?", `Every game in the collection runs in our tests, ${REMAINING.length ? `but ${REMAINING.length} rarely used system functions are still missing (no game reached them in play)` : "and our checks find nothing missing: two scans of each program's code, a test pressing every key, and a log of every system function each program calls when played on the original OS"}. What those checks cannot reach, such as the far ends of the long RPGs, is covered only by playing by hand. If a game does meet something Fulu lacks, it stops and says what is missing: choose Continue to skip it and keep playing. If the same thing comes up again, Fulu skips it by itself. The progress report lists every program and every known problem.`],
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
      [SPEED, "倍速：与模拟原版系统相比，视游戏而定"],
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
    gamesLead: `bbk-games 合集中 ${SUMMARY.total} 个 4988 程序，${ALL_RUN ? "全部" : `有 ${RUN} 个`}能在符箓上运行。在我们三分钟、随机按每个键的测试中，${SUMMARY.plays} 个一直运行，另外 ${SUMMARY.ends} 个像在设备上一样结束（游戏结束，或用“跳出”退出）${SUMMARY.stops ? `，${SUMMARY.stops} 个停下` : "，没有一个停下"}。游戏文件（.gam）需要你自己在游戏库页面添加。`,
    cards: [
      ["伏魔记、英雄坛说、三国霸业", "整个伏魔记系列（1.0、1.2、1.3、完美版、怀旧终曲）、英雄坛说和三国霸业：已与原版系统逐个调用对比，包括存档。", `${SUMMARY.full} 款完整对比`],
      ["用 RPG 工具制作的游戏", "像伏魔记一样用步步高工具做的 RPG：在符箓上还能用更宽的地图、高清文字和每页更多文字。", `${KIT.all} 个中 ${KIT.run} 个能运行`],
      ["益智、棋牌和街机游戏", "麻将、象棋、方块和宠物游戏，各有各的代码。中文用你自己的输入法输入。", `${OWN.all} 个中 ${OWN.run} 个能运行`],
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
      ["符箓回答它的请求", `每当游戏请求什么（画这个、按了哪个键、存档），符箓就回答，并让机器的状态和步步高的系统留下的完全一样。它实现了 ${FULU_COUNTS.functions} 个系统函数和 ${FULU_COUNTS.routines} 个 C 运行库例程。`],
      ["真机的节奏", "每次回答花的时间和真机一样，游戏保持原来的速度。"],
    ],
    checkTitle: "怎么知道它是对的",
    checkText: `我们让步步高的原版系统和符箓并排运行。从游戏的同一时刻出发，先让原版回答一次调用，再让符箓回答，然后比较两台机器，直到内存的每一个字节。完整对比的 ${SUMMARY.full} 款游戏，数十万次调用：没有任何差异。其余每个程序也都对比过，一分钟或更长的试玩。发现的差异只有：原版系统自带的中文输入栏（符箓不绘制，这是作者的选择）；新存档文件目录项中的一个字节；以及在武林新传中出现过一次的消息框定时器计数。都列在进展报告里。`,
    check: ["游戏的同一时刻", "原版回答", "符箓回答", "全部比较", "逐字节"],
    faqTitle: "须知",
    faq: [
      ["需要步步高的什么东西吗？", "不需要固件。只需要游戏本身，一个 .gam 文件，在游戏库页面添加。"],
      ["有声音吗？", "没有：符箓保持声音关闭，会打开声音的游戏也按声音关闭运行。没有声音，游戏玩起来也一样。"],
      ["存档在哪里？", "在这个浏览器里，就像在设备上一样。可以在播放器的选项里导出，保留一份。"],
      ["怎样输入中文？", "游戏需要中文时，屏幕下方会出现一个输入框：用电脑或手机自己的输入法（拼音、手写都可以）输入，按回车即可。不绘制步步高自带的输入栏。"],
      ["游戏停下了怎么办？", `合集中的每个游戏在我们的测试中都能运行，${REMAINING.length ? `但仍有 ${REMAINING.length} 个很少用到的系统函数没有实现（试玩中没有游戏走到过）` : "我们的检查也找不到缺少的功能：对每个程序代码的两种扫描、随机按每个键的测试，以及在原版系统上运行时每个程序调用的每个系统函数的记录"}。这些检查走不到的地方，比如长篇 RPG 后面的部分，只能靠亲手玩来检查。游戏如果真的遇到符箓缺少的功能，会停下并说明缺少什么：选择“继续”即可跳过它接着玩；同样的情况再出现时，符箓会自动跳过。进展报告列出了每个程序和每个已知问题。`],
      ["可以改用原版系统吗？", "可以：在游戏库页面添加 4988 的固件文件，然后在游戏卡片上选择“原版系统”。"],
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

/** The layers: the game on Fulu on the emulated hardware, in the browser (boxes that wrap at any width). */
function StackDiagram({ labels }: { labels: string[] }) {
  const [game, gameSub, fulu, fuluSub, hw, hwSub, browser] = labels;
  const rows: [string, string, string][] = [
    [game, gameSub, "plain"],
    [fulu, fuluSub, "lit"],
    [hw, hwSub, "plain"],
  ];
  return (
    <div className="f-stack">
      {rows.map(([title, sub, kind]) => (
        <div key={title} className={`f-layer ${kind}`}>
          <strong>{title}</strong>
          <span>{sub}</span>
        </div>
      ))}
      <div className="f-layer dashed">
        <span>{browser}</span>
      </div>
    </div>
  );
}

/** The shadow run: one state, two answers, compared (across on wide screens, downwards on phones). */
function CheckDiagram({ steps }: { steps: string[] }) {
  const [state, firmware, fulu, compare, result] = steps;
  return (
    <>
      <svg className="f-svg f-wide" viewBox="0 0 640 230" role="img" aria-label={steps.join(" → ")}>
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
      <svg className="f-svg f-narrow" viewBox="0 0 360 292" role="img" aria-label={steps.join(" → ")}>
        <rect x="70" y="1" width="220" height="50" className="f-box plain" />
        <text x="180" y="31" textAnchor="middle" className="f-s strong">
          {state}
        </text>
        <path d="M180 51 C 180 73, 88 73, 88 95" className="f-line" />
        <path d="M180 51 C 180 73, 272 73, 272 95" className="f-line" />
        <rect x="1" y="95" width="174" height="56" className="f-box plain" />
        <text x="88" y="128" textAnchor="middle" className="f-s strong">
          {firmware}
        </text>
        <rect x="185" y="95" width="174" height="56" className="f-box lit" />
        <text x="272" y="128" textAnchor="middle" className="f-s strong">
          {fulu}
        </text>
        <path d="M88 151 C 88 175, 180 175, 180 200" className="f-line" />
        <path d="M272 151 C 272 175, 180 175, 180 200" className="f-line" />
        <rect x="70" y="200" width="220" height="90" className="f-box ink" />
        <text x="180" y="234" textAnchor="middle" className="f-s inv">
          {compare}
        </text>
        <text x="180" y="268" textAnchor="middle" className="f-t inv">
          {result}
        </text>
      </svg>
    </>
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

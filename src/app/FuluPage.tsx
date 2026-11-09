// The Fulu page: a short public report on the site's stand-in for the
// Longman 4988's operating system, with three diagrams: where Fulu sits,
// the three ways a program reaches the OS, and how it was checked.
import { Link } from "./router";
import { REPO_URL } from "./links";
import { useSiteLang, type SiteLang } from "./siteLang";
import { Arrow } from "./Tile";

const TEXT = {
  en: {
    kicker: "Engine · open source",
    title: "Fulu",
    lead: "A new operating system for a 2004 handheld, written in TypeScript, so its games run in a browser without BBK's firmware.",
    play: "Play a game on Fulu",
    report: "Read the full technical report",
    stats: [
      ["59", "OS functions answered"],
      ["55", "C runtime routines"],
      ["0", "differences from the original OS"],
      ["16×", "faster than emulating the firmware"],
    ],
    whyTitle: "Why an operating system?",
    why: [
      "The Longman 4988 (步步高 electronic dictionary) ran games as .gam programs: 65C02 machine code that asks the device's operating system for everything — drawing, text, keys, timers, memory, saving.",
      "FMJ React emulates the 4988's chips, but the operating system is BBK's firmware, which we cannot give away. Fulu (符箓, a written charm) replaces it: the game's own code runs unchanged, and every time it calls the OS, Fulu answers instead.",
    ],
    stackTitle: "Where Fulu sits",
    stack: ["The game (.gam)", "its own 65C02 code, unchanged", "Fulu", "TypeScript, in place of BBK's firmware", "The emulated 4988", "CPU, memory banks, flash, LCD, timers, keys", "Your browser"],
    waysTitle: "Three ways into the OS",
    waysText: "A program reaches the OS in only three ways. Fulu fills the OS's part of memory with one special byte; when the CPU lands on it, Fulu looks the address up and runs the TypeScript that answers it.",
    ways: [
      ["Far call", "$D2F6", "drawing, text, keys, files…"],
      ["Runtime", "$D000–$FFFF", "the C compiler's arithmetic"],
      ["Interrupts", "$0300", "keyboard and timers"],
    ],
    howTitle: "How it works",
    how: [
      ["The OS as a lookup table", "No firmware code at all: the address the CPU arrives at says which function is wanted."],
      ["Same state, same place", "Fulu keeps the OS's variables at the OS's own addresses and leaves every register and flag as the firmware would, so a game cannot tell the difference."],
      ["Waiting like the device", "When a game waits for a key, Fulu halts the CPU until the next interrupt and answers again, just as the real OS sleeps."],
      ["The device's pace", "Each answer is charged the time the firmware would have taken, measured on 370,000 calls, so games keep their original speed."],
    ],
    checkTitle: "How we know it is right",
    checkText: "The shadow run: from the same moment of a game, the real firmware answers a call, then Fulu answers it, and the two machines are compared — registers, memory banks and all of RAM. Every call in a minute of play of each game, hundreds of thousands of them: no differences.",
    check: ["Same machine state", "BBK's firmware answers", "Fulu answers", "Compare everything", "0 differences"],
    gamesTitle: "What runs",
    games: "The whole 伏魔记 series (1.0, 1.2, 1.3, 完美版, 怀旧终曲) and 英雄坛说: play and save, no firmware needed.",
    extrasTitle: "What it adds",
    extras: [
      ["HD text", "Fulu draws every character, so it can redraw them in real fonts."],
      ["Steadier keys", "Presses made while a scene plays are dropped instead of skipping dialogue."],
      ["A debug menu", "Party, items and story flags, read and changed in the running game."],
    ],
    openTitle: "Open for everyone",
    open: "Fulu is part of FMJ React and its source is public: read it, run its tests, extend it to more 4988 programs. Each missing OS function is named when a program needs it; that is the to-do list.",
    source: "Source on GitHub",
  },
  zh: {
    kicker: "引擎 · 开源",
    title: "符箓",
    lead: "为一台 2004 年的掌机重新写的操作系统，用 TypeScript 编写，让它的游戏不需要步步高的固件，就能在浏览器里运行。",
    play: "用符箓玩一款游戏",
    report: "阅读完整的技术报告",
    stats: [
      ["59", "个系统函数"],
      ["55", "个 C 运行库例程"],
      ["0", "处与原机系统的差异"],
      ["16×", "比模拟固件快"],
    ],
    whyTitle: "为什么要写一个操作系统？",
    why: [
      "朗文 4988（步步高电子词典）上的游戏是 .gam 程序：65C02 机器码，画图、文字、按键、定时器、内存、存档，全都要向机器的操作系统请求。",
      "FMJ React 模拟了 4988 的芯片，但操作系统是步步高的固件，本站不能提供。符箓代替了它：游戏自己的代码原样运行，每当它调用系统，就由符箓来回答。",
    ],
    stackTitle: "符箓在哪一层",
    stack: ["游戏（.gam）", "它自己的 65C02 代码，原样运行", "符箓", "TypeScript，代替步步高的固件", "模拟的 4988", "CPU、内存分页、闪存、液晶屏、定时器、按键", "你的浏览器"],
    waysTitle: "进入系统的三条路",
    waysText: "程序只通过三种方式进入系统。符箓把系统所在的内存都填上一个特殊字节；CPU 一跳到那里，符箓就按地址查表，运行对应的 TypeScript 来回答。",
    ways: [
      ["远调用", "$D2F6", "画图、文字、按键、文件……"],
      ["运行库", "$D000–$FFFF", "C 编译器的算术例程"],
      ["中断", "$0300", "键盘和定时器"],
    ],
    howTitle: "工作原理",
    how: [
      ["系统就是一张查找表", "完全不需要固件代码：CPU 到达的地址就说明了要调用哪个函数。"],
      ["同样的状态，同样的位置", "符箓把系统变量放在系统自己的地址上，每个寄存器和标志位都和固件留下的一样，游戏分辨不出来。"],
      ["像真机一样等待", "游戏等按键时，符箓让 CPU 停下，等下一个中断再回答，就像真正的系统休眠一样。"],
      ["真机的节奏", "每次回答都计入固件本来要花的时间（按 37 万次调用测得），游戏保持原来的速度。"],
    ],
    checkTitle: "怎么知道它是对的",
    checkText: "影子运行：从游戏的同一时刻出发，先让真正的固件回答一次调用，再让符箓回答，然后比较两台机器——寄存器、内存分页和全部内存。每款游戏玩一分钟，数十万次调用：没有任何差异。",
    check: ["同样的机器状态", "步步高固件回答", "符箓回答", "全部比较", "0 处差异"],
    gamesTitle: "能运行什么",
    games: "整个伏魔记系列（1.0、1.2、1.3、完美版、怀旧终曲）和英雄坛说：都能玩、能存档，不需要固件。",
    extrasTitle: "它带来了什么",
    extras: [
      ["高清文字", "每个字都由符箓绘制，所以能用真正的字体重新画出来。"],
      ["更稳的按键", "过场动画时按下的键会被丢弃，不会跳过后面的对话。"],
      ["调试菜单", "队伍、物品和剧情标志，在运行中的游戏里查看和修改。"],
    ],
    openTitle: "向所有人开放",
    open: "符箓是 FMJ React 的一部分，源代码公开：可以阅读、运行测试，把它扩展到更多 4988 程序。程序缺少某个系统函数时，会说出它的名字——这就是待办清单。",
    source: "GitHub 上的源代码",
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

/** The three ways into the OS, all arriving at Fulu. */
function WaysDiagram({ ways, fulu }: { ways: string[][]; fulu: string }) {
  return (
    <svg className="f-svg" viewBox="0 0 640 300" role="img" aria-label={ways.map((w) => w[0]).join(", ")}>
      {ways.map(([name, addr, what], i) => {
        const y = 14 + i * 96;
        return (
          <g key={name}>
            <rect x="1" y={y} width="390" height="76" className="f-box plain" />
            <text x="20" y={y + 30} className="f-t">
              {name}
            </text>
            <text x="20" y={y + 54} className="f-s">
              {addr} · {what}
            </text>
            <path d={`M392 ${y + 38} C 440 ${y + 38}, 440 150, 486 150`} className="f-line" />
          </g>
        );
      })}
      <rect x="486" y="96" width="153" height="108" className="f-box lit" />
      <text x="562" y="160" textAnchor="middle" className="f-t big">
        {fulu}
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
          <a className="h-btn f-btn-line" href={REPORT_URL} target="_blank" rel="noreferrer">
            {t.report}
            <span aria-hidden="true">↗</span>
          </a>
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
          <h2>{t.waysTitle}</h2>
          <p>{t.waysText}</p>
        </header>
        <figure className="f-fig wide">
          <WaysDiagram ways={t.ways} fulu={t.title} />
        </figure>
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
        <div className="f-two">
          <div>
            <h2 className="f-h2">{t.gamesTitle}</h2>
            <p className="f-prose">{t.games}</p>
          </div>
          <div>
            <h2 className="f-h2">{t.extrasTitle}</h2>
            <ul className="f-list">
              {t.extras.map(([title, text]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
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

// Fulu's progress report (/fulu/progress), a tab of the Fulu page: how far
// Fulu has got over the programs it should run, in detail, from
// src/app/fuluGames.ts (also written to docs/fulu-games.md): the numbers, how
// much of the OS is written, how it got here, what is left, the problems, the
// owner's hand tests, every program, and how each of these is measured.
import { useMemo, useState, type ReactNode } from "react";
import {
  COVERAGE,
  FULU_COUNTS,
  fuluSummary,
  GAMES,
  HAND_TESTS,
  MILESTONES,
  PLAY_HISTORY,
  PROBLEMS,
  REMAINING,
  remainingGames,
  type FuluGame,
  type ProblemStatus,
  FULU_OTHERS,
} from "./fuluGames";
import { REPO_URL } from "./links";
import { Link } from "./router";
import { useSiteLang, type SiteLang } from "./siteLang";

const DOCS = {
  games: `${REPO_URL}/blob/main/docs/fulu-games.md`,
  report: `${REPO_URL}/blob/main/docs/fulu-report.md#16-limitations-and-future-work`,
  plan: `${REPO_URL}/blob/main/docs/fulu-plan.md`,
  hand: `${REPO_URL}/blob/main/docs/fulu-hand-tests.md`,
};

type Filter = "all" | "plays" | "ends" | "stops" | "kit" | "own" | "checked" | "missing" | "hand";
type ProblemFilter = "all" | ProblemStatus;

const TEXT = {
  en: {
    tabs: ["Overview", "Progress report"],
    kicker: "Fulu · progress report",
    title: "Progress report",
    lead: "Where Fulu stands, program by program: what runs, what has been checked against BBK's original OS, what is left to write, and every problem known. Kept up to date as the work goes on.",
    onPage: "On this page",
    sections: {
      glance: "At a glance",
      os: "How much of the OS",
      history: "How it got here",
      left: "What is left",
      problems: "Problems",
      hand: "Tested by hand",
      programs: "Every program",
      method: "How it is measured",
    },
    stats: (n: ReturnType<typeof fuluSummary>, apiDone: number) => [
      [`${n.plays + n.ends}/${n.total}`, "programs run without Fulu stopping them"],
      [`${apiDone}/${COVERAGE.apiUsed}`, "OS functions the programs call, answered"],
      [`${COVERAGE.residentUsed}/${COVERAGE.residentUsed}`, "C runtime routines they call, answered"],
      [String(n.open), "problems open"],
    ],
    bars: {
      play: "On Fulu alone, 180 seconds of random keys from every key",
      plays: "play the whole time",
      ends: "end as on the device (a game over, its menu's quit, Exit)",
      stops: "stop at something Fulu lacks",
      check: "Checked against the original OS",
      full: "in full: code traced; play, saves and typing compared",
      played: "a minute of play compared, call by call",
      none: "not compared yet",
      scan: "Code scan: what each program's code can call",
      clean: "nothing Fulu lacks",
      missing: "something Fulu lacks, often on a path never taken",
    },
    glanceNote:
      "A program that is not compared with the original OS yet can still play well: the comparison is how we know it plays exactly as on the device. The 86 programs made with BBK's RPG kit share one engine, so the six of them checked in full already exercise much of what the others run.",
    osText: [
      `Fulu does not copy the whole firmware. About half of it serves the dictionary's own applications (the dictionaries, the organiser), which no game calls. What counts is what the games call: across the 138 programs, ${COVERAGE.apiUsed} OS functions and ${COVERAGE.residentUsed} routines of the C runtime the games were compiled with.`,
      `Fulu answers ${FULU_COUNTS.functions} OS functions in all: the ${COVERAGE.apiUsed} the programs call, ${FULU_OTHERS.forFulu} that only Fulu's own functions call (parts of the help screen and the calendar, for instance), and ${FULU_OTHERS.iconSet} status-bar icon functions written with the rest of their set, which nothing calls. And ${FULU_COUNTS.routines} runtime routines: the ${COVERAGE.residentUsed - 1} the programs call (the ${COVERAGE.residentUsed}th, the far call, is Fulu's core) and ${FULU_OTHERS.routinesForFulu} only its own functions use.`,
    ],
    meters: (apiDone: number) => [
      ["OS functions the programs call", apiDone, COVERAGE.apiUsed, `${apiDone} of ${COVERAGE.apiUsed}`],
      ["Runtime routines the programs call", COVERAGE.residentUsed, COVERAGE.residentUsed, `${COVERAGE.residentUsed} of ${COVERAGE.residentUsed}`],
      ["OS code, in instructions", COVERAGE.written, COVERAGE.written + COVERAGE.left, `about ${fmt(COVERAGE.written)} written, ${fmt(COVERAGE.left)} left`],
    ] as [string, number, number, string][],
    osNote: "Not counted: the OS's own input method for typing Chinese. Fulu does not copy it: when a game asks for Chinese, the player takes it from the computer's or phone's own input method.",
    historyText: "Each round: scan and play all 138 programs, see where they stop, write what they stop at, check it against the firmware, play them all again.",
    historyBars: "Programs that play the whole 180 s (dark) or end as on the device (light), out of 138",
    historyNote:
      "Until the last row the play test pressed Enter, the arrows and space. The last row presses every key a player can, Shift and Exit included: more programs end there (quit with Exit or a menu), and each is started again for the rest of its 180 s. None of the 138 stops.",
    leftText:
      "The OS functions the programs' code can call that Fulu still lacks. For each: the programs that stop at it in play, and those whose code can call it. “Next round” is the work planned next; “later”, what no program has reached in play yet. A program that does reach one stops and names it, and Continue goes on past it.",
    leftNone:
      "Nothing that the checks can find. Both code scans find nothing Fulu lacks in any of the 138 programs, the play test with every key finds no stop, and the log of all 138 played on the original OS found nothing a program entered that Fulu lacks. What no scan can prove and random play does not reach, such as the endings of the long RPGs, is checked only by playing by hand. The OS's own input method for Chinese is not written (the computer's is used instead), and sound stays off.",
    leftCols: ["What", "Instructions", "Stops in play", "Code can call it", "When"],
    when: { next: "next round", later: "later" },
    notMeasured: "not measured",
    also: "also",
    programs: (n: number) => `${n} programs`,
    none: "none",
    problemFilters: { all: "All", open: "Open", decided: "Decided", fixed: "Fixed" } as Record<ProblemFilter, string>,
    status: { open: "open", decided: "decided", fixed: "fixed" } as Record<ProblemStatus, string>,
    decision: "Decision",
    notFulu: "not Fulu's",
    games: "Programs",
    handText: "Games the site's author played by hand, as they reported them. Reports are added as they come.",
    handTry: "What to try by hand: the long way through the games, which no scan or random play reaches",
    handCols: ["Game", "On", "What was tried", "Result", "Notes"],
    where: { fulu: "Fulu", firmware: "original OS", react: "FMJ React" },
    result: { works: "works", problems: "problems" },
    programsText: (n: ReturnType<typeof fuluSummary>) =>
      `The ${n.total} programs of the bbk-games collection for the 4988: ${n.kit} made with BBK's RPG kit, ${n.total - n.kit} with their own code.`,
    filters: {
      all: "All",
      plays: "Play",
      ends: "End as on the device",
      stops: "Stop",
      kit: "RPG kit",
      own: "Own code",
      checked: "Compared with the OS",
      missing: "Code calls something missing",
      hand: "Tested by hand",
    } as Record<Filter, string>,
    find: "Find a program",
    shown: (n: number, of: number) => `${n} of ${of}`,
    cols: ["Program", "Made with", "On Fulu", "Compared with the OS", "Code scan", "By hand", "Problems"],
    kit: "RPG kit",
    own: "own code",
    onFulu: { plays: "plays", ends: "ends", stops: "stops" } as Record<FuluGame["onFulu"], string>,
    firmware: { full: "in full", play: "a minute of play", none: "—" } as Record<FuluGame["firmware"], string>,
    at: "at",
    clean: "nothing missing",
    yes: "yes",
    methods: [
      [
        "Play test",
        "Each program runs on Fulu alone for 180 seconds while every key a player can press is pressed at random, Shift and Exit included (not the four keys that leave a game on the device). Fulu stops a program only when it really calls something not written, and names it; the test goes on past each stop, and starts a program that ends again.",
        "Finds what a program needs in play. Misses screens random keys never reach. (Earlier rounds pressed only Enter, the arrows and space, and missed what Shift and Exit do in 8 programs.)",
      ],
      [
        "Shadow run",
        "From the same machine state, BBK's firmware answers an OS call, then Fulu does, and the registers, memory banks and all of RAM are compared. Over a minute of play of each program compared; for the seven, saving and typing too.",
        "Finds any difference a program could see.",
      ],
      [
        "Random arguments",
        "Each function is also called on both with thousands of random arguments.",
        "Reaches the cases play does not.",
      ],
      [
        "Code scan: byte search",
        "A search of each program's bytes for every OS call and runtime routine call in it.",
        "Finds calls on paths play never takes. Misses calls made through pointers, and routines missing from its list.",
      ],
      [
        "Code scan: code flow",
        "Follows each program's code from its start and from every compiled C function, and reports what it reaches that Fulu lacks, how much of the code it followed, and what it cannot follow.",
        "Finds calls the byte search misses (it found the link cable's routines). Cannot follow calls through pointers or jump tables.",
      ],
      [
        "Firmware log",
        "Each program played for 180 seconds with every key on BBK's original OS, logging every OS function and routine it enters.",
        "Sees calls made through pointers, which the scans cannot follow (93 far calls in 48 programs, 40 jump tables in 33). Only what play reaches.",
      ],
      [
        "Hand tests",
        "The site's author plays games and reports what they find.",
        "The only check of what no scan proves and random play does not reach, such as the long RPGs' endings, and of how a game feels.",
      ],
    ],
    sources: "Sources",
    sourceLinks: ["This list as Markdown", "The technical report, §16", "The plan", "What to try by hand"],
  },
  zh: {
    tabs: ["概览", "进展报告"],
    kicker: "符箓 · 进展报告",
    title: "进展报告",
    lead: "符箓逐个程序的进展：哪些能运行，哪些已与步步高原版系统对比，还剩什么要写，以及所有已知问题。随工作进展持续更新。",
    onPage: "本页内容",
    sections: {
      glance: "概况",
      os: "系统完成了多少",
      history: "一路走来",
      left: "还剩什么",
      problems: "问题",
      hand: "人工测试",
      programs: "全部程序",
      method: "怎样衡量",
    },
    stats: (n: ReturnType<typeof fuluSummary>, apiDone: number) => [
      [`${n.plays + n.ends}/${n.total}`, "个程序运行时符箓不会中止"],
      [`${apiDone}/${COVERAGE.apiUsed}`, "个程序调用的系统函数已实现"],
      [`${COVERAGE.residentUsed}/${COVERAGE.residentUsed}`, "个程序调用的 C 运行库例程已实现"],
      [String(n.open), "个问题待解决"],
    ],
    bars: {
      play: "仅在符箓上，从所有按键中随机按 180 秒",
      plays: "全程运行",
      ends: "像在设备上一样结束（游戏结束、菜单的退出、跳出）",
      stops: "停在符箓尚缺的功能上",
      check: "与原版系统的对比",
      full: "完整：追踪代码，对比试玩、存档和输入",
      played: "逐个调用对比一分钟的试玩",
      none: "尚未对比",
      scan: "代码扫描：每个程序的代码可能调用什么",
      clean: "不缺任何功能",
      missing: "缺少某个功能（常在从未走到的路径上）",
    },
    glanceNote:
      "尚未与原版系统对比的程序也可能运行良好：对比是为了确认它和在设备上完全一样。86 个用步步高 RPG 工具制作的程序共用同一个引擎，所以其中完整对比过的六款，已经覆盖了其他程序运行的大部分代码。",
    osText: [
      `符箓并不照搬整个固件。大约一半的固件是为词典自己的应用（词典、记事本等）服务的，游戏不会调用。重要的是游戏调用什么：138 个程序共调用 ${COVERAGE.apiUsed} 个系统函数，以及编译它们的 C 运行库中的 ${COVERAGE.residentUsed} 个例程。`,
      `符箓一共实现了 ${FULU_COUNTS.functions} 个系统函数：程序调用的 ${COVERAGE.apiUsed} 个；只有符箓自己的函数调用的 ${FULU_OTHERS.forFulu} 个（例如帮助画面和日历的组成部分）；以及 ${FULU_OTHERS.iconSet} 个状态栏图标函数，随同整组一起实现，目前没有任何调用。运行库例程共 ${FULU_COUNTS.routines} 个：程序调用的 ${COVERAGE.residentUsed - 1} 个（第 ${COVERAGE.residentUsed} 个是远调用本身，属于符箓的核心），另有 ${FULU_OTHERS.routinesForFulu} 个只供符箓自己的函数使用。`,
    ],
    meters: (apiDone: number) => [
      ["程序调用的系统函数", apiDone, COVERAGE.apiUsed, `${COVERAGE.apiUsed} 个中的 ${apiDone} 个`],
      ["程序调用的运行库例程", COVERAGE.residentUsed, COVERAGE.residentUsed, `${COVERAGE.residentUsed} 个中的 ${COVERAGE.residentUsed} 个`],
      ["系统代码（指令数）", COVERAGE.written, COVERAGE.written + COVERAGE.left, `已写约 ${fmt(COVERAGE.written)} 条，剩余约 ${fmt(COVERAGE.left)} 条`],
    ] as [string, number, number, string][],
    osNote: "不计入：系统自带的中文输入法。符箓不照搬它：游戏需要中文时，播放器从电脑或手机自己的输入法取得文字。",
    historyText: "每一轮：扫描并试玩全部 138 个程序，看它们停在哪里，写出缺少的部分，与固件对比，再全部试玩一遍。",
    historyBars: "全程运行 180 秒（深色）或像在设备上一样结束（浅色）的程序，共 138 个",
    historyNote:
      "最后一行之前，试玩测试只按确认键、方向键和空格。最后一行按玩家能按的每个键，包括 Shift 和“跳出”：结束的程序更多（用“跳出”或菜单退出），每个结束后都重新启动，玩满 180 秒。138 个程序都没有停下。",
    leftText: "程序代码可能调用、符箓仍缺少的系统函数。每一项列出试玩时停在它上面的程序，以及代码中可能调用它的程序。“下一轮”是接下来要做的；“以后”是试玩中还没有程序走到的。程序一旦走到，就会停下并说出函数名，选择“继续”即可跳过。",
    leftNone:
      "检查能找到的都没有了。两种代码扫描在 138 个程序里都找不到符箓缺少的功能，按每个键的试玩测试没有程序停下，在原版系统上运行全部 138 个程序的记录中，也没有程序进入符箓缺少的功能。扫描无法证明、随机试玩也走不到的地方，比如长篇 RPG 的结局，只能靠亲手玩来检查。系统自带的中文输入法没有实现（改用电脑自己的输入法），声音保持关闭。",
    leftCols: ["内容", "指令数", "试玩时停止", "代码可能调用", "计划"],
    when: { next: "下一轮", later: "以后" },
    notMeasured: "未测量",
    also: "另",
    programs: (n: number) => `${n} 个程序`,
    none: "无",
    problemFilters: { all: "全部", open: "待解决", decided: "已决定", fixed: "已解决" } as Record<ProblemFilter, string>,
    status: { open: "待解决", decided: "已决定", fixed: "已解决" } as Record<ProblemStatus, string>,
    decision: "决定",
    notFulu: "不是符箓的问题",
    games: "程序",
    handText: "本站作者亲手玩过的游戏，按其报告记录。收到新的报告就会加进来。",
    handTry: "人工测试要试什么：扫描和随机试玩都走不到的、游戏的长路",
    handCols: ["游戏", "运行于", "测试内容", "结果", "说明"],
    where: { fulu: "符箓", firmware: "原版系统", react: "FMJ React" },
    result: { works: "正常", problems: "有问题" },
    programsText: (n: ReturnType<typeof fuluSummary>) =>
      `bbk-games 合集中的 ${n.total} 个 4988 程序：${n.kit} 个用步步高 RPG 工具制作，${n.total - n.kit} 个是独立编写的。`,
    filters: {
      all: "全部",
      plays: "全程运行",
      ends: "像设备上一样结束",
      stops: "停止",
      kit: "RPG 工具",
      own: "独立编写",
      checked: "已与系统对比",
      missing: "代码调用了缺少的功能",
      hand: "人工测试过",
    } as Record<Filter, string>,
    find: "查找程序",
    shown: (n: number, of: number) => `${of} 个中的 ${n} 个`,
    cols: ["程序", "制作方式", "在符箓上", "与系统对比", "代码扫描", "人工测试", "问题"],
    kit: "RPG 工具",
    own: "独立编写",
    onFulu: { plays: "全程运行", ends: "结束", stops: "停止" } as Record<FuluGame["onFulu"], string>,
    firmware: { full: "完整", play: "一分钟试玩", none: "—" } as Record<FuluGame["firmware"], string>,
    at: "于",
    clean: "不缺",
    yes: "是",
    methods: [
      [
        "试玩测试",
        "每个程序单独在符箓上运行 180 秒，随机按玩家能按的每个键，包括 Shift 和“跳出”（不包括在设备上会离开游戏的四个系统键）。只有程序真的调用了尚未实现的功能，符箓才会让它停下，并说出函数名；测试越过每次停止继续进行，程序结束后重新启动。",
        "能发现程序在试玩中需要什么；随机按键到不了的画面发现不了。（之前几轮只按确认键、方向键和空格，漏掉了 Shift 和“跳出”在 8 个程序中的作用。）",
      ],
      ["影子运行", "从同一机器状态出发，先让步步高固件回答一次系统调用，再让符箓回答，然后比较寄存器、内存分页和全部内存。每个对比的程序玩一分钟；那七款游戏还包括存档和输入。", "能发现程序可以察觉到的任何差异。"],
      ["随机参数", "每个函数还会在两边用数千组随机参数调用。", "覆盖试玩走不到的情况。"],
      ["代码扫描：字节搜索", "在每个程序的字节中搜索其中的每个系统调用和运行库例程调用。", "能发现试玩从未走到的路径上的调用；发现不了通过指针的调用，以及不在其清单里的例程。"],
      [
        "代码扫描：代码流",
        "从每个程序的入口和每个编译出的 C 函数开始跟踪它的代码，报告走到了哪些符箓缺少的功能、跟踪了多少代码，以及哪些跟踪不了。",
        "能发现字节搜索漏掉的调用（联机线的例程就是它找到的）；跟踪不了通过指针或跳转表的调用。",
      ],
      [
        "固件记录",
        "每个程序在步步高原版系统上按每个键玩 180 秒，记录它进入的每个系统函数和例程。",
        "能看到扫描跟踪不了的、通过指针的调用（48 个程序中的 93 个远调用，33 个程序中的 40 个跳转表）；只限试玩走到的地方。",
      ],
      ["人工测试", "本站作者亲手玩游戏并报告发现。", "扫描无法证明、随机试玩又走不到的地方（比如长篇 RPG 的结局），以及游戏的手感，只能这样检查。"],
    ],
    sources: "来源",
    sourceLinks: ["这份清单（Markdown）", "技术报告第 16 节", "计划", "人工测试要试什么"],
  },
};

const fmt = (n: number) => n.toLocaleString("en-US");

/** The two tabs of the Fulu page. */
export function FuluTabs({ lang }: { lang: SiteLang }) {
  const [overview, progress] = TEXT[lang].tabs;
  return (
    <nav className="fp-tabs" aria-label={lang === "zh" ? "符箓" : "Fulu"}>
      <Link to="fulu" exact>
        {overview}
      </Link>
      <Link to="fulu-progress" exact>
        {progress}
      </Link>
    </nav>
  );
}

/** One bar split into parts, with its legend. */
function SplitBar({ title, parts, total }: { title: string; parts: [number, string, string][]; total: number }) {
  return (
    <figure className="fp-split">
      <figcaption>{title}</figcaption>
      <div className="fp-bar" role="img" aria-label={`${title}: ${parts.map(([n, what]) => `${n} ${what}`).join(", ")}`}>
        {parts.map(([n, what, kind]) =>
          n ? <span key={what} className={`fp-seg ${kind}`} style={{ flexGrow: n }} title={`${n} ${what}`} /> : null,
        )}
      </div>
      <ul className="fp-legend">
        {parts.map(([n, what, kind]) => (
          <li key={what}>
            <span className={`fp-dot ${kind}`} aria-hidden="true" />
            <span>
              <strong>{n}</strong> {what}
              <span className="fp-pct"> · {Math.round((100 * n) / total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Section({ id, title, children, lead }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="h-section fp-section" id={id} aria-labelledby={`${id}-h`}>
      <header className="h-sec-head">
        <h2 id={`${id}-h`}>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/** A list of program names, folded when long. */
function Names({ names, t }: { names: string[]; t: (typeof TEXT)["en"] | (typeof TEXT)["zh"] }) {
  if (!names.length) return <span className="fp-dim">{t.none}</span>;
  if (names.length <= 4) return <>{names.join("、")}</>;
  return (
    <details className="fp-names">
      <summary>{t.programs(names.length)}</summary>
      {names.join("、")}
    </details>
  );
}

export function FuluProgressPage() {
  const lang: SiteLang = useSiteLang();
  const t = TEXT[lang];
  const n = fuluSummary();
  const missingApi = new Set(GAMES.flatMap((g) => g.scan ?? []));
  const apiDone = COVERAGE.apiUsed - missingApi.size;
  const tested = useMemo(() => new Set(HAND_TESTS.map((h) => h.game)), []);
  const problemTitle = (id: string) => PROBLEMS.find((p) => p.id === id)?.title[lang] ?? id;

  const [problemFilter, setProblemFilter] = useState<ProblemFilter>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const keep: Record<Filter, (g: FuluGame) => boolean> = {
    all: () => true,
    plays: (g) => g.onFulu === "plays",
    ends: (g) => g.onFulu === "ends",
    stops: (g) => g.onFulu === "stops",
    kit: (g) => g.kit,
    own: (g) => !g.kit,
    checked: (g) => g.firmware !== "none",
    missing: (g) => !!g.scan?.length,
    hand: (g) => tested.has(g.name),
  };
  const q = query.trim().toLowerCase();
  const shown = GAMES.filter((g) => keep[filter](g) && (!q || g.name.toLowerCase().includes(q)));
  const problems = PROBLEMS.filter((p) => problemFilter === "all" || p.status === problemFilter);
  const gamesWith = (id: string) => GAMES.filter((g) => g.problems?.includes(id)).map((g) => g.name);
  const sections = Object.entries(t.sections) as [string, string][];

  return (
    <div className="f-page library page fp-page">
      <FuluTabs lang={lang} />
      <header className="f-head fp-head">
        <p className="h-kicker">{t.kicker}</p>
        <h1 className="i-title">{t.title}</h1>
        <p className="f-lead">{t.lead}</p>
      </header>

      <nav className="fp-toc" aria-label={t.onPage}>
        <span className="h-meta">{t.onPage}</span>
        <ol>
          {sections.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`}>{title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="glance" title={t.sections.glance}>
        <dl className="f-stats">
          {t.stats(n, apiDone).map(([num, what]) => (
            <div key={what}>
              <dt>{num}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <div className="fp-splits">
          <SplitBar
            title={t.bars.play}
            total={n.total}
            parts={[
              [n.plays, t.bars.plays, "good"],
              [n.ends, t.bars.ends, "soft"],
              [n.stops, t.bars.stops, "bad"],
            ]}
          />
          <SplitBar
            title={t.bars.check}
            total={n.total}
            parts={[
              [n.full, t.bars.full, "ink"],
              [n.play, t.bars.played, "good"],
              [n.total - n.full - n.play, t.bars.none, "empty"],
            ]}
          />
          <SplitBar
            title={t.bars.scan}
            total={n.total}
            parts={[
              [n.scanClean, t.bars.clean, "good"],
              [n.total - n.scanClean, t.bars.missing, "warn"],
            ]}
          />
        </div>
        <p className="fp-note">{t.glanceNote}</p>
      </Section>

      <Section id="os" title={t.sections.os}>
        <div className="f-two fp-os">
          <div className="f-prose">
            {t.osText.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="fp-meters">
            {t.meters(apiDone).map(([what, done, all, says]) => (
              <div key={what} className="fp-meter">
                <div className="fp-meter-head">
                  <span>{what}</span>
                  <span className="h-meta">{says}</span>
                </div>
                <div className="fp-bar thin" role="img" aria-label={`${what}: ${says}`}>
                  <span className="fp-seg good" style={{ flexGrow: done }} />
                  {all > done && <span className="fp-seg empty" style={{ flexGrow: all - done }} />}
                </div>
              </div>
            ))}
            <p className="fp-note">{t.osNote}</p>
          </div>
        </div>
      </Section>

      <Section id="history" title={t.sections.history} lead={t.historyText}>
        <figure className="fp-history">
          <figcaption className="h-meta">{t.historyBars}</figcaption>
          {PLAY_HISTORY.map((h) => (
            <div key={h.step.en} className="fp-hrow">
              <span className="fp-hlabel">{h.step[lang]}</span>
              <div className="fp-bar" role="img" aria-label={`${h.step[lang]}: ${h.plays} + ${h.ends} / ${n.total}`}>
                <span className="fp-seg ink" style={{ flexGrow: h.plays }} />
                {h.ends > 0 && <span className="fp-seg soft" style={{ flexGrow: h.ends }} />}
                <span className="fp-seg empty" style={{ flexGrow: n.total - h.plays - h.ends }} />
              </div>
              <span className="fp-hnum">
                {h.plays}
                {h.ends > 0 && <span className="fp-dim"> +{h.ends}</span>}
              </span>
            </div>
          ))}
          <p className="fp-note">{t.historyNote}</p>
        </figure>
        <ol className="fp-timeline">
          {MILESTONES.map((m) => (
            <li key={m.title.en}>
              <div className="fp-when">{m.step && <span className="fp-step">{m.step}</span>}</div>
              <div>
                <strong>{m.title[lang]}</strong>
                <p>{m.detail[lang]}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="left" title={t.sections.left} lead={REMAINING.length ? t.leftText : undefined}>
        {!REMAINING.length ? (
          <p className="fp-none">{t.leftNone}</p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  {t.leftCols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REMAINING.map((r) => {
                  const { stop, canCall } = remainingGames(r.what);
                  return (
                    <tr key={r.what}>
                      <td>
                        <code className="fp-code">{r.what === "input methods" ? problemTitle("input-methods") : r.what}</code>
                        {r.about && r.what !== "input methods" && <div className="fp-dim">{r.about[lang]}</div>}
                        {r.calls && (
                          <div className="fp-dim">
                            {t.also} {r.calls.join(" ")}
                          </div>
                        )}
                      </td>
                      <td className="fp-num">{r.size ? fmt(r.size) : <span className="fp-dim">{t.notMeasured}</span>}</td>
                      <td>{stop.length ? stop.join("、") : <span className="fp-dim">{t.none}</span>}</td>
                      <td>
                        <Names names={canCall} t={t} />
                      </td>
                      <td>
                        <span className={`fp-badge ${r.plan === "next" ? "fixed" : "decided"}`}>{t.when[r.plan]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="problems" title={t.sections.problems}>
        <div className="fp-chips" role="group" aria-label={t.sections.problems}>
          {(["all", "open", "decided"] as ProblemFilter[]).map((f) => (
            <button key={f} type="button" className="fp-chip" aria-pressed={problemFilter === f} onClick={() => setProblemFilter(f)}>
              {t.problemFilters[f]}
              <span className="fp-dim"> {f === "all" ? PROBLEMS.length : PROBLEMS.filter((p) => p.status === f).length}</span>
            </button>
          ))}
        </div>
        <ul className="fp-problems">
          {problems.map((p) => {
            const games = gamesWith(p.id);
            return (
              <li key={p.id} className={`fp-problem ${p.status}`}>
                <div className="fp-problem-head">
                  <strong>{p.title[lang]}</strong>
                  <span className={`fp-badge ${p.status}`}>{t.status[p.status]}</span>
                  {p.notFulu && <span className="fp-badge muted">{t.notFulu}</span>}
                </div>
                <p>{p.detail[lang]}</p>
                {p.decision && (
                  <p className="fp-decision">
                    <span>{t.decision}:</span> {p.decision[lang]}
                  </p>
                )}
                {games.length > 0 && (
                  <p className="fp-games">
                    <span>{t.games}:</span> {games.join("、")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="hand" title={t.sections.hand} lead={t.handText}>
        <div className="fp-table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                {t.handCols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HAND_TESTS.map((h, i) => (
                <tr key={i}>
                  <td>{h.game}</td>
                  <td>{t.where[h.engine]}</td>
                  <td>{h.tested}</td>
                  <td>
                    <span className={`fp-badge ${h.result === "works" ? "fixed" : "open"}`}>{t.result[h.result]}</span>
                  </td>
                  <td>{h.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fp-note">
          <a href={DOCS.hand} target="_blank" rel="noreferrer">
            {t.handTry} ↗
          </a>
        </p>
      </Section>

      <Section id="programs" title={t.sections.programs} lead={t.programsText(n)}>
        <div className="fp-chips" role="group" aria-label={t.sections.programs}>
          {(Object.keys(keep) as Filter[]).map((f) => (
            <button key={f} type="button" className="fp-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t.filters[f]}
              <span className="fp-dim"> {GAMES.filter(keep[f]).length}</span>
            </button>
          ))}
        </div>
        <label className="fp-filter">
          <span>{t.find}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className="h-meta">{t.shown(shown.length, GAMES.length)}</span>
        </label>
        <div className="fp-table-wrap tall">
          <table className="fp-table">
            <thead>
              <tr>
                {t.cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td className="fp-nowrap">{g.kit ? t.kit : <span className="fp-dim">{t.own}</span>}</td>
                  <td className="fp-nowrap">
                    <span className={`fp-badge ${g.onFulu === "stops" ? "open" : g.onFulu === "plays" ? "fixed" : "decided"}`}>{t.onFulu[g.onFulu]}</span>
                    {g.stopsAt && (
                      <span className="fp-at">
                        {" "}
                        {t.at} {g.stopsAt === "input methods" ? problemTitle("input-methods") : g.stopsAt}
                      </span>
                    )}
                  </td>
                  <td className="fp-nowrap">{t.firmware[g.firmware]}</td>
                  <td>{g.scan?.length ? <code className="fp-code">{g.scan.join(" ")}</code> : <span className="fp-dim">{t.clean}</span>}</td>
                  <td>{tested.has(g.name) ? t.yes : ""}</td>
                  <td>{g.problems?.map(problemTitle).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="method" title={t.sections.method}>
        <div className="fp-methods">
          {t.methods.map(([title, how, finds], i) => (
            <div key={title} className="fp-method">
              <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
              <strong>{title}</strong>
              <p>{how}</p>
              <p className="fp-dim">{finds}</p>
            </div>
          ))}
        </div>
        <p className="fp-sources">
          <span className="h-meta">{t.sources}</span>
          {[DOCS.games, DOCS.report, DOCS.plan, DOCS.hand].map((href, i) => (
            <a key={href} href={href} target="_blank" rel="noreferrer">
              {t.sourceLinks[i]} ↗
            </a>
          ))}
        </p>
      </Section>
    </div>
  );
}

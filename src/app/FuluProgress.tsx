// The Fulu page's progress section: the programs Fulu should run and how far
// each has got, those tested by hand, and the problems known, from
// src/app/fuluGames.ts (also written to docs/fulu-games.md).
import { useMemo, useState } from "react";
import { fuluSummary, GAMES, HAND_TESTS, PROBLEMS, type FuluGame, type ProblemStatus } from "./fuluGames";
import type { SiteLang } from "./siteLang";

const TEXT = {
  en: {
    title: "Progress, game by game",
    lead: "The programs Fulu should run are the 138 of the bbk-games collection for the 4988. Each was played on Fulu alone for 180 seconds of random keys; those that touch new code are also compared with the firmware.",
    counts: (n: ReturnType<typeof fuluSummary>) => [
      [String(n.plays), "play the whole time"],
      [String(n.ends), "end on their own, as on the device"],
      [String(n.stops), "stop at something Fulu lacks"],
      [String(n.full + n.play), `compared with the firmware (${n.full} in full)`],
    ],
    problemsTitle: "Problems",
    status: { open: "open", decided: "decided", fixed: "fixed" } as Record<ProblemStatus, string>,
    decision: "Decision",
    notFulu: "not Fulu's",
    games: "Games",
    handTitle: "Tested by hand",
    handLead: "What the owner played and reported.",
    handCols: ["Date", "Game", "Where", "What", "Result", "Notes"],
    where: { fulu: "Fulu", firmware: "original OS", react: "FMJ React" },
    result: { works: "works", problems: "problems" },
    allTitle: (n: number) => `All ${n} programs`,
    filter: "Find a game",
    cols: ["Game", "RPG kit", "On Fulu", "Firmware comparison", "By hand"],
    onFulu: { plays: "plays", ends: "ends on its own", stops: "stops" } as Record<FuluGame["onFulu"], string>,
    firmware: { full: "full", play: "a minute of play", none: "—" } as Record<FuluGame["firmware"], string>,
    at: "at",
    yes: "yes",
    doc: "This list in the repository",
  },
  zh: {
    title: "逐个游戏的进展",
    lead: "符箓要运行的程序是 bbk-games 合集中的 138 个 4988 程序。每个都在符箓上单独随机按键试玩 180 秒；用到新代码的，还与固件做了对比。",
    counts: (n: ReturnType<typeof fuluSummary>) => [
      [String(n.plays), "全程运行"],
      [String(n.ends), "自行结束，与设备上一样"],
      [String(n.stops), "停在符箓尚缺的功能上"],
      [String(n.full + n.play), `已与固件对比（${n.full} 个完整对比）`],
    ],
    problemsTitle: "问题",
    status: { open: "待解决", decided: "已决定", fixed: "已解决" } as Record<ProblemStatus, string>,
    decision: "决定",
    notFulu: "不是符箓的问题",
    games: "游戏",
    handTitle: "人工测试",
    handLead: "作者亲自玩过并报告的结果。",
    handCols: ["日期", "游戏", "运行于", "内容", "结果", "说明"],
    where: { fulu: "符箓", firmware: "原版系统", react: "FMJ React" },
    result: { works: "正常", problems: "有问题" },
    allTitle: (n: number) => `全部 ${n} 个程序`,
    filter: "查找游戏",
    cols: ["游戏", "RPG 工具", "在符箓上", "与固件对比", "人工测试"],
    onFulu: { plays: "全程运行", ends: "自行结束", stops: "停止" } as Record<FuluGame["onFulu"], string>,
    firmware: { full: "完整", play: "一分钟试玩", none: "—" } as Record<FuluGame["firmware"], string>,
    at: "于",
    yes: "是",
    doc: "仓库中的这份清单",
  },
};

export function FuluProgress({ lang, docUrl }: { lang: SiteLang; docUrl: string }) {
  const t = TEXT[lang];
  const n = fuluSummary();
  const [query, setQuery] = useState("");
  const tested = useMemo(() => new Set(HAND_TESTS.map((h) => h.game)), []);
  const shown = GAMES.filter((g) => !query.trim() || g.name.toLowerCase().includes(query.trim().toLowerCase()));
  const gamesWith = (id: string) => GAMES.filter((g) => g.problems?.includes(id)).map((g) => g.name);
  return (
    <section className="h-section fp">
      <header className="h-sec-head">
        <h2>{t.title}</h2>
        <p>{t.lead}</p>
      </header>

      <dl className="f-stats fp-counts">
        {t.counts(n).map(([num, what]) => (
          <div key={what}>
            <dt>{num}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>

      <h3 className="fp-h3">{t.problemsTitle}</h3>
      <ul className="fp-problems">
        {PROBLEMS.map((p) => {
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

      <h3 className="fp-h3">{t.handTitle}</h3>
      <p className="fp-note">{t.handLead}</p>
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
                <td className="fp-nowrap">{h.date}</td>
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

      <details className="fp-all">
        <summary>{t.allTitle(GAMES.length)}</summary>
        <label className="fp-filter">
          <span>{t.filter}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="fp-table-wrap">
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
                  <td>{g.kit ? t.yes : ""}</td>
                  <td>
                    <span className={`fp-badge ${g.onFulu === "stops" ? "open" : g.onFulu === "plays" ? "fixed" : "decided"}`}>{t.onFulu[g.onFulu]}</span>
                    {g.stopsAt && (
                      <span className="fp-at">
                        {" "}
                        {t.at} {g.stopsAt}
                      </span>
                    )}
                  </td>
                  <td>{t.firmware[g.firmware]}</td>
                  <td>{tested.has(g.name) ? t.yes : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fp-note">
          <a href={docUrl} target="_blank" rel="noreferrer">
            {t.doc} ↗
          </a>
        </p>
      </details>
    </section>
  );
}

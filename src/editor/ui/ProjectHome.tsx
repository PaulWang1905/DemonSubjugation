// The project home, the workspace's first tab: the game's name and title,
// where it starts, what it holds, what the project check found, quick
// actions, and what to do next.
import { gbkBytes, sysGbkDecode } from "../../engine/java";
import type { LibArchive } from "../format/lib";
import { problemSummary, type Problem } from "../format/validate";
import { entryOf, entryTitle, findStart, GROUPS, groupCounts, type GroupId } from "./workspace";
import { WorldMapCard } from "./WorldMap";

interface Props {
  archive: LibArchive;
  sources: Record<string, string>;
  name: string;
  onName: (name: string) => void;
  /** Change the title stored in the game file (up to 9 bytes). */
  onTitle: (bytes: Uint8Array) => void;
  problems: readonly Problem[];
  onOpen: (key: string, line?: number) => void;
  onGroup: (g: GroupId) => void;
  onCreate: (what: string) => void;
  onPlaytest: () => void;
  onExport: () => void;
  onCheck: () => void;
  onProblem: (p: Problem) => void;
  onHelp: () => void;
  onPalette: () => void;
}

/** The title as bytes: GBK, at most 9 (a Chinese character takes 2). */
function titleBytes(s: string): Uint8Array | null {
  const b = Uint8Array.from(gbkBytes(s), (x) => x & 0xff);
  return b.length <= 9 ? b : null;
}

export function ProjectHome(p: Props) {
  const { archive, problems } = p;
  const start = findStart(archive, p.sources);
  const counts = groupCounts(archive.entries);
  const errors = problems.filter((x) => x.level === "error");
  const sorted = [...errors, ...problems.filter((x) => x.level !== "error")];
  const title = sysGbkDecode(archive.titleBytes);
  const scripts = counts.story;
  const maps = counts.world;
  const fresh = scripts <= 2 && maps <= 2;
  const link = (key: string | undefined, line?: number) => {
    const e = key ? entryOf(archive, key) : undefined;
    if (!e || !key) return null;
    return (
      <button className="link" onClick={() => p.onOpen(key, line)}>
        {e.resType === 1 ? "script" : "map"} {e.type}-{e.index} <strong>{entryTitle(e)}</strong>
      </button>
    );
  };

  const next: { text: React.ReactNode; action?: [string, () => void] }[] = [
    { text: <>Paint the first place the player sees.</>, action: start.map ? ["Open the map", () => p.onOpen(start.map!)] : ["New map", () => p.onCreate("map")] },
    { text: <>Write what happens when the game starts: who is there, what they say.</>, action: start.script ? ["Open the start script", () => p.onOpen(start.script!)] : undefined },
    { text: <>Add a person to talk to: a person (NPC) with a walk sprite, placed by the script.</>, action: ["New person", () => p.onCreate("npc")] },
    { text: <>Playtest: the project is checked first, and problems link to where they are.</>, action: ["Playtest", p.onPlaytest] },
    { text: <>Export a .gam or a .lib to keep a copy or share it (projects live in this browser).</>, action: ["Export…", p.onExport] },
  ];

  return (
    <div className="p-home">
      <section className="p-head">
        <div className="p-names">
          <label className="p-field">
            <span>Project name</span>
            <input className="p-name" value={p.name} onChange={(e) => p.onName(e.target.value)} aria-describedby="p-name-help" />
          </label>
          <label className="p-field">
            <span>Title in the game file</span>
            <input
              className="p-title"
              defaultValue={title}
              maxLength={9}
              aria-describedby="p-name-help"
              onChange={(e) => {
                const b = titleBytes(e.target.value);
                e.target.setCustomValidity(b ? "" : "At most 9 letters (4 Chinese characters).");
                if (b) p.onTitle(b);
              }}
            />
          </label>
        </div>
        <p id="p-name-help" className="muted small">
          The project name is what this browser lists; the title (9 letters at most) is stored in the game and shown by a device's game list.
        </p>
      </section>

      <div className="p-grid">
        <section className="p-card p-start">
          <h3>Start</h3>
          {start.script ? (
            <p>
              The game starts with {link(start.script)}
              {start.map ? (
                <>
                  , which loads {link(start.map)}
                  {start.loadmap && (
                    <>
                      {" "}
                      (
                      <button className="link" onClick={() => p.onOpen(start.script!, start.loadmap!.line)}>
                        line {start.loadmap.line}
                      </button>
                      )
                    </>
                  )}
                  .
                </>
              ) : start.loadmap ? (
                <>
                  , which loads map {start.loadmap.type}-{start.loadmap.index}: <span className="error">it does not exist</span>.
                </>
              ) : (
                <>, which loads no map yet.</>
              )}
            </p>
          ) : (
            <p className="error">There is no script 1-1, so the game cannot start. Make a script: the first one is number 1.</p>
          )}
          <div className="row">
            <button onClick={p.onPlaytest} title="Check and run this project (Ctrl+Enter)">
              ▶ Playtest
            </button>
            <button className="ghost" onClick={p.onExport}>
              Export…
            </button>
            <button className="ghost" onClick={() => p.onCreate("map")}>
              + New map
            </button>
            <button className="ghost" onClick={() => p.onCreate("script")}>
              + New script
            </button>
          </div>
          <p className="muted small p-tip">
            <kbd>Ctrl+P</kbd>{" "}
            <button className="link" onClick={p.onPalette}>
              goes to any map, script or character
            </button>{" "}
            and runs commands.
          </p>
        </section>

        <section className={`p-card p-check ${errors.length ? "has-errors" : problems.length ? "has-warnings" : "clean"}`}>
          <h3>
            Check{" "}
            <button className="link small" onClick={p.onCheck}>
              show all
            </button>
          </h3>
          <p className="p-check-sum">{problems.length ? `${problemSummary([...problems])}.` : "✓ No problems found."}</p>
          {problems.length > 0 && (
            <ul className="p-problems">
              {sorted.slice(0, 5).map((x, i) => (
                <li key={i}>
                  <button className={`link problem-link ${x.level}`} onClick={() => p.onProblem(x)} disabled={!x.key}>
                    <span className="lvl">{x.level === "error" ? "Error" : "Warning"}</span> {x.where}
                    {x.line ? ` · line ${x.line}` : ""}: <span className="muted">{x.message}</span>
                  </button>
                </li>
              ))}
              {sorted.length > 5 && <li className="muted small">and {sorted.length - 5} more</li>}
            </ul>
          )}
        </section>
      </div>

      <WorldMapCard archive={archive} sources={p.sources} onOpen={(key) => p.onOpen(key)} />

      <section className="p-card">
        <h3>In this game</h3>
        <ul className="p-counts">
          {GROUPS.map((g) => (
            <li key={g.id}>
              <button className="p-count" onClick={() => p.onGroup(g.id)} title={`Show ${g.label} in the sidebar`}>
                <span className="n">{counts[g.id]}</span>
                <span className="g">{g.label}</span>
                <span className="b muted small">{g.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <details className="p-card p-next" open={fresh}>
        <summary>
          <h3>What next</h3>
        </summary>
        <ol>
          {next.map((n, i) => (
            <li key={i}>
              <span>{n.text}</span>
              {n.action && (
                <button className="ghost" onClick={n.action[1]}>
                  {n.action[0]}
                </button>
              )}
            </li>
          ))}
        </ol>
        <p className="muted small">
          <button className="link" onClick={p.onHelp}>
            How the parts of a game fit together, and the keyboard shortcuts
          </button>
        </p>
      </details>
    </div>
  );
}

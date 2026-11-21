import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inspectDatLib } from "../../engine";
import { deleteProject, listProjects, putProject, type StoredProject } from "../../storage/db";
import { AsmError, assemble } from "../format/gut";
import { checkProject, describeEntry, problemSummary, type Problem } from "../format/validate";
import { GettingStarted, HelpDialog, ProblemsDialog, ShortcutTable } from "./EditorDialogs";
import { typing } from "./undoKeys";
import {
  encodeGoods, encodeLevelChain, encodeMagic, encodeMagicChain, encodeMap, encodeMonster, encodeNpc, encodePlayer, encodeSceneObj,
} from "../format/encode";
import { findEntry, putEntry, readLib, removeEntry, writeLib, type LibArchive, type LibEntry } from "../format/lib";
import { blankProject } from "../template/blank";
import { blankAnimation, blankGraphic } from "../template/newres";
import { lanternPath, lanternPathSources } from "../template/demo";
import { silentBell, silentBellSources } from "../template/silentBell";
import { keyOf, ResourceList } from "./ResourceList";
import { KIND_NAMES } from "../format/decode";
import { ResourceView } from "./ResourceView";
import { ExportDialog } from "./ExportDialog";
import { findLib, isGam } from "../../bbk/gam";
import { Link } from "../../app/router";
import { useSiteLang } from "../../app/siteLang";
import { Arrow } from "../../app/Tile";

/** The editor's start page, in English and Chinese (the editor itself is in English). */
const HOME = {
  en: {
    kicker: "Editor",
    title: "Make your own game",
    lead: "Paint maps, write the story, draw sprites and playtest in one click. Export it as a .gam or a .lib and play it here, or share it.",
    startTitle: "Start a project",
    startText: "New projects start from an original template (system graphics, tiles, sprites, sample monsters, items and spells), so you never need anyone else's game files.",
    starts: {
      bell: ["The Silent Bell", "The full demo: a town, a story and a bell to ring. Take it apart."],
      lantern: ["Lantern Path", "A short demo: a glade, a lantern and a walk home."],
      blank: ["Blank game", "Only the template: an empty map and a first script."],
      open: ["Open a file", "A .lib, or a .gam made with the RPG kit. Only open games you may modify."],
    },
    projectsTitle: "Your projects",
    projectsText: "Kept in this browser and saved as you work.",
    none: "No projects yet. Start one above.",
    open: "Open",
    remove: "Delete",
    edited: "Edited",
    help: "How to play your game",
    newName: "Name of the new game (letters, up to 9):",
    confirmDelete: (n: string) => `Delete project “${n}”?`,
  },
  zh: {
    kicker: "编辑器",
    title: "做你自己的游戏",
    lead: "画地图、写剧情、画角色，一键试玩。导出为 .gam 或 .lib，在这里玩或分享给别人。",
    startTitle: "开始一个项目",
    startText: "新项目从原创模板开始（系统图形、图块、角色、示例怪物、物品和法术），不需要任何别人的游戏文件。",
    starts: {
      bell: ["The Silent Bell", "完整的演示：一座小镇、一个故事和一口要敲响的钟。可以拆开来看。"],
      lantern: ["Lantern Path", "简短的演示：一片林间空地、一盏灯笼和回家的路。"],
      blank: ["空白游戏", "只有模板：一张空地图和第一个脚本。"],
      open: ["打开文件", ".lib，或用 RPG 工具制作的 .gam。只打开你有权修改的游戏。"],
    },
    projectsTitle: "你的项目",
    projectsText: "保存在这个浏览器里，边做边自动保存。",
    none: "还没有项目。从上面开始一个吧。",
    open: "打开",
    remove: "删除",
    edited: "修改于",
    help: "怎么玩你的游戏",
    newName: "新游戏的名字（字母，最多 9 个）：",
    confirmDelete: (n: string) => `删除项目“${n}”？`,
  },
};

interface Props {
  onPlaytest: (p: { id: string; name: string; data: ArrayBuffer }) => void;
}

interface Open {
  id: string;
  name: string;
  archive: LibArchive;
  sources: Record<string, string>;
}

const ITEM_KINDS = ["Hat", "Clothes", "Shoes", "Armour", "Bracers", "Accessory", "Weapon", "Thrown weapon", "Medicine", "Revival", "Elixir", "Stimulant", "Escape item", "Story item"];

/** A new level table: ten levels of steady growth. */
const defaultLevels = (index: number) =>
  encodeLevelChain(index, Array.from({ length: 10 }, (_, i) => ({ maxHP: 60 + i * 12, maxMP: 10 + i * 3, attack: 10 + i * 3, defend: 5 + i * 2, nextExp: 15 + i * i * 10, speed: 10 + i, lingli: 5 + i, luck: 10 + i, magics: 1 })));

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function nextIndex(a: LibArchive, resType: number, type: number): number {
  for (let i = 1; i < 256; i++) if (!findEntry(a, resType, type, i)) return i;
  throw new Error("No free index left");
}

/** Resources store their own number in byte 1; keep it in step with the index. */
function withIndex(data: Uint8Array, index: number): Uint8Array {
  const out = data.slice();
  if (out.length > 1) out[1] = index;
  return out;
}

/** Point a script's `.gut` header line at a new number. */
function withGutIndex(source: string, index: number): string {
  return source.replace(/^(\s*\.gut\s+\d+\s+)\d+/m, `$1${index}`);
}

export function Editor({ onPlaytest }: Props) {
  const lang = useSiteLang();
  const h = HOME[lang];
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [cur, setCur] = useState<Open | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "saving" | "saved" | "error" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [version, setVersion] = useState(0);
  const saveTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Script text typed but not applied, by resource key (kept when another
  // resource is opened); `dirty` lists the keys for the resource list.
  const drafts = useRef<Record<string, string>>({});
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const [goto, setGoto] = useState<{ key: string; line: number; n: number } | null>(null);
  const [checking, setChecking] = useState<{ action: "playtest" | "export" | null; problems: Problem[] } | null>(null);
  const [help, setHelp] = useState(false);

  const refresh = useCallback(async () => setProjects(await listProjects()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    (o: Open, immediate = false) => {
      const run = async () => {
        saveTimer.current = null;
        try {
          const bytes = writeLib(o.archive);
          await putProject({ id: o.id, name: o.name, updatedAt: Date.now(), data: bytes.buffer as ArrayBuffer, sources: o.sources });
          setStatus({ text: `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, kind: "saved" });
          void refresh();
        } catch (e) {
          setStatus({ text: `Not saved: ${(e as Error).message}`, kind: "error" });
        }
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setStatus({ text: "Saving…", kind: "saving" });
      if (immediate) void run();
      else saveTimer.current = window.setTimeout(run, 600);
    },
    [refresh],
  );

  const resetDrafts = () => {
    drafts.current = {};
    setDirty(new Set());
    setGoto(null);
  };

  const openArchive = (name: string, archive: LibArchive, sources: Record<string, string> = {}, id = newId()) => {
    resetDrafts();
    const o = { id, name, archive, sources };
    setCur(o);
    setSelected(findEntry(archive, 1, 1, 1) ? "1-1-1" : null);
    persist(o, true);
  };

  const create = (kind: "demo" | "bell" | "blank") => {
    if (kind === "demo") openArchive("Lantern Path", lanternPath(), lanternPathSources());
    else if (kind === "bell") openArchive("The Silent Bell", silentBell(), silentBellSources());
    else {
      const name = prompt(h.newName, "MY GAME")?.trim();
      if (!name) return;
      openArchive(name, blankProject(name.toUpperCase().slice(0, 9)));
    }
  };

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      let bytes = new Uint8Array(await f.arrayBuffer());
      // a .gam made with the RPG kit (or exported here): its game library
      if (isGam(bytes)) {
        const at = findLib(bytes);
        if (at < 0) throw new Error("this .gam was not made with the RPG kit (it has no game library)");
        bytes = bytes.slice(at);
      }
      if (!inspectDatLib(bytes).playable) throw new Error("this archive has no starting script (GUT 1-1)");
      openArchive(f.name.replace(/\.(lib|gam)$/i, ""), readLib(bytes));
    } catch (e) {
      alert(`Could not open ${f.name}: ${(e as Error).message}`);
    }
  };

  const openStored = (p: StoredProject) => {
    try {
      const a = readLib(new Uint8Array(p.data));
      resetDrafts();
      setCur({ id: p.id, name: p.name, archive: a, sources: p.sources ?? {} });
      setSelected(findEntry(a, 1, 1, 1) ? "1-1-1" : null);
      setStatus(null);
    } catch (e) {
      alert(`Could not open project: ${(e as Error).message}`);
    }
  };

  const change = useCallback(
    (data: Uint8Array, source?: string) => {
      setCur((o) => {
        if (!o || !selected) return o;
        const [resType, type, index] = selected.split("-").map(Number);
        putEntry(o.archive, { resType, type, index, data });
        const sources = source !== undefined ? { ...o.sources, [selected]: source } : o.sources;
        const next = { ...o, sources, archive: { ...o.archive, entries: [...o.archive.entries] } };
        persist(next);
        return next;
      });
      setVersion((v) => v + 1);
    },
    [selected, persist],
  );

  /** Remember (or forget, with null) a script's unapplied text. */
  const setDraft = useCallback((key: string, text: string | null) => {
    const had = key in drafts.current;
    if (text === null) delete drafts.current[key];
    else drafts.current[key] = text;
    if (had !== (text !== null)) setDirty(new Set(Object.keys(drafts.current)));
  }, []);
  const onDraft = useCallback((text: string | null) => selected && setDraft(selected, text), [selected, setDraft]);

  /**
   * Apply every script's unapplied text, so a playtest or an export has it.
   * Scripts that do not assemble are left as they were and returned as problems.
   */
  const applyDrafts = (o: Open): { next: Open; failed: Problem[] } => {
    const failed: Problem[] = [];
    let sources = o.sources;
    for (const [key, text] of Object.entries(drafts.current)) {
      const [resType, type, index] = key.split("-").map(Number);
      const e = findEntry(o.archive, resType, type, index);
      if (!e) {
        setDraft(key, null);
        continue;
      }
      try {
        const bin = assemble(text);
        if (bin[0] !== type || bin[1] !== index) throw new Error(`the .gut line must stay "${type} ${index}"`);
        putEntry(o.archive, { ...e, data: bin });
        sources = { ...sources, [key]: text };
        setDraft(key, null);
      } catch (err) {
        failed.push({
          level: "error",
          key,
          where: describeEntry(e),
          line: err instanceof AsmError && err.line > 0 ? err.line : undefined,
          message: `not applied: ${(err as Error).message.replace(/^line \d+: /, "")}`,
        });
      }
    }
    if (sources === o.sources) return { next: o, failed };
    const next = { ...o, sources, archive: { ...o.archive, entries: [...o.archive.entries] } };
    setCur(next);
    persist(next);
    setVersion((v) => v + 1);
    return { next, failed };
  };

  // (re-checked after every change; `version` counts them)
  const problems = useMemo(() => (cur ? checkProject(cur.archive, cur.sources) : []), [cur, version]);
  const marks = useMemo(() => {
    const m = new Map<string, "error" | "warning">();
    for (const p of problems) if (p.key && m.get(p.key) !== "error") m.set(p.key, p.level);
    return m;
  }, [problems]);

  const addScript = () => {
    if (!cur) return;
    const index = nextIndex(cur.archive, 1, 1);
    putEntry(cur.archive, {
      resType: 1,
      type: 1,
      index,
      data: assemble(`.gut 1 ${index}\n.desc "chapter ${index}"\n.events 40\n\n@start:\n  callback\n`),
    });
    setSelected(`1-1-${index}`);
    persist(cur);
    setVersion((v) => v + 1);
  };

  /** Create a new record with sensible defaults and select it. */
  const addRecord = (what: string) => {
    if (!cur) return;
    const a = cur.archive;
    const [kind, sub] = what.split(":");
    let resType = 0;
    let type = 0;
    let data: Uint8Array;
    const idx = (rt: number, t: number) => nextIndex(a, rt, t);
    let index = 0;
    switch (kind) {
      case "player":
        [resType, type, index] = [3, 1, idx(3, 1)];
        // The engine finds a party member's portrait (11-1-N), battle
        // sprite (11-3-N) and level table (12-2-N) by the member's own number.
        for (const t of [1, 3]) {
          if (findEntry(a, 11, t, index)) continue;
          const like = findEntry(a, 11, t, 1);
          putEntry(a, { resType: 11, type: t, index, data: like ? withIndex(like.data, index) : blankGraphic(a, 11, t, index) });
        }
        // ...and its level table (12-2-N)
        if (!findEntry(a, 12, 2, index)) putEntry(a, { resType: 12, type: 2, index, data: defaultLevels(index) });
        data = encodePlayer({ index, name: `Hero ${index}`, walkSprite: 1, magicChain: 1, magicsKnown: 1, level: 1, maxHP: 60, maxMP: 10, attack: 10, defend: 5, speed: 10, lingli: 5, luck: 10 });
        break;
      case "npc":
        [resType, type, index] = [3, 2, idx(3, 2)];
        data = encodeNpc({ index, name: `NPC ${index}`, sprite: 1 });
        break;
      case "monster":
        [resType, type, index] = [3, 3, idx(3, 3)];
        data = encodeMonster({ index, name: `Monster ${index}`, sprite: 1, level: 1, maxHP: 30, attack: 8, defend: 3, speed: 6, money: 5, exp: 5 });
        break;
      case "object":
        [resType, type, index] = [3, 4, idx(3, 4)];
        data = encodeSceneObj({ index, name: `Object ${index}`, sprite: 1 });
        break;
      case "item": {
        type = Number(sub);
        [resType, index] = [6, idx(6, type)];
        const icon = a.entries.find((e) => e.resType === 9 && e.type === type)?.index ?? 1;
        data = encodeGoods({ type, index, name: `Item ${index}`, icon, description: "A new item.", buy: 10, sell: 5, hp: type === 9 ? 30 : undefined });
        break;
      }
      case "magic":
        type = Number(sub);
        [resType, index] = [4, idx(4, type)];
        data = encodeMagic({ type: type as 1 | 2 | 3 | 4 | 5, index, name: `Spell ${index}`, description: "A new spell.", cost: 3, animation: 1, hp: type === 1 ? 20 : type === 3 ? 30 : type === 4 ? 50 : 0 });
        break;
      case "chain":
        [resType, type, index] = [12, 1, idx(12, 1)];
        data = encodeMagicChain(index, []);
        break;
      case "levels":
        [resType, type, index] = [12, 2, idx(12, 2)];
        data = defaultLevels(index);
        break;
      case "gfx": {
        [resType, type] = sub.split("-").map(Number);
        index = idx(resType, type);
        data = blankGraphic(a, resType, type, index);
        break;
      }
      case "anim":
        [resType, type, index] = [5, Number(sub), idx(5, Number(sub))];
        data = blankAnimation(type, index);
        break;
      default:
        return;
    }
    putEntry(a, { resType, type, index, data });
    setSelected(`${resType}-${type}-${index}`);
    persist(cur);
    setVersion((v) => v + 1);
  };

  const addMap = () => {
    if (!cur) return;
    const index = nextIndex(cur.archive, 2, 1);
    const w = 20;
    const h = 14;
    const cells = Array.from({ length: w * h }, (_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      const border = x < 3 || y < 2 || x >= w - 3 || y >= h - 2;
      return { tile: border ? 2 : 0, walkable: !border, event: 0 };
    });
    putEntry(cur.archive, { resType: 2, type: 1, index, data: encodeMap({ type: 1, index, tileset: 1, name: `MAP ${index}`, width: w, height: h, cells }) });
    setSelected(`2-1-${index}`);
    persist(cur);
    setVersion((v) => v + 1);
  };

  /** Copy the selected resource to the next free number of the same kind. */
  const duplicate = (e: LibEntry) => {
    if (!cur) return;
    try {
      const index = nextIndex(cur.archive, e.resType, e.type);
      putEntry(cur.archive, { ...e, index, data: withIndex(e.data, index) });
      const from = keyOf(e);
      const to = keyOf({ ...e, index });
      const src = cur.sources[from];
      const sources = src !== undefined ? { ...cur.sources, [to]: withGutIndex(src, index) } : cur.sources;
      const next = { ...cur, sources };
      if (drafts.current[from] !== undefined) setDraft(to, withGutIndex(drafts.current[from], index));
      setCur(next);
      setSelected(to);
      persist(next);
      setVersion((v) => v + 1);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  /** Give the selected resource another number. References are not changed. */
  const renumber = (e: LibEntry, index: number): string | null => {
    if (!cur) return null;
    if (!Number.isInteger(index) || index < 1 || index > 255) return "Numbers are 1-255.";
    if (index === e.index) return null;
    if (findEntry(cur.archive, e.resType, e.type, index)) return `${e.type}-${index} is already used.`;
    removeEntry(cur.archive, e.resType, e.type, e.index);
    putEntry(cur.archive, { ...e, index, data: withIndex(e.data, index) });
    const from = keyOf(e);
    const to = keyOf({ ...e, index });
    const { [from]: src, ...rest } = cur.sources;
    const next = { ...cur, sources: src !== undefined ? { ...rest, [to]: withGutIndex(src, index) } : rest };
    if (drafts.current[from] !== undefined) setDraft(to, withGutIndex(drafts.current[from], index));
    setDraft(from, null);
    setCur(next);
    setSelected(to);
    persist(next);
    setVersion((v) => v + 1);
    return null;
  };

  const remove = (e: LibEntry) => {
    if (!cur) return;
    const what = `${KIND_NAMES[e.resType] ?? "resource"} ${e.type}-${e.index}`;
    if (!confirm(`Delete ${what}? Anything that refers to it will find it missing.`)) return;
    removeEntry(cur.archive, e.resType, e.type, e.index);
    const { [keyOf(e)]: _gone, ...sources } = cur.sources;
    setDraft(keyOf(e), null);
    const next = { ...cur, sources };
    setCur(next);
    setSelected(null);
    persist(next);
    setVersion((v) => v + 1);
  };

  const runPlaytest = (o: Open) => {
    try {
      const bytes = writeLib(o.archive);
      onPlaytest({ id: `playtest-${o.id}`, name: `${o.name} (playtest)`, data: bytes.buffer as ArrayBuffer });
    } catch (e) {
      alert(`Cannot build the game: ${(e as Error).message}`);
    }
  };

  /**
   * Playtest or export: apply the scripts' unapplied text, check the project,
   * and go ahead unless something would break the game (then show it first).
   */
  const guarded = (action: "playtest" | "export") => {
    if (!cur) return;
    const { next, failed } = applyDrafts(cur);
    const found = [...failed, ...checkProject(next.archive, next.sources)];
    if (found.some((p) => p.level === "error")) {
      setChecking({ action, problems: found });
      return;
    }
    if (action === "playtest") runPlaytest(next);
    else setExporting(true);
  };
  const playtest = () => guarded("playtest");

  /** Open the resource a problem is in (a script at its line). */
  const goToProblem = (p: Problem) => {
    setChecking(null);
    if (!p.key) return;
    setSelected(p.key);
    if (p.line) setGoto({ key: p.key, line: p.line, n: Date.now() });
  };

  // keyboard shortcuts for the whole editor
  const latest = useRef({ cur, persist, playtest });
  latest.current = { cur, persist, playtest };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { cur: o } = latest.current;
      if (!o || !root.current || root.current.offsetParent === null) return;
      if (document.querySelector("dialog[open]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s") {
        // (a script view handles it itself: it applies the script, which saves)
        if (e.defaultPrevented) return;
        e.preventDefault();
        latest.current.persist(o, true);
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        latest.current.playtest();
      } else if ((mod && k === "k") || (e.key === "/" && !typing(e))) {
        e.preventDefault();
        document.getElementById("res-filter")?.focus();
      } else if (e.key === "?" && !typing(e)) {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // closing the page with work not saved yet: save it, and ask
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      const { cur: o } = latest.current;
      const pending = saveTimer.current !== null;
      if (o && pending) latest.current.persist(o, true);
      if (pending || Object.keys(drafts.current).length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  if (!cur) {
    const starts = [
      ["bell", () => create("bell")],
      ["lantern", () => create("demo")],
      ["blank", () => create("blank")],
      ["open", () => fileInput.current?.click()],
    ] as const;
    // returning authors find their projects first
    const projectList = (
      <section className="h-section">
        <header className="h-sec-head">
          <h2>{h.projectsTitle}</h2>
          <p>{h.projectsText}</p>
        </header>
        {projects.length === 0 ? (
          <p className="e-none">{h.none}</p>
        ) : (
          <ul className="e-projects">
            {projects.map((p) => (
              <li key={p.id}>
                <button className="e-project-open" onClick={() => openStored(p)}>
                  <strong>{p.name}</strong>
                  <span className="h-meta">
                    {h.edited} {new Date(p.updatedAt).toLocaleString(lang === "zh" ? "zh-CN" : undefined)}
                  </span>
                </button>
                <div className="row">
                  <button className="h-btn h-btn-dark e-btn" onClick={() => openStored(p)}>
                    {h.open}
                    <Arrow />
                  </button>
                  <button
                    className="ghost danger"
                    onClick={async () => {
                      if (confirm(h.confirmDelete(p.name))) {
                        try {
                          await deleteProject(p.id);
                        } catch (e) {
                          alert(`${p.name}: ${(e as Error).message ?? e}`);
                        }
                        void refresh();
                      }
                    }}
                  >
                    {h.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="e-help">
          <Link to="guide" className="i-more">
            {h.help}
            <Arrow />
          </Link>
        </p>
      </section>
    );
    return (
      <div className="f-page library page e-home">
        <header className="f-head">
          <p className="h-kicker">{h.kicker}</p>
          <h1 className="i-title">{h.title}</h1>
          <p className="f-lead">{h.lead}</p>
        </header>

        {projects.length > 0 && projectList}

        <section className="h-section">
          <header className="h-sec-head">
            <h2>{h.startTitle}</h2>
            <p>{h.startText}</p>
          </header>
          <div className="e-starts">
            {starts.map(([key, run], i) => (
              <button key={key} className={`e-start ${key}`} onClick={run}>
                <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
                <span className="e-start-title">{h.starts[key][0]}</span>
                <span className="e-start-text">{h.starts[key][1]}</span>
                <Arrow />
              </button>
            ))}
          </div>
          <input ref={fileInput} type="file" accept=".lib,.LIB,.gam,.GAM" hidden onChange={(e) => (void openFile(e.target.files?.[0]), (e.target.value = ""))} />
        </section>

        {projects.length === 0 && projectList}
      </div>
    );
  }

  const entry = selected ? cur.archive.entries.find((e) => keyOf(e) === selected) : undefined;

  const errors = problems.filter((p) => p.level === "error").length;
  const backToProjects = () => {
    const { next, failed } = applyDrafts(cur);
    if (failed.length && !confirm(`${failed.map((f) => `${f.where}: ${f.message}`).join("\n")}\n\nLeave anyway? These changes will be lost.`)) {
      goToProblem(failed[0]);
      return;
    }
    resetDrafts();
    persist(next, true);
    setCur(null);
  };

  return (
    <div className="editor" ref={root}>
      <div className="editor-bar">
        <button className="ghost" onClick={backToProjects}>
          ← Projects
        </button>
        <input
          className="proj-name"
          value={cur.name}
          onChange={(e) => {
            const next = { ...cur, name: e.target.value };
            setCur(next);
            persist(next);
          }}
        />
        <span className={`save-status small ${status?.kind ?? ""}`} role="status" title="Projects are saved in this browser as you work (Ctrl+S saves now)">
          {status?.text ?? ""}
        </span>
        <div className="spacer" />
        <button className="ghost" onClick={addScript}>
          + Script
        </button>
        <button className="ghost" onClick={addMap}>
          + Map
        </button>
        <select
          className="add-menu"
          value=""
          onChange={(e) => {
            try {
              addRecord(e.target.value);
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        >
          <option value="">+ Add…</option>
          <optgroup label="Characters">
            <option value="player">Party member</option>
            <option value="npc">NPC</option>
            <option value="monster">Monster</option>
            <option value="object">Object (chest, sign…)</option>
          </optgroup>
          <optgroup label="Items">
            {ITEM_KINDS.map((n, i) => (
              <option key={n} value={`item:${i + 1}`}>
                {n}
              </option>
            ))}
          </optgroup>
          <optgroup label="Magic">
            {["Attack", "Enhance", "Restore", "Revive", "Steal"].map((n, i) => (
              <option key={n} value={`magic:${i + 1}`}>
                {n} spell
              </option>
            ))}
          </optgroup>
          <optgroup label="Tables">
            <option value="chain">Spell list</option>
            <option value="levels">Level table</option>
          </optgroup>
          <optgroup label="Graphics (blank)">
            {(
              [
                ["7-1", "Tileset"],
                ["8-1", "Party walk sprite"],
                ["8-2", "NPC walk sprite"],
                ["8-3", "Monster battle sprite"],
                ["8-4", "Object sprite"],
                ["11-1", "Portrait"],
                ["11-3", "Party battle sprite"],
                ["11-4", "Battle background"],
                ["11-5", "Story picture"],
              ] as const
            ).map(([k, n]) => (
              <option key={k} value={`gfx:${k}`}>
                {n}
              </option>
            ))}
          </optgroup>
          <optgroup label="Item icons (blank)">
            {ITEM_KINDS.map((n, i) => (
              <option key={n} value={`gfx:9-${i + 1}`}>
                {n} icon
              </option>
            ))}
          </optgroup>
          <optgroup label="Animations">
            <option value="anim:1">Cut-scene animation</option>
            <option value="anim:2">Spell / item effect</option>
          </optgroup>
        </select>
        <button
          className={`ghost check-btn ${errors ? "has-errors" : problems.length ? "has-warnings" : "clean"}`}
          onClick={() => setChecking({ action: null, problems })}
          title={`Check the project for problems: ${problemSummary(problems).toLowerCase()}`}
        >
          {problems.length ? "⚠" : "✓"} Check{problems.length > 0 && <span className="count">{problems.length}</span>}
        </button>
        <button className="ghost" onClick={() => guarded("export")} title="Download the game as a .gam or a .lib">
          Export…
        </button>
        {exporting && <ExportDialog name={cur.name} lib={() => writeLib(cur.archive)} onClose={() => setExporting(false)} />}
        <button onClick={playtest} title="Check and run this project (Ctrl+Enter)">
          ▶ Playtest
        </button>
        <button className="ghost help-btn" onClick={() => setHelp(true)} title="Getting started and keyboard shortcuts (?)" aria-label="Help">
          ?
        </button>
      </div>
      {checking && (
        <ProblemsDialog
          problems={checking.problems}
          action={checking.action}
          onGo={goToProblem}
          onClose={() => setChecking(null)}
          onProceed={() => {
            const a = checking.action;
            setChecking(null);
            if (a === "playtest") runPlaytest(cur);
            else if (a === "export") setExporting(true);
          }}
        />
      )}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      <div className="editor-main">
        <ResourceList archive={cur.archive} selected={selected} onSelect={setSelected} dirty={dirty} marks={marks} />
        {entry ? (
          <ResourceView
            key={selected!}
            archive={cur.archive}
            entry={entry}
            source={selected ? cur.sources[selected] : undefined}
            draft={selected ? drafts.current[selected] : undefined}
            onDraft={onDraft}
            goto={goto && goto.key === selected ? goto : undefined}
            onChange={change}
            actions={{ duplicate: () => duplicate(entry), renumber: (n) => renumber(entry, n), remove: () => remove(entry) }}
          />
        ) : (
          <section className="res-view e-empty">
            <h2>Pick a resource on the left</h2>
            <GettingStarted />
            <h3>Keyboard shortcuts</h3>
            <ShortcutTable />
          </section>
        )}
      </div>
    </div>
  );
}

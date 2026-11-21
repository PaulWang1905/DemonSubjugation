// The editor: the projects page, and an open project's workspace (a top
// bar, the sidebar by topic, tabs with the project home first, the command
// palette). This file owns the project's state (the archive, script sources
// and unapplied drafts, author notes, saving, checking, playtest and export);
// what each resource looks like is up to its views (views.tsx).
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { inspectDatLib } from "../../engine";
import { deleteProject, listProjects, putProject, type StoredProject } from "../../storage/db";
import { AsmError, assemble, scriptSource } from "../format/gut";
import { checkProject, describeEntry, problemSummary, type Problem } from "../format/validate";
import { HelpDialog, ProblemsDialog } from "./EditorDialogs";
import { typing } from "./undoKeys";
import { findEntry, putEntry, readLib, removeEntry, writeLib, type LibArchive, type LibEntry } from "../format/lib";
import { blankProject } from "../template/blank";
import { lanternPath, lanternPathSources } from "../template/demo";
import { silentBell, silentBellSources } from "../template/silentBell";
import { ResourceView } from "./ResourceView";
import { ExportDialog } from "./ExportDialog";
import { findLib, isGam } from "../../bbk/gam";
import { CREATE_OPTIONS, createResource, nextIndex, withGutIndex, withIndex } from "./create";
import { emptyNotes, normalizeNotes, type ProjectNotes } from "./notes";
import { Palette, type PaletteCommand } from "./Palette";
import { ProjectHome } from "./ProjectHome";
import { ProjectsPage, type StartKind } from "./ProjectsPage";
import { Sidebar } from "./Sidebar";
import { panelId, tabId, TabStrip } from "./TabStrip";
import type { EditorServices, OpenOptions } from "./views";
import {
  closeTab, cycleTab, entryOf, groupOf, HOME_TAB, initialTabs, keyOf, kindLabel, openTab, parseKey, pinTab, pushRecent, renameTab, resourceItem,
  retainTabs, setTabMode, type GroupId, type TabState,
} from "./workspace";

interface Props {
  onPlaytest: (p: { id: string; name: string; data: ArrayBuffer }) => void;
}

interface Open {
  id: string;
  name: string;
  archive: LibArchive;
  sources: Record<string, string>;
  notes: ProjectNotes;
}

/** The workspace as an author left it (per project, in this browser only). */
interface WorkspaceMemory {
  tabs: TabState;
  recents: string[];
  groups: GroupId[];
}

const DEFAULT_GROUPS: GroupId[] = ["story", "world"];
const wsKey = (id: string) => `fmj-editor-ws:${id}`;

function loadWorkspace(id: string): WorkspaceMemory | null {
  try {
    const raw = localStorage.getItem(wsKey(id));
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<WorkspaceMemory>;
    if (!m.tabs || !Array.isArray(m.tabs.tabs)) return null;
    return { tabs: m.tabs, recents: Array.isArray(m.recents) ? m.recents.filter((x) => typeof x === "string") : [], groups: Array.isArray(m.groups) ? m.groups : DEFAULT_GROUPS };
  } catch {
    return null;
  }
}

function saveWorkspace(id: string, m: WorkspaceMemory): void {
  try {
    localStorage.setItem(wsKey(id), JSON.stringify(m));
  } catch {
    /* private mode: the workspace is not remembered */
  }
}

function forgetWorkspace(id: string): void {
  try {
    localStorage.removeItem(wsKey(id));
  } catch {
    /* nothing to forget */
  }
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A tab's panel. Every open tab stays mounted (so a view keeps its state);
 * a hidden panel is not re-rendered, and its scroll position is kept.
 */
const TabPanel = memo(
  function TabPanel({ id, labelledBy, active, children }: { id: string; labelledBy: string; active: boolean; children: () => ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const scroll = useRef(0);
    useLayoutEffect(() => {
      if (active && ref.current) ref.current.scrollTop = scroll.current;
    }, [active]);
    return (
      <div
        ref={ref}
        id={id}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className="e-panel"
        hidden={!active}
        tabIndex={-1}
        onScroll={(e) => {
          if (active) scroll.current = e.currentTarget.scrollTop;
        }}
      >
        {children()}
      </div>
    );
  },
  (a, b) => !a.active && !b.active && a.id === b.id,
);

export function Editor({ onPlaytest }: Props) {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [cur, setCur] = useState<Open | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "saving" | "saved" | "error" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [version, setVersion] = useState(0);
  const saveTimer = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // Script text typed but not applied, by resource key (kept when its tab
  // closes); `dirty` lists the keys for the sidebar and the tabs.
  const drafts = useRef<Record<string, string>>({});
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const [goto, setGoto] = useState<{ key: string; line: number; n: number } | null>(null);
  const [checking, setChecking] = useState<{ action: "playtest" | "export" | null; problems: Problem[] } | null>(null);
  const [help, setHelp] = useState(false);
  // the workspace
  const [ws, setWs] = useState<TabState>(initialTabs);
  const [recents, setRecents] = useState<string[]>([]);
  const [groups, setGroups] = useState<ReadonlySet<GroupId>>(new Set(DEFAULT_GROUPS));
  const [palette, setPalette] = useState<string | null>(null);
  // Resources changed from outside their own view: their views are re-created.
  const [revs, setRevs] = useState<Record<string, number>>({});

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
          await putProject({ id: o.id, name: o.name, updatedAt: Date.now(), data: bytes.buffer as ArrayBuffer, sources: o.sources, notes: o.notes });
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

  // remember the workspace (tabs, recent items, open groups) per project
  useEffect(() => {
    if (cur) saveWorkspace(cur.id, { tabs: ws, recents, groups: [...groups] });
  }, [cur?.id, ws, recents, groups]);

  const resetDrafts = () => {
    drafts.current = {};
    setDirty(new Set());
    setGoto(null);
  };

  /** Show a project, with its workspace as it was left (or the project home). */
  const show = (o: Open) => {
    resetDrafts();
    setRevs({});
    const m = loadWorkspace(o.id);
    setWs(m ? retainTabs(m.tabs, (k) => !!entryOf(o.archive, k)) : initialTabs());
    setRecents(m?.recents ?? []);
    setGroups(new Set(m?.groups ?? DEFAULT_GROUPS));
    setCur(o);
  };

  const openArchive = (name: string, archive: LibArchive, sources: Record<string, string> = {}) => {
    const o = { id: newId(), name, archive, sources, notes: emptyNotes() };
    show(o);
    persist(o, true);
  };

  const start = (kind: StartKind, name?: string) => {
    if (kind === "demo") openArchive("Lantern Path", lanternPath(), lanternPathSources());
    else if (kind === "bell") openArchive("The Silent Bell", silentBell(), silentBellSources());
    else if (name) openArchive(name, blankProject(name.toUpperCase().slice(0, 9)));
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
      show({ id: p.id, name: p.name, archive: a, sources: p.sources ?? {}, notes: normalizeNotes(p.notes) });
      setStatus(null);
    } catch (e) {
      alert(`Could not open project: ${(e as Error).message}`);
    }
  };

  const removeProject = async (p: StoredProject) => {
    try {
      await deleteProject(p.id);
      forgetWorkspace(p.id);
    } catch (e) {
      alert(`${p.name}: ${(e as Error).message ?? e}`);
    }
    void refresh();
  };

  // --- tabs ---------------------------------------------------------------

  const openResource = useCallback((key: string, opts: OpenOptions = {}) => {
    if (key === HOME_TAB) {
      setWs((s) => ({ ...s, active: HOME_TAB }));
      return;
    }
    setWs((s) => openTab(s, key, { pin: !opts.preview, mode: opts.mode }));
    setRecents((r) => pushRecent(r, `res:${key}`));
    if (opts.line) setGoto({ key, line: opts.line, n: Date.now() });
  }, []);

  const pin = useCallback((key: string) => setWs((s) => pinTab(s, key)), []);
  const close = useCallback((key: string) => setWs((s) => closeTab(s, key)), []);

  // --- changes --------------------------------------------------------------

  /**
   * Store a resource's bytes (and a script's source text). `own`: the change
   * comes from the resource's own view (which then keeps its state); any
   * other change re-creates the resource's views.
   */
  const write = useCallback(
    (key: string, data: Uint8Array, source: string | undefined, own: boolean) => {
      const r = parseKey(key);
      if (!r) return;
      setCur((o) => {
        if (!o) return o;
        putEntry(o.archive, { ...r, data });
        const sources = source !== undefined ? { ...o.sources, [key]: source } : o.sources;
        const next = { ...o, sources, archive: { ...o.archive, entries: [...o.archive.entries] } };
        persist(next);
        return next;
      });
      setVersion((v) => v + 1);
      if (own) pin(key);
      else {
        // (the writer started from scriptText, which includes the unapplied text)
        if (key in drafts.current) {
          delete drafts.current[key];
          setDirty(new Set(Object.keys(drafts.current)));
        }
        setRevs((m) => ({ ...m, [key]: (m[key] ?? 0) + 1 }));
      }
    },
    [persist, pin],
  );

  /** Remember (or forget, with null) a script's unapplied text. */
  const setDraft = useCallback(
    (key: string, text: string | null) => {
      const had = key in drafts.current;
      if (text === null) delete drafts.current[key];
      else drafts.current[key] = text;
      if (had !== (text !== null)) setDirty(new Set(Object.keys(drafts.current)));
      if (text !== null && !had) pin(key);
    },
    [pin],
  );

  // stable callbacks per resource, for its view
  const perKey = useRef(new Map<string, { change: (d: Uint8Array, s?: string) => void; draft: (t: string | null) => void }>());
  const callbacksFor = (key: string) => {
    let c = perKey.current.get(key);
    if (!c) {
      c = { change: (d, s) => write(key, d, s, true), draft: (t) => setDraft(key, t) };
      perKey.current.set(key, c);
    }
    return c;
  };

  const setNotes = useCallback(
    (update: (prev: ProjectNotes) => ProjectNotes) =>
      setCur((o) => {
        if (!o) return o;
        const next = { ...o, notes: update(o.notes) };
        if (next.notes !== o.notes) persist(next);
        return next;
      }),
    [persist],
  );

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

  /** Make a new resource (`what` as in CREATE_OPTIONS) and open it. */
  const create = (what: string) => {
    if (!cur) return;
    try {
      const key = createResource(cur.archive, what);
      const next = { ...cur, archive: { ...cur.archive, entries: [...cur.archive.entries] } };
      setCur(next);
      persist(next);
      setVersion((v) => v + 1);
      setGroups((g) => new Set([...g, groupOf(parseKey(key)!)]));
      openResource(key);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  /** Copy a resource to the next free number of the same kind. */
  const duplicate = (e: LibEntry) => {
    if (!cur) return;
    try {
      const index = nextIndex(cur.archive, e.resType, e.type);
      putEntry(cur.archive, { ...e, index, data: withIndex(e.data, index) });
      const from = keyOf(e);
      const to = keyOf({ ...e, index });
      const src = cur.sources[from];
      const sources = src !== undefined ? { ...cur.sources, [to]: withGutIndex(src, index) } : cur.sources;
      const next = { ...cur, sources, archive: { ...cur.archive, entries: [...cur.archive.entries] } };
      if (drafts.current[from] !== undefined) setDraft(to, withGutIndex(drafts.current[from], index));
      setCur(next);
      persist(next);
      setVersion((v) => v + 1);
      openResource(to);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  /** Give a resource another number. References are not changed. */
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
    setWs((s) => renameTab(s, from, to));
    setRecents((r) => r.map((x) => (x === `res:${from}` ? `res:${to}` : x)));
    persist(next);
    setVersion((v) => v + 1);
    return null;
  };

  const remove = (e: LibEntry) => {
    if (!cur) return;
    const what = `${kindLabel(e)} ${e.type}-${e.index}`;
    if (!confirm(`Delete ${what}? Anything that refers to it will find it missing.`)) return;
    removeEntry(cur.archive, e.resType, e.type, e.index);
    const key = keyOf(e);
    const { [key]: _gone, ...sources } = cur.sources;
    setDraft(key, null);
    const next = { ...cur, sources };
    setCur(next);
    setWs((s) => closeTab(s, key));
    setRecents((r) => r.filter((x) => x !== `res:${key}`));
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
  const showProblems = () => setChecking({ action: null, problems });

  /** Open the resource a problem is in (a script at its line). */
  const goToProblem = (p: Problem) => {
    setChecking(null);
    if (p.key) openResource(p.key, { line: p.line });
  };

  const showGroup = (g: GroupId) => {
    setGroups((s) => new Set([...s, g]));
    requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLElement>(`[data-group="${g}"]`);
      el?.scrollIntoView({ block: "start" });
      el?.querySelector<HTMLElement>(".group-head")?.focus();
    });
  };

  const backToProjects = () => {
    if (!cur) return;
    const { next, failed } = applyDrafts(cur);
    if (failed.length && !confirm(`${failed.map((f) => `${f.where}: ${f.message}`).join("\n")}\n\nLeave anyway? These changes will be lost.`)) {
      goToProblem(failed[0]);
      return;
    }
    resetDrafts();
    persist(next, true);
    setCur(null);
  };

  // --- the palette's commands ----------------------------------------------------

  // (the makers most asked for first: a map, a script, a person's sprite)
  const featured = ["map", "script", "gfx:8-2"];
  const makers = [...CREATE_OPTIONS].sort((a, b) => (featured.indexOf(a.what) + 1 || 99) - (featured.indexOf(b.what) + 1 || 99));
  const commands: PaletteCommand[] = cur
    ? [
        { id: "home", label: "Go to project home", detail: "the first tab", keywords: "start overview", run: () => openResource(HOME_TAB) },
        { id: "playtest", label: "Playtest", detail: "Ctrl+Enter", keywords: "run play test", run: playtest },
        { id: "check", label: "Check the project", detail: problemSummary(problems), keywords: "problems errors warnings", run: showProblems },
        { id: "export", label: "Export…", detail: ".gam or .lib", keywords: "download save file", run: () => guarded("export") },
        ...makers.map((o) => ({
          id: `new:${o.what}`,
          label: `New ${o.what === "gfx:8-2" ? "person sprite" : o.label.charAt(0).toLowerCase() + o.label.slice(1)}`,
          detail: o.what === "gfx:8-2" ? "a person's walk sprite" : "make",
          keywords: `new add create make ${o.label} ${o.group}`,
          run: () => create(o.what),
        })),
        { id: "save", label: "Save now", detail: "Ctrl+S", run: () => persist(cur, true) },
        { id: "close", label: "Close tab", detail: "Ctrl+W · Alt+W", run: () => close(ws.active) },
        { id: "filter", label: "Filter the sidebar", detail: "Ctrl+K", run: () => document.getElementById("res-filter")?.focus() },
        { id: "help", label: "Help and keyboard shortcuts", detail: "?", keywords: "getting started guide", run: () => setHelp(true) },
        { id: "projects", label: "Back to projects", detail: "all your projects", keywords: "close project", run: backToProjects },
      ]
    : [];
  const resourceItems = useMemo(() => (cur ? cur.archive.entries.map(resourceItem) : []), [cur?.archive]);

  // --- keyboard shortcuts for the whole editor ------------------------------------------

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
      } else if (mod && k === "p") {
        e.preventDefault();
        setPalette(e.shiftKey ? ">" : "");
      } else if ((mod && !e.shiftKey && k === "w") || (e.altKey && !mod && (k === "w" || e.code === "KeyW"))) {
        e.preventDefault();
        setWs((s) => closeTab(s, s.active));
      } else if ((e.ctrlKey && e.key === "Tab") || (e.altKey && !mod && (e.code === "BracketRight" || e.code === "BracketLeft"))) {
        e.preventDefault();
        const back = e.key === "Tab" ? e.shiftKey : e.code === "BracketLeft";
        setWs((s) => cycleTab(s, back ? -1 : 1));
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

  // the workspace fills the window below the site's bar
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      if (el.offsetParent !== null) el.style.setProperty("--e-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [cur?.id]);

  if (!cur) return <ProjectsPage projects={projects} onStart={start} onOpenFile={(f) => void openFile(f)} onOpen={openStored} onDelete={(p) => void removeProject(p)} />;

  const errors = problems.filter((p) => p.level === "error").length;
  const activeKey = ws.active === HOME_TAB ? null : ws.active;

  /** What a resource's view gets from the editor (see views.tsx). */
  const servicesFor = (key: string): EditorServices => ({
    key,
    version,
    source: cur.sources[key],
    draft: drafts.current[key],
    setDraft: callbacksFor(key).draft,
    goto: goto && goto.key === key ? goto : undefined,
    problems: problems.filter((p) => p.key === key),
    pin: () => pin(key),
    allProblems: problems,
    openResource,
    writeResource: (k, data, source) => write(k, data, source, false),
    scriptText: (k) => {
      if (drafts.current[k] !== undefined) return drafts.current[k];
      const e = entryOf(cur.archive, k);
      return e && e.resType === 1 ? scriptSource(e.data, cur.sources[k]) : undefined;
    },
    notes: cur.notes,
    setNotes,
    playtest,
    showProblems,
  });

  return (
    <div className="editor" ref={root}>
      <div className="editor-bar">
        <button className="ghost" onClick={backToProjects}>
          ← Projects
        </button>
        <input
          className="proj-name"
          value={cur.name}
          aria-label="Project name"
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
        <button className="ghost goto-btn" onClick={() => setPalette("")} title="Go to a resource or run a command (Ctrl+P)" aria-haspopup="dialog">
          Go to… <kbd>Ctrl+P</kbd>
        </button>
        <button
          className={`ghost check-btn ${errors ? "has-errors" : problems.length ? "has-warnings" : "clean"}`}
          onClick={showProblems}
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
      {palette !== null && (
        <Palette
          resources={resourceItems}
          commands={commands}
          recents={recents}
          initial={palette}
          onOpenResource={(key) => openResource(key)}
          onUsed={(id) => setRecents((r) => pushRecent(r, id))}
          onClose={() => setPalette(null)}
        />
      )}
      <div className="editor-main">
        <Sidebar
          archive={cur.archive}
          active={activeKey}
          onOpen={(key, pinIt) => openResource(key, { preview: !pinIt })}
          onCreate={create}
          dirty={dirty}
          marks={marks}
          open={groups}
          onToggle={(g, on) => setGroups((s) => (on ? new Set([...s, g]) : new Set([...s].filter((x) => x !== g))))}
        />
        <div className="e-work">
          <TabStrip
            archive={cur.archive}
            projectName={cur.name}
            tabs={ws.tabs}
            active={ws.active}
            dirty={dirty}
            marks={marks}
            onActivate={(key) => setWs((s) => ({ ...s, active: key }))}
            onPin={pin}
            onClose={close}
          />
          <div className="e-panels">
            {ws.tabs.map((t) => (
              <TabPanel key={t.key} id={panelId(t.key)} labelledBy={tabId(t.key)} active={t.key === ws.active}>
                {() => {
                  if (t.key === HOME_TAB)
                    return (
                      <ProjectHome
                        archive={cur.archive}
                        sources={cur.sources}
                        name={cur.name}
                        onName={(name) => {
                          const next = { ...cur, name };
                          setCur(next);
                          persist(next);
                        }}
                        onTitle={(titleBytes) => {
                          const next = { ...cur, archive: { ...cur.archive, titleBytes } };
                          setCur(next);
                          persist(next);
                        }}
                        problems={problems}
                        onOpen={(key, line) => openResource(key, { line })}
                        onGroup={showGroup}
                        onCreate={create}
                        onPlaytest={playtest}
                        onExport={() => guarded("export")}
                        onCheck={showProblems}
                        onProblem={goToProblem}
                        onHelp={() => setHelp(true)}
                        onPalette={() => setPalette("")}
                      />
                    );
                  const entry = entryOf(cur.archive, t.key);
                  if (!entry) return <p className="muted e-gone">This resource no longer exists.</p>;
                  const cb = callbacksFor(t.key);
                  return (
                    <ResourceView
                      key={`${t.key}:${revs[t.key] ?? 0}`}
                      archive={cur.archive}
                      entry={entry}
                      mode={t.mode}
                      onMode={(mode) => setWs((s) => setTabMode(s, t.key, mode))}
                      onChange={cb.change}
                      services={servicesFor(t.key)}
                      actions={{ duplicate: () => duplicate(entry), renumber: (n) => renumber(entry, n), remove: () => remove(entry) }}
                    />
                  );
                }}
              </TabPanel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

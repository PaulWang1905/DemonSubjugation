// The editor's start page: the author's projects, and the ways to start one
// (in English and Chinese; the editor itself is in English).
import { useRef, useState } from "react";
import type { StoredProject } from "../../storage/db";
import { Link } from "../../app/router";
import { useSiteLang } from "../../app/siteLang";
import { Arrow } from "../../app/Tile";
import { fileTitle } from "../template/titleLogo";
import { gbkBytes } from "../../engine/java";
import "./authoring.css";
import { useShowModal } from "./useShowModal";

const HOME = {
  en: {
    kicker: "BBK Maker",
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
    newName: "Name of the new game",
    nameTitle: "Name your game",
    nameHint: (title: string) => `Any length: the project and its title screen keep the full name. The game file stores a title of 9 letters at most, for a device's game list: “${title}” (change it on the project home).`,
    create: "Create the game",
    cancel: "Cancel",
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
    newName: "新游戏的名字",
    nameTitle: "给游戏起个名字",
    nameHint: (title: string) => `长度不限：项目和标题画面都保留完整的名字。游戏文件里存的标题最多 9 个字母（4 个汉字），用于设备的游戏列表：“${title}”（可在项目首页修改）。`,
    create: "创建游戏",
    cancel: "取消",
    confirmDelete: (n: string) => `删除项目“${n}”？`,
  },
};

export type StartKind = "bell" | "demo" | "blank";

interface Props {
  projects: StoredProject[];
  /** Start from a template; a blank game asks for its name first (null when cancelled). */
  onStart: (kind: StartKind, name?: string) => void;
  onOpenFile: (f: File | undefined) => void;
  onOpen: (p: StoredProject) => void;
  onDelete: (p: StoredProject) => void;
}

export function ProjectsPage({ projects, onStart, onOpenFile, onOpen, onDelete }: Props) {
  const lang = useSiteLang();
  const h = HOME[lang];
  const fileInput = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState(false);
  const starts = [
    ["bell", () => onStart("bell")],
    ["lantern", () => onStart("demo")],
    ["blank", () => setNaming(true)],
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
              <button className="e-project-open" onClick={() => onOpen(p)}>
                <strong>{p.name}</strong>
                <span className="h-meta">
                  {h.edited} {new Date(p.updatedAt).toLocaleString(lang === "zh" ? "zh-CN" : undefined)}
                </span>
              </button>
              <div className="row">
                <button className="h-btn h-btn-dark e-btn" onClick={() => onOpen(p)}>
                  {h.open}
                  <Arrow />
                </button>
                <button className="ghost danger" onClick={() => confirm(h.confirmDelete(p.name)) && onDelete(p)}>
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
        <input ref={fileInput} type="file" accept=".lib,.LIB,.gam,.GAM" hidden onChange={(e) => (onOpenFile(e.target.files?.[0]), (e.target.value = ""))} />
      </section>

      {projects.length === 0 && projectList}
      {naming && <NameDialog h={h} onCancel={() => setNaming(false)} onCreate={(name) => (setNaming(false), onStart("blank", name))} />}
    </div>
  );
}

/** The new blank game's name, asked in the page (not the browser's prompt). */
function NameDialog({ h, onCreate, onCancel }: { h: (typeof HOME)["en"]; onCreate: (name: string) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("MY GAME");
  useShowModal(dialog);
  const clean = name.trim();
  return (
    <dialog ref={dialog} className="export-dialog name-dialog" onClose={onCancel} onCancel={onCancel} aria-labelledby="name-dialog-title">
      <form method="dialog" onSubmit={(e) => (e.preventDefault(), clean && onCreate(clean))}>
        <h2 id="name-dialog-title">{h.nameTitle}</h2>
        <input
          className="name-input"
          aria-label={h.newName}
          autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} aria-describedby="name-dialog-hint"
        />
        <p id="name-dialog-hint" className="muted small">
          {h.nameHint(fileTitle(clean || "MY GAME", (t) => gbkBytes(t).length))}
        </p>
        <div className="row">
          <button type="submit" disabled={!clean}>
            {h.create}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            {h.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

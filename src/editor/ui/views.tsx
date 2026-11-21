// The view registry: which React component edits which kind of resource.
//
// A tab shows one resource with one view. A kind can have several views
// (a script: "Visual" and "Text"); the tab's header then offers a switch
// between them, and the first one (lowest `order`) is the default.
//
// ADDING A VIEW (phase 2 and later): write the component in its own file,
// importing only types from here (`import type { ViewProps } from "./views"`),
// and add one `registerView({...})` call in "Registered views" at the bottom
// of this file. Editor.tsx does not change.
//
// THE CONTRACT
// - `entry` is the resource as stored now; `archive` is the whole project.
//   Both are read-only: never mutate them. Store a change with
//   `onChange(data, source?)`, or another resource's with
//   `services.writeResource(key, data, source?)`.
// - Storing a change saves the project (after a short pause), re-runs the
//   project check and pins the tab. It does NOT re-create the view: a view
//   keeps its own state (undo history, selection) across its own changes.
// - When the resource is changed from outside the view (another view's
//   writeResource, a renumber, applying scripts before a playtest), the view
//   is re-created with the new entry. A view therefore may read `entry` only
//   when it is created, as MapEditor does.
// - Views stay mounted (hidden) while their tab is open but not shown, and
//   are not re-rendered while hidden. Global key handlers must check that
//   the view is on screen (see undoKeys.ts: `anchor.offsetParent !== null`).
// - The tab panel scrolls; its scroll position is kept per tab. A view need
//   not fill the height.
// - Scripts: unapplied text lives in the editor (so it survives closing the
//   view and is applied before a playtest). Read `services.draft` when the
//   view is created and report every change with `services.setDraft(text)`,
//   or `setDraft(null)` when the text equals what is stored. A dirty tab
//   shows a dot.
import type { ComponentType } from "react";
import { scriptSource } from "../format/gut";
import type { LibArchive, LibEntry } from "../format/lib";
import { fieldsFor } from "../format/schema";
import type { Problem } from "../format/validate";
import type { ProjectNotes } from "../format/notes";
import { AnimationEditor } from "./AnimationEditor";
import { hasCard } from "./cardModel";
import { CardView } from "./CardView";
import { GalleryView } from "./GalleryView";
import { FieldForm } from "./FieldForm";
import { MapEditor } from "./MapEditor";
import { PixelEditor } from "./PixelEditor";
import { ScriptEditor } from "./ScriptEditor";
import { ScriptVisual } from "./ScriptVisual";
import { LevelTableEditor, MagicChainEditor } from "./TableEditors";
import { WorldView } from "./WorldView";

/** How to open a resource (EditorServices.openResource). */
export interface OpenOptions {
  /** Show this line (scripts). */
  line?: number;
  /** The view to show it with (a ViewDef id); the kind's default otherwise. */
  mode?: string;
  /** Open it as a preview tab (replaced by the next preview), like a single click in the sidebar. Default false. */
  preview?: boolean;
}

/** What the editor offers every view, beyond its own resource. */
export interface EditorServices {
  /** This view's resource, as "resType-type-index". */
  readonly key: string;
  /** Counts every change to the project (for useMemo dependencies). */
  readonly version: number;

  // --- this resource ---
  /** The script's saved source text (labels, comments), if it has one. */
  readonly source?: string;
  /** Script text typed but not applied yet (read it when the view is created). */
  readonly draft?: string;
  /** Remember (text) or forget (null) this resource's unapplied text. Stable per resource. */
  setDraft(text: string | null): void;
  /** A request to show a line of a script; `n` changes with every request. */
  readonly goto?: { line: number; n: number };
  /** The project check's problems in this resource. */
  readonly problems: readonly Problem[];
  /** Keep this tab open (a preview tab becomes a normal one). Editing does it already. */
  pin(): void;

  // --- the project ---
  /** Every problem the project check found. */
  readonly allProblems: readonly Problem[];
  /** Open a resource in a tab (or the project home with "home"). */
  openResource(key: string, opts?: OpenOptions): void;
  /**
   * Store another resource's bytes (and a script's source text); its open
   * views are re-created. For a script this replaces its unapplied text too:
   * build the new text from scriptText(key) and assemble it (format/gut.ts).
   */
  writeResource(key: string, data: Uint8Array, source?: string): void;
  /** A script's text as the author sees it: unapplied draft, else saved source, else disassembled. */
  scriptText(key: string): string | undefined;
  /** The author's notes (names for flags and variables, notes): kept with the project, not in the game. */
  readonly notes: ProjectNotes;
  /** Change the notes; saved with the project. */
  setNotes(update: (prev: ProjectNotes) => ProjectNotes): void;
  /** Check the project and run it (as the Playtest button). */
  playtest(): void;
  /** Show the project check's list. */
  showProblems(): void;
  /**
   * Playtest a copy of the project that starts on map tile x, y of a map
   * (the project is not changed). Returns what the copy does, or null when
   * the project check is shown first. Throws when the player cannot start there.
   */
  playtestAt?(mapKey: string, x: number, y: number): string | null;
  /** Open a wizard ("map", "person", "shop", "battle"; Wizards.tsx), starting on a map. */
  wizard?(kind: string, init?: { map?: string }): void;
}

/** What a view component gets. */
export interface ViewProps {
  /** The whole project. Read-only. */
  archive: LibArchive;
  /** The resource shown. Read-only (see the contract above). */
  entry: LibEntry;
  /** Store new bytes for this resource (and, for a script, its source text). */
  onChange: (data: Uint8Array, source?: string) => void;
  services: EditorServices;
}

export interface ViewDef {
  /** Unique, "kind.view": "script.text", "script.visual", "map.tiles". Stored in tabs. */
  id: string;
  /** The switch's label: "Text", "Visual". */
  label: string;
  /** A longer description for the switch's tooltip. */
  title?: string;
  /** Whether this view can show the resource. */
  match: (e: { resType: number; type: number; index: number }) => boolean;
  /** Lower comes first in the switch; the first matching view is the default. Default 100. */
  order?: number;
  component: ComponentType<ViewProps>;
}

const registry = new Map<string, ViewDef>();

/** Add a view (a view with the same id is replaced). */
export function registerView(def: ViewDef): void {
  registry.set(def.id, def);
}

/** The views that can show a resource, default first. */
export function viewsFor(e: { resType: number; type: number; index: number }): ViewDef[] {
  return [...registry.values()].filter((v) => v.match(e)).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** The view to show a resource with: `mode` if it can, else the default. */
export function pickView(e: { resType: number; type: number; index: number }, mode?: string): ViewDef | undefined {
  const list = viewsFor(e);
  return list.find((v) => v.id === mode) ?? list[0];
}

// --- the built-in views -------------------------------------------------------------

function hex(b: Uint8Array, n = 64): string {
  return [...b.subarray(0, n)].map((x) => x.toString(16).padStart(2, "0")).join(" ") + (b.length > n ? " …" : "");
}

function ScriptTextView({ archive, entry, onChange, services }: ViewProps) {
  return (
    <ScriptEditor
      entry={entry}
      source={services.source}
      draft={services.draft}
      onDraft={services.setDraft}
      goto={services.goto}
      onChange={onChange}
      others={() => archive.entries.filter((e) => e.resType === 1 && e !== entry).map((e) => scriptSource(e.data))}
    />
  );
}

function MapTilesView({ archive, entry, onChange }: ViewProps) {
  return <MapEditor archive={archive} entry={entry} onChange={onChange} />;
}

function AnimationView({ entry, onChange }: ViewProps) {
  return <AnimationEditor entry={entry} onChange={onChange} />;
}

function pixelHint(e: LibEntry): string | undefined {
  if (e.resType === 8 && (e.type === 1 || e.type === 2)) return "Frames 1-3 face north, 4-6 east, 7-9 south, 10-12 west (left foot, standing, right foot).";
  if (e.resType === 7) return "Frame N is tile N-1 in the map editor. Tiles are 16×16.";
  if (e.resType === 11 && e.type === 3) return "Battle frames: 1 idle, 2-5 attack, 6-8 cast, 9 guard, 10 hit, 11 weak, 12 knocked out.";
  if (e.resType === 8 && e.type === 4) return "Objects show frame step+1 (chests: 1 closed, 2 open).";
  return undefined;
}

function PixelView({ entry, onChange }: ViewProps) {
  return <PixelEditor entry={entry} onChange={onChange} hint={pixelHint(entry)} />;
}

function TableView({ archive, entry, onChange }: ViewProps) {
  return entry.type === 1 ? <MagicChainEditor archive={archive} entry={entry} onChange={onChange} /> : <LevelTableEditor archive={archive} entry={entry} onChange={onChange} />;
}

function FormView({ archive, entry, onChange }: ViewProps) {
  // (registered only for kinds that have fields)
  return <FieldForm archive={archive} entry={entry} fields={fieldsFor(entry.resType, entry.type) ?? []} onChange={onChange} />;
}

function BytesView({ entry }: ViewProps) {
  return (
    <>
      <p className="muted">
        The resource as stored: {entry.data.length} bytes{entry.data.length > 512 ? " (the first 512 shown)" : ""}.
      </p>
      <pre className="hex">{hex(entry.data, 512)}</pre>
    </>
  );
}

// --- Registered views ----------------------------------------------------------------
// One line per view. Phase 2 adds e.g. "script.visual" (order 10, before
// "script.text"), "map.world", "character.card" here.

registerView({ id: "script.visual", label: "Visual", title: "The script's events as steps in plain words", order: 10, match: (e) => e.resType === 1, component: ScriptVisual });
registerView({ id: "script.text", label: "Text", title: "The script as text", order: 50, match: (e) => e.resType === 1, component: ScriptTextView });
registerView({ id: "map.tiles", label: "Tiles", title: "Paint tiles, walkable cells and map events", order: 50, match: (e) => e.resType === 2, component: MapTilesView });
registerView({ id: "record.card", label: "Card", title: "The record as a card: picture, key numbers, pickers, where it is used", order: 10, match: hasCard, component: CardView });
registerView({ id: "record.gallery", label: "Compare", title: "Every record of its kind side by side, sorted by a number", order: 20, match: hasCard, component: GalleryView });
registerView({ id: "form", label: "Fields", title: "Every field, as stored", order: 50, match: (e) => (e.resType === 3 || e.resType === 4 || e.resType === 6) && !!fieldsFor(e.resType, e.type), component: FormView });
registerView({ id: "animation", label: "Animation", order: 50, match: (e) => e.resType === 5, component: AnimationView });
registerView({ id: "pixels", label: "Pixels", title: "Draw the frames", order: 50, match: (e) => e.resType >= 7 && e.resType <= 11, component: PixelView });
registerView({ id: "table", label: "Table", order: 50, match: (e) => e.resType === 12 && (e.type === 1 || e.type === 2), component: TableView });
registerView({ id: "map.world", label: "World", title: "Who is on the map, exits and the start; place, move and paint", order: 10, match: (e) => e.resType === 2, component: WorldView });
registerView({ id: "bytes", label: "Bytes", title: "The raw bytes as stored in the game file", order: 1000, match: () => true, component: BytesView });

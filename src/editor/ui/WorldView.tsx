// The World view of a map: the map as the player sees it, with the people
// and objects the scripts place there (drawn with their sprites), the
// player's start and arrivals from other maps, event tiles and what handles
// them, exits with where they lead. Click anything to see what it is in plain
// words; drag people, objects and the start to move them; tools add a person,
// a chest, an exit (and the way back), start the game here, delete; and the
// tile painter's tools (tile, fill, walkable, blocked, event number, pick)
// work here too, so an author paints and places in one place. Every change
// writes the scripts through the script model (untouched lines stay as they
// are) and the map's bytes; Ctrl+Z / Ctrl+Shift+Z undo and redo both.
//
// Layout of the code: the world index is rebuilt from the project whenever it
// changes (scripts' texts as the author sees them, unapplied ones included);
// `commit` stores a change (this map through onChange, other maps and
// scripts through writeResource) and records a snapshot pair for undo.
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeMap } from "../format/decode";
import { encodeNpc, encodeSceneObj } from "../format/encode";
import { assemble } from "../format/gut";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { parseScript, toSource, type ScriptModel } from "../format/scriptModel";
import { buildWorld, describeKey, resKey, scriptNames, withCellEvent, type Placement, type WorldIndex } from "../format/world";
import {
  addCellHandler,
  addChest,
  addExit,
  addPerson,
  arrivalCamera,
  besideExit,
  deletePlacement,
  eventSummary,
  firstLine,
  freeCellEvent,
  freeFlag,
  inPlayerBand,
  labelLine,
  loadsWhenStarting,
  mapOverlay,
  mapSetups,
  movePlacement,
  moveStart,
  placementCondition,
  placementPosition,
  placementUses,
  setLineText,
  standingSprite,
  type OverlayCell,
  type Texts,
} from "../format/worldEdit";
import { flagName, setFlagNote, setVariableNote, variableName } from "../format/notes";
import { cells as textCells, wrapMessage } from "../format/text";
import { FrameCanvas } from "./FrameStrip";
import { DARK } from "./pixels";
import { ResourcePicker, entryLabel, type ResValue } from "./ResourcePicker";
import { useToolKeys, useUndoKeys } from "./undoKeys";
import type { ViewProps } from "./views";
import { MiniMap } from "./WorldMap";
import { framesOf, mapCanvas, spriteFrame } from "./worldArt";
import { requestWorld, useWorldIntent } from "./intents";
import "./world.css";

type Tool = "select" | "person" | "chest" | "exit" | "start" | "tile" | "fill" | "walk" | "block" | "event" | "pick" | "here";

const PLACE_TOOLS: [Tool, string, string, string][] = [
  ["select", "Select", "V", "Click to see what something is; drag people, objects and the start to move them"],
  ["person", "Add person", "P", "Put a person on the map who talks"],
  ["chest", "Add chest", "C", "Put a chest (or another object) on the map"],
  ["exit", "Add exit", "D", "A tile that takes the party to another map (a door, a road)"],
  ["start", "Start here", "S", "Start a new game on a tile of this map"],
];
const PAINT_TOOLS: [Tool, string, string][] = [
  ["tile", "Tile", "B"],
  ["fill", "Fill", "G"],
  ["walk", "Walkable", "W"],
  ["block", "Blocked", "X"],
  ["event", "Event no.", "E"],
  ["pick", "Pick", "I"],
];
const PAINTING = new Set<Tool>(["tile", "fill", "walk", "block", "event", "pick"]);

type Sel =
  | { kind: "person"; script: string; id: number; group: string | null }
  | { kind: "start" }
  | { kind: "cell"; x: number; y: number }
  | { kind: "arrival"; from: string; x: number; y: number };

type Snap = Record<string, { data: Uint8Array; source?: string }>;
interface UndoEntry {
  label: string;
  before: Snap;
  after: Snap;
}

interface ExitDraft {
  cell: { x: number; y: number } | null;
  target: ResValue | null;
  arrival: { x: number; y: number } | null;
  back: boolean;
  backCell: { x: number; y: number } | null;
  picking: "arrival" | "back";
}

const HISTORY = 100;
const VISUAL = "visual";
const keyOfEntry = (e: { resType: number; type: number; index: number }) => resKey(e.resType, e.type, e.index);
const at = (x: number, y: number) => `${x}, ${y}`;

/** The project's scripts with their texts as the author sees them; unapplied texts that assemble count. */
function indexInput(archive: LibArchive, textOf: (k: string) => string | undefined): { archive: LibArchive; texts: Texts } {
  const texts: Texts = {};
  const entries = archive.entries.map((e) => {
    if (e.resType !== 1) return e;
    const k = keyOfEntry(e);
    const t = textOf(k);
    if (t === undefined) return e;
    texts[k] = t;
    try {
      const data = assemble(t);
      if (data.length !== e.data.length || data.some((v, i) => v !== e.data[i])) return { ...e, data };
    } catch {
      /* shown as stored */
    }
    return e;
  });
  return { archive: { ...archive, entries }, texts };
}

function cellLo(b: Uint8Array, w: number, x: number, y: number) {
  return 0x12 + (y * w + x) * 2;
}

export function WorldView({ archive, entry, onChange, services }: ViewProps) {
  const mapKey = services.key;
  const [bytes, setBytes] = useState<Uint8Array>(entry.data);
  const committed = useRef<Uint8Array>(entry.data);
  const map = useMemo(() => decodeMap(bytes), [bytes]);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Sel | null>(null);
  const [setupPick, setSetupPick] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [showWalk, setShowWalk] = useState(false);
  const [showEvents, setShowEvents] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [tile, setTile] = useState(0);
  const [eventNo, setEventNo] = useState(1);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ what: Sel; to: { x: number; y: number }; moved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [npc, setNpc] = useState<ResValue | null>(null);
  const [say, setSay] = useState("Hello there!");
  const [box, setBox] = useState<ResValue | null>(null);
  const [item, setItem] = useState<ResValue | null>(null);
  const [exitDraft, setExitDraft] = useState<ExitDraft>({ cell: null, target: null, arrival: null, back: true, backCell: null, picking: "arrival" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const undo = useRef<UndoEntry[]>([]);
  const redo = useRef<UndoEntry[]>([]);
  const [, bump] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stroke = useRef<Uint8Array | null>(null);
  const s = 16 * zoom;

  // requests from outside (the guide, the New person wizard): arm a tool, pick who
  useWorldIntent(mapKey, (i) => {
    if (i.tool) setTool(i.tool as Tool);
    if (i.npc) setNpc({ type: 2, index: i.npc });
    if (i.say) setSay(i.say);
    if (i.box) setBox({ type: 4, index: i.box });
    setError(null);
    setNotice(i.tool === "person" && i.npc ? "Click a tile to put them there." : null);
  });

  // --- the world index ---------------------------------------------------------
  const input = useMemo(() => indexInput(archive, services.scriptText), [archive, services.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const world: WorldIndex = useMemo(() => buildWorld(input.archive, input.texts), [input]);
  const setups = useMemo(() => mapSetups(world, mapKey), [world, mapKey]);
  const setup = setups.find((x) => x.script === setupPick) ?? setups[0] ?? null;
  const overlay = useMemo(() => mapOverlay(world, input.archive, mapKey, setup?.script ?? null), [world, input, mapKey, setup?.script]);
  const names = useMemo(() => (setup ? scriptNames(world, archive, setup.script, services.notes) : {}), [world, archive, setup?.script, services.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const modelOf = (k: string): ScriptModel | undefined => world.scripts.get(k)?.model;
  const textOf = (k: string) => input.texts[k] ?? services.scriptText(k);
  const mapName = (k: string) => world.maps.get(k)?.name || describeKey(archive, k);
  const tiles = useMemo(() => {
    const t = findEntry(archive, 7, 1, map.tileset);
    return t ? framesOf(t.data) : [];
  }, [archive, map.tileset]);

  // --- storing changes, undo -------------------------------------------------------
  const write = (snap: Snap) => {
    // (an edit keeps the tab: a preview tab would be replaced, undo history and all)
    services.pin();
    for (const [k, v] of Object.entries(snap)) {
      if (k === mapKey) {
        committed.current = v.data;
        setBytes(v.data);
        onChange(v.data);
      } else services.writeResource(k, v.data, v.source);
    }
  };

  /** Store a change (this map's bytes, other maps' bytes, script texts) as one step to undo. */
  const commit = (label: string, change: { map?: Uint8Array; others?: Record<string, Uint8Array>; texts?: Texts }): boolean => {
    try {
      const before: Snap = {};
      const after: Snap = {};
      if (change.map && change.map !== committed.current) {
        before[mapKey] = { data: committed.current };
        after[mapKey] = { data: change.map };
      }
      for (const [k, d] of Object.entries(change.others ?? {})) {
        const e = findEntryByKey(archive, k);
        if (e) before[k] = { data: e.data };
        after[k] = { data: d };
      }
      for (const [k, src] of Object.entries(change.texts ?? {})) {
        const old = textOf(k);
        if (src === old) continue;
        const data = assemble(src);
        const e = findEntryByKey(archive, k);
        if (e && old !== undefined) {
          let od = e.data;
          try {
            od = assemble(old);
          } catch {
            /* keep the stored bytes */
          }
          before[k] = { data: od, source: old };
        }
        after[k] = { data, source: src };
      }
      if (!Object.keys(after).length) return false;
      undo.current.push({ label, before, after });
      if (undo.current.length > HISTORY) undo.current.shift();
      redo.current = [];
      write(after);
      setError(null);
      setNotice(`${label}. Ctrl+Z undoes it.`);
      bump((n) => n + 1);
      return true;
    } catch (err) {
      setError(`Could not ${label.charAt(0).toLowerCase()}${label.slice(1)}: ${(err as Error).message}`);
      return false;
    }
  };

  const doUndo = () => {
    const u = undo.current.pop();
    if (!u) return;
    redo.current.push(u);
    write(u.before);
    setNotice(`Undone: ${u.label}.`);
    setError(null);
    bump((n) => n + 1);
  };
  const doRedo = () => {
    const u = redo.current.pop();
    if (!u) return;
    undo.current.push(u);
    write(u.after);
    setNotice(`Redone: ${u.label}.`);
    setError(null);
    bump((n) => n + 1);
  };
  useUndoKeys(stage, doUndo, doRedo);

  // --- what is where ----------------------------------------------------------------
  const placementOf = (x: Sel | null): Placement | undefined => {
    if (!x || x.kind !== "person") return undefined;
    const list = overlay.people.map((p) => p.placement).filter((p) => p.script === x.script && p.id === x.id);
    return list.find((p) => p.group === x.group) ?? list[0];
  };
  const cellEvent = (x: number, y: number) => map.cells[y * map.width + x]?.event ?? 0;
  const overlayCell = (n: number): OverlayCell | undefined => overlay.cells.find((c) => c.mapEvent === n);
  const startLeader = useMemo(() => {
    const st = overlay.start;
    if (!st?.actor) return null;
    const m = modelOf(st.actor.script);
    const step = m?.steps.find((x) => x.id === st.actor!.stepId);
    const member = step && step.kind === "instruction" ? (step.values[0] as number) : 1;
    return standingSprite(archive, resKey(3, 1, member));
  }, [overlay.start, world, archive]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- drawing ------------------------------------------------------------------
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = map.width * s;
    c.height = map.height * s;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mapCanvas(archive, bytes), 0, 0, c.width, c.height);
    if (showWalk) {
      ctx.fillStyle = "rgba(200,40,40,0.32)";
      map.cells.forEach((cell, i) => {
        if (!cell.walkable) ctx.fillRect((i % map.width) * s, Math.floor(i / map.width) * s, s, s);
      });
    }
    if (showWalk || PAINTING.has(tool) || tool === "start" || tool === "exit") {
      ctx.strokeStyle = "rgba(20,60,200,0.7)";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(4 * s + 0.5, 3 * s + 0.5, Math.max(0, map.width - 8) * s, Math.max(0, map.height - 5) * s);
      ctx.setLineDash([]);
    }
    if (PAINTING.has(tool) || zoom >= 3) {
      ctx.strokeStyle = `rgba(${DARK.join(",")},0.14)`;
      ctx.beginPath();
      for (let x = 0; x <= map.width; x++) (ctx.moveTo(x * s + 0.5, 0), ctx.lineTo(x * s + 0.5, c.height));
      for (let y = 0; y <= map.height; y++) (ctx.moveTo(0, y * s + 0.5), ctx.lineTo(c.width, y * s + 0.5));
      ctx.stroke();
    }
    const box = (p: { x: number; y: number }, color: string, dash = false) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dash) ctx.setLineDash([4, 3]);
      ctx.strokeRect(p.x * s + 1, p.y * s + 1, s - 2, s - 2);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    };
    if (sel?.kind === "cell") box(sel, "#e0a800");
    if (tool === "exit" && exitDraft.cell) box(exitDraft.cell, "#1f7a3a");
    if (drag?.moved) box(drag.to, "#1f7a3a", true);
    if (hover && tool !== "select") box(hover, "rgba(255,255,255,0.9)");
  }, [archive, bytes, map, s, zoom, showWalk, tool, sel, hover, drag, exitDraft.cell]);

  // --- pointer ------------------------------------------------------------------
  const cellFromEvent = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const c = canvas.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * map.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * map.height);
    return x < 0 || y < 0 || x >= map.width || y >= map.height ? null : { x, y };
  };

  const paintAt = (b: Uint8Array, x: number, y: number, click: boolean): Uint8Array => {
    const o = cellLo(b, map.width, x, y);
    let lo = b[o];
    let ev = b[o + 1];
    if (tool === "tile") lo = (lo & 0x80) | (tile & 0x7f);
    else if (tool === "walk") lo |= 0x80;
    else if (tool === "block") lo &= 0x7f;
    else if (tool === "event") ev = click && ev === eventNo ? 0 : eventNo;
    if (lo === b[o] && ev === b[o + 1]) return b;
    const out = b.slice();
    out[o] = lo;
    out[o + 1] = ev;
    return out;
  };

  const fillAt = (x: number, y: number): Uint8Array => {
    const from = map.cells[y * map.width + x].tile;
    if (from === tile) return bytes;
    const out = bytes.slice();
    const seen = new Uint8Array(map.width * map.height);
    const stack = [y * map.width + x];
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i] || (out[0x12 + i * 2] & 0x7f) !== from) continue;
      seen[i] = 1;
      out[0x12 + i * 2] = (out[0x12 + i * 2] & 0x80) | (tile & 0x7f);
      const cx = i % map.width;
      if (cx > 0) stack.push(i - 1);
      if (cx < map.width - 1) stack.push(i + 1);
      if (i >= map.width) stack.push(i - map.width);
      if (i + map.width < map.width * map.height) stack.push(i + map.width);
    }
    return out;
  };

  const onStageDown = (e: React.PointerEvent) => {
    const p = cellFromEvent(e);
    if (!p || e.button !== 0) return;
    setError(null);
    if (tool === "select") {
      setSel({ kind: "cell", ...p });
      setConfirmDelete(false);
      return;
    }
    if (tool === "pick") {
      setTile(map.cells[p.y * map.width + p.x].tile);
      setTool("tile");
      return;
    }
    if (tool === "fill") {
      commit("Fill with a tile", { map: fillAt(p.x, p.y) });
      return;
    }
    if (tool === "event") {
      commit(`Paint event ${eventNo}`, { map: paintAt(bytes, p.x, p.y, true) });
      return;
    }
    if (tool === "tile" || tool === "walk" || tool === "block") {
      stroke.current = bytes;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setBytes(paintAt(bytes, p.x, p.y, false));
      return;
    }
    if (tool === "here") {
      setTool("select");
      playHere(p.x, p.y);
      return;
    }
    if (tool === "person") placePerson(p.x, p.y);
    else if (tool === "chest") placeChest(p.x, p.y);
    else if (tool === "start") startHere(p.x, p.y);
    else if (tool === "exit") {
      if (cellEvent(p.x, p.y)) {
        setError(`That tile already has event ${cellEvent(p.x, p.y)}. Pick a tile without one (or clear it with the Event no. tool).`);
        return;
      }
      setExitDraft((d) => ({ ...d, cell: p }));
    }
  };

  const onStageMove = (e: React.PointerEvent) => {
    const p = cellFromEvent(e);
    if (p?.x !== hover?.x || p?.y !== hover?.y) setHover(p);
    if (stroke.current && p) setBytes((b) => paintAt(b, p.x, p.y, false));
    if (drag && p && (p.x !== drag.to.x || p.y !== drag.to.y)) setDrag({ ...drag, to: p, moved: true });
  };

  const onStageUp = () => {
    if (stroke.current) {
      const before = stroke.current;
      stroke.current = null;
      if (bytes !== before) {
        // the stroke was drawn live; record it from where it started
        committed.current = before;
        commit(tool === "tile" ? "Paint tiles" : tool === "walk" ? "Make tiles walkable" : "Block tiles", { map: bytes });
      }
    }
    if (drag) {
      const d = drag;
      setDrag(null);
      if (d.moved) moveTo(d.what, d.to.x, d.to.y);
    }
  };

  // --- edits ----------------------------------------------------------------------
  const who = (p: Placement) => p.name || `${p.kind} #${p.id}`;

  const moveTo = (what: Sel, x: number, y: number) => {
    if (what.kind === "person") {
      const p = placementOf(what);
      if (!p) return;
      if (p.x === x && p.y === y) return;
      const m = parseScript(textOf(p.script)!);
      commit(`Move ${who(p)} to ${at(x, y)}`, { texts: { [p.script]: toSource(movePlacement(m, p.stepId, x, y)) } });
      setSel(what);
    } else if (what.kind === "start") startHere(x, y);
  };

  const startHere = (x: number, y: number) => {
    const st = overlay.start;
    if (!st) {
      setError(world.start ? `The game starts on ${mapName(world.start.map)}: "Start here" moves the start within that map.` : "Script 1-1 shows no map, so there is no start to move.");
      return;
    }
    if (!inPlayerBand(x, y, map.width, map.height)) {
      setError("The player cannot stand that close to the edge: pick a tile inside the dashed box.");
      return;
    }
    if (!map.cells[y * map.width + x].walkable) {
      setError("That tile is blocked: the player would be stuck. Pick a walkable tile.");
      return;
    }
    if (st.x === x && st.y === y) return;
    const keys = [st.load.script, ...(st.actor ? [st.actor.script] : [])];
    const texts: Texts = Object.fromEntries(keys.map((k) => [k, textOf(k)!]));
    try {
      if (commit(`Start the game at ${at(x, y)}`, { texts: moveStart(texts, st, x, y, map.width, map.height) })) {
        setSel({ kind: "start" });
        setTool("select");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  /** "Playtest from here": a copy of the game that starts on this tile (the project is not changed). */
  const playHere = (x: number, y: number) => {
    if (!services.playtestAt) return;
    if (!inPlayerBand(x, y, map.width, map.height)) {
      setError("The player cannot stand that close to the edge: pick a tile inside the dashed box.");
      return;
    }
    if (!map.cells[y * map.width + x].walkable) {
      setError("That tile is blocked: pick a walkable tile to start on.");
      return;
    }
    try {
      const note = services.playtestAt(mapKey, x, y);
      if (note) setNotice(note);
    } catch (err) {
      setError(`Cannot play from there: ${(err as Error).message}`);
    }
  };

  const needSetup = (): string | null => {
    if (!setup) {
      setError("No script shows this map yet, so nothing can be placed on it. Add an exit to it from another map: a script is made for it then.");
      return null;
    }
    return setup.script;
  };

  const loadFor = (script: string) => setup?.loads.find((l) => l.script === script && l.start) ?? setup?.loads.find((l) => l.script === script) ?? null;

  const placePerson = (x: number, y: number) => {
    const script = needSetup();
    if (!script) return;
    if (!npc) {
      setError("Pick who to place first.");
      return;
    }
    const m = parseScript(textOf(script)!);
    const e = findEntry(archive, 3, 2, npc.index);
    const name = e ? entryLabel(e) : "person";
    try {
      const r = addPerson(m, { npc: npc.index, name, x, y, at: placementPosition(m, world, mapKey, loadFor(script)), text: say || "Hello!" });
      if (commit(`Add ${name} at ${at(x, y)}`, { texts: { [script]: toSource(r.model) } })) {
        setSel({ kind: "person", script, id: r.id, group: null });
        setTool("select");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const placeChest = (x: number, y: number) => {
    const script = needSetup();
    if (!script) return;
    if (!box) {
      setError("Pick the object (a chest) first.");
      return;
    }
    const m = parseScript(textOf(script)!);
    const e = findEntry(archive, 3, 4, box.index);
    const name = e ? entryLabel(e) : "chest";
    try {
      const flag = freeFlag(world, Object.keys(services.notes.flags));
      const r = addChest(m, { box: box.index, name, x, y, at: placementPosition(m, world, mapKey, loadFor(script)), item, flag });
      if (commit(`Add ${name} at ${at(x, y)}`, { texts: { [script]: toSource(r.model) } })) {
        if (item) services.setNotes((n) => (flagName(n, flag) ? n : setFlagNote(n, flag, { name: `${name} at ${at(x, y)} opened` })));
        setSel({ kind: "person", script, id: r.id, group: null });
        setTool("select");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  /** A new person or object resource with a sprite, when the game has none to pick. */
  const makeCharacter = (kind: 2 | 4, sprite: number, name: string) => {
    let i = 1;
    while (findEntry(archive, 3, kind, i) && i < 255) i++;
    const data = kind === 2 ? encodeNpc({ index: i, name: name.slice(0, 12) || `Person ${i}`, sprite, facing: 3, step: 1 }) : encodeSceneObj({ index: i, name: name.slice(0, 12) || "Chest", sprite, step: 0 });
    services.writeResource(resKey(3, kind, i), data);
    if (kind === 2) setNpc({ type: 2, index: i });
    else setBox({ type: 4, index: i });
    setNotice(`Made ${kind === 2 ? "person" : "object"} ${kind}-${i}. Now click a tile to place it.`);
  };

  const deleteSelected = (withEvent: boolean) => {
    const p = placementOf(sel);
    if (!p) return;
    const m = parseScript(textOf(p.script)!);
    const r = deletePlacement(m, p.stepId, withEvent);
    if (commit(`Delete ${who(p)}${withEvent ? " and what happens when you talk to them" : ""}`, { texts: { [p.script]: toSource(r.model) } })) {
      setSel(null);
      setConfirmDelete(false);
    }
  };

  const addHandlerHere = (n: number) => {
    const script = needSetup();
    if (!script) return;
    const m = parseScript(textOf(script)!);
    const label = `tile_${n}`;
    const out = addCellHandler(m, n, label, [`  message "${wrapMessage("Something is here.")}"`, "  callback"]);
    commit(`Make event ${n} do something`, { texts: { [script]: toSource(out) } });
  };

  const makeExit = () => {
    const script = needSetup();
    if (!script) return;
    const d = exitDraft;
    if (!d.cell || !d.target || !d.arrival) return;
    const tKey = resKey(2, 1, d.target.index);
    const tEntry = findEntry(archive, 2, 1, d.target.index);
    if (!tEntry) return;
    const tMap = decodeMap(tEntry.data);
    const same = tKey === mapKey;
    const used = new Set(world.variables.keys());
    try {
      let toScript: { key: string; exists: boolean } | null = null;
      if (!same) {
        const loader = world.maps.get(tKey)?.loadedBy.find((l) => l.start && loadsWhenStarting(modelOf(l.script)!, { type: 1, index: d.target!.index }));
        if (loader) toScript = { key: loader.script, exists: true };
        else {
          let i = 1;
          while (findEntry(archive, 1, 1, i) && i < 255) i++;
          toScript = { key: resKey(1, 1, i), exists: false };
        }
      }
      const loaders = [...new Set(world.maps.get(mapKey)?.loadedBy.map((l) => l.script) ?? [script])];
      const n = freeCellEvent(loaders.map((k) => modelOf(k)!).filter(Boolean), map.cells.map((c) => c.event));
      const texts: Texts = { [script]: textOf(script)! };
      if (toScript?.exists) texts[toScript.key] = textOf(toScript.key)!;
      const first = addExit(texts, { fromScript: script, mapEvent: n, toMap: { type: 1, index: d.target.index, name: tMap.name }, camera: arrivalCamera(d.arrival.x, d.arrival.y, world.playerScreen), toScript, usedVariables: used, fromName: map.name });
      let r = first;
      const others: Record<string, Uint8Array> = {};
      let newMap = withCellEvent(bytes, d.cell.x, d.cell.y, n);
      let back = "";
      if (d.back && toScript && d.backCell) {
        if (r.variable) used.add(r.variable.variable);
        const tLoaders = [...new Set([toScript.key, ...(world.maps.get(tKey)?.loadedBy.map((l) => l.script) ?? [])])];
        const n2 = freeCellEvent(tLoaders.map((k) => (k === toScript!.key ? parseScript(r.texts[k]) : modelOf(k)!)).filter(Boolean), tMap.cells.map((c) => c.event));
        const beside = besideExit(d.cell.x, d.cell.y, map.width, map.height, (x, y) => map.cells[y * map.width + x].walkable);
        r = addExit(r.texts, { fromScript: toScript.key, mapEvent: n2, toMap: { type: map.type, index: map.index, name: map.name }, camera: arrivalCamera(beside.x, beside.y, world.playerScreen), toScript: { key: script, exists: true }, usedVariables: used, fromName: tMap.name });
        others[tKey] = withCellEvent(tEntry.data, d.backCell.x, d.backCell.y, n2);
        back = " and the way back";
      }
      if (same) newMap = withCellEvent(bytes, d.cell.x, d.cell.y, n);
      const vars = [first.variable, r.variable].filter((v): v is { variable: number; value: number } => !!v);
      if (commit(`Add an exit to ${tMap.name || "another map"}${back}`, { map: newMap, others, texts: r.texts })) {
        // name the variables that tell arrivals apart, for the event views
        services.setNotes((nn) => vars.reduce((acc, v) => (variableName(acc, v.variable) ? acc : setVariableNote(acc, v.variable, { name: "where the party comes from" })), nn));
        setSel({ kind: "cell", ...d.cell });
        setTool("select");
        setExitDraft({ cell: null, target: null, arrival: null, back: true, backCell: null, picking: "arrival" });
        if (toScript && !toScript.exists) setNotice(`Added an exit to ${tMap.name}: a new script (${toScript.key.split("-").slice(1).join("-")}) sets ${tMap.name} up. Ctrl+Z undoes the exit (the new script stays).`);
      }
    } catch (err) {
      setError(`Could not add the exit: ${(err as Error).message}`);
    }
  };

  // --- keys -------------------------------------------------------------------------
  useToolKeys(stage, {
    ...Object.fromEntries([...PLACE_TOOLS, ...PAINT_TOOLS].map(([t, , k]) => [k.toLowerCase(), () => setTool(t)])),
    "[": () => setTile((t) => Math.max(0, t - 1)),
    "]": () => setTile((t) => Math.min(Math.max(0, tiles.length - 1), t + 1)),
    escape: () => {
      setSel(null);
      setTool("select");
      setConfirmDelete(false);
    },
    delete: () => sel?.kind === "person" && setConfirmDelete(true),
  });

  // --- the overlay ------------------------------------------------------------------
  const interactive = tool === "select";
  const thing = (key: string, x: number, y: number, body: React.ReactNode, o: { label: string; title?: string; className?: string; what?: Sel; onClick?: () => void; draggable?: boolean }) => {
    const dragging = drag && o.what && JSON.stringify(drag.what) === JSON.stringify(o.what) && drag.moved;
    const px = dragging ? drag!.to.x : x;
    const py = dragging ? drag!.to.y : y;
    const selected = o.what && sel && JSON.stringify(o.what) === JSON.stringify(sel);
    return (
      <button
        key={key}
        type="button"
        className={`w-thing ${o.className ?? ""}${selected ? " sel" : ""}${dragging ? " dragging" : ""}`}
        style={{ left: px * s, top: py * s, width: s, height: s }}
        aria-label={o.label}
        aria-pressed={!!selected}
        title={o.title ?? o.label}
        tabIndex={interactive ? 0 : -1}
        onPointerDown={(e) => {
          if (!interactive || e.button !== 0) return;
          e.stopPropagation();
          setError(null);
          setConfirmDelete(false);
          if (o.what) setSel(o.what);
          o.onClick?.();
          if (o.draggable && o.what) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({ what: o.what, to: { x, y }, moved: false });
          }
        }}
        onKeyDown={(e) => {
          if (!o.draggable || !o.what) return;
          const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
          if (!d) return;
          e.preventDefault();
          const nx = Math.max(0, Math.min(map.width - 1, x + d[0]));
          const ny = Math.max(0, Math.min(map.height - 1, y + d[1]));
          moveTo(o.what, nx, ny);
        }}
      >
        {body}
      </button>
    );
  };

  const spriteImg = (sp: { sprite: string; frame: number } | null, fallback: string) => {
    const f = sp ? spriteFrame(archive, sp.sprite, sp.frame) : null;
    if (!f) return <span className="w-dot">{fallback.slice(0, 1).toUpperCase()}</span>;
    return <img src={f.url} alt="" draggable={false} style={{ width: f.width * zoom, height: f.height * zoom }} />;
  };

  const side = (x: number) => (x > map.width / 2 ? "left" : "right");

  const people = overlay.people.map((op) => {
    const p = op.placement;
    const what: Sel = { kind: "person", script: p.script, id: p.id, group: p.group };
    const cond = p.conditional ? placementCondition(modelOf(p.script)!, p, names) : null;
    return thing(
      `p-${p.script}-${p.stepId}`,
      p.x,
      p.y,
      <>
        {spriteImg(op.sprite, who(p))}
        {showNames && (
          <span className="w-name">
            {who(p)}
            {cond ? " ?" : ""}
          </span>
        )}
      </>,
      {
        label: `${who(p)}, ${p.kind} #${p.id} at ${at(p.x, p.y)}${cond ? " (only sometimes)" : ""}`,
        title: `${who(p)} (#${p.id})${cond ? ` — only sometimes: ${cond}` : ""}. Drag to move.`,
        className: `w-person${cond ? " maybe" : ""}`,
        what,
        draggable: true,
      },
    );
  });

  const start = overlay.start;
  const startMark = start
    ? thing("start", start.x, start.y, <>{spriteImg(startLeader, "S")}<span className="w-flag">▶ Start</span></>, {
        label: `The player's start, at ${at(start.x, start.y)}`,
        title: "A new game starts here. Drag to move the start.",
        className: "w-start",
        what: { kind: "start" },
        draggable: true,
      })
    : null;

  const arrivals = overlay.arrivals
    .filter((a) => !(start && a.x === start.x && a.y === start.y))
    .map((a) =>
      thing(`a-${a.from}-${a.x}-${a.y}`, a.x, a.y, <span className={`w-chip arrive ${side(a.x)}`}>↘ from {mapName(a.from)}</span>, {
        label: `Arrival from ${mapName(a.from)} at ${at(a.x, a.y)}`,
        className: "w-arrival",
        what: { kind: "arrival", from: a.from, x: a.x, y: a.y },
      }),
    );

  const cellMarks = showEvents
    ? overlay.cells.flatMap((c) =>
        c.cells.map((p, i) =>
          thing(
            `c-${c.mapEvent}-${p.x}-${p.y}`,
            p.x,
            p.y,
            <>
              <span className={`w-num${c.label ? "" : " none"}`}>{c.mapEvent}</span>
              {i === 0 && <span className={`w-chip ${c.exit ? "exit" : c.label ? "" : "none"} ${side(p.x)}`}>{c.phrase}</span>}
            </>,
            {
              label: `Event ${c.mapEvent} at ${at(p.x, p.y)}: ${c.phrase}`,
              className: `w-cell${c.exit ? " exit" : ""}`,
              what: { kind: "cell", x: p.x, y: p.y },
            },
          ),
        ),
      )
    : [];

  // --- panels -------------------------------------------------------------------------
  const open = (script: string, line: number) => services.openResource(script, { line, mode: VISUAL });
  const scriptLink = (script: string, line: number, text?: string) => (
    <button className="link" onClick={() => services.openResource(script, { line })}>
      {text ?? `${scriptLabel(script)}, line ${line}`}
    </button>
  );
  const scriptLabel = (k: string) => {
    const m = modelOf(k);
    const [, t, i] = k.split("-");
    return `${m?.header.desc?.trim() || "script"} (${t}-${i})`;
  };

  const placementPanel = (p: Placement) => {
    const m = modelOf(p.script)!;
    const op = overlay.people.find((x) => x.placement === p);
    const label = op?.label ?? null;
    const res = findEntryByKey(archive, p.resource);
    const sp = op?.sprite;
    const cond = placementCondition(m, p, names);
    const first = firstLine(m, label);
    const summary = eventSummary(m, label, names, 4);
    const uses = placementUses(m, p.stepId);
    const kind = p.kind === "person" ? "Person" : "Object";
    return (
      <div className="w-panel-body">
        <div className="w-head">
          <span className="w-head-pic">{spriteImg(sp ?? null, who(p))}</span>
          <div>
            <h4>{who(p)}</h4>
            <p className="muted small">
              {kind} {res ? `${p.resource.split("-").slice(1).join("-")}` : "(missing)"}
              {sp ? `, sprite ${sp.sprite.split("-").slice(1).join("-")}` : ""} · id #{p.id} · at {at(p.x, p.y)}
            </p>
          </div>
        </div>
        <p className="small">Placed by {scriptLink(p.script, p.line, `script ${scriptLabel(p.script)}, line ${p.line}`)}.</p>
        {cond && <p className="w-note small">Only sometimes: {cond}.</p>}
        <h5>{p.kind === "person" ? "Talking to them" : "Facing it and pressing OK"}</h5>
        {label ? (
          <>
            {first && (
              <SayField
                key={`${p.script}:${first.stepId}:${first.text}`}
                label={first.kind === "say" ? "They say first" : "The first message it shows"}
                text={first.text}
                onSave={(t) => commit(`Change what ${who(p)} says`, { texts: { [p.script]: toSource(setLineText(parseScript(textOf(p.script)!), first.stepId, t)) } })}
              />
            )}
            <ol className="w-steps small">
              {summary.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              {summary.more > 0 && <li className="muted">and {summary.more} more steps</li>}
            </ol>
            <button onClick={() => open(p.script, labelLine(m, label))}>{p.kind === "person" ? "Edit what they say →" : "Edit what it does →"}</button>
          </>
        ) : (
          <p className="muted small">Nothing: script {scriptLabel(p.script)} has no event {p.id}.</p>
        )}
        <div className="w-actions">
          {!confirmDelete ? (
            <button className="ghost danger" onClick={() => setConfirmDelete(true)}>
              Delete…
            </button>
          ) : (
            <div className="w-confirm" role="group" aria-label="Delete">
              {uses.event && !uses.keepEvent ? (
                <>
                  <p className="small">
                    Also delete what happens when you talk to {who(p)} (@{uses.event.label}, lines {uses.event.lines[0]}-{uses.event.lines[1]})?
                  </p>
                  <div className="row">
                    <button className="danger-solid" onClick={() => deleteSelected(true)}>
                      Delete both
                    </button>
                    <button className="ghost" onClick={() => deleteSelected(false)}>
                      Only {p.kind === "person" ? "the person" : "the object"}
                    </button>
                    <button className="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="small">
                    Remove {who(p)} from line {p.line}
                    {uses.followUps.length ? ` (and ${uses.followUps.length} line${uses.followUps.length > 1 ? "s" : ""} that only move or open it)` : ""}?
                    {uses.keepEvent ? ` Their event stays: ${uses.keepEvent}.` : ""}
                  </p>
                  <div className="row">
                    <button className="danger-solid" onClick={() => deleteSelected(false)}>
                      Delete
                    </button>
                    <button className="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const exitTargets = (c: OverlayCell) =>
    c.exit!.targets.map((t, i) => (
      <li key={i}>
        Takes the party to{" "}
        <button className="link" onClick={() => services.openResource(t.map)}>
          {mapName(t.map)}
        </button>
        {t.x !== null ? ` at ${at(t.x, t.y!)}` : ""}
        {t.certain ? "" : " (only on some paths: a flag or a choice decides)"}
      </li>
    ));

  const cellPanel = (x: number, y: number) => {
    const cell = map.cells[y * map.width + x];
    const n = cell.event;
    const c = n ? overlayCell(n) : undefined;
    const m = setup ? modelOf(setup.script) : undefined;
    const here = overlay.people.filter((p) => p.placement.x === x && p.placement.y === y);
    return (
      <div className="w-panel-body">
        <h4>
          Tile {at(x, y)}
        </h4>
        <p className="muted small">
          Tile picture {cell.tile} · {cell.walkable ? "walkable" : "blocked"}
          {!inPlayerBand(x, y, map.width, map.height) ? " · outside where the player can stand" : ""}
        </p>
        {services.playtestAt && cell.walkable && inPlayerBand(x, y, map.width, map.height) && (
          <div className="row">
            <button className="ghost" onClick={() => playHere(x, y)} title="Play a copy of the game that starts on this tile (story flags and variables start clear)">
              ▶ Playtest from here
            </button>
          </div>
        )}
        {here.map((p) => (
          <p key={p.placement.stepId} className="small">
            <button className="link" onClick={() => setSel({ kind: "person", script: p.placement.script, id: p.placement.id, group: p.placement.group })}>
              {who(p.placement)}
            </button>{" "}
            stands here.
          </p>
        ))}
        {!n ? (
          <>
            <p className="small">Nothing happens when the player walks here.</p>
            <div className="row">
              <button
                className="ghost"
                onClick={() => {
                  setTool("exit");
                  setExitDraft((d) => ({ ...d, cell: { x, y } }));
                }}
              >
                Make an exit here
              </button>
            </div>
          </>
        ) : c?.label && m ? (
          <>
            <p className="small">
              Event {n} (script event {n + 40}): walking into this tile, or facing it and pressing OK, runs{" "}
              {scriptLink(setup!.script, labelLine(modelOf(setup!.script)!, c.label), `@${c.label}`)} in {scriptLabel(setup!.script)}.
            </p>
            {c.exit && <ul className="w-steps small">{exitTargets(c)}</ul>}
            <ol className="w-steps small">
              {eventSummary(m, c.label, names, 4).lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
            <div className="row">
              <button onClick={() => open(setup!.script, labelLine(m, c.label))}>Edit →</button>
              <button className="ghost" onClick={() => commit(`Clear the event of tile ${at(x, y)}`, { map: withCellEvent(bytes, x, y, 0) })}>
                Clear this tile
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="small w-note">
              Event {n} is painted here, but no event handles this tile{setup ? ` in ${scriptLabel(setup.script)}` : ""}: nothing happens.
            </p>
            <div className="row">
              <button onClick={() => addHandlerHere(n)} disabled={!setup}>
                Add one
              </button>
              <button className="ghost" onClick={() => commit(`Clear the event of tile ${at(x, y)}`, { map: withCellEvent(bytes, x, y, 0) })}>
                Clear this tile
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const startPanel = () => {
    const st = overlay.start!;
    return (
      <div className="w-panel-body">
        <div className="w-head">
          <span className="w-head-pic">{spriteImg(startLeader, "S")}</span>
          <div>
            <h4>The start</h4>
            <p className="muted small">A new game starts here, at {at(st.x, st.y)}.</p>
          </div>
        </div>
        <p className="small">
          {scriptLink(st.load.script, st.load.line, `${scriptLabel(st.load.script)}, line ${st.load.line}`)} shows this map with the view at {at(st.cameraX, st.cameraY)}
          {st.actor ? (
            <>
              ; {scriptLink(st.actor.script, st.actor.line, `line ${st.actor.line}`)} puts the leader on the screen at {at(st.screenX, st.screenY)}
            </>
          ) : null}
          .
        </p>
        <p className="muted small">Drag the marker, or use Start here (S) and click a tile, to start somewhere else on this map.</p>
      </div>
    );
  };

  const arrivalPanel = (a: { from: string; x: number; y: number }) => {
    const ar = overlay.arrivals.find((x) => x.from === a.from && x.x === a.x && x.y === a.y);
    if (!ar) return null;
    const m = modelOf(ar.exit.script);
    return (
      <div className="w-panel-body">
        <h4>Arriving from {mapName(ar.from)}</h4>
        <p className="small">
          The exit {ar.exit.label ? `@${ar.exit.label}` : `event ${ar.exit.event}`} of {mapName(ar.from)} brings the party to {at(ar.x, ar.y)}
          {ar.certain ? "." : " (on some paths)."}
        </p>
        <div className="row">
          <button className="ghost" onClick={() => services.openResource(ar.from)}>
            Open {mapName(ar.from)}
          </button>
          {m && <button onClick={() => open(ar.exit.script, labelLine(m, ar.exit.label))}>Edit that exit →</button>}
        </div>
      </div>
    );
  };

  const summaryPanel = () => {
    const unhandled = overlay.cells.filter((c) => !c.label);
    return (
      <div className="w-panel-body">
        <h4>On this map</h4>
        {!setup && (
          <div className="empty-state w-note small">
            <p>No script shows this map yet, so nobody can be placed here and the party cannot get here. Add an exit to it from another map: a script is made to set it up.</p>
            {world.start && world.start.map !== mapKey && (
              <button
                onClick={() => {
                  services.openResource(world.start!.map, { mode: "map.world" });
                  requestWorld(world.start!.map, { tool: "exit" });
                }}
              >
                Add an exit on {mapName(world.start.map)}…
              </button>
            )}
          </div>
        )}
        {overlay.people.length ? (
          <ul className="w-list">
            {overlay.people.map((op) => (
              <li key={`${op.placement.script}-${op.placement.stepId}`}>
                <button className="link" onClick={() => setSel({ kind: "person", script: op.placement.script, id: op.placement.id, group: op.placement.group })}>
                  {who(op.placement)}
                </button>{" "}
                <span className="muted small">
                  at {at(op.placement.x, op.placement.y)}
                  {op.placement.conditional ? " · sometimes" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          setup && (
            <div className="empty-state small">
              <p>Nobody is here yet. Put someone here who talks, a chest with something inside, or a way to another map.</p>
              <div className="row">
                <button onClick={() => setTool("person")}>Add a person</button>
                <button className="ghost" onClick={() => setTool("chest")}>
                  Add a chest
                </button>
                <button className="ghost" onClick={() => setTool("exit")}>
                  Add an exit
                </button>
                {services.wizard && (
                  <button className="ghost" onClick={() => services.wizard!("map", { map: mapKey })}>
                    New map joined here…
                  </button>
                )}
              </div>
            </div>
          )
        )}
        {overlay.exits.length > 0 && (
          <>
            <h5>Exits</h5>
            <ul className="w-list">
              {overlay.cells
                .filter((c) => c.exit)
                .map((c) => (
                  <li key={c.mapEvent}>
                    <button className="link" onClick={() => setSel({ kind: "cell", ...c.cells[0] })}>
                      {c.phrase}
                    </button>{" "}
                    <span className="muted small">{c.cells[0] ? `from ${at(c.cells[0].x, c.cells[0].y)}` : ""}</span>
                  </li>
                ))}
            </ul>
          </>
        )}
        {unhandled.length > 0 && (
          <p className="w-note small">
            {unhandled.length === 1 ? `Event ${unhandled[0].mapEvent} is` : `Events ${unhandled.map((c) => c.mapEvent).join(", ")} are`} painted on the map but nothing handles {unhandled.length === 1 ? "it" : "them"}.
          </p>
        )}
        <p className="muted small">Click anyone or any tile to see what it is. Drag people, objects and the start to move them (arrow keys move the selected one).</p>
      </div>
    );
  };

  const toolPanel = () => {
    switch (tool) {
      case "person":
        return (
          <div className="w-panel-body">
            <h4>Add a person</h4>
            {archive.entries.some((e) => e.resType === 3 && e.type === 2) ? (
              <label className="w-field">
                <span>Who</span>
                <ResourcePicker archive={archive} resType={3} types={[2]} value={npc} onChange={setNpc} label="Person" />
              </label>
            ) : (
              <NewCharacter archive={archive} kind={2} onMake={makeCharacter} />
            )}
            <label className="w-field">
              <span>They say</span>
              <input value={say} onChange={(e) => setSay(e.target.value)} maxLength={200} />
            </label>
            <p className="muted small">Then click a tile. {setup ? `They are placed by ${scriptLabel(setup.script)} with an event that says this line.` : ""}</p>
          </div>
        );
      case "chest":
        return (
          <div className="w-panel-body">
            <h4>Add a chest</h4>
            {archive.entries.some((e) => e.resType === 3 && e.type === 4) ? (
              <label className="w-field">
                <span>Object</span>
                <ResourcePicker archive={archive} resType={3} types={[4]} value={box} onChange={setBox} label="Object" />
              </label>
            ) : (
              <NewCharacter archive={archive} kind={4} onMake={makeCharacter} />
            )}
            <label className="w-field">
              <span>Inside</span>
              <ResourcePicker archive={archive} resType={6} value={item} onChange={setItem} allowNone noneLabel="Nothing (a sign: it shows a message)" label="Item inside" />
            </label>
            <p className="muted small">
              Then click a tile. Facing it and pressing OK opens it once: the game shows “Got: …” and a story flag remembers it was opened (it stays open). Without an item it shows a message.
            </p>
          </div>
        );
      case "start":
        return (
          <div className="w-panel-body">
            <h4>Start the game here</h4>
            {overlay.start ? (
              <p className="small">Click a tile inside the dashed box: a new game starts there. The start script's loadmap{overlay.start.actor ? " and createactor lines change" : " line changes"}.</p>
            ) : (
              <p className="w-note small">
                {world.start ? (
                  <>
                    The game starts on{" "}
                    <button className="link" onClick={() => services.openResource(world.start!.map)}>
                      {mapName(world.start.map)}
                    </button>
                    . Start here moves the start within that map.
                  </>
                ) : (
                  "Script 1-1 shows no map, so there is no start to move."
                )}
              </p>
            )}
          </div>
        );
      case "exit":
        return exitPanel();
      case "select":
        return null;
      default:
        return (
          <div className="w-panel-body">
            <h4>Paint</h4>
            {tool === "event" && (
              <label className="w-field">
                <span>Event number</span>
                <input type="number" min={1} max={255} value={eventNo} onChange={(e) => setEventNo(Math.max(1, Math.min(255, Number(e.target.value) || 1)))} />
                <span className="muted small">
                  {(() => {
                    const c = overlayCell(eventNo);
                    return c ? `event ${eventNo}: ${c.phrase}` : `event ${eventNo}: nothing handles it yet`;
                  })()}
                </span>
              </label>
            )}
            <div className="palette-head">
              <strong>Tiles</strong>
              <span className="muted small" title="[ and ] pick the previous / next tile">
                tile {tile}
              </span>
            </div>
            <div className="palette-grid w-palette">
              {tiles.map((f, i) => (
                <button key={i} className={`tilebtn ${i === tile ? "sel" : ""}`} onClick={() => (setTile(i), tool !== "tile" && tool !== "fill" && setTool("tile"))} title={`Tile ${i}`} aria-label={`Tile ${i}`} aria-pressed={i === tile}>
                  <FrameCanvas frame={f} scale={1} />
                </button>
              ))}
              {tiles.length === 0 && <p className="muted">Tileset {map.tileset} is missing.</p>}
            </div>
            <p className="muted small">The map's name, size and tileset are in the Tiles view.</p>
          </div>
        );
    }
  };

  const exitPanel = () => {
    const d = exitDraft;
    const tKey = d.target ? resKey(2, 1, d.target.index) : null;
    const tEntry = d.target ? findEntry(archive, 2, 1, d.target.index) : undefined;
    const tMap = tEntry ? decodeMap(tEntry.data) : null;
    const same = tKey === mapKey;
    const loader = tKey ? world.maps.get(tKey)?.loadedBy.find((l) => l.start) : undefined;
    const arrivalOk = !!(d.arrival && tMap && inPlayerBand(d.arrival.x, d.arrival.y, tMap.width, tMap.height) && tMap.cells[d.arrival.y * tMap.width + d.arrival.x].walkable);
    const backOk = !d.back || same || (d.backCell && tMap && !tMap.cells[d.backCell.y * tMap.width + d.backCell.x].event);
    const marks = [
      ...(d.arrival ? [{ ...d.arrival, kind: "pick" as const }] : []),
      ...(d.back && d.backCell ? [{ ...d.backCell, kind: "back" as const }] : []),
      ...(tKey ? (world.maps.get(tKey)?.people ?? []).map((p) => ({ x: p.x, y: p.y, kind: "person" as const })) : []),
    ];
    return (
      <div className="w-panel-body">
        <h4>Add an exit</h4>
        <ol className="w-howto small">
          <li className={d.cell ? "done" : "now"}>
            Click the tile on this map that leads away{d.cell ? `: ${at(d.cell.x, d.cell.y)}` : " (a door, or the end of a road just beyond where the player can walk)"}.
          </li>
          <li className={d.target ? "done" : d.cell ? "now" : ""}>
            <span>Where to: </span>
            <ResourcePicker archive={archive} resType={2} value={d.target} onChange={(v) => setExitDraft((x) => ({ ...x, target: v, arrival: null, backCell: null, picking: "arrival" }))} label="Map the exit leads to" />
          </li>
          {tMap && tKey && (
            <li className={arrivalOk && backOk ? "done" : "now"}>
              {!same && (
                <label className="check small">
                  <input type="checkbox" checked={d.back} onChange={(e) => setExitDraft((x) => ({ ...x, back: e.target.checked, picking: "arrival" }))} /> Also the way back (a tile on {tMap.name} that leads here)
                </label>
              )}
              {d.back && !same && (
                <div className="seg w-pickwhat" role="radiogroup" aria-label="What a click on the small map picks">
                  <button className={d.picking === "arrival" ? "" : "ghost"} role="radio" aria-checked={d.picking === "arrival"} onClick={() => setExitDraft((x) => ({ ...x, picking: "arrival" }))}>
                    Where they arrive
                  </button>
                  <button className={d.picking === "back" ? "" : "ghost"} role="radio" aria-checked={d.picking === "back"} onClick={() => setExitDraft((x) => ({ ...x, picking: "back" }))}>
                    The way back tile
                  </button>
                </div>
              )}
              <p className="small">
                {d.picking === "arrival" || !d.back || same ? "Click where the party arrives" : "Click the tile that leads back here"} on {tMap.name}:
              </p>
              <MiniMap
                archive={archive}
                mapKey={tKey}
                marks={marks}
                label={`${tMap.name}: click a tile`}
                onPick={(x, y) =>
                  setExitDraft((dd) => {
                    if (dd.picking === "back" && dd.back && !same) return { ...dd, backCell: { x, y } };
                    return { ...dd, arrival: { x, y }, picking: dd.back && !same && !dd.backCell ? "back" : dd.picking };
                  })
                }
              />
              <p className="small">
                {d.arrival ? (
                  arrivalOk ? (
                    <>They arrive at {at(d.arrival.x, d.arrival.y)}.</>
                  ) : (
                    <span className="error">The party cannot stand on {at(d.arrival.x, d.arrival.y)}: pick a walkable tile inside the dashed box.</span>
                  )
                ) : (
                  <span className="muted">No arrival tile yet.</span>
                )}{" "}
                {d.back && !same && (d.backCell ? (backOk ? <>The way back is at {at(d.backCell.x, d.backCell.y)}.</> : <span className="error">That tile already has an event.</span>) : <span className="muted">No way back tile yet.</span>)}
              </p>
              <p className="muted small">
                {same
                  ? "The same map: the exit only moves the party (and the view)."
                  : loader
                    ? `${scriptLabel(loader.script)} sets ${tMap.name} up: it learns where the party arrives.`
                    : `No script shows ${tMap.name} yet: a new script is made to set it up.`}
              </p>
            </li>
          )}
        </ol>
        <div className="row">
          <button onClick={makeExit} disabled={!d.cell || !d.target || !arrivalOk || !backOk || (d.back && !same && !d.backCell)}>
            Make the exit
          </button>
          <button className="ghost" onClick={() => setExitDraft({ cell: null, target: null, arrival: null, back: true, backCell: null, picking: "arrival" })}>
            Start over
          </button>
        </div>
      </div>
    );
  };

  const selectionPanel = () => {
    if (!sel) return summaryPanel();
    if (sel.kind === "person") {
      const p = placementOf(sel);
      return p ? placementPanel(p) : summaryPanel();
    }
    if (sel.kind === "start") return overlay.start ? startPanel() : summaryPanel();
    if (sel.kind === "arrival") return arrivalPanel(sel) ?? summaryPanel();
    return sel.x < map.width && sel.y < map.height ? cellPanel(sel.x, sel.y) : summaryPanel();
  };

  const status = () => {
    if (!hover) return <span className="muted">Point at a tile to see where it is.</span>;
    const cell = map.cells[hover.y * map.width + hover.x];
    const here = overlay.people.filter((p) => p.placement.x === hover.x && p.placement.y === hover.y).map((p) => who(p.placement));
    const c = cell.event ? overlayCell(cell.event) : undefined;
    return (
      <>
        <strong>{at(hover.x, hover.y)}</strong>
        <span>tile {cell.tile}</span>
        <span className={cell.walkable ? "" : "error"}>{cell.walkable ? "walkable" : "blocked"}</span>
        {!!cell.event && <span>event {cell.event}{c ? `: ${c.phrase}` : ""}</span>}
        {here.length > 0 && <span>{here.join(", ")}</span>}
      </>
    );
  };

  const toolBtn = ([t, label, k, title]: [Tool, string, string, string?]) => (
    <button key={t} data-tool={t} className={tool === t ? "" : "ghost"} aria-pressed={tool === t} onClick={() => (setTool(t), setError(null), setNotice(null))} title={`${title ?? label} (${k})`}>
      {label} <kbd>{k}</kbd>
    </button>
  );

  const stageClass = `w-stage${interactive ? "" : PAINTING.has(tool) ? " painting" : " placing"}`;

  return (
    <div className="w-view" data-map={mapKey}>
      <div className="w-tools" role="toolbar" aria-label="World tools">
        <div className="seg">{PLACE_TOOLS.map(toolBtn)}</div>
        <div className="seg w-paint">
          <span className="w-seg-label muted small">Paint</span>
          {PAINT_TOOLS.map(toolBtn)}
        </div>
        <div className="seg">
          <button className="ghost" onClick={doUndo} disabled={!undo.current.length} title={undo.current.length ? `Undo: ${undo.current[undo.current.length - 1].label} (Ctrl+Z)` : "Undo (Ctrl+Z)"}>
            Undo
          </button>
          <button className="ghost" onClick={doRedo} disabled={!redo.current.length} title={redo.current.length ? `Redo: ${redo.current[redo.current.length - 1].label} (Ctrl+Shift+Z)` : "Redo (Ctrl+Shift+Z)"}>
            Redo
          </button>
        </div>
      </div>
      <div className="w-tools w-show">
        {setups.length > 1 ? (
          <label className="field">
            As set up by
            <select value={setup?.script ?? ""} onChange={(e) => setSetupPick(e.target.value)}>
              {setups.map((x) => (
                <option key={x.script} value={x.script}>
                  {x.label}, {x.where}
                </option>
              ))}
            </select>
          </label>
        ) : setup ? (
          <span className="small muted">
            Set up by {scriptLink(setup.script, setup.loads[0]?.line ?? 1, setup.label)}, {setup.where}.
          </span>
        ) : (
          <span className="small w-note">No script shows this map yet.</span>
        )}
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Names
        </label>
        <label className="check small">
          <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} /> Events
        </label>
        <label className="check small">
          <input type="checkbox" checked={showWalk} onChange={(e) => setShowWalk(e.target.checked)} /> Walkable
        </label>
        <label className="field small">
          Zoom
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[1, 2, 3, 4].map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </label>
        <button className="ghost small" onClick={() => services.openResource("home")} title="Every map and how exits join them, on the project home">
          World map
        </button>
        {services.playtestAt && (
          <button
            className={tool === "here" ? "small" : "ghost small"}
            aria-pressed={tool === "here"}
            data-tool="here"
            onClick={() => {
              if (sel?.kind === "cell") playHere(sel.x, sel.y);
              else {
                setTool(tool === "here" ? "select" : "here");
                setNotice(tool === "here" ? null : "Click the tile to start the playtest on.");
                setError(null);
              }
            }}
            title="Playtest a copy of the game starting on a tile of this map: the selected tile, or the next one you click (right-click a tile does it too). Story flags and variables start clear."
          >
            ▶ Playtest from here
          </button>
        )}
      </div>
      <div className="w-body">
        <div className="w-left">
          <div className="w-scroll">
            <div
              ref={stage}
              className={stageClass}
              style={{ width: map.width * s, height: map.height * s }}
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerLeave={() => setHover(null)}
              onContextMenu={(e) => {
                const p = cellFromEvent(e);
                if (!p || !services.playtestAt) return;
                e.preventDefault();
                playHere(p.x, p.y);
              }}
            >
              <canvas ref={canvas} aria-label={`Map ${map.name}, ${map.width} by ${map.height} tiles`} role="img" />
              <div className="w-layer">
                {cellMarks}
                {arrivals}
                {people}
                {startMark}
              </div>
            </div>
          </div>
          <p className="map-status small w-status">{status()}</p>
        </div>
        <aside className="w-panel" aria-label="Details">
          {error && (
            <p className="error small w-msg" role="alert">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="w-msg ok small" role="status">
              {notice}
            </p>
          )}
          {toolPanel() ?? selectionPanel()}
        </aside>
      </div>
    </div>
  );
}

function findEntryByKey(a: LibArchive, key: string): LibEntry | undefined {
  const [rt, t, i] = key.split("-").map(Number);
  return findEntry(a, rt, t, i);
}

/** The first line someone says, editable in place (Enter or leaving the field saves). */
function SayField({ label, text, onSave }: { label: string; text: string; onSave: (t: string) => void }) {
  const [v, setV] = useState(text);
  const save = () => {
    if (v.trim() && v !== text) onSave(v);
  };
  return (
    <label className="w-field">
      <span>{label}</span>
      <textarea value={v} rows={2} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), save())} />
    </label>
  );
}

/** Make a person / object resource from a walk sprite, when the game has none. */
function NewCharacter({ archive, kind, onMake }: { archive: LibArchive; kind: 2 | 4; onMake: (kind: 2 | 4, sprite: number, name: string) => void }) {
  const [sprite, setSprite] = useState<ResValue | null>(null);
  const [name, setName] = useState(kind === 2 ? "Villager" : "Chest");
  const ok = textCells(name) <= 12;
  return (
    <div className="w-new">
      <p className="small">This game has no {kind === 2 ? "people" : "objects"} yet. Make one from a sprite:</p>
      <label className="w-field">
        <span>Sprite</span>
        <ResourcePicker archive={archive} resType={8} types={[kind]} value={sprite} onChange={setSprite} label={kind === 2 ? "Person walk sprite" : "Object sprite"} />
      </label>
      <label className="w-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!ok} />
      </label>
      <button disabled={!sprite || !ok} onClick={() => sprite && onMake(kind, sprite.index, name)}>
        Make {kind === 2 ? "this person" : "this object"}
      </button>
    </div>
  );
}

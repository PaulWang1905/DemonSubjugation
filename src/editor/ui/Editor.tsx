import { useCallback, useEffect, useRef, useState } from "react";
import { inspectDatLib } from "../../engine";
import { deleteProject, listProjects, putProject, type StoredProject } from "../../storage/db";
import { assemble } from "../format/gut";
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

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function download(bytes: Uint8Array, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [cur, setCur] = useState<Open | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [, setVersion] = useState(0);
  const saveTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setProjects(await listProjects()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    (o: Open, immediate = false) => {
      const run = async () => {
        try {
          const bytes = writeLib(o.archive);
          await putProject({ id: o.id, name: o.name, updatedAt: Date.now(), data: bytes.buffer as ArrayBuffer, sources: o.sources });
          setStatus(`Saved ${new Date().toLocaleTimeString()}`);
          void refresh();
        } catch (e) {
          setStatus(`Not saved: ${(e as Error).message}`);
        }
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) void run();
      else saveTimer.current = window.setTimeout(run, 600);
    },
    [refresh],
  );

  const openArchive = (name: string, archive: LibArchive, sources: Record<string, string> = {}, id = newId()) => {
    const o = { id, name, archive, sources };
    setCur(o);
    setSelected(findEntry(archive, 1, 1, 1) ? "1-1-1" : null);
    persist(o, true);
  };

  const create = (kind: "demo" | "bell" | "blank") => {
    if (kind === "demo") openArchive("Lantern Path", lanternPath(), lanternPathSources());
    else if (kind === "bell") openArchive("The Silent Bell", silentBell(), silentBellSources());
    else {
      const name = prompt("Name of the new game (letters, up to 9):", "MY GAME")?.trim();
      if (!name) return;
      openArchive(name, blankProject(name.toUpperCase().slice(0, 9)));
    }
  };

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!inspectDatLib(bytes).playable) throw new Error("this archive has no starting script (GUT 1-1)");
      openArchive(f.name.replace(/\.lib$/i, ""), readLib(bytes));
    } catch (e) {
      alert(`Could not open ${f.name}: ${(e as Error).message}`);
    }
  };

  const openStored = (p: StoredProject) => {
    try {
      const a = readLib(new Uint8Array(p.data));
      setCur({ id: p.id, name: p.name, archive: a, sources: p.sources ?? {} });
      setSelected(findEntry(a, 1, 1, 1) ? "1-1-1" : null);
      setStatus("");
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
        // The engine finds a party member's portrait (11-1-N) and battle
        // sprite (11-3-N) by the member's own number.
        for (const t of [1, 3]) {
          if (findEntry(a, 11, t, index)) continue;
          const like = findEntry(a, 11, t, 1);
          putEntry(a, { resType: 11, type: t, index, data: like ? withIndex(like.data, index) : blankGraphic(a, 11, t, index) });
        }
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
        data = encodeLevelChain(index, Array.from({ length: 10 }, (_, i) => ({ maxHP: 60 + i * 12, maxMP: 10 + i * 3, attack: 10 + i * 3, defend: 5 + i * 2, nextExp: 15 + i * i * 10, speed: 10 + i, lingli: 5 + i, luck: 10 + i, magics: 1 })));
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
    const next = { ...cur, sources };
    setCur(next);
    setSelected(null);
    persist(next);
    setVersion((v) => v + 1);
  };

  const playtest = () => {
    if (!cur) return;
    try {
      const bytes = writeLib(cur.archive);
      onPlaytest({ id: `playtest-${cur.id}`, name: `${cur.name} (playtest)`, data: bytes.buffer as ArrayBuffer });
    } catch (e) {
      alert(`Cannot build the game: ${(e as Error).message}`);
    }
  };

  if (!cur) {
    return (
      <div className="editor-home">
        <section>
          <h2>New project</h2>
          <div className="row">
            <button onClick={() => create("bell")}>The Silent Bell demo</button>
            <button onClick={() => create("demo")}>Lantern Path demo</button>
            <button className="ghost" onClick={() => create("blank")}>
              Blank game
            </button>
            <button className="ghost" onClick={() => fileInput.current?.click()}>
              Open a .lib file…
            </button>
            <input ref={fileInput} type="file" accept=".lib,.LIB" hidden onChange={(e) => void openFile(e.target.files?.[0])} />
          </div>
          <p className="muted">
            New projects start from an original template (system graphics, tiles, sprites, sample monsters, items and spells),
            so you never need anyone else's game files. Only open archives you have the right to modify.
          </p>
        </section>
        <section>
          <h2>Your projects</h2>
          {projects.length === 0 ? (
            <p className="muted">No projects yet.</p>
          ) : (
            <ul className="projects">
              {projects.map((p) => (
                <li key={p.id}>
                  <div className="meta">
                    <strong>{p.name}</strong>
                    <span>{new Date(p.updatedAt).toLocaleString()}</span>
                  </div>
                  <div className="row">
                    <button onClick={() => openStored(p)}>Open</button>
                    <button
                      className="ghost danger"
                      onClick={async () => {
                        if (confirm(`Delete project “${p.name}”?`)) {
                          await deleteProject(p.id);
                          void refresh();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const entry = selected ? cur.archive.entries.find((e) => keyOf(e) === selected) : undefined;

  return (
    <div className="editor">
      <div className="editor-bar">
        <button
          className="ghost"
          onClick={() => {
            persist(cur, true);
            setCur(null);
          }}
        >
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
        <span className="muted small">{status}</span>
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
          className="ghost"
          onClick={() => {
            try {
              download(writeLib(cur.archive), `${cur.name.replace(/[^\w一-鿿-]+/g, "_") || "game"}.lib`);
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          Export .lib
        </button>
        <button onClick={playtest} title="Run this project">
          ▶ Playtest
        </button>
      </div>
      <div className="editor-main">
        <ResourceList archive={cur.archive} selected={selected} onSelect={setSelected} />
        {entry ? (
          <ResourceView
            key={selected!}
            archive={cur.archive}
            entry={entry}
            source={selected ? cur.sources[selected] : undefined}
            onChange={change}
            actions={{ duplicate: () => duplicate(entry), renumber: (n) => renumber(entry, n), remove: () => remove(entry) }}
          />
        ) : (
          <section className="res-view">
            <p className="muted">Pick a resource on the left.</p>
          </section>
        )}
      </div>
    </div>
  );
}

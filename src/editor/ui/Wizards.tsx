// Wizards for the things authors make most: a map (joined to another by an
// exit), a person who talks, a shop, a monster and a battle. Each is a small
// dialog that asks only what matters, makes the change through the model
// (format/wizards.ts) and hands it to the editor, which stores it and opens
// the result. Opened from the project home's quick actions, the sidebar's
// "+" menus ("wizard:person"…) and the command palette (">new person").
import { useMemo, useRef, useEffect, useState } from "react";
import { decodeMap } from "../format/decode";
import { findEntry, type LibArchive } from "../format/lib";
import type { ProjectNotes } from "../format/notes";
import { cells as textCells } from "../format/text";
import { freeFlag, type Texts } from "../format/worldEdit";
import {
  addBattle,
  addShop,
  buyPrice,
  MAP_SIZES,
  MIN_MAP,
  MONSTER_TEMPLATES,
  newMap,
  newMonster,
  newPerson,
  projectWorld,
  randomBattles,
  setupScript,
  type Change,
  type Side,
  type WizardResult,
} from "../format/wizards";
import { DialoguePreview } from "./DialoguePreview";
import { FrameCanvas } from "./FrameStrip";
import { ResourcePicker, entryLabel, type ResValue } from "./ResourcePicker";
import { Thumb } from "./Thumb";
import { MiniMap } from "./WorldMap";
import { framesOf } from "./worldArt";
import type { WorldIntent } from "./intents";
import "./starter.css";

export type WizardKind = "map" | "person" | "shop" | "battle";

/** The wizards, for menus: `what` is "wizard:<kind>" (as the editor's create takes it). */
export const WIZARDS: { kind: WizardKind; what: string; label: string; group: "story" | "world" | "characters"; blurb: string }[] = [
  { kind: "map", what: "wizard:map", label: "Map…", group: "world", blurb: "a new place, joined to another by an exit" },
  { kind: "person", what: "wizard:person", label: "Person who talks…", group: "characters", blurb: "someone on a map with a line" },
  { kind: "shop", what: "wizard:shop", label: "Shop…", group: "story", blurb: "a person who sells items" },
  { kind: "battle", what: "wizard:battle", label: "Monster or battle…", group: "characters", blurb: "random battles on a map, or a fight with someone" },
];

/** Where a wizard starts (the map shown, the side to join). */
export interface WizardInit {
  map?: string;
  side?: Side;
  /** Tick "join it to" (New map). */
  join?: boolean;
}

interface Props {
  kind: WizardKind;
  init?: WizardInit;
  archive: LibArchive;
  /** Every script's text as the author sees it. */
  texts: Texts;
  notes: ProjectNotes;
  /** Store what the wizard made (and arm a World view tool, for a person placed by clicking). */
  onApply: (r: WizardResult, arm?: { map: string; intent: WorldIntent }) => void;
  onClose: () => void;
}

const SIDES: Side[] = ["east", "west", "north", "south"];

/** The map a new game starts on, else the first. */
function firstMap(archive: LibArchive, texts: Texts): string | undefined {
  try {
    const w = projectWorld({ archive, texts });
    if (w.start) return w.start.map;
  } catch {
    /* fall back */
  }
  const e = archive.entries.find((x) => x.resType === 2);
  return e ? `2-${e.type}-${e.index}` : undefined;
}

const toValue = (key: string | undefined): ResValue | null => {
  if (!key) return null;
  const [, type, index] = key.split("-").map(Number);
  return { type, index };
};

export function WizardDialog({ kind, init, archive, texts, notes, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const project = { archive, texts, namedFlags: Object.keys(notes.flags) };
  const run: Run = (make) => {
    try {
      const r = make();
      onApply(r, r.arm);
      onClose();
    } catch (e) {
      setError((e as Error).message.replace(/^./, (c) => c.toUpperCase()));
    }
  };
  const title = { map: "New map", person: "New person", shop: "New shop", battle: "New monster or battle" }[kind];
  const body =
    kind === "map" ? <MapWizard archive={archive} texts={texts} init={init} run={run} project={project} />
    : kind === "person" ? <PersonWizard archive={archive} texts={texts} init={init} run={run} project={project} />
    : kind === "shop" ? <ShopWizard archive={archive} texts={texts} run={run} project={project} />
    : <BattleWizard archive={archive} texts={texts} init={init} notes={notes} run={run} project={project} />;
  return (
    <dialog ref={dialog} className="export-dialog wz" onClose={onClose} onCancel={onClose} aria-labelledby="wz-title">
      <div className="wz-form">
        <h2 id="wz-title">{title}</h2>
        {body}
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}

type Run = (make: () => WizardResult & { arm?: { map: string; intent: WorldIntent } }) => void;
interface Part {
  archive: LibArchive;
  texts: Texts;
  init?: WizardInit;
  run: Run;
  project: { archive: LibArchive; texts: Texts };
}

function Buttons({ ok, label, disabled }: { ok: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="row wz-buttons">
      <button type="button" onClick={ok} disabled={disabled}>
        {label}
      </button>
      <button type="button" className="ghost" onClick={(e) => (e.currentTarget.closest("dialog") as HTMLDialogElement | null)?.close()}>
        Cancel
      </button>
    </div>
  );
}

/** A tileset's tiles to pick one from. */
function TilePick({ archive, tileset, value, onChange, label }: { archive: LibArchive; tileset: number; value: number; onChange: (t: number) => void; label: string }) {
  const tiles = useMemo(() => {
    const e = findEntry(archive, 7, 1, tileset);
    return e ? framesOf(e.data) : [];
  }, [archive, tileset]);
  if (!tiles.length) return <p className="muted small">Tileset {tileset} has no tiles.</p>;
  return (
    <div className="wz-tiles" role="radiogroup" aria-label={label}>
      {tiles.map((f, i) => (
        <button key={i} type="button" role="radio" aria-checked={i === value} className={`wz-tile${i === value ? " on" : ""}`} onClick={() => onChange(i)} title={`Tile ${i}`} aria-label={`Tile ${i}`}>
          <FrameCanvas frame={f} scale={1} />
        </button>
      ))}
    </div>
  );
}

// --- a map ---------------------------------------------------------------------------

function MapWizard({ archive, texts, init, run, project }: Part) {
  const [name, setName] = useState("");
  const [size, setSize] = useState<string>("room");
  const [w, setW] = useState(20);
  const [h, setH] = useState(14);
  const [tileset, setTileset] = useState<ResValue | null>(() => {
    const t = archive.entries.find((e) => e.resType === 7 && e.type === 1);
    return t ? { type: 1, index: t.index } : null;
  });
  const [fill, setFill] = useState(0);
  const [ring, setRing] = useState(true);
  const [border, setBorder] = useState(2);
  const maps = archive.entries.filter((e) => e.resType === 2);
  const [join, setJoin] = useState(init?.join ?? maps.length > 0);
  const [from, setFrom] = useState<ResValue | null>(toValue(init?.map ?? firstMap(archive, texts)));
  const [side, setSide] = useState<Side>(init?.side ?? "east");
  const preset = MAP_SIZES.find((s) => s.id === size);
  const width = preset ? preset.width : w;
  const height = preset ? preset.height : h;
  const nameOk = textCells(name.trim().toUpperCase()) <= 12;
  const fromName = from ? (() => {
    const e = findEntry(archive, 2, from.type, from.index);
    return e ? decodeMap(e.data).name : "";
  })() : "";
  return (
    <>
      <p className="muted small">A new place for the party. Paint it afterwards in its World view.</p>
      <label className="wz-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="FOREST" maxLength={12} aria-invalid={!nameOk} autoFocus />
        <span className="muted small">Shown when the party arrives; 12 letters at most.</span>
      </label>
      <fieldset className="wz-field">
        <legend>Size</legend>
        <div className="wz-sizes">
          {MAP_SIZES.map((s) => (
            <label key={s.id} className={`wz-choice${size === s.id ? " on" : ""}`}>
              <input type="radio" name="wz-size" checked={size === s.id} onChange={() => setSize(s.id)} />
              <span>
                {s.label} <span className="muted small">{s.width}×{s.height}</span>
              </span>
            </label>
          ))}
          <label className={`wz-choice${size === "custom" ? " on" : ""}`}>
            <input type="radio" name="wz-size" checked={size === "custom"} onChange={() => setSize("custom")} />
            <span>
              Other{" "}
              {size === "custom" && (
                <>
                  <input className="wz-num" type="number" min={MIN_MAP.width} max={127} value={w} onChange={(e) => setW(Number(e.target.value) || MIN_MAP.width)} aria-label="Width in tiles" /> ×{" "}
                  <input className="wz-num" type="number" min={MIN_MAP.height} max={127} value={h} onChange={(e) => setH(Number(e.target.value) || MIN_MAP.height)} aria-label="Height in tiles" />
                </>
              )}
            </span>
          </label>
        </div>
        <span className="muted small">The screen shows 9×6 tiles; a bigger map scrolls.</span>
      </fieldset>
      <div className="wz-two">
        <label className="wz-field">
          <span>Tileset</span>
          <ResourcePicker archive={archive} resType={7} value={tileset} onChange={setTileset} label="Tileset" />
        </label>
      </div>
      <div className="wz-field">
        <span>Ground (walkable)</span>
        {tileset && <TilePick archive={archive} tileset={tileset.index} value={fill} onChange={setFill} label="Ground tile" />}
      </div>
      <div className="wz-field">
        <label className="check small">
          <input type="checkbox" checked={ring} onChange={(e) => setRing(e.target.checked)} /> A blocked edge of
        </label>
        {ring && tileset && <TilePick archive={archive} tileset={tileset.index} value={border} onChange={setBorder} label="Edge tile" />}
      </div>
      {maps.length > 0 && (
        <fieldset className="wz-field wz-join">
          <legend>Join it to another map</legend>
          <label className="check">
            <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} /> Walking off one side of
            <ResourcePicker archive={archive} resType={2} value={from} onChange={setFrom} label="The map to join it to" disabled={!join} />
          </label>
          {join && (
            <label className="small">
              its{" "}
              <select value={side} onChange={(e) => setSide(e.target.value as Side)} aria-label="Which side">
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>{" "}
              side leads here, and this map's other side leads back to {fromName || "it"}.
            </label>
          )}
        </fieldset>
      )}
      <Buttons
        label={join && from ? "Make the map and the exits" : "Make the map"}
        disabled={!tileset || !nameOk}
        ok={() => run(() => newMap(project, { name: name || "NEW MAP", width, height, tileset: tileset!.index, fill, border: ring ? border : null, connect: join && from ? { from: `2-${from.type}-${from.index}`, side } : null }))}
      />
    </>
  );
}

// --- a person -----------------------------------------------------------------------------

function PersonWizard({ archive, texts, init, run, project }: Part) {
  const sprites = archive.entries.filter((e) => e.resType === 8 && e.type === 2);
  const people = archive.entries.filter((e) => e.resType === 3 && e.type === 2);
  const [mode, setMode] = useState<"new" | "old">("new");
  const [sprite, setSprite] = useState<number | null>(sprites[0]?.index ?? null);
  const [npc, setNpc] = useState<ResValue | null>(people[0] ? { type: 2, index: people[0].index } : null);
  const [name, setName] = useState("Villager");
  const [map, setMap] = useState<ResValue | null>(toValue(init?.map ?? firstMap(archive, texts)));
  const [tile, setTile] = useState<{ x: number; y: number } | null>(null);
  const [line, setLine] = useState("Hello! Lovely day, isn't it?");
  const [walks, setWalks] = useState(false);
  const mapKey = map ? `2-${map.type}-${map.index}` : null;
  const world = useMemo(() => {
    try {
      return projectWorld(project);
    } catch {
      return null;
    }
  }, [project.archive, project.texts]); // eslint-disable-line react-hooks/exhaustive-deps
  const setup = mapKey && world ? setupScript(world, mapKey) : null;
  const marks = useMemo(() => {
    const info = mapKey ? world?.maps.get(mapKey) : undefined;
    return [
      ...(tile ? [{ ...tile, kind: "pick" as const }] : []),
      ...(info?.people.map((p) => ({ x: p.x, y: p.y, kind: "person" as const })) ?? []),
      ...(world?.start && world.start.map === mapKey ? [{ x: world.start.x, y: world.start.y, kind: "start" as const }] : []),
    ];
  }, [tile, mapKey, world]);
  const shownName = mode === "old" && npc ? entryLabel(findEntry(archive, 3, 2, npc.index)!) : name;
  const nameOk = textCells(shownName) <= 12 && shownName.trim().length > 0;
  return (
    <>
      <p className="muted small">Someone on a map who says a line when the player talks to them.</p>
      {people.length > 0 && (
        <div className="seg" role="radiogroup" aria-label="Who">
          <button type="button" role="radio" aria-checked={mode === "new"} className={mode === "new" ? "" : "ghost"} onClick={() => setMode("new")}>
            Someone new
          </button>
          <button type="button" role="radio" aria-checked={mode === "old"} className={mode === "old" ? "" : "ghost"} onClick={() => setMode("old")}>
            Someone already in the game
          </button>
        </div>
      )}
      {mode === "new" ? (
        <>
          <fieldset className="wz-field">
            <legend>Looks like</legend>
            {sprites.length ? (
              <div className="wz-sprites" role="radiogroup" aria-label="Walk sprite">
                {sprites.map((s) => (
                  <button key={s.index} type="button" role="radio" aria-checked={sprite === s.index} className={`wz-sprite${sprite === s.index ? " on" : ""}`} onClick={() => setSprite(s.index)} title={`Walk sprite 2-${s.index}`}>
                    <Thumb archive={archive} entry={s} />
                    <span className="small muted">2-{s.index}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="wz-note small">This game has no person walk sprites yet: draw one first (Art, “+”, Person walk sprite).</p>
            )}
          </fieldset>
          <label className="wz-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!nameOk} maxLength={12} />
          </label>
        </>
      ) : (
        <label className="wz-field">
          <span>Who</span>
          <ResourcePicker archive={archive} resType={3} types={[2]} value={npc} onChange={setNpc} label="Person" />
        </label>
      )}
      <div className="wz-two">
        <label className="wz-field">
          <span>On the map</span>
          <ResourcePicker archive={archive} resType={2} value={map} onChange={(v) => (setMap(v), setTile(null))} label="Map" />
        </label>
        <label className="check small wz-walks">
          <input type="checkbox" checked={walks} onChange={(e) => setWalks(e.target.checked)} /> Walks around
        </label>
      </div>
      {mapKey && (
        <div className="wz-field">
          <span>Where they stand {tile ? <strong>{tile.x}, {tile.y}</strong> : <span className="muted small">(click a tile, or leave it and click one in the World view)</span>}</span>
          {setup ? <MiniMap archive={archive} mapKey={mapKey} marks={marks} label="Click where they stand" onPick={(x, y) => setTile({ x, y })} /> : <p className="wz-note small">No script shows this map yet: join it to another map with an exit first (New map does it).</p>}
        </div>
      )}
      <label className="wz-field">
        <span>They say</span>
        <textarea rows={2} value={line} onChange={(e) => setLine(e.target.value)} maxLength={200} />
      </label>
      <div className="wz-preview">
        <DialoguePreview archive={archive} name="say" values={[0, line.replace(/\s+/g, " ").trim()]} onWrap={null} />
      </div>
      <Buttons
        label={tile ? "Make them and put them there" : "Make them, then pick a tile"}
        disabled={!mapKey || !setup || !nameOk || (mode === "new" ? sprite === null : !npc)}
        ok={() =>
          run(() => {
            const who = mode === "new" ? { sprite: sprite! } : { npc: npc!.index };
            const r = newPerson(project, { who, name: shownName, map: mapKey!, tile, line, walks });
            return tile ? r : { ...r, arm: { map: mapKey!, intent: { tool: "person", npc: r.npc, say: line } } };
          })
        }
      />
    </>
  );
}

// --- a shop -------------------------------------------------------------------------------------

/** People the scripts place, for the shop and battle wizards. */
function usePeople(project: { archive: LibArchive; texts: Texts }) {
  return useMemo(() => {
    try {
      const w = projectWorld(project);
      return w.placements
        .filter((p) => p.kind === "person")
        .map((p) => ({ key: `${p.script}#${p.id}`, script: p.script, id: p.id, name: p.name || `Person #${p.id}`, map: p.map ? (w.maps.get(p.map)?.name ?? p.map) : "no map", map_key: p.map }))
        .filter((p, i, all) => all.findIndex((q) => q.key === p.key) === i);
    } catch {
      return [];
    }
  }, [project.archive, project.texts]); // eslint-disable-line react-hooks/exhaustive-deps
}

function PersonSelect({ people, value, onChange }: { people: ReturnType<typeof usePeople>; value: string; onChange: (v: string) => void }) {
  if (!people.length) return <p className="wz-note small">Nobody is placed on a map yet: make a person first (New person).</p>;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Person">
      {people.map((p) => (
        <option key={p.key} value={p.key}>
          {p.name} — on {p.map} (#{p.id}, script {p.script.split("-").slice(1).join("-")})
        </option>
      ))}
    </select>
  );
}

function ShopWizard({ archive, run, project }: Part) {
  const people = usePeople(project);
  const [who, setWho] = useState(people[0]?.key ?? "");
  const items = archive.entries.filter((e) => e.resType === 6).sort((a, b) => a.type - b.type || a.index - b.index);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(items.filter((e) => e.type !== 14 && (buyPrice(archive, e.type, e.index) ?? 0) > 0).slice(0, 4).map((e) => `${e.type}-${e.index}`)));
  const [greeting, setGreeting] = useState("Take a look at my wares!");
  const person = people.find((p) => p.key === who);
  return (
    <>
      <p className="muted small">Talking to the person opens a shop. The game shows each item's buy price from its card.</p>
      <label className="wz-field">
        <span>Who keeps the shop</span>
        <PersonSelect people={people} value={who} onChange={setWho} />
      </label>
      <fieldset className="wz-field">
        <legend>
          Sells <span className="muted small">({chosen.size} chosen)</span>
        </legend>
        <ul className="wz-items">
          {items.map((e) => {
            const k = `${e.type}-${e.index}`;
            const price = buyPrice(archive, e.type, e.index) ?? 0;
            return (
              <li key={k}>
                <label className={`wz-item${chosen.has(k) ? " on" : ""}`}>
                  <input type="checkbox" checked={chosen.has(k)} onChange={(ev) => setChosen((s) => (ev.target.checked ? new Set([...s, k]) : new Set([...s].filter((x) => x !== k))))} />
                  <Thumb archive={archive} entry={e} />
                  <span className="wz-item-name">{entryLabel(e)}</span>
                  <span className={`small ${price ? "muted" : "warn-text"}`}>{price ? `${price} gold` : "free"}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {!items.length && <p className="muted small">This game has no items yet.</p>}
      </fieldset>
      <label className="wz-field">
        <span>They say first</span>
        <input value={greeting} onChange={(e) => setGreeting(e.target.value)} maxLength={120} placeholder="(nothing)" />
      </label>
      <Buttons
        label="Open the shop"
        disabled={!person || !chosen.size}
        ok={() => run(() => addShop(project, { script: person!.script, id: person!.id, name: person!.name, greeting, items: [...chosen].map((k) => ({ type: Number(k.split("-")[0]), index: Number(k.split("-")[1]) })) }))}
      />
    </>
  );
}

// --- monsters and battles --------------------------------------------------------------------

function BattleWizard({ archive, texts, init, run, project, notes }: Part & { notes: ProjectNotes }) {
  const monsters = archive.entries.filter((e) => e.resType === 3 && e.type === 3);
  const people = usePeople(project);
  const [chosen, setChosen] = useState<number[]>(monsters.slice(0, 2).map((m) => m.index));
  const [making, setMaking] = useState(monsters.length === 0);
  const [mName, setMName] = useState("Slime");
  const [mSprite, setMSprite] = useState<ResValue | null>(() => {
    const s = archive.entries.find((e) => e.resType === 8 && e.type === 3);
    return s ? { type: 3, index: s.index } : null;
  });
  const [template, setTemplate] = useState<string>("weak");
  const [where, setWhere] = useState<"map" | "person" | "none">("map");
  const [map, setMap] = useState<ResValue | null>(toValue(init?.map ?? firstMap(archive, texts)));
  const [othersOff, setOthersOff] = useState(true);
  const [who, setWho] = useState(people[0]?.key ?? "");
  const [winLine, setWinLine] = useState("You're stronger than you look!");
  const [once, setOnce] = useState(true);
  const [loseEnds, setLoseEnds] = useState(true);
  const [bg, setBg] = useState<ResValue | null>(() => {
    const b = archive.entries.find((e) => e.resType === 11 && e.type === 4);
    return b ? { type: 4, index: b.index } : null;
  });
  const limit = where === "person" ? 3 : 8;
  const count = chosen.length + (making ? 1 : 0);
  const person = people.find((p) => p.key === who);
  const go = () =>
    run(() => {
      const extra: Change[] = [];
      let list = [...chosen];
      let made = "";
      if (making) {
        if (!mSprite) throw new Error("pick the new monster's battle sprite");
        const m = newMonster(project, { name: mName, sprite: mSprite.index, template });
        extra.push(m.change);
        list = [...list, m.index];
        made = `Made monster 3-${m.index} ${mName.trim() || "Monster"}. `;
      }
      if (where === "none") return { changes: extra, open: extra[0] ? { key: extra[0].key } : undefined, message: made || "Nothing to make." };
      const background = bg?.index ?? 0;
      const r =
        where === "map"
          ? randomBattles(project, { map: `2-${map!.type}-${map!.index}`, monsters: list, background, othersOff })
          : addBattle(project, {
              script: person!.script,
              id: person!.id,
              name: person!.name,
              monsters: list,
              background,
              winLine,
              loseEnds,
              onceFlag: once ? freeFlag(projectWorld(project), Object.keys(notes.flags)) : null,
            });
      const flag = where === "person" && once ? Number(/if (\d+), @fight_/.exec(r.changes[0].source ?? "")?.[1] ?? 0) : 0;
      return {
        ...r,
        changes: [...extra, ...r.changes],
        message: made + r.message,
        notes: flag ? (n) => ({ ...n, flags: { ...n.flags, [String(flag)]: n.flags[String(flag)] ?? { name: `beat ${person!.name}` } } }) : r.notes,
      };
    });
  return (
    <>
      <p className="muted small">Monsters to fight: met at random while walking on a map, or when talking to someone.</p>
      <fieldset className="wz-field">
        <legend>
          Monsters <span className="muted small">(up to {limit})</span>
        </legend>
        <ul className="wz-items wz-monsters">
          {monsters.map((m) => (
            <li key={m.index}>
              <label className={`wz-item${chosen.includes(m.index) ? " on" : ""}`}>
                <input type="checkbox" checked={chosen.includes(m.index)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, m.index] : c.filter((x) => x !== m.index)))} />
                <Thumb archive={archive} entry={m} />
                <span className="wz-item-name">{entryLabel(m)}</span>
                <span className="small muted">level {m.data[0x12]}, {m.data[0x18] | (m.data[0x19] << 8)} HP</span>
              </label>
            </li>
          ))}
        </ul>
        <label className="check small">
          <input type="checkbox" checked={making} onChange={(e) => setMaking(e.target.checked)} /> And a new monster
        </label>
        {making && (
          <div className="wz-new">
            <label className="wz-field">
              <span>Name</span>
              <input value={mName} onChange={(e) => setMName(e.target.value)} maxLength={12} />
            </label>
            <label className="wz-field">
              <span>How strong</span>
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                {MONSTER_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}: level {t.level}, {t.maxHP} HP, attack {t.attack}
                  </option>
                ))}
              </select>
            </label>
            <label className="wz-field">
              <span>Battle sprite</span>
              <ResourcePicker archive={archive} resType={8} types={[3]} value={mSprite} onChange={setMSprite} label="Monster battle sprite" />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset className="wz-field">
        <legend>Where</legend>
        <label className={`wz-choice${where === "map" ? " on" : ""}`}>
          <input type="radio" name="wz-where" checked={where === "map"} onChange={() => setWhere("map")} />
          <span>Random battles while walking on</span>
          {where === "map" && <ResourcePicker archive={archive} resType={2} value={map} onChange={setMap} label="Map" />}
        </label>
        {where === "map" && (
          <label className="check small wz-sub">
            <input type="checkbox" checked={othersOff} onChange={(e) => setOthersOff(e.target.checked)} /> No random battles on the other maps (they stay on when the party walks away otherwise)
          </label>
        )}
        <label className={`wz-choice${where === "person" ? " on" : ""}`}>
          <input type="radio" name="wz-where" checked={where === "person"} onChange={() => setWhere("person")} />
          <span>A battle when talking to</span>
          {where === "person" && <PersonSelect people={people} value={who} onChange={setWho} />}
        </label>
        {where === "person" && (
          <div className="wz-sub">
            <label className="wz-field">
              <span>After a win they say</span>
              <input value={winLine} onChange={(e) => setWinLine(e.target.value)} maxLength={120} />
            </label>
            <label className="check small">
              <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} /> Fight only once (a story flag remembers the win)
            </label>
            <label className="check small">
              <input type="checkbox" checked={loseEnds} onChange={(e) => setLoseEnds(e.target.checked)} /> Losing ends the game
            </label>
          </div>
        )}
        {making && (
          <label className={`wz-choice${where === "none" ? " on" : ""}`}>
            <input type="radio" name="wz-where" checked={where === "none"} onChange={() => setWhere("none")} />
            <span>Only make the monster</span>
          </label>
        )}
      </fieldset>
      {where !== "none" && (
        <label className="wz-field">
          <span>Battle background</span>
          <ResourcePicker archive={archive} resType={11} types={[4]} value={bg} onChange={setBg} allowNone label="Battle background" />
        </label>
      )}
      {count > limit && <p className="error small">Pick at most {limit} monsters for {where === "person" ? "a battle" : "random battles"}.</p>}
      <Buttons label={where === "none" ? "Make the monster" : "Make it"} disabled={count === 0 || count > limit || (where === "map" && !map) || (where === "person" && !person)} ok={go} />
    </>
  );
}

/** A short note of what a wizard made, for a few seconds. */
export function WizardToast({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 9000);
    return () => clearTimeout(t);
  }, [text, onClose]);
  return (
    <div className="wz-toast" role="status">
      <span>{text}</span>
      <button type="button" className="ghost small" onClick={onClose} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Keys, STAT_KEYS, STAT_MAX, type CheatSwitches, type Engine, type EngineKey, type StatKey } from "../engine";

/** ↑ ↑ ↓ ↓ ← → ← → B A, with B = Cancel and A = Confirm. */
export const SECRET: EngineKey[] = [Keys.UP, Keys.UP, Keys.DOWN, Keys.DOWN, Keys.LEFT, Keys.RIGHT, Keys.LEFT, Keys.RIGHT, Keys.CANCEL, Keys.ENTER];

const STAT_LABELS: Record<StatKey, string> = {
  level: "Level",
  currentExp: "Exp",
  maxHP: "Max HP",
  hp: "HP",
  maxMP: "Max MP",
  mp: "MP",
  attack: "Attack",
  defend: "Defence",
  speed: "Speed",
  lingli: "Spirit",
  luck: "Luck",
};

const SWITCHES: [keyof CheatSwitches, string, string][] = [
  ["noRandomBattles", "No random battles", "Walk anywhere without encounters."],
  ["walkThroughWalls", "Walk through walls", "Blocked tiles stop nobody; characters still do."],
  ["alwaysFull", "Always full HP / MP", "The party is refilled every tick, in and out of battle."],
];

type Tab = "party" | "items" | "story" | "tricks";

interface Props {
  engine: Engine;
  onClose: () => void;
}

/** The hidden test menu. The game is paused while it is open. */
export function DebugMenu({ engine, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("party");
  const [, setVersion] = useState(0);
  const c = engine.cheats;
  const changed = () => {
    engine.redraw();
    setVersion((v) => v + 1);
  };

  return (
    <aside className="debug" role="dialog" aria-label="Debug menu">
      <header>
        <strong>Debug menu</strong>
        <span className="muted small">game paused</span>
        <div className="spacer" />
        <button className="ghost" onClick={onClose} aria-label="Close debug menu">
          ✕
        </button>
      </header>
      <nav className="seg">
        {(
          [
            ["party", "Party"],
            ["items", "Items"],
            ["story", "Story"],
            ["tricks", "Tricks"],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} className={tab === t ? "" : "ghost"} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </nav>
      <div className="debug-body">
        {tab === "party" && <PartyTab engine={engine} changed={changed} />}
        {tab === "items" && <ItemsTab engine={engine} changed={changed} />}
        {tab === "story" && <StoryTab engine={engine} changed={changed} />}
        {tab === "tricks" && (
          <div className="debug-list">
            {SWITCHES.map(([k, label, help]) => (
              <label key={k} className="check debug-switch">
                <input
                  type="checkbox"
                  checked={c.switches()[k]}
                  onChange={(e) => {
                    c.setSwitch(k, e.target.checked);
                    changed();
                  }}
                />
                <span>
                  {label}
                  <span className="muted small">{help}</span>
                </span>
              </label>
            ))}
            <div className="row">
              <button
                onClick={() => {
                  c.heal();
                  changed();
                }}
              >
                Heal party
              </button>
              <button
                disabled={!c.inCombat()}
                title={c.inCombat() ? undefined : "Only during a battle"}
                onClick={() => {
                  c.winCombat();
                  changed();
                }}
              >
                Win this battle
              </button>
            </div>
            <p className="muted small">Switches last until you leave this game.</p>
          </div>
        )}
      </div>
      <footer className="muted small">Close with ✕ or Esc. Changes are saved when the game saves.</footer>
    </aside>
  );
}

function Num({ value, max, min = 0, onSet, label }: { value: number; max: number; min?: number; onSet: (v: number) => void; label: string }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value !== "") onSet(Number(e.target.value));
      }}
    />
  );
}

function PartyTab({ engine, changed }: { engine: Engine; changed: () => void }) {
  const c = engine.cheats;
  const party = c.party();
  if (party.length === 0) return <p className="muted">No party yet. Start or load a game first.</p>;
  return (
    <div className="debug-list">
      {party.map((p) => (
        <section key={p.slot} className="debug-card">
          <div className="row">
            <strong>{p.name || `Member ${p.slot + 1}`}</strong>
            <div className="spacer" />
            <button
              className="ghost"
              onClick={() => {
                for (const k of ["maxHP", "maxMP"] as const) c.setStat(p.slot, k, STAT_MAX[k]);
                for (const k of ["hp", "mp", "attack", "defend", "speed", "lingli", "luck"] as const) c.setStat(p.slot, k, STAT_MAX[k]);
                changed();
              }}
            >
              Max all
            </button>
          </div>
          <div className="debug-stats">
            {STAT_KEYS.map((k) => (
              <label key={k}>
                <span>{STAT_LABELS[k]}</span>
                <Num
                  label={`${p.name} ${STAT_LABELS[k]}`}
                  value={p[k]}
                  min={k === "level" ? 1 : 0}
                  max={k === "hp" ? p.maxHP : k === "mp" ? p.maxMP : STAT_MAX[k]}
                  onSet={(v) => {
                    c.setStat(p.slot, k, v);
                    changed();
                  }}
                />
              </label>
            ))}
          </div>
          <div className="row">
            <span className="muted small">
              Spells known: {p.magicsKnown} / {p.magicsTotal}
            </span>
            <button
              className="ghost"
              disabled={p.magicsKnown >= p.magicsTotal}
              onClick={() => {
                c.learnAllMagic(p.slot);
                changed();
              }}
            >
              Learn all spells
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemsTab({ engine, changed }: { engine: Engine; changed: () => void }) {
  const c = engine.cheats;
  const catalogue = useMemo(() => c.catalogue(), [c]);
  const [pick, setPick] = useState("");
  const [count, setCount] = useState(1);
  const [filter, setFilter] = useState("");
  const inv = c.inventory();
  const shown = catalogue.filter((i) => !filter || i.name.includes(filter) || `${i.type}-${i.index}` === filter);
  return (
    <div className="debug-list">
      <label className="field">
        Money
        <Num
          label="Money"
          value={c.money()}
          max={999999}
          onSet={(v) => {
            c.setMoney(v);
            changed();
          }}
        />
      </label>
      <section className="debug-card">
        <strong>Inventory</strong>
        {inv.length === 0 && <p className="muted small">Empty.</p>}
        <ul className="debug-items">
          {inv.map((i) => (
            <li key={`${i.type}-${i.index}`}>
              <span>
                {i.name} <span className="muted small">{i.type}-{i.index}</span>
              </span>
              <Num
                label={`${i.name} count`}
                value={i.count}
                max={99}
                onSet={(v) => {
                  c.setItemCount(i.type, i.index, v);
                  changed();
                }}
              />
            </li>
          ))}
        </ul>
      </section>
      <section className="debug-card">
        <strong>Add an item</strong>
        <input className="debug-filter" placeholder="Filter by name…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="row">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Item">
            <option value="">Choose ({shown.length})…</option>
            {shown.map((i) => (
              <option key={`${i.type}-${i.index}`} value={`${i.type}-${i.index}`}>
                {i.name} ({i.type}-{i.index})
              </option>
            ))}
          </select>
          <Num label="How many" value={count} min={1} max={99} onSet={(v) => setCount(Math.max(1, Math.min(99, v)))} />
          <button
            disabled={!pick}
            onClick={() => {
              const [t, n] = pick.split("-").map(Number);
              c.setItemCount(t, n, Math.min(99, c.inventory().find((i) => i.type === t && i.index === n)?.count ?? 0) + count);
              changed();
            }}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}

function StoryTab({ engine, changed }: { engine: Engine; changed: () => void }) {
  const c = engine.cheats;
  const [n, setN] = useState(1);
  const flags = c.flags();
  const loc = c.location();
  return (
    <div className="debug-list">
      <section className="debug-card">
        <strong>Where you are</strong>
        <p className="small">
          {loc ? (
            <>
              Map {loc.type}-{loc.index} <em>{loc.map}</em>, tile {loc.x}, {loc.y}
            </>
          ) : (
            "Not on a map."
          )}
        </p>
      </section>
      <section className="debug-card">
        <strong>Story flags</strong>
        <p className="muted small">Scripts use flags (1-2400) to remember what has happened. Turning one on or off can skip or replay a scene.</p>
        <div className="row">
          <Num label="Flag number" value={n} min={1} max={2400} onSet={(v) => setN(Math.max(1, Math.min(2400, v)))} />
          <button
            onClick={() => {
              c.setFlag(n, !flags.includes(n));
              changed();
            }}
          >
            {flags.includes(n) ? `Turn ${n} off` : `Turn ${n} on`}
          </button>
        </div>
        <div className="debug-flags">
          {flags.length === 0 && <span className="muted small">No flags set.</span>}
          {flags.map((f) => (
            <button
              key={f}
              className="ghost chipbtn"
              title={`Turn flag ${f} off`}
              onClick={() => {
                c.setFlag(f, false);
                changed();
              }}
            >
              {f} ✕
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

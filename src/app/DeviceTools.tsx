// The debug menu's Device tab: the emulator's own tools, for any program on
// the 4988 (on Fulu or the firmware): save states, finding and changing
// numbers in RAM, a look at memory, and on Fulu the program's latest OS
// calls. (The game is paused while the menu is open.)

import { useState } from "react";
import type { Device } from "../bbk/device";
import type { MachineState } from "../bbk/machine";
import { MemorySearch, type Test } from "../bbk/memorySearch";
import { FuluDevice } from "../fulu/device";
import { NAMES } from "../fulu/os";

/** A saved moment of the device: its machine and its flash. */
export interface Snapshot {
  state: MachineState;
  flash: Uint8Array;
  at: Date;
}

interface Props {
  device: Device | FuluDevice;
  /** The save-state slots (kept by the player while the game is open). */
  slots: (Snapshot | null)[];
  /** Run the device one frame. */
  step: () => void;
}

const hex = (n: number, digits = 4) => n.toString(16).toUpperCase().padStart(digits, "0");
const TESTS: [Test, string][] = [
  ["changed", "Changed"],
  ["unchanged", "Same"],
  ["up", "Went up"],
  ["down", "Went down"],
];

export function DeviceTools({ device, slots, step }: Props) {
  const m = device.machine;
  const [, setVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);
  const [size, setSize] = useState<1 | 2 | 4>(2);
  const [search, setSearch] = useState<MemorySearch | null>(null);
  const [wanted, setWanted] = useState(0);
  const [at, setAt] = useState(0x1900);

  const save = (i: number) => {
    slots[i] = { state: m.saveState(), flash: m.flash.data.slice(), at: new Date() };
    changed();
  };
  const load = (s: Snapshot) => {
    m.flash.data.set(s.flash);
    m.loadState(s.state);
    if (device instanceof FuluDevice) {
      device.fulu.textMarks.clear();
      device.resumed();
    }
    changed();
  };
  const narrow = (test: Test) => {
    const s = search ?? new MemorySearch(m.ram, size);
    s.narrow(test);
    setSearch(s);
    changed();
  };

  return (
    <div className="debug-list">
      <section className="debug-card">
        <strong>Save states</strong>
        <p className="muted small">The whole device at a moment, to go back to. Kept until you leave this game.</p>
        {slots.map((s, i) => (
          <div key={i} className="row">
            <span className="small">
              Slot {i + 1}: {s ? s.at.toLocaleTimeString() : <span className="muted">empty</span>}
            </span>
            <div className="spacer" />
            <button className="ghost" onClick={() => save(i)}>
              Save
            </button>
            <button className="ghost" disabled={!s} onClick={() => s && load(s)}>
              Load
            </button>
          </div>
        ))}
      </section>

      <section className="debug-card">
        <strong>Find a number</strong>
        <p className="muted small">
          Look for a number the game shows (money, HP), then change it in the game (spend, take a hit) and narrow, until one address is left.
        </p>
        <div className="row">
          <select value={size} disabled={!!search} onChange={(e) => setSize(Number(e.target.value) as 1 | 2 | 4)} aria-label="Size">
            <option value={1}>1 byte</option>
            <option value={2}>2 bytes</option>
            <option value={4}>4 bytes</option>
          </select>
          <input type="number" min={0} value={wanted} aria-label="Number" onChange={(e) => setWanted(Number(e.target.value))} />
          <button onClick={() => narrow({ equals: wanted })}>{search ? "Is now" : "Find"}</button>
        </div>
        <div className="row">
          {TESTS.map(([t, label]) => (
            <button key={label} className="ghost" disabled={!search} onClick={() => narrow(t)}>
              {label}
            </button>
          ))}
          <button className="ghost" disabled={!search} onClick={() => setSearch(null)}>
            Start over
          </button>
        </div>
        {search && (
          <>
            <span className="muted small">{search.count} address{search.count === 1 ? "" : "es"}</span>
            <ul className="debug-items">
              {search.results(20).map(({ addr, value }) => (
                <li key={addr}>
                  <span className="debug-hex">RAM ${hex(addr)}</span>
                  <input
                    type="number"
                    min={0}
                    value={value}
                    aria-label={`Value at ${hex(addr)}`}
                    onChange={(e) => {
                      search.set(addr, Number(e.target.value));
                      changed();
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="debug-card">
        <div className="row">
          <strong>Memory</strong>
          <div className="spacer" />
          <span className="small">RAM $</span>
          <input
            className="debug-filter debug-hex"
            size={5}
            value={hex(at)}
            aria-label="Address"
            onChange={(e) => {
              const v = parseInt(e.target.value, 16);
              if (Number.isFinite(v)) setAt(Math.max(0, Math.min(m.ram.length - 128, v & ~15)));
            }}
          />
        </div>
        <pre className="debug-hex">
          {Array.from({ length: 8 }, (_, r) => {
            const a = at + 16 * r;
            return `${hex(a)}  ${Array.from(m.ram.subarray(a, a + 16), (b) => hex(b, 2)).join(" ")}`;
          }).join("\n")}
        </pre>
      </section>

      <section className="debug-card">
        <div className="row">
          <strong>Program</strong>
          <div className="spacer" />
          <button
            className="ghost"
            onClick={() => {
              step();
              changed();
            }}
          >
            Run one frame
          </button>
        </div>
        <span className="debug-hex small">
          PC ${hex(m.cpu.pc)} A ${hex(m.cpu.a, 2)} X ${hex(m.cpu.x, 2)} Y ${hex(m.cpu.y, 2)} · banks {m.banks().map((b) => hex(b, 3)).join(" ")}
        </span>
        {device instanceof FuluDevice && (
          <>
            <span className="muted small">Latest OS calls, newest first:</span>
            <span className="debug-hex small">
              {[...device.fulu.recentCalls]
                .reverse()
                .map((e) => NAMES[e] ?? `$${hex(e)}`)
                .join(" · ") || "none yet"}
            </span>
          </>
        )}
      </section>
    </div>
  );
}

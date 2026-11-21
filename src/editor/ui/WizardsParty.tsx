// Two wizards about the party (format/wizards.ts addCompanion, addInn):
// - a companion who joins: a party member (new, with art and a level table of
//   their own to draw over, or one already in the game) and the person on a
//   map who joins as them when talked to (removed from the map, a story flag
//   remembers it);
// - an inn: a person who lets the party rest for gold, restoring HP and MP of
//   every member who is in the party then.
import { useMemo, useState } from "react";
import { findEntry } from "../format/lib";
import { innParty, memberRecord, partyMembers, startMembers, joins, companionOf } from "../format/party";
import { cells as textCells, wrapMessage } from "../format/text";
import { addCompanion, addInn, freeIndex, PARTY_MAX, projectWorld, setupScript, type NewMember } from "../format/wizards";
import { sayText } from "../format/worldEdit";
import { DialoguePreview } from "./DialoguePreview";
import { ResourcePicker, entryLabel, type ResValue } from "./ResourcePicker";
import { Thumb } from "./Thumb";
import { MiniMap } from "./WorldMap";
import { Buttons, firstMap, PersonSelect, toValue, usePeople, type Part } from "./wizardParts";
import "./round2.css";

const u16 = (d: Uint8Array, at: number) => (d[at] ?? 0) | ((d[at + 1] ?? 0) << 8);

/** A member's starting numbers, as the wizard's stat fields hold them. */
function statsOf(d: Uint8Array | undefined) {
  if (!d) return { level: 1, maxHP: 60, maxMP: 10, attack: 10, defend: 5, speed: 10 };
  return { level: d[0x20] || 1, maxHP: u16(d, 0x26), maxMP: u16(d, 0x2a), attack: u16(d, 0x2e), defend: u16(d, 0x30), speed: d[0x36] ?? 0 };
}
const STAT_FIELDS = [
  { key: "level", label: "Level", min: 1, max: 99 },
  { key: "maxHP", label: "HP", min: 1, max: 999 },
  { key: "maxMP", label: "MP", min: 0, max: 999 },
  { key: "attack", label: "Attack", min: 0, max: 999 },
  { key: "defend", label: "Defence", min: 0, max: 999 },
  { key: "speed", label: "Speed", min: 0, max: 99 },
] as const;
type Stats = ReturnType<typeof statsOf>;

/** Where someone stands on a map: a small map to click, with who is there already. */
function TilePicker({ archive, project, mapKey, tile, onPick }: { archive: Part["archive"]; project: Part["project"]; mapKey: string; tile: { x: number; y: number } | null; onPick: (t: { x: number; y: number }) => void }) {
  const world = useMemo(() => {
    try {
      return projectWorld(project);
    } catch {
      return null;
    }
  }, [project.archive, project.texts]); // eslint-disable-line react-hooks/exhaustive-deps
  const setup = world ? setupScript(world, mapKey) : null;
  const marks = useMemo(() => {
    const info = world?.maps.get(mapKey);
    return [
      ...(tile ? [{ ...tile, kind: "pick" as const }] : []),
      ...(info?.people.map((p) => ({ x: p.x, y: p.y, kind: "person" as const })) ?? []),
      ...(world?.start && world.start.map === mapKey ? [{ x: world.start.x, y: world.start.y, kind: "start" as const }] : []),
    ];
  }, [tile, mapKey, world]);
  if (!setup) return <p className="wz-note small">No script shows this map yet: join it to another map with an exit first (New map does it).</p>;
  return <MiniMap archive={archive} mapKey={mapKey} marks={marks} label="Click where they wait" onPick={(x, y) => onPick({ x, y })} />;
}

// --- a companion who joins --------------------------------------------------------------

export function CompanionWizard({ archive, texts, init, run, project }: Part) {
  const members = partyMembers(archive);
  const start = startMembers(texts["1-1-1"]);
  const world = useMemo(() => {
    try {
      return projectWorld(project);
    } catch {
      return null;
    }
  }, [project.archive, project.texts]); // eslint-disable-line react-hooks/exhaustive-deps
  // members who could join from a map: not in the party from the start, not joining from a map already
  const joinable = members.filter((m) => !start.includes(m.index) && !(world && companionOf(world, m.index)));
  const walks = archive.entries.filter((e) => e.resType === 8 && e.type === 1);
  const spells = archive.entries.filter((e) => e.resType === 4).sort((a, b) => a.type - b.type || a.index - b.index);
  const [mode, setMode] = useState<"new" | "old">("new");
  const [old, setOld] = useState<number | null>(joinable[0]?.index ?? null);
  const [name, setName] = useState("Kai");
  const like0 = start[0] ?? members[0]?.index ?? 1;
  const [like, setLike] = useState(like0);
  const [walk, setWalk] = useState<number | null>(memberRecord(archive, like0)?.walk ?? walks[0]?.index ?? null);
  const [ownWalk, setOwnWalk] = useState(true);
  const [stats, setStats] = useState<Stats>(() => statsOf(findEntry(archive, 3, 1, like0)?.data));
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [map, setMap] = useState<ResValue | null>(toValue(init?.map ?? firstMap(archive, texts)));
  const [tile, setTile] = useState<{ x: number; y: number } | null>(null);
  const [line, setLine] = useState("Mind if I come along? I know these roads.");
  const [joined, setJoined] = useState("");
  const mapKey = map ? `2-${map.type}-${map.index}` : null;
  const newIndex = freeIndex(archive, 3, 1);
  const who = mode === "new" ? name.trim() : (memberRecord(archive, old ?? 0)?.name ?? "");
  const joinedText = joined || `${who || "They"} joined the party!`;
  const nameOk = mode === "old" || (name.trim().length > 0 && textCells(name.trim()) <= 12);
  const statsOk = STAT_FIELDS.every((f) => Number.isInteger(stats[f.key]) && stats[f.key] >= f.min && stats[f.key] <= f.max);
  const others = new Set([...start, ...(world ? joins(world).map((j) => j.member) : [])]);
  if (mode === "old" && old) others.delete(old);
  const full = others.size + 1 > PARTY_MAX;
  const number = mode === "new" ? newIndex : (old ?? 0);
  const likeName = memberRecord(archive, like)?.name ?? `member ${like}`;
  const go = () =>
    run(() => {
      const member: { index: number } | NewMember =
        mode === "old"
          ? { index: old! }
          : { name, walk: walk!, ownWalk, like, ...stats, spells: [...known].map((k) => ({ type: Number(k.split("-")[0]), index: Number(k.split("-")[1]) })) };
      const r = addCompanion(project, { member, map: mapKey!, tile: tile!, line, joined: joinedText });
      return { ...r, placed: { map: mapKey!, script: r.script, id: r.id } };
    });
  return (
    <>
      <p className="muted small">Someone who waits on a map and joins the party when the player talks to them; afterwards they are off the map for good (a story flag remembers it).</p>
      {joinable.length > 0 && (
        <div className="seg" role="radiogroup" aria-label="Who joins">
          <button type="button" role="radio" aria-checked={mode === "new"} className={mode === "new" ? "" : "ghost"} onClick={() => setMode("new")}>
            A new party member
          </button>
          <button type="button" role="radio" aria-checked={mode === "old"} className={mode === "old" ? "" : "ghost"} onClick={() => setMode("old")}>
            A party member already in the game
          </button>
        </div>
      )}
      {mode === "old" ? (
        <label className="wz-field">
          <span>Who</span>
          <select value={old ?? ""} onChange={(e) => setOld(Number(e.target.value))} aria-label="Party member">
            {joinable.map((m) => (
              <option key={m.index} value={m.index}>
                {m.name} (member {m.index})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <div className="wz-two">
            <label className="wz-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} aria-invalid={!nameOk} autoFocus />
              <span className="muted small">12 letters at most.</span>
            </label>
            <label className="wz-field">
              <span>Starts like</span>
              <select
                value={like}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLike(v);
                  setStats(statsOf(findEntry(archive, 3, 1, v)?.data));
                }}
                aria-label="The member whose numbers, portrait, battle sprite and level table theirs start from"
              >
                {members.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span className="muted small">Their numbers, level table, portrait and battle sprite start as copies of {likeName}'s, to change and draw over.</span>
            </label>
          </div>
          <fieldset className="wz-field">
            <legend>Looks like</legend>
            {walks.length ? (
              <div className="wz-sprites" role="radiogroup" aria-label="Walk sprite">
                {walks.map((s) => (
                  <button key={s.index} type="button" role="radio" aria-checked={walk === s.index} className={`wz-sprite${walk === s.index ? " on" : ""}`} onClick={() => setWalk(s.index)} title={entryLabel(s)}>
                    <Thumb archive={archive} entry={s} />
                    <span className="small muted">{entryLabel(s)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="wz-note small">This game has no party walk sprites yet: draw one first (Art, “+”, Party walk sprite).</p>
            )}
            <label className="check small">
              <input type="checkbox" checked={ownWalk} onChange={(e) => setOwnWalk(e.target.checked)} /> A walk sprite of their own (a copy to draw over; else they share this one)
            </label>
          </fieldset>
          <div className="wz-field wz-stats">
            <span>At the start of a new game</span>
            <div className="wz-stat-row">
              {STAT_FIELDS.map((f) => (
                <label key={f.key} className="wz-stat">
                  <span className="small muted">{f.label}</span>
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    value={Number.isFinite(stats[f.key]) ? stats[f.key] : ""}
                    aria-invalid={!(stats[f.key] >= f.min && stats[f.key] <= f.max)}
                    onChange={(e) => {
                      const v = e.target.value === "" ? NaN : Math.trunc(Number(e.target.value));
                      setStats((s) => ({ ...s, [f.key]: v }));
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
          {spells.length > 0 && (
            <fieldset className="wz-field">
              <legend>
                Spells they know <span className="muted small">({known.size} chosen; a spell list of their own)</span>
              </legend>
              <ul className="wz-items">
                {spells.map((e) => {
                  const k = `${e.type}-${e.index}`;
                  return (
                    <li key={k}>
                      <label className={`wz-item${known.has(k) ? " on" : ""}`}>
                        <input type="checkbox" checked={known.has(k)} onChange={(ev) => setKnown((s) => (ev.target.checked ? new Set([...s, k]) : new Set([...s].filter((x) => x !== k))))} />
                        <span className="wz-item-name">{entryLabel(e)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <span className="muted small">More can be added later from a spell's card (“Add to {who ? `${who}’s` : "their"} spell list”).</span>
            </fieldset>
          )}
          {newIndex > 3 && (
            <p className="wz-note small">
              They will be party member {newIndex}: the battle screen shows the portraits of members 1-3 only, and only members 1-4 can wear equipment.
            </p>
          )}
        </>
      )}
      <div className="wz-field">
        <span>Where they wait</span>
        <ResourcePicker archive={archive} resType={2} value={map} onChange={(v) => (setMap(v), setTile(null))} label="Map" />
        {mapKey && (
          <>
            <span className="small">{tile ? <strong>On {tile.x}, {tile.y}</strong> : <span className="muted">Click a tile on the map:</span>}</span>
            <TilePicker archive={archive} project={project} mapKey={mapKey} tile={tile} onPick={setTile} />
          </>
        )}
      </div>
      <label className="wz-field">
        <span>They say</span>
        <textarea rows={2} value={line} onChange={(e) => setLine(e.target.value)} maxLength={200} />
      </label>
      <div className="wz-preview">
        <DialoguePreview archive={archive} name="say" values={[0, sayText(`${who || "Kai"}: ${line}`, 0)]} onWrap={null} />
      </div>
      <label className="wz-field">
        <span>Then the game shows</span>
        <input value={joined} onChange={(e) => setJoined(e.target.value)} maxLength={80} placeholder={joinedText} />
      </label>
      <div className="wz-preview">
        <DialoguePreview archive={archive} name="message" values={[wrapMessage(joinedText.replace(/\s+/g, " ").trim())]} onWrap={null} />
      </div>
      <p className="muted small">
        Talking to them adds party member {number || "?"}, removes them from the map and sets the story flag “{who || "They"} joined the party”; the map's script then leaves them out (the rest of its steps, like the place name, run as before).
      </p>
      {full && (
        <p className="error small" role="alert">
          The party holds {PARTY_MAX} members at most, and {[...others].map((m) => memberRecord(archive, m)?.name ?? `member ${m}`).join(", ")} already {others.size === 1 ? "is" : "are"} in it or join{others.size === 1 ? "s" : ""}.
        </p>
      )}
      <Buttons label="Make them and put them there" disabled={!mapKey || !tile || !nameOk || full || (mode === "new" ? walk === null || !statsOk : !old)} ok={go} />
    </>
  );
}

// --- an inn -----------------------------------------------------------------------------------

export function InnWizard({ archive, texts, init, run, project }: Part) {
  const people = usePeople(project, init?.map);
  const [who, setWho] = useState(init?.person && people.some((p) => p.key === init.person) ? init.person : "");
  const [price, setPrice] = useState(10);
  const [offer, setOffer] = useState<string | null>(null);
  const [rested, setRested] = useState("You sleep well. HP and MP are back to full.");
  const [poor, setPoor] = useState("Sorry, you don't have enough gold.");
  const [no, setNo] = useState("Come back any time!");
  const person = people.find((p) => p.key === who);
  const offerText = offer ?? (price ? `A night's rest is ${price} gold. Will you stay?` : "Rest here a while? It's free.");
  const party = useMemo(() => {
    try {
      return innParty(projectWorld(project), archive, texts["1-1-1"]);
    } catch {
      return null;
    }
  }, [project, archive, texts]); // eslint-disable-line react-hooks/exhaustive-deps
  const priceOk = Number.isInteger(price) && price >= 0 && price <= 65535;
  return (
    <>
      <p className="muted small">Talking to them offers a rest: the player answers “Rest” or “Leave” (the question is the line they say first: the game shows only the answers); resting takes the gold and brings every party member's HP and MP back to full.</p>
      <label className="wz-field">
        <span>Who keeps the inn</span>
        <PersonSelect people={people} value={who} onChange={setWho} />
      </label>
      <label className="wz-field">
        <span>Price</span>
        <span>
          <input className="wz-num" type="number" min={0} max={65535} value={Number.isFinite(price) ? price : ""} aria-invalid={!priceOk} onChange={(e) => setPrice(e.target.value === "" ? NaN : Math.trunc(Number(e.target.value)))} /> gold
        </span>
      </label>
      <label className="wz-field">
        <span>They say</span>
        <input value={offerText} onChange={(e) => setOffer(e.target.value)} maxLength={120} />
      </label>
      <div className="wz-preview">
        <DialoguePreview archive={archive} name="say" values={[0, sayText(`${person?.name ?? "Innkeeper"}: ${offerText}`, 0)]} onWrap={null} />
        <p className="muted small">Then the box closes and the player picks “{price ? `Rest (${price} gold)` : "Rest (free)"}” or “Leave”.</p>
      </div>
      <div className="wz-two">
        <label className="wz-field">
          <span>Not enough gold</span>
          <input value={poor} onChange={(e) => setPoor(e.target.value)} maxLength={120} disabled={!price} />
        </label>
        <label className="wz-field">
          <span>“Leave”</span>
          <input value={no} onChange={(e) => setNo(e.target.value)} maxLength={120} placeholder="(nothing)" />
        </label>
      </div>
      <label className="wz-field">
        <span>After resting</span>
        <input value={rested} onChange={(e) => setRested(e.target.value)} maxLength={120} />
      </label>
      {party && (
        <div className="wz-field">
          <span>Who rests</span>
          <ul className="wz-members small">
            {party.always.map((m) => (
              <li key={m.member}>{m.name}: always (in the party from the start)</li>
            ))}
            {party.whenFlag.map((m) => (
              <li key={m.member}>
                {m.name}: once they have joined (story flag {m.flag} remembers it)
              </li>
            ))}
            {party.unknown.map((m) => (
              <li key={m.member} className="warn-text">
                {m.name}: left out, as the editor cannot tell when they are in the party ({m.why}); resting someone who is not in it stops the game on the device
              </li>
            ))}
          </ul>
        </div>
      )}
      <Buttons
        label="Open the inn"
        disabled={!person || !priceOk || !party || (!party.always.length && !party.whenFlag.length)}
        ok={() => run(() => addInn(project, { script: person!.script, id: person!.id, name: person!.name, price, offer: offerText, rested, poor, no }))}
      />
    </>
  );
}

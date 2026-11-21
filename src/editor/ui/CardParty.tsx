// What a card says about the party (format/party.ts):
// - a party member's card: the person on a map who joins as them ("On the
//   map as Kai (person 2-3) on COAST ROAD"), buttons to draw their own
//   portrait, battle sprite and walk sprite and to edit their level table,
//   and which of those are still copies of another member's;
// - a person's card: the party member they join as;
// - a spell's card: who learns it and when (from their spell lists and level
//   tables), "Add to <member>'s spell list" for the others (a list of their
//   own is made when they have none or share one), and "Learns it at level n"
//   when the level table never gets that far.
import { useMemo, useState } from "react";
import type { LibArchive, LibEntry } from "../format/lib";
import { addSpellToMember, companionOf, joinsAs, learnFromLevel, memberRecord, spellLearners, stillCopies } from "../format/party";
import { readLevels } from "../format/schema";
import { findEntry } from "../format/lib";
import { resKey, type WorldIndex } from "../format/world";
import type { EditorServices } from "./views";
import "./round2.css";

/** "Party member 1-2": on the map as the person who joins (party cards), or the member a person joins as (person cards). */
export function CompanionLink({ archive, entry, world, services }: { archive: LibArchive; entry: LibEntry; world: WorldIndex; services: EditorServices }) {
  if (entry.resType !== 3 || (entry.type !== 1 && entry.type !== 2)) return null;
  const j = entry.type === 1 ? companionOf(world, entry.index) : joinsAs(world, resKey(3, 2, entry.index));
  if (!j) return null;
  const p = j.person!;
  const mapName = p.map ? (world.maps.get(p.map)?.name ?? "a map") : "no map";
  if (entry.type === 1)
    return (
      <p className="cv-link small">
        On the map as{" "}
        <button type="button" className="link" onClick={() => services.openResource(p.resource)} title="Open the person's card">
          {p.name || "a person"} (person {p.resource.split("-").slice(1).join("-")})
        </button>{" "}
        on{" "}
        {p.map ? (
          <button type="button" className="link" onClick={() => services.openResource(p.map!, { mode: "map.world" })}>
            {mapName}
          </button>
        ) : (
          mapName
        )}
        : talking to them adds this member{j.flag !== null ? ` and sets flag ${j.flag}, which keeps them off the map afterwards` : ""}.
      </p>
    );
  const m = memberRecord(archive, j.member);
  return (
    <p className="cv-link small">
      Joins the party as{" "}
      <button type="button" className="link" onClick={() => services.openResource(resKey(3, 1, j.member))} title="Open the party member's card">
        {m?.name ?? "party member"} (member {j.member})
      </button>{" "}
      when the player talks to them on {mapName}{j.flag !== null ? ` (flag ${j.flag} remembers it)` : ""}.
    </p>
  );
}

/** A party member's own art and table, to open and draw: portrait, battle sprite, walk sprite, level table. */
export function OwnArt({ archive, index, services }: { archive: LibArchive; index: number; services: EditorServices }) {
  const me = memberRecord(archive, index);
  const copies = useMemo(() => stillCopies(archive, index), [archive, index]);
  if (!me) return null;
  const open = (key: string) => services.openResource(key);
  const btn = (key: string, label: string) => (
    <button type="button" className="ghost small" onClick={() => open(key)} disabled={!findEntry(archive, ...(key.split("-").map(Number) as [number, number, number]))} title={`Open ${label.toLowerCase().replace(/^edit /, "")} ${key.split("-").slice(1).join("-")}`}>
      {label}
    </button>
  );
  return (
    <>
      <div className="cv-own-art" role="group" aria-label={`${me.name}'s art`}>
        {btn(resKey(11, 1, index), "Edit portrait")}
        {btn(resKey(11, 3, index), "Edit battle sprite")}
        {me.walk > 0 && btn(resKey(8, 1, me.walk), "Edit walk sprite")}
        {btn(resKey(12, 2, index), "Edit level table")}
      </div>
      {copies.some((c) => !c.shared) && (
        <p className="muted small cv-link">
          Their {andList(copies.filter((c) => !c.shared).map((c) => c.what))} {copies.filter((c) => !c.shared).length === 1 ? "is" : "are"} still a copy of {copies.find((c) => !c.shared)!.of}'s: draw {me.name}'s own.
        </p>
      )}
      {copies.some((c) => c.shared) && (
        <p className="muted small cv-link">
          {me.name} and {copies.find((c) => c.shared)!.of} use the same walk sprite: drawing on it changes both (Duplicate it and pick the copy for {me.name}).
        </p>
      )}
    </>
  );
}

const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** A spell card's "Who learns it". */
export function SpellLearners({ archive, entry, services }: { archive: LibArchive; entry: LibEntry; services: EditorServices }) {
  const spell = { type: entry.type, index: entry.index };
  const info = useMemo(() => spellLearners(archive, spell), [archive, entry]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const write = (changes: { key: string; data: Uint8Array }[], msg: string) => {
    for (const c of changes) services.writeResource(c.key, c.data);
    setError(null);
    setDone(msg);
  };
  const add = (member: number) => {
    try {
      const r = addSpellToMember(archive, member, spell, true);
      const m = memberRecord(archive, member)!;
      write(r.changes, `Added to ${m.name}'s spell list${r.created ? ` (a new list, 1-${r.list}, of their own)` : ""}, as spell ${r.position}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const learnAt = (member: number, position: number, level: number) => {
    try {
      write([learnFromLevel(archive, member, position, level)], `${memberRecord(archive, member)!.name} learns it at level ${level} now.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const levels = (member: number) => {
    const t = findEntry(archive, 12, 2, member);
    return t ? readLevels(t.data).length : 0;
  };
  return (
    <section className="cv-group" aria-labelledby="cv-learners">
      <h3 id="cv-learners">Who learns it</h3>
      <p className="muted small">A party member knows the first spells of their spell list: some from the start, more as their level table says when they level up. A script's “Teach spell” step can also teach it.</p>
      <ul className="cv-learners">
        {info.learners.map((l) => (
          <li key={l.member.index}>
            <strong>{l.member.name}</strong>
            <span className="cv-learn-when">
              {l.at === "start" ? "knows it from the start" : l.at !== null ? `learns it at level ${l.at}` : "has it in their list, but their level table never gets that far"}
              {l.sharedWith.length ? ` (the list is shared with ${l.sharedWith.join(", ")})` : ""}
            </span>
            {l.at === null && levels(l.member.index) > 0 && (
              <LearnAt max={levels(l.member.index)} from={Math.min(levels(l.member.index), l.member.level + 1)} onPick={(lv) => learnAt(l.member.index, l.position, lv)} />
            )}
          </li>
        ))}
        {info.others.map((m) => (
          <li key={m.index}>
            <button type="button" className="ghost small" onClick={() => add(m.index)}>
              Add to {m.name}'s spell list
            </button>
          </li>
        ))}
        {!info.learners.length && !info.others.length && <li className="muted small">This game has no party members yet.</li>}
      </ul>
      {done && (
        <p className="small" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="error small" role="alert">
          {error.replace(/^./, (c) => c.toUpperCase())}
        </p>
      )}
    </section>
  );
}

function LearnAt({ max, from, onPick }: { max: number; from: number; onPick: (level: number) => void }) {
  const [lv, setLv] = useState(from);
  return (
    <span className="small">
      Learns it at level{" "}
      <input className="wz-num" type="number" min={1} max={max} value={lv} onChange={(e) => setLv(Math.max(1, Math.min(max, Math.trunc(Number(e.target.value)) || 1)))} aria-label="Level" />{" "}
      <button type="button" className="ghost small" onClick={() => onPick(lv)}>
        Set
      </button>
    </span>
  );
}

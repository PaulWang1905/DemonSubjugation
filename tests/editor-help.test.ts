// The script editor's help data and dialogue tools, the project check, and
// the blank template's fixes (no game files needed).
import { describe, expect, it } from "vitest";
import { AsmError, assemble, closestOp, disassemble, OPS, parseGut, statements } from "../src/editor/format/gut";
import {
  allHelp,
  checkDialogue,
  GROUPS,
  insertSnippet,
  instructionAt,
  opHelp,
  playerStart,
  signature,
  SNIPPETS,
  splitWords,
  template,
  unshowable,
  wrapDialogue,
} from "../src/editor/format/scriptHelp";
import { checkProject, problemSummary } from "../src/editor/format/validate";
import { encodeMagicChain, encodeMap, encodePlayer } from "../src/editor/format/encode";
import { findEntry, putEntry, removeEntry, type LibArchive } from "../src/editor/format/lib";
import { decodeImage } from "../src/editor/format/decode";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { filterLabel } from "../src/editor/format/decode";

/** A script around some lines, with every label they jump to defined. */
function wrapLines(lines: string): string {
  const labels = new Set([...lines.matchAll(/@(\w+)/g)].map((m) => m[1]));
  const defined = new Set([...lines.matchAll(/^@(\w+):/gm)].map((m) => m[1]));
  const extra = [...labels].filter((l) => !defined.has(l)).map((l) => `@${l}:\n  callback`);
  return `.gut 1 1\n.desc "t"\n.events 0\n@start:\n${lines}\n  callback\n${extra.join("\n")}\n`;
}

describe("script help", () => {
  it("covers every instruction once, with one name per operand", () => {
    const help = allHelp();
    expect(help.map((h) => h.name).sort()).toEqual(OPS.map((o) => o.name).sort());
    for (const o of OPS) {
      const h = opHelp(o.name)!;
      expect(GROUPS).toContain(h.group);
      expect(h.args.length, o.name).toBe(o.args.length);
      expect(h.text.length).toBeGreaterThan(5);
    }
    // the no-op instructions come last
    const firstNoop = help.findIndex((h) => h.noop);
    expect(help.slice(firstNoop).every((h) => h.noop)).toBe(true);
  });

  it("gives examples that assemble to the instruction", () => {
    for (const h of allHelp()) {
      const bin = assemble(wrapLines(`  ${template(h)}`));
      expect(disassemble(bin), h.name).toContain(`  ${h.name}`);
    }
    expect(signature(opHelp("say")!)).toBe('say portrait, "text"');
  });

  it("knows the instruction and operand at the caret", () => {
    const line = '  enterfight 0, 1, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, @lose, @win';
    expect(instructionAt(line, 3)).toMatchObject({ help: { name: "enterfight" }, arg: -1 });
    expect(instructionAt(line, line.indexOf("1,") + 1)?.arg).toBe(1);
    expect(instructionAt(line, line.length)?.arg).toBe(14);
    // commas inside text do not count
    const say = '@hi: say 1, "Well, well, well"';
    expect(instructionAt(say, say.length - 2)).toMatchObject({ help: { name: "say" }, arg: 1 });
    expect(instructionAt("  ; a comment", 5)).toBeNull();
    expect(instructionAt("  buy 9:1, 9:2, 7:1", 18)?.arg).toBe(0);
  });

  it("finds words split across a dialogue box's lines", () => {
    expect(splitWords("Your adventure starts here!", [11, 15])).toEqual(["advent|ure", "here|!"]);
    expect(splitWords("Your       adventure      starts     here!", [11, 15])).toEqual([]);
    // Chinese text breaks anywhere
    expect(splitWords("你好你好你好你好你好你好", [11, 15])).toEqual([]);
    const issues = checkDialogue(`.gut 1 1\n  say 1, "Your adventure starts here!"\n  say 0, "Short."\n  message "Nothing here but the wind and rain"\n`);
    expect(issues.map((i) => i.line)).toEqual([2, 4]);
  });

  it("flags characters the game cannot show", () => {
    expect(unshowable("Hi 🙂 there… ok?")).toEqual(["🙂"]);
    expect(checkDialogue('  say 0, "Hi 🙂"\n')[0].message).toContain("🙂");
    expect(unshowable("你好，世界！")).toEqual([]);
  });

  it("re-wraps only the dialogue that needs it", () => {
    const src = `@a:\n  say 1, "Your adventure starts here!" ; hello\n  say 0, "Keep   my  text"\n  message "He shouted \\"stop\\" at the dog"\n`;
    const r = wrapDialogue(src);
    expect(r.changed).toBe(2);
    expect(checkDialogue(r.text)).toEqual([]);
    const lines = r.text.split("\n");
    expect(lines[1]).toMatch(/^ {2}say 1, "Your {7}adventure.*" ; hello$/);
    expect(lines[2]).toBe(src.split("\n")[2]);
    expect(lines[3]).toContain('\\"stop\\"');
    expect(() => assemble(`.gut 1 1\n.events 0\n${r.text}  callback\n`)).not.toThrow();
  });

  it("inserts snippets that assemble, with their events and unique names", () => {
    const base = `.gut 1 1\n.desc "t"\n.events 40\n.event 1 @talk\n\n@start:\n  createnpc 1, 1, 5, 5\n  callback\n@talk:\n  callback\n`;
    for (const s of SNIPPETS) {
      const r = insertSnippet(base, s, 6);
      expect(() => assemble(r.text), s.label).not.toThrow();
      expect(r.note).not.toContain("{");
    }
    const npc = SNIPPETS.find((s) => s.label.startsWith("NPC"))!;
    const once = insertSnippet(base, npc, 6);
    // id 1 is taken: the new NPC is id 2, and its handler runs as event 2
    expect(once.text).toContain("  createnpc 2, 1, 10, 6");
    expect(once.text).toContain(".event 2 @talk_1");
    expect(once.line).toBe(8); // after line 6 and the new .event line
    expect(once.text.split("\n")[once.line - 1]).toBe("  createnpc 2, 1, 10, 6");
    const twice = insertSnippet(once.text, npc, 8);
    expect(() => assemble(twice.text)).not.toThrow();
    expect(twice.text).toContain("@talk_2:");

    // a map exit raises .events to cover script event 41
    const exit = insertSnippet(base, SNIPPETS.find((s) => s.label === "Map exit")!, 6);
    expect(exit.text).toContain(".events 41");
    expect(exit.note).toContain("map event 1");
    expect(parseGut(assemble(exit.text)).events[40]).toBeGreaterThan(0);

    // story flags no script uses yet
    const chest = insertSnippet(base, SNIPPETS.find((s) => s.label === "Chest")!, 6, ["  setevent 1\n  if 2, @x\n"]);
    expect(chest.text).toContain("setevent 3");
  });

  it("places the player with the camera inside the map", () => {
    expect(playerStart(8, 7, 20, 14)).toEqual({ screenX: 4, screenY: 4, actorX: 4, actorY: 3 });
    expect(playerStart(1, 1, 20, 14)).toEqual({ screenX: 0, screenY: 0, actorX: 1, actorY: 1 });
    expect(playerStart(19, 13, 20, 14)).toEqual({ screenX: 11, screenY: 8, actorX: 8, actorY: 5 });
  });
});

describe("assembler messages", () => {
  it("puts .event errors on their line", () => {
    const err = (src: string) => {
      try {
        assemble(src);
      } catch (e) {
        return e as AsmError;
      }
      throw new Error("assembled");
    };
    expect(err(".gut 1 1\n.events 40\n.event 41 @x\n@x:\n  callback\n")).toMatchObject({ line: 3 });
    expect(err(".gut 1 1\n.events 40\n.event 41 @x\n@x:\n  callback\n").message).toContain(".events");
    expect(err(".gut 1 1\n.events 2\n.event 2 @nowhere\n  callback\n")).toMatchObject({ line: 3 });
    expect(err('.gut 1 1\n  say 0, “Hi”\n').message).toContain("straight quotes");
    expect(err(".gut 1 1\n  sya 0, 1\n").message).toContain("did you mean say?");
    expect(closestOp("callbak")).toBe("callback");
    expect(closestOp("xyzzyq")).toBeNull();
  });

  it("lists a script's instructions with their lines", () => {
    const st = statements('.gut 1 1\n\n@a: loadmap 1, 2, 3, 4\n  ; note\n  say 0, "x"\n  bogus 1\n');
    expect(st.map((s) => [s.line, s.op.name])).toEqual([
      [3, "loadmap"],
      [5, "say"],
    ]);
  });
});

describe("project check", () => {
  it("finds nothing wrong with the templates", () => {
    expect(checkProject(lanternPath(), lanternPathSources())).toEqual([]);
    expect(checkProject(silentBell(), silentBellSources())).toEqual([]);
    expect(checkProject(silentBell())).toEqual([]); // from the disassembly
    expect(checkProject(blankProject("TEST"))).toEqual([]);
  });

  const withScript = (a: LibArchive, src: string) => {
    putEntry(a, { resType: 1, type: 1, index: 1, data: assemble(src) });
    return { [`1-1-1`]: src };
  };

  it("reports missing resources at their script line", () => {
    const a = blankProject("TEST");
    const sources = withScript(
      a,
      [".gut 1 1", ".events 40", "@start:", "  loadmap 1, 9, 4, 4", "  createactor 1, 4, 3", "  createnpc 3, 7, 5, 5", "  createnpc 50, 1, 5, 5", "  gaingoods 9, 99", "  buy 9:1, 9:42", "  enterfight 0, 8, 0, 0, 77, 0, 0, 0, 0, 0, 0, 0, 0, @x, @x", "  say 9, \"Hi\"", "  startchapter 1, 3", "@x:", "  callback", ""].join("\n"),
    );
    const p = checkProject(a, sources);
    const at = (line: number) => p.filter((x) => x.line === line).map((x) => `${x.level}: ${x.message}`);
    expect(at(4)).toEqual(["error: loadmap: map 1-9 does not exist"]);
    expect(at(5)).toEqual([]);
    expect(at(6)).toEqual(["error: createnpc: NPC 2-7 does not exist"]);
    expect(at(7)).toEqual(["error: createnpc: id 50 is outside 1-40", "error: createnpc: NPC 2-1 does not exist"]);
    expect(at(8)).toEqual(["error: gaingoods: item 9-99 does not exist"]);
    expect(at(9)).toEqual(["error: buy: item 9-42 does not exist"]);
    expect(at(10)).toEqual(["error: enterfight: monster 3-8 does not exist", "warning: enterfight: picture 4-77 does not exist (a blank stand-in is shown)"]);
    expect(at(11)).toEqual(["warning: say: picture 1-9 does not exist (a blank stand-in is shown)"]);
    expect(at(12)).toEqual(["error: startchapter: script 1-3 does not exist"]);
    // the map is not loaded by any script now
    expect(p.find((x) => x.key === "2-1-1")?.message).toContain("no script shows this map");
    expect(problemSummary(p)).toMatch(/^\d+ errors, 3 warnings$/);
  });

  it("reports map events no script handles, missing tilesets and tiles", () => {
    const a = blankProject("TEST");
    const cells = Array.from({ length: 20 * 14 }, (_, i) => ({ tile: i === 0 ? 120 : 0, walkable: true, event: i === 30 ? 2 : 0 }));
    putEntry(a, { resType: 2, type: 1, index: 1, data: encodeMap({ type: 1, index: 1, tileset: 1, name: "START", width: 20, height: 14, cells }) });
    let p = checkProject(a).map((x) => x.message);
    expect(p).toContain("map event 2 does nothing: no script that shows this map says what happens there");
    const tiles = decodeImage(findEntry(a, 7, 1, 1)!.data).frames.length;
    expect(p).toContain(`uses tile 120, but tileset 1 has tiles 0-${tiles - 1}`);
    withScript(a, ".gut 1 1\n.events 42\n.event 42 @door\n@start:\n  loadmap 1, 1, 4, 4\n  callback\n@door:\n  callback\n");
    p = checkProject(a).map((x) => x.message);
    expect(p.some((m) => m.startsWith("map event"))).toBe(false);
    removeEntry(a, 7, 1, 1);
    expect(checkProject(a).map((x) => x.message)).toContain("tileset 1 does not exist (the map is blank)");
  });

  it("reports forms and tables that point at nothing", () => {
    const a = blankProject("TEST");
    putEntry(a, { resType: 3, type: 1, index: 5, data: encodePlayer({ index: 5, name: "Kai", walkSprite: 9, magicChain: 1, magicsKnown: 1, level: 1, maxHP: 1, maxMP: 1, attack: 1, defend: 1, speed: 1, lingli: 1, luck: 1, equip: { weapon: 33 } }) });
    putEntry(a, { resType: 12, type: 1, index: 9, data: encodeMagicChain(9, [{ type: 1, index: 77 }]) });
    const p = checkProject(a).map((x) => `${x.level} ${x.where}: ${x.message}`);
    expect(p).toContain("warning Party member 1-5 Kai: Walking sprite: sprite 1-9 does not exist");
    expect(p).toContain("warning Party member 1-5 Kai: no portrait (picture 1-5)");
    expect(p).toContain("error Spell list 1-9: spell 1-77 does not exist");
    expect(p.some((x) => x.startsWith("error Party member 1-5 Kai: Weapon: item 7-33"))).toBe(true);
  });

  it("reports a project without a starting script", () => {
    const a = blankProject("TEST");
    removeEntry(a, 1, 1, 1);
    expect(checkProject(a)[0]).toMatchObject({ level: "error", message: expect.stringContaining("script 1-1") });
  });
});

describe("blank template", () => {
  it("shows its own name on the title screen and wraps its dialogue", () => {
    const a = blankProject("MOSSVALE");
    const logo = findEntry(a, 5, 1, 248)!.data;
    expect(logo).not.toEqual(findEntry(lanternPath(), 5, 1, 248)!.data);
    expect(findEntry(blankProject("other"), 5, 1, 248)!.data).not.toEqual(logo);
    // names the pixel font cannot draw still make a logo
    expect(() => blankProject("剑侠")).not.toThrow();
    expect(checkDialogue(disassemble(findEntry(a, 1, 1, 1)!.data))).toEqual([]);
  });
});

describe("resource filter", () => {
  it("matches kinds as well as names", () => {
    const a = lanternPath();
    const monster = a.entries.find((e) => e.resType === 3 && e.type === 3)!;
    expect(filterLabel(monster)).toContain("monster");
    expect(filterLabel(monster)).toContain("characters");
    expect(filterLabel(a.entries.find((e) => e.resType === 7)!)).toContain("tilesets");
  });
});

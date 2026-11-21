// The script model (src/editor/format/scriptModel.ts): reading a script's
// text into events and steps, writing it back unchanged, outlining blocks,
// and edits that keep untouched lines as they were and still assemble.
import { describe, expect, it } from "vitest";
import { assemble, disassemble, parseGut, scriptSource } from "../src/editor/format/gut";
import {
  addEvent,
  addPlacement,
  addTileEvent,
  deleteSteps,
  dominators,
  entryStep,
  eventGroup,
  eventMeaning,
  freeId,
  freeMapEvent,
  insertLines,
  instructionLine,
  instructions,
  labelRefCounts,
  modelProblems,
  moveSteps,
  outline,
  outlineSteps,
  parseScript,
  removeEvent,
  renameLabel,
  replaceLine,
  setEventLabel,
  setOperand,
  startGroup,
  startPlacement,
  stepById,
  toSource,
  uniqueLabel,
  type InstructionStep,
  type OutlineNode,
  type ScriptModel,
} from "../src/editor/format/scriptModel";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { blankProject } from "../src/editor/template/blank";

/** Every script of the three templates, as the editor shows it: [name, text]. */
function templateScripts(): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, a, sources] of [
    ["blank", blankProject(), {}],
    ["lantern", lanternPath(), lanternPathSources()],
    ["bell", silentBell(), silentBellSources()],
  ] as const) {
    for (const e of a.entries.filter((x) => x.resType === 1)) {
      const key = `1-${e.type}-${e.index}`;
      const src = (sources as Record<string, string>)[key];
      out.push([`${name} ${key}`, scriptSource(e.data, src)]);
      // and the disassembly, which an imported game shows
      out.push([`${name} ${key} (disassembled)`, disassemble(e.data)]);
    }
  }
  return out;
}

const SCRIPTS = templateScripts();
const HAMLET = lanternPathSources()["1-1-1"];
const GLADE = lanternPathSources()["1-1-2"];
const VILLAGE = silentBellSources()["1-1-1"];
const WOOD = silentBellSources()["1-1-2"];

const find = (m: ScriptModel, text: string) => {
  const s = m.steps.find((x) => x.text.trim() === text);
  if (!s) throw new Error(`no line "${text}"`);
  return s;
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Lines of `after` that are not in `before` (by position-insensitive multiset). */
function added(before: string, after: string): string[] {
  const left = before.split("\n");
  const out: string[] = [];
  for (const l of after.split("\n")) {
    const k = left.indexOf(l);
    if (k >= 0) left.splice(k, 1);
    else out.push(l);
  }
  return out;
}

describe("reading and writing back", () => {
  it("gives back every template script exactly", () => {
    expect(SCRIPTS.length).toBe(2 * (1 + 2 + 5));
    for (const [name, src] of SCRIPTS) {
      const m = parseScript(src);
      expect(toSource(m), name).toBe(src);
      expect(m.steps.filter((s) => s.kind === "raw").map((s) => s.text), name).toEqual([]);
      expect(modelProblems(m), name).toEqual([]);
      expect(same(assemble(toSource(m)), assemble(src)), name).toBe(true);
    }
  });

  it("keeps any text: no final line break, CRLF, odd spacing, comments, raw lines", () => {
    const texts = [
      "",
      "\n",
      "callback",
      ".gut 1 1\r\n.events 1\r\n.event 1 @a\r\n@a: say 1, \"x\" ; hi\r\n  callback\r\n",
      "  ; only a comment\n\n\n",
      "@a:@b:\n  sya 1, 2\n  say 1\n  goto done\n  .raw x\"0102\"\n  .bogus 1\n",
      '\t@x:\tsay\t0 , "a \\"q\\" \\\\ \\n \\x41"   ;; c\n',
    ];
    for (const t of texts) expect(toSource(parseScript(t)), JSON.stringify(t)).toBe(t);
  });

  it("reads each kind of line", () => {
    const src = [
      ".gut 1 7",
      '.desc "Test place"',
      ".events 42",
      ".event 1 @talk",
      ".event 42 #99",
      "",
      "; start code",
      "@start:",
      "  loadmap 1, 2, 3, 4 ; the map",
      "@talk: say 0, \"Hi\"",
      "  sya 1",
      "  say 1",
      "  buy 9:1, 0x7:2",
      '  .raw x"ff00"',
      "  callback",
    ].join("\n");
    const m = parseScript(src);
    expect(m.steps.map((s) => s.kind)).toEqual(["directive", "directive", "directive", "directive", "directive", "blank", "comment", "label", "instruction", "instruction", "raw", "raw", "instruction", "data", "instruction"]);
    expect(m.header).toEqual({ type: 1, index: 7, desc: "Test place", headerBytes: null, eventCount: 42 });
    expect(m.events.map((e) => [e.number, e.label])).toEqual([
      [1, "talk"],
      [42, null],
    ]);
    const load = m.steps[8] as InstructionStep;
    expect(load.values).toEqual([1, 2, 3, 4]);
    expect(load.comment).toBe("; the map");
    expect(m.steps[9].label).toBe("talk");
    expect((m.steps[9] as InstructionStep).values).toEqual([0, "Hi"]);
    expect(m.steps[10]).toMatchObject({ kind: "raw", reason: 'unknown instruction "sya"' });
    expect(m.steps[11]).toMatchObject({ kind: "raw", reason: expect.stringMatching(/takes 2 operand/) });
    expect((m.steps[12] as InstructionStep).values).toEqual([
      [
        [9, 1],
        [7, 2],
      ],
    ]);
    expect(m.codeFrom).toBe(6);
    expect(modelProblems(m).map((p) => p.line)).toEqual([11, 12]);
  });

  it("calls raw exactly the lines the assembler refuses", () => {
    const lines = ["say 1", "say 1, 2", 'say "x", 1', "loadmap 1, 2, 3, 70000", "goto 5", "buy 9:0", "buy 300:1", 'message "a\\q"', '.desc "' + "x".repeat(22) + '"', ".events 300", ".event x @a", "frobnicate", "callback", 'say 1, "ok"', "buy", "buy 9:1, 9:2", "goto #12", "ifcmp 0, 1, @a"];
    for (const l of lines) {
      const src = `.events 0\n${l}\n@a:\n  callback\n`;
      const m = parseScript(src);
      const raw = m.steps[1].kind === "raw";
      let fails = false;
      try {
        assemble(src);
      } catch {
        fails = true;
      }
      expect(raw, l).toBe(fails);
    }
  });
});

describe("events and groups", () => {
  it("reads the header and event table", () => {
    const m = parseScript(VILLAGE);
    expect(m.header).toMatchObject({ type: 1, index: 1, desc: "Bellhaven", eventCount: 47 });
    expect(m.events.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 41, 42, 43, 44, 45, 46, 47]);
    expect(eventMeaning(3)).toEqual({ kind: "person", id: 3 });
    expect(eventMeaning(43)).toEqual({ kind: "tile", mapEvent: 3 });
  });

  it("groups the code by the event that starts at each label", () => {
    const m = parseScript(VILLAGE);
    expect(m.groups.map((g) => g.label)).toEqual(["start", "elder", "tam", "hana", "pip", "joss", "chest", "boulder", "east", "north", "pier", "tower", "home", "shop", "inn"]);
    expect(m.groups[0]).toMatchObject({ start: true, events: [], jumpsOut: ["done"] });
    expect(eventGroup(m, 41)?.label).toBe("east");
    expect(eventGroup(m, 47)).toMatchObject({ label: "inn", sharedLabels: ["done"] });
    expect(eventGroup(m, 5)?.jumpsOut).toEqual(["done"]);
    // the groups cover the code without gaps
    for (let k = 1; k < m.groups.length; k++) expect(m.groups[k].from).toBe(m.groups[k - 1].to);
    expect(m.groups[m.groups.length - 1].to).toBe(m.steps.length);
    // @east ends with startchapter: it does not run on into @north
    expect(eventGroup(m, 41)?.fallsInto).toBeNull();
  });

  it("notes a group that runs on into the next", () => {
    const m = parseScript(".events 2\n.event 1 @a\n.event 2 @b\n@start:\n  callback\n@a:\n  setevent 1\n@b:\n  callback\n");
    expect(m.groups.map((g) => [g.label, g.fallsInto])).toEqual([
      ["start", null],
      ["a", "b"],
      ["b", null],
    ]);
  });

  it("finds a start group for a script without labels (a disassembly)", () => {
    const blank = blankProject().entries.find((e) => e.resType === 1)!;
    const m = parseScript(disassemble(blank.data));
    expect(m.groups).toHaveLength(1);
    expect(startGroup(m)).toMatchObject({ start: true, label: null, events: [] });
  });
});

describe("outlines", () => {
  it("shows every step of every group exactly once", () => {
    for (const [name, src] of SCRIPTS) {
      const m = parseScript(src);
      for (const g of m.groups) {
        const ids = outlineSteps(outline(m, g)).map((s) => s.id);
        expect(new Set(ids).size, `${name} @${g.label}`).toBe(ids.length);
        expect(ids.sort((a, b) => a - b), `${name} @${g.label}`).toEqual(m.steps.slice(g.from, g.to).map((s) => s.id));
      }
    }
  });

  const blocks = (nodes: OutlineNode[]): Extract<OutlineNode, { kind: "block" }>[] =>
    nodes.flatMap((n) => (n.kind === "block" ? [n, ...n.arms.flatMap((a) => (a.nodes ? blocks(a.nodes) : []))] : []));

  it("recognises a choice with its two answers", () => {
    const m = parseScript(VILLAGE);
    const [choice] = blocks(outline(m, eventGroup(m, 3)!)).filter((b) => b.block === "choice");
    expect(choice.arms.map((a) => [a.title, a.label, a.nodes !== null])).toEqual([
      ["“Rest”", null, true],
      ["“Not now”", "hana_no", true],
    ]);
    // the first answer holds the inn's code up to its end, with its own blocks
    const first = choice.arms[0].nodes!;
    expect(blocks(first).map((b) => b.block)).toEqual(["branch", "ifThen"]);
    expect(choice.arms[1].nodes!.map((n) => (n.kind === "step" ? n.step.text.trim() : ""))).toEqual(["callback", ""]);
  });

  it("recognises a battle with its win and lose branches", () => {
    const m = parseScript(WOOD);
    const [battle] = blocks(outline(m, eventGroup(m, 1)!)).filter((b) => b.block === "battle");
    expect(battle.step.op.name).toBe("enterfight");
    const [won, lost] = battle.arms;
    expect([won.title, won.label, lost.title, lost.label]).toEqual(["If won", "bram_win", "If lost", "lose"]);
    expect(won.nodes!.map((n) => (n.kind === "step" ? n.step.text.trim() : "")).slice(0, 2)).toEqual(["deletenpc 1", "createactor 2, 4, 3"]);
    // @lose is shared by two battles: a jump, not nested
    expect(lost.nodes).toBeNull();
    expect(labelRefCounts(m).get("lose")).toBe(2);
  });

  it("recognises if-then (if; goto join; then-code; join)", () => {
    const m = parseScript(HAMLET);
    const bs = blocks(outline(m, startGroup(m)!));
    const chest = bs.find((b) => b.block === "ifThen" && b.arms[0].label === "chest_was_open")!;
    expect(chest.joinLabel).toBe("lantern_state");
    expect(chest.extra.map((s) => s.text.trim())).toEqual(["goto @lantern_state"]);
    expect(chest.arms[0].nodes!.map((n) => (n.kind === "step" ? n.step.text.trim() : ""))).toEqual(["boxopen 3"]);
    expect(chest.arms[0].continuesAt).toBe("lantern_state");
  });

  it("nests what a flag check jumps to when only it goes there", () => {
    const m = parseScript(HAMLET);
    const top = outline(m, eventGroup(m, 1)!);
    const ifs = top.filter((n): n is Extract<OutlineNode, { kind: "block" }> => n.kind === "block");
    expect(ifs[0].step.text.trim()).toBe("if 9, @elder_after");
    expect(ifs[0].arms[0].nodes?.length).toBeGreaterThan(0);
    // testgoodsnum jumps to @elder_win from two operands: not nested
    const test = ifs.find((b) => b.step.op.name === "testgoodsnum")!;
    expect(test.arms.map((a) => a.nodes)).toEqual([null, null]);
  });

  it("recognises a menu with the comparisons after it", () => {
    const src = '.events 1\n.event 1 @talk\n@start:\n  callback\n@talk:\n  menu 5, "Inn Shop Leave"\n  ifcmp 5, 0, @inn\n  ifcmp 5, 1, @shop\n  callback\n@inn:\n  message "Rest"\n  callback\n@shop:\n  buy 9:1\n  callback\n';
    const m = parseScript(src);
    const [menu] = outline(m, eventGroup(m, 1)!).filter((n): n is Extract<OutlineNode, { kind: "block" }> => n.kind === "block");
    expect(menu.block).toBe("menu");
    expect(menu.extra.map((s) => s.text.trim())).toEqual(["ifcmp 5, 0, @inn", "ifcmp 5, 1, @shop"]);
    expect(menu.arms.map((a) => [a.key, a.title, a.label])).toEqual([
      ["0", "“Inn”", "inn"],
      ["1", "“Shop”", "shop"],
    ]);
    expect(menu.arms.every((a) => a.nodes)).toBe(true);
  });
});

describe("flow", () => {
  it("finds dominators and where the start code places people", () => {
    const m = parseScript(WOOD);
    const entry = entryStep(m);
    const dom = dominators(m, entry);
    const callback = m.steps.findIndex((s) => s.text.trim() === "callback");
    const always = [...dom.get(callback)!].map((i) => m.steps[i].text.trim());
    expect(always).toContain("createbox 2, 1, 5, 12");
    expect(always).not.toContain("createnpc 1, 6, 12, 4");
    expect(always).not.toContain("createbox 3, 3, 25, 8");
    expect(startPlacement(m)).toEqual({ after: find(m, "createbox 2, 1, 5, 12").id });
    const h = parseScript(HAMLET);
    expect(startPlacement(h)).toEqual({ after: find(h, "createbox 4, 2, 12, 6").id });
  });
});

describe("edits", () => {
  it("inserts, deletes, moves and replaces lines, keeping the others and their ids", () => {
    const m = parseScript(HAMLET);
    const say = find(m, "buy 9:1, 9:2, 7:1, 2:1");
    const { model: a, ids } = insertLines(m, { after: say.id }, ['  message "Come again!"']);
    expect(toSource(a)).toBe(HAMLET.replace("  buy 9:1, 9:2, 7:1, 2:1\n", '  buy 9:1, 9:2, 7:1, 2:1\n  message "Come again!"\n'));
    expect(stepById(a, ids[0])?.kind).toBe("instruction");
    expect(stepById(a, say.id)?.text).toBe(say.text);
    expect(a.steps.filter((s) => m.steps.some((o) => o.id === s.id)).map((s) => s.text)).toEqual(m.steps.map((s) => s.text));
    const b = deleteSteps(a, ids);
    expect(toSource(b)).toBe(HAMLET);
    // move the lantern's message above its flag check
    const check = find(m, "if 9, @lantern_lit");
    const cold = m.steps[m.steps.indexOf(check) + 1];
    const c = moveSteps(m, [cold.id], { before: check.id });
    expect(added(HAMLET, toSource(c))).toEqual([]);
    expect(toSource(c).indexOf(cold.text)).toBeLessThan(toSource(c).indexOf("if 9, @lantern_lit"));
    const d = replaceLine(m, check.id, "  if 10, @lantern_lit");
    expect(added(HAMLET, toSource(d))).toEqual(["  if 10, @lantern_lit"]);
    for (const x of [a, b, c, d]) expect(() => assemble(toSource(x))).not.toThrow();
  });

  it("changes one operand's characters only", () => {
    const src = '.events 0\n  loadmap 0x1, 2, 3, 4   ; go\n  say 1, "Hello"\n  buy 9:1, 7:1 ; shop\n  goto @x\n@x:\n@y:\n  callback\n';
    let m = parseScript(src);
    const [load, say, buy, go] = instructions(m);
    m = setOperand(m, load.id, 2, 10);
    m = setOperand(m, say.id, 1, 'Say "hi"');
    m = setOperand(m, buy.id, 0, [
      [9, 2],
      [14, 1],
    ]);
    m = setOperand(m, go.id, 0, "y");
    expect(toSource(m)).toBe('.events 0\n  loadmap 0x1, 2, 10, 4   ; go\n  say 1, "Say \\"hi\\""\n  buy 9:2, 14:1 ; shop\n  goto @y\n@x:\n@y:\n  callback\n');
    expect(() => assemble(toSource(m))).not.toThrow();
    expect(() => setOperand(m, load.id, 0, "x")).toThrow();
  });

  it("renames a label everywhere", () => {
    const m = renameLabel(parseScript(HAMLET), "elder", "talk_elder");
    const t = toSource(m);
    expect(t).toContain(".event 1 @talk_elder\n");
    expect(t).toContain("\n@talk_elder:\n");
    expect(added(HAMLET, t).length).toBe(2);
    expect(same(assemble(t), assemble(HAMLET))).toBe(true);
    expect(() => renameLabel(m, "done", "talk_elder")).toThrow(/exists/);
    // a jump target
    const n = renameLabel(parseScript(HAMLET), "done", "the_end");
    expect(same(assemble(toSource(n)), assemble(HAMLET))).toBe(true);
    expect(added(HAMLET, toSource(n))).toEqual(["  if 1, @the_end", "  usegoods 14, 1, @the_end", "@the_end:"]);
  });

  it("adds, repoints and removes events, raising the count", () => {
    const m = parseScript(GLADE);
    const a = addEvent(m, 45, "bridge", ['  message "A bridge."', "  callback"]);
    const t = toSource(a);
    expect(t).toContain(".events 45\n");
    expect(t).toContain(".event 41 @exit_west\n.event 45 @bridge\n");
    expect(t.endsWith('\n\n@bridge:\n  message "A bridge."\n  callback\n')).toBe(true);
    expect(parseGut(assemble(t)).events).toHaveLength(45);
    expect(() => addEvent(a, 45, "x")).toThrow(/already/);
    const b = setEventLabel(a, 45, "stone");
    expect(toSource(b)).toContain(".event 45 @stone\n");
    const c = removeEvent(b, 45);
    expect(toSource(c)).not.toContain(".event 45");
    expect(() => assemble(toSource(c))).not.toThrow();
    // an event before the others goes first
    expect(toSource(addEvent(m, 2, "stone"))).toContain(".event 1 @stone\n.event 2 @stone\n.event 41");
  });

  it("reports what would stop the text assembling", () => {
    const m = parseScript(HAMLET);
    const gone = deleteSteps(m, [find(m, "@done:").id]);
    const probs = modelProblems(gone);
    expect(probs.length).toBe(2);
    expect(probs.every((p) => p.message === "unknown label @done")).toBe(true);
    expect(() => assemble(toSource(gone))).toThrow(/unknown label @done/);
    const dup = insertLines(m, "end", ["@done:"]).model;
    expect(modelProblems(dup).map((p) => p.message)).toEqual(["duplicate label @done"]);
  });

  it("finds free names and numbers", () => {
    const m = parseScript(HAMLET);
    expect(uniqueLabel(m, "elder")).toBe("elder_2");
    expect(uniqueLabel(m, "talk to Ostra")).toBe("talk_to_Ostra");
    expect(freeId(m)).toBe(5);
    expect(freeMapEvent(m)).toBe(3);
    expect(freeMapEvent(parseScript(GLADE))).toBe(2);
  });

  it("adds a person who talks to the Hamlet", () => {
    const m = parseScript(HAMLET);
    const body = [instructionLine("facetoface", [0, 5]), instructionLine("say", [0, "Fine day!"]), "  callback"];
    const r = addPlacement(m, { kind: "person", resource: 2, x: 8, y: 8, body });
    expect([r.id, r.label]).toEqual([5, "talk_5"]);
    const expected = HAMLET.replace("  createbox 4, 2, 12, 6\n", "  createbox 4, 2, 12, 6\n  createnpc 5, 2, 8, 8\n").replace(".event 4 @lantern\n", ".event 4 @lantern\n.event 5 @talk_5\n") + '\n@talk_5:\n  facetoface 0, 5\n  say 0, "Fine day!"\n  callback\n';
    expect(toSource(r.model)).toBe(expected);
    const bin = assemble(expected);
    const g = parseGut(bin);
    expect(g.events[4]).toBeGreaterThan(0);
    expect(modelProblems(r.model)).toEqual([]);
    // an object, with the default event
    const o = addPlacement(r.model, { kind: "object", resource: 1, x: 3, y: 3 });
    expect(o.id).toBe(6);
    expect(added(expected, toSource(o.model)).filter(Boolean).sort()).toEqual(["  createbox 6, 1, 3, 3", ".event 6 @use_6", "@use_6:", "  callback"].sort());
    expect(() => assemble(toSource(o.model))).not.toThrow();
  });

  it("adds a tile event to the Glade", () => {
    const m = parseScript(GLADE);
    const r = addTileEvent(m, { body: [instructionLine("message", ["An old sign."]), "  callback"] });
    expect([r.mapEvent, r.label]).toEqual([2, "tile_2"]);
    const expected = GLADE.replace(".events 41\n", ".events 42\n").replace(".event 41 @exit_west\n", ".event 41 @exit_west\n.event 42 @tile_2\n") + '\n@tile_2:\n  message "An old sign."\n  callback\n';
    expect(toSource(r.model)).toBe(expected);
    expect(parseGut(assemble(expected)).events).toHaveLength(42);
  });

  it("adds a person to a disassembled script (the blank game's)", () => {
    const blank = blankProject().entries.find((e) => e.resType === 1)!;
    const src = disassemble(blank.data);
    const r = addPlacement(parseScript(src), { kind: "person", resource: 1, x: 10, y: 6 });
    const t = toSource(r.model);
    expect(added(src, t).filter(Boolean).sort()).toEqual(["  createnpc 1, 1, 10, 6", ".event 1 @talk_1", "@talk_1:", "  facetoface 0, 1", "  callback"].sort());
    expect(t.indexOf("createnpc")).toBeGreaterThan(t.indexOf("createactor"));
    expect(t.indexOf(".event 1 @talk_1")).toBeGreaterThan(t.indexOf(".events 40"));
    expect(() => assemble(t)).not.toThrow();
  });

  it("keeps every template script assembling through a set of edits", () => {
    for (const [name, src] of SCRIPTS) {
      let m = parseScript(src);
      const first = instructions(m)[0];
      m = insertLines(m, { before: first.id }, ["  fightdisenable", "  ; a note"]).model;
      m = addTileEvent(m).model;
      m = addPlacement(m, { kind: "object", resource: 1, x: 2, y: 2 }).model;
      const say = instructions(m).find((s) => s.op.name === "say" || s.op.name === "message");
      if (say) m = setOperand(m, say.id, say.op.name === "say" ? 1 : 0, "Changed text");
      const moved = instructions(m).find((s) => s.op.name === "setscenename");
      if (moved) m = moveSteps(m, [moved.id], "end");
      m = deleteSteps(m, [instructions(m)[0].id]);
      expect(modelProblems(m), name).toEqual([]);
      expect(() => assemble(toSource(m)), name).not.toThrow();
      // the untouched lines are all still there
      const now = toSource(m).split("\n");
      for (const l of src.split("\n")) if (l !== say?.text && !/^\.events/.test(l)) expect(now, `${name}: ${l}`).toContain(l);
    }
  });

  it("keeps CRLF line breaks in new lines", () => {
    const src = HAMLET.replace(/\n/g, "\r\n");
    const m = parseScript(src);
    expect(m.eol).toBe("\r\n");
    expect(toSource(m)).toBe(src);
    const r = addTileEvent(m);
    expect(toSource(r.model).split("\n").slice(0, -1).every((l) => l.endsWith("\r"))).toBe(true);
    expect(() => assemble(toSource(r.model))).not.toThrow();
  });
});

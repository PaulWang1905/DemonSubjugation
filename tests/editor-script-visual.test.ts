// The Visual script view's pure logic (src/editor/ui/scriptVisualLogic.ts)
// and the text boxes as the engine lays them out (format/dialogueBox.ts).
import { describe, expect, it } from "vitest";
import { scriptSource } from "../src/editor/format/gut";
import { commandInfo, COMMANDS } from "../src/editor/format/commands";
import { layoutChoice, layoutMessage, layoutSay, layoutShowgut, textBytes } from "../src/editor/format/dialogueBox";
import { splitWords } from "../src/editor/format/scriptHelp";
import { SAY_PLAIN, SAY_WITH_PORTRAIT } from "../src/editor/format/text";
import { outline, parseScript, toSource, type InstructionStep, type OutlineNode, type ScriptModel } from "../src/editor/format/scriptModel";
import { buildWorld, scriptNames } from "../src/editor/format/world";
import { TextRender } from "../src/engine/fmj/graphics/TextRender";
import { lanternPath, lanternPathSources } from "../src/editor/template/demo";
import { silentBell, silentBellSources } from "../src/editor/template/silentBell";
import { blankProject } from "../src/editor/template/blank";
import {
  commitModel,
  controlFor,
  deleteNode,
  dropNode,
  duplicateNode,
  eventEntries,
  eventTitle,
  insertCommand,
  insertionPoint,
  moveNode,
  parseOperandNumber,
  startTitle,
  startingValues,
  wrapStep,
} from "../src/editor/ui/scriptVisualLogic";

const templates = () =>
  [
    ["blank", blankProject(), {} as Record<string, string>],
    ["lantern", lanternPath(), lanternPathSources()],
    ["bell", silentBell(), silentBellSources()],
  ] as const;

/** Every script of the templates: [name, key, text, type, index]. */
function scripts(): [string, string, string, number, number][] {
  const out: [string, string, string, number, number][] = [];
  for (const [name, a, sources] of templates()) {
    for (const e of a.entries.filter((x) => x.resType === 1)) {
      const key = `1-${e.type}-${e.index}`;
      out.push([name, key, scriptSource(e.data, (sources as Record<string, string>)[key]), e.type, e.index]);
    }
  }
  return out;
}

/** Every say / message text of the templates. */
function dialogueTexts(): { name: string; text: string; portrait: boolean }[] {
  const out: { name: string; text: string; portrait: boolean }[] = [];
  for (const [, , text] of scripts()) {
    for (const s of parseScript(text).steps) {
      if (s.kind !== "instruction") continue;
      if (s.op.name === "say") out.push({ name: "say", text: String(s.values[1]), portrait: s.values[0] !== 0 });
      if (s.op.name === "message") out.push({ name: "message", text: String(s.values[0]), portrait: false });
    }
  }
  return out;
}

const blocks = (nodes: OutlineNode[]): Extract<OutlineNode, { kind: "block" }>[] =>
  nodes.flatMap((n) => (n.kind === "block" ? [n, ...n.arms.flatMap((a) => (a.nodes ? blocks(a.nodes) : []))] : []));

describe("dialogue boxes as the engine lays them out", () => {
  it("breaks say lines where the engine's own layout does (TextRender.deviceLineEnds)", () => {
    const texts = dialogueTexts().filter((t) => t.name === "say");
    expect(texts.length).toBeGreaterThan(20);
    const extra = ["", "Hi", "一二三四五六七八九十一二三四五六七八九十", "Mixed 中文 and English words that run long", "x".repeat(200)];
    for (const t of [...texts, ...extra.flatMap((text) => [{ text, portrait: true }, { text, portrait: false }])]) {
      const l = layoutSay(t.text, t.portrait);
      const rows = t.portrait ? [{ left: 44, right: 145 }, { left: 14, right: 145 }] : [{ left: 14, right: 145 }, { left: 14, right: 145 }];
      const b = textBytes(t.text);
      const ends = TextRender.deviceLineEnds(Int8Array.from(b), rows);
      const len = b.indexOf(0);
      expect(l.lineStarts).toEqual(ends.filter((e) => e < len));
      // and nothing is lost: every byte up to the NUL is on a page
      const drawn = new Set(l.pages.flatMap((p) => p.glyphs.map((g) => g.at)));
      for (let i = 0; i < b.length - 1; i++) if (b[i] < 0x80 || b[i] >= 0xa1) expect(drawn.has(i) || (i > 0 && b[i - 1] >= 0xa1 && drawn.has(i - 1))).toBe(true);
    }
  });

  it("holds 11 then 15 letters with a portrait, 15 without", () => {
    const l = layoutSay("a".repeat(60), true);
    const rows = (p: number) => [...new Set(l.pages[p].glyphs.map((g) => g.y))].map((y) => l.pages[p].glyphs.filter((g) => g.y === y).length);
    expect(rows(0)).toEqual([11, 15]);
    expect(l.pages.length).toBe(3); // 26 + 26 + 8
    expect(l.pages[0].glyphs[0]).toMatchObject({ x: 44, y: 58 });
    const plain = layoutSay("a".repeat(30), false);
    expect(plain.pages).toHaveLength(1);
    expect(plain.pages[0].glyphs[0]).toMatchObject({ x: 14, y: 58 });
    expect([...new Set(plain.pages[0].glyphs.map((g) => g.y))]).toEqual([58, 76]);
  });

  it("finds the same split words as the script check (scriptHelp.splitWords)", () => {
    for (const t of dialogueTexts()) {
      if (t.name !== "say" || /[^\x20-\x7e]/.test(t.text)) continue;
      const l = layoutSay(t.text, t.portrait);
      expect(l.split.map((w) => w.text)).toEqual(splitWords(t.text, t.portrait ? SAY_WITH_PORTRAIT : SAY_PLAIN));
    }
    const l = layoutSay("Your adventure starts here!", true);
    expect(l.split.map((w) => w.text)).toEqual(["advent|ure", "here|!"]);
  });

  it("sizes message boxes by the text's length and says when text is cut", () => {
    const one = layoutMessage("Found a Herb!");
    expect(one.lines).toBe(1);
    expect(one.textY).toBe(39);
    const two = layoutMessage("The chest is   empty.         ");
    expect(two.lines).toBe(2);
    expect(two.cutFrom).toBeNull();
    expect([...new Set(two.page.glyphs.map((g) => g.y))]).toEqual([31, 47]);
    const long = layoutMessage("word ".repeat(40));
    expect(long.lines).toBe(5);
    expect(long.cutFrom).not.toBeNull();
  });

  it("lays out a choice box as cmd_choice does", () => {
    const c = layoutChoice("Yes", "No");
    expect(c).toMatchObject({ x: 65, y: 29, w: 30, h: 38 });
    expect(c.first.map((g) => String.fromCharCode(g.code)).join("")).toBe("Yes");
    expect(c.second[0]).toMatchObject({ x: 68, y: 48 });
  });

  it("wraps scrolling text at 160 pixels", () => {
    const g = layoutShowgut("x".repeat(25));
    expect(g.rows.map((r) => r.length)).toEqual([20, 6]); // with the NUL's blank glyph
  });
});

describe("events in words", () => {
  it("names the start code and the events", () => {
    expect(startTitle("1-1-1")).toBe("When the game starts");
    expect(startTitle("1-1-2")).toBe("When this script begins");
    const a = silentBell();
    const world = buildWorld(a, silentBellSources());
    const ctx = { script: "1-1-1", world, names: scriptNames(world, a, "1-1-1") };
    const model = world.scripts.get("1-1-1")!.model;
    const list = eventEntries(model, ctx);
    expect(list[0]).toMatchObject({ key: "start", kind: "start", title: "When the game starts" });
    const elder = list.find((e) => e.events.includes(1))!;
    expect(elder.title).toMatch(/^Talking to .+ \(#1\)$/);
    expect(elder.steps).toBeGreaterThan(5);
    const chest = list.find((e) => e.events.includes(6))!;
    expect(chest.kind).toBe("object");
    expect(chest.title).toMatch(/^Examining .+ \(#6\)$/);
    const east = list.find((e) => e.events.includes(41))!;
    expect(east.kind).toBe("tile");
    expect(east.title).toMatch(/^Stepping on tile event 1 \(map BELLHAVEN \d+,\d+( and \d+ more)?\)$/);
    // every event of the table is listed once
    expect(list.flatMap((e) => e.events).sort((x, y) => x - y)).toEqual(model.events.map((e) => e.number));
  });

  it("says when nobody is placed or a tile is not painted", () => {
    const a = lanternPath();
    const world = buildWorld(a, lanternPathSources());
    const t = eventTitle(30, { script: "1-1-1", world });
    expect(t.title).toBe("Talking to person or object #30");
    expect(eventTitle(40 + 99, { script: "1-1-1", world }).title).toBe("Stepping on tile event 99 (not on the map yet)");
  });
});

describe("operand controls", () => {
  const ctl = (name: string, k: number) => controlFor(commandInfo(name)!, k);
  it("maps operands to controls", () => {
    expect(ctl("say", 0)).toEqual({ kind: "resource", resType: 11, types: [1], allowNone: true });
    expect(ctl("say", 1)).toEqual({ kind: "text", multiline: true });
    expect(ctl("gaingoods", 0)).toEqual({ kind: "hidden" });
    expect(ctl("gaingoods", 1)).toEqual({ kind: "resource", resType: 6, allowNone: false, pairType: 0 });
    expect(ctl("loadmap", 1)).toMatchObject({ kind: "resource", resType: 2, pairType: 0 });
    expect(ctl("createnpc", 0)).toEqual({ kind: "npc", allowPlayer: false });
    expect(ctl("facetoface", 0)).toEqual({ kind: "npc", allowPlayer: true });
    expect(ctl("createnpc", 1)).toEqual({ kind: "resource", resType: 3, types: [2], allowNone: false });
    expect(ctl("enterfight", 1)).toEqual({ kind: "resource", resType: 3, types: [3], allowNone: true });
    expect(ctl("enterfight", 13)).toEqual({ kind: "label" });
    expect(ctl("setevent", 0)).toEqual({ kind: "flag" });
    expect(ctl("set", 0)).toEqual({ kind: "variable" });
    expect(ctl("npcstep", 1)).toMatchObject({ kind: "select" });
    expect(ctl("npcmovemod", 1)).toMatchObject({ kind: "select" });
    expect(ctl("timemsg", 0)).toMatchObject({ kind: "number", unit: "1/100 s", zero: "until a key is pressed" });
    expect(ctl("choice", 0)).toEqual({ kind: "text", multiline: false });
    expect(ctl("buy", 0)).toEqual({ kind: "shop" });
    // every operand of every instruction has one
    for (const c of COMMANDS) c.operands.forEach((_, k) => expect(controlFor(c, k).kind).toBeTruthy());
  });

  it("checks typed numbers against the operand's range", () => {
    const flag = commandInfo("setevent")!.operands[0];
    expect(parseOperandNumber("12", flag)).toEqual({ value: 12 });
    expect(parseOperandNumber("0", flag)).toEqual({ error: "Flag must be 1-2400" });
    expect(parseOperandNumber("3000", flag)).toEqual({ error: "Flag must be 1-2400" });
    expect(parseOperandNumber("1.5", flag)).toMatchObject({ error: expect.stringContaining("whole number") });
    expect(parseOperandNumber(" 7 ", commandInfo("set")!.operands[1])).toEqual({ value: 7 });
  });
});

/** A template script's model and its group for an event. */
function lantern(n = 1): { model: ScriptModel; group: ReturnType<typeof outline> extends unknown ? ScriptModel["groups"][number] : never } {
  const model = parseScript(lanternPathSources()["1-1-1"]);
  return { model, group: model.groups.find((g) => g.events.includes(n))! };
}
const ok = (m: ScriptModel, type = 1, index = 1) => {
  const c = commitModel(m, type, index);
  if (!c.ok) throw new Error(c.message);
  return c;
};
const findStep = (m: ScriptModel, f: (s: InstructionStep) => boolean) => m.steps.find((s): s is InstructionStep => s.kind === "instruction" && f(s))!;

describe("adding steps", () => {
  it("adds every instruction to every event of every template, and it assembles", () => {
    for (const [name, key, text, type, index] of scripts()) {
      const model = parseScript(text);
      for (const group of model.groups) {
        for (const c of COMMANDS) {
          const pos = insertionPoint(model, group, null);
          const r = insertCommand(model, group, c.name, pos);
          const res = commitModel(r.model, type, index);
          if (!res.ok) throw new Error(`${name} ${key} ${group.label}: ${c.name}: ${res.message}`);
          expect(r.model.steps.find((s) => s.id === r.id)?.kind).toBe("instruction");
        }
      }
    }
  });

  it("goes after the selected step, or before it when the code ends there", () => {
    const { model, group } = lantern(3); // the chest
    const give = findStep(model, (s) => s.op.name === "gaingoods");
    expect(insertionPoint(model, group, give.id)).toEqual({ after: give.id });
    const end = model.steps.slice(group.from, group.to).find((s) => s.kind === "instruction" && s.op.name === "callback")!;
    expect(insertionPoint(model, group, end.id)).toEqual({ before: end.id });
    // nothing selected: before the event's last End
    expect(insertionPoint(model, group, null)).toEqual({ before: end.id });
  });

  it("adds a choice whose second answer is a nested arm", () => {
    const { model, group } = lantern(2); // the merchant
    const say = findStep(model, (s) => s.op.name === "say" && String(s.values[1]).startsWith("Tam"));
    const r = insertCommand(model, group, "choice", { after: say.id });
    ok(r.model);
    const g = r.model.groups.find((x) => x.events.includes(2))!;
    const b = blocks(outline(r.model, g)).find((x) => x.block === "choice")!;
    expect(b.arms.map((a) => a.title)).toEqual(["“Yes”", "“No”"]);
    expect(b.arms[1].nodes?.filter((n) => n.step.kind !== "blank").map((n) => n.step.kind === "instruction" && n.step.op.name)).toEqual(["callback"]);
    // the rest of the event is the first answer
    expect(b.arms[0].nodes?.some((n) => n.step.kind === "instruction" && n.step.op.name === "buy")).toBe(true);
    // untouched lines are as they were
    const before = toSource(model).split("\n");
    const after = toSource(r.model).split("\n");
    for (const l of before) expect(after).toContain(l);
  });

  it("adds a battle: won goes on with the event, lost ends the game", () => {
    const { model, group } = lantern(2);
    const say = findStep(model, (s) => s.op.name === "say" && String(s.values[1]).startsWith("Tam"));
    const r = insertCommand(model, group, "enterfight", { after: say.id });
    ok(r.model);
    const g = r.model.groups.find((x) => x.events.includes(2))!;
    const b = blocks(outline(r.model, g)).find((x) => x.block === "battle")!;
    expect(b.arms.map((a) => a.title)).toEqual(["If won", "If lost"]);
    expect(b.arms[0].nodes?.some((n) => n.step.kind === "instruction" && n.step.op.name === "buy")).toBe(true);
    expect(b.arms[1].nodes?.filter((n) => n.step.kind !== "blank").map((n) => n.step.kind === "instruction" && n.step.op.name)).toEqual(["gameover"]);
    // deleting the battle keeps the code after it (the win) and takes the lose arm away
    const res = deleteNode(r.model, g, r.id);
    if (!("model" in res)) throw new Error(res.error);
    const t = ok(res.model).text;
    expect(t).not.toMatch(/enterfight|gameover|@won|@lost/);
    expect(t).toContain("buy 9:1");
  });

  it("adds a menu with an arm per answer", () => {
    const { model, group } = lantern(2);
    const r = insertCommand(model, group, "menu", insertionPoint(model, group, null));
    ok(r.model);
    const g = r.model.groups.find((x) => x.events.includes(2))!;
    const b = blocks(outline(r.model, g)).find((x) => x.block === "menu")!;
    expect(b.arms.map((a) => a.title)).toEqual(["“Yes”", "“No”"]);
    expect(b.step.values[0]).toBe(200);
  });

  it("starts steps from the catalog's examples", () => {
    // new dialogue is short and neutral: it fits its box without a warning
    expect(startingValues("say")).toEqual([0, "Hello!"]);
    expect(startingValues("message")).toEqual(["..."]);
    expect(startingValues("gaingoods")).toEqual([9, 1]);
    expect(startingValues("choice")).toEqual(["Yes", "No", "label"]);
  });
});

describe("moving, duplicating, deleting", () => {
  it("moves a step up and down within its event, never above the event's label", () => {
    const { model, group } = lantern(3);
    const [g1, g2] = model.steps.filter((s): s is InstructionStep => s.kind === "instruction" && s.op.name === "gaingoods");
    const up = moveNode(model, group, g2.id, -1)!;
    ok(up);
    const order = (m: ScriptModel) => m.steps.filter((s) => s.id === g1.id || s.id === g2.id).map((s) => s.id);
    expect(order(up)).toEqual([g2.id, g1.id]);
    expect(moveNode(up, up.groups.find((x) => x.events.includes(3))!, g1.id, 1)).not.toBeNull();
    // the first step cannot go above @chest:
    const first = model.steps[group.from + 1];
    expect(first.label).toBeUndefined();
    const firstCard = outline(model, group).filter((n) => n.step.kind !== "blank")[1];
    expect(moveNode(model, group, firstCard.step.id, -1)).toBeNull();
  });

  it("moves a block with its nested code, and drops steps before or after others", () => {
    const { model, group } = lantern(2);
    const say = findStep(model, (s) => s.op.name === "say" && String(s.values[1]).startsWith("Tam"));
    const r = insertCommand(model, group, "if", { after: say.id });
    const g = r.model.groups.find((x) => x.events.includes(2))!;
    const moved = moveNode(r.model, g, r.id, -1)!;
    ok(moved);
    const buy = findStep(moved, (s) => s.op.name === "buy");
    const g2 = moved.groups.find((x) => x.events.includes(2))!;
    const dropped = dropNode(moved, g2, buy.id, say.id, "before")!;
    ok(dropped);
    const ids = dropped.steps.map((s) => s.id);
    expect(ids.indexOf(buy.id)).toBe(ids.indexOf(say.id) - 1);
  });

  it("duplicates a block with fresh labels", () => {
    const { model, group } = lantern(2);
    const say = findStep(model, (s) => s.op.name === "say" && String(s.values[1]).startsWith("Tam"));
    const r = insertCommand(model, group, "choice", { after: say.id });
    const g = r.model.groups.find((x) => x.events.includes(2))!;
    const d = duplicateNode(r.model, g, say.id)!;
    ok(d.model);
    const c = findStep(r.model, (s) => s.op.name === "choice");
    const dd = duplicateNode(r.model, g, c.id)!;
    const res = ok(dd.model);
    expect(res.text.match(/@answer_2(_\d+)?:/g)?.length).toBe(2);
  });

  it("deletes a block with its arms, and refuses to delete a label others go to", () => {
    const { model, group } = lantern(2);
    const say = findStep(model, (s) => s.op.name === "say" && String(s.values[1]).startsWith("Tam"));
    const r = insertCommand(model, group, "choice", { after: say.id });
    const g = r.model.groups.find((x) => x.events.includes(2))!;
    const res = deleteNode(r.model, g, r.id);
    expect("model" in res && toSource(res.model)).toBe(toSource(model).replace(/\n$/, "\n"));
    // @done (lantern's shared callback) is reached from elsewhere
    const m = parseScript(lanternPathSources()["1-1-1"]);
    const exit = m.groups.find((x) => x.events.includes(41))!;
    const done = m.steps.find((s) => s.label === "done")!;
    const refused = deleteNode(m, exit, done.id);
    expect(refused).toMatchObject({ error: expect.stringContaining("the label done") });
    // and the event's own label
    const label = m.steps.find((s) => s.label === "exit_east")!;
    expect(deleteNode(m, exit, label.id)).toMatchObject({ error: expect.stringContaining("starts this event") });
  });
});

describe("committing", () => {
  it("refuses an edit that does not assemble", () => {
    const { model } = lantern(1);
    const say = findStep(model, (s) => s.op.name === "say");
    const bad = parseScript(toSource(model).replace(say.text, "  goto @nowhere"));
    const c = commitModel(bad, 1, 1);
    expect(c.ok).toBe(false);
    expect(!c.ok && c.message).toMatch(/nowhere/);
    expect(commitModel(model, 1, 2)).toMatchObject({ ok: false, message: expect.stringContaining(".gut") });
  });

  it("re-wraps one say step so no word is split", () => {
    const m = parseScript(blankProject().entries.filter((e) => e.resType === 1).map((e) => scriptSource(e.data))[0].replace(/say 1, ".*"/, 'say 1, "Your adventure starts here, brave one!"'));
    const say = findStep(m, (s) => s.op.name === "say");
    expect(layoutSay(String(say.values[1]), true).split.length).toBeGreaterThan(0);
    const w = wrapStep(m, say.id)!;
    ok(w);
    const after = findStep(w, (s) => s.id === say.id);
    expect(layoutSay(String(after.values[1]), true).split).toEqual([]);
    expect(wrapStep(w, say.id)).toBeNull();
    // other lines untouched
    expect(toSource(w).split("\n").filter((l) => !l.includes("say "))).toEqual(toSource(m).split("\n").filter((l) => !l.includes("say ")));
  });
});

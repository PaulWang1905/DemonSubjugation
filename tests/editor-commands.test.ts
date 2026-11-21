// The instruction catalog for authors (src/editor/format/commands.ts):
// complete, consistent with the assembler, the help and the project check,
// and rendering statements as sentences.
import { describe, expect, it } from "vitest";
import { assemble, OPS, statements } from "../src/editor/format/gut";
import {
  ATTRIBUTES_ADD,
  ATTRIBUTES_SET,
  ATTRIBUTES_TEST,
  CATEGORIES,
  commandInfo,
  COMMANDS,
  commandsIn,
  defaultValues,
  formatInstruction,
  operandRefs,
  quoteText,
  searchCommands,
  sentence,
  valuesFromToks,
  type NameResolver,
} from "../src/editor/format/commands";
import { opHelp } from "../src/editor/format/scriptHelp";
import { SCRIPT_REFS } from "../src/editor/format/validate";
import { lanternPath } from "../src/editor/template/demo";
import { projectNames } from "../src/editor/format/world";
import { emptyNotes, setFlagNote, setResourceNote } from "../src/editor/format/notes";

/** A script around one line, with the labels it jumps to defined. */
function wrap(line: string): string {
  const labels = [...new Set([...line.matchAll(/@(\w+)/g)].map((m) => m[1]))];
  return `.gut 1 1\n.desc "t"\n.events 0\n  ${line}\n  callback\n${labels.map((l) => `@${l}:\n  callback`).join("\n")}\n`;
}

describe("the catalog", () => {
  it("has every instruction once, in opcode order, with the assembler's operands", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual(OPS.map((o) => o.name));
    expect(COMMANDS).toHaveLength(80);
    for (const c of COMMANDS) {
      const spec = OPS.find((o) => o.name === c.name)!;
      expect(c.code).toBe(spec.code);
      expect(c.operands.length, c.name).toBe(spec.args.length);
      c.operands.forEach((o, k) => {
        const kind = spec.args[k];
        if (kind === "addr") expect(o.kind, `${c.name} ${o.key}`).toBe("label");
        else if (kind === "str") expect(o.kind, `${c.name} ${o.key}`).toBe("text");
        else if (kind === "buy") expect(o.kind).toBe("shopList");
        else expect(["label", "text", "shopList"], `${c.name} ${o.key}`).not.toContain(o.kind);
      });
    }
  });

  it("puts every instruction in a listed category, and every category has some", () => {
    for (const c of COMMANDS) expect(CATEGORIES, c.name).toContain(c.category);
    for (const cat of CATEGORIES) expect(commandsIn(cat).length, cat).toBeGreaterThan(0);
    expect(CATEGORIES.flatMap((cat) => commandsIn(cat)).length).toBe(80);
    // the ones without effect are all under Other
    for (const c of COMMANDS.filter((x) => x.noEffect)) expect(c.category).toBe("Other");
    expect(COMMANDS.filter((x) => x.noEffect).map((x) => x.name).sort()).toEqual(
      ["actorevent", "actormove", "actorspeed", "mapevent", "music", "screena", "screenr", "setarmstoss", "setfightmiss"].sort(),
    );
  });

  it("gives every operand a unique key, a label, help, and every template only known keys", () => {
    for (const c of COMMANDS) {
      const keys = c.operands.map((o) => o.key);
      expect(new Set(keys).size, c.name).toBe(keys.length);
      for (const o of c.operands) {
        expect(o.label, `${c.name}.${o.key}`).toBeTruthy();
        expect(o.help, `${c.name}.${o.key}`).toBeTruthy();
        if (o.values) for (const [v] of o.values) expect(v >= (o.min ?? 0) && v <= (o.max ?? 65535), `${c.name}.${o.key} ${v}`).toBe(true);
        if (o.kind === "label") expect(o.when, `${c.name}.${o.key}`).toBeTruthy();
      }
      for (const t of [c.sentence, c.sentenceIfZero?.sentence ?? ""]) {
        for (const m of t.matchAll(/\{(\w+)\}/g)) expect([...keys, "monsters"], `${c.name}: ${m[1]}`).toContain(m[1]);
      }
      expect(c.title).toBeTruthy();
      expect(c.help).toBeTruthy();
    }
  });

  it("links the halves of type, index pairs", () => {
    let pairs = 0;
    for (const c of COMMANDS) {
      c.operands.forEach((o, k) => {
        if (!o.pair) return;
        pairs++;
        const other = c.operands[o.pair.partner];
        expect(other.pair, `${c.name}.${o.key}`).toEqual({ role: o.pair.role === "type" ? "index" : "type", partner: k });
        expect(other.kind).toBe(o.kind);
        if (o.pair.role === "index") expect(o.ref?.type).toEqual({ operand: o.pair.partner });
      });
    }
    // loadmap, startchapter, callchapter, movie, learnmagic and the five item instructions
    expect(pairs).toBe(2 * 10);
  });

  it("knows every reference the project check knows", () => {
    for (const [name, specs] of Object.entries(SCRIPT_REFS)) {
      const c = commandInfo(name)!;
      for (const r of specs) {
        const o = c.operands[r.arg];
        expect(o.ref, `${name} operand ${r.arg}`).toBeDefined();
        expect(o.ref!.resType).toBe(r.resType);
        expect(o.ref!.type).toEqual(typeof r.type === "number" ? r.type : { operand: r.type.arg });
        expect(o.ref!.zeroNone, `${name} operand ${r.arg}`).toBe(r.zeroOk ?? true);
      }
    }
    // and more: every party member operand refers to its character
    expect(commandInfo("resumeactorhp")!.operands[0].ref).toEqual({ resType: 3, type: 1, zeroNone: false });
  });

  it("names as many operands as the script help", () => {
    for (const c of COMMANDS) {
      const h = opHelp(c.name)!;
      expect(h, c.name).toBeDefined();
      expect(c.operands.length, c.name).toBe(h.args.length);
    }
  });

  it("follows the engine's numbering for attributes, directions and movement", () => {
    expect(ATTRIBUTES_TEST.find((x) => x[0] === 23)?.[1]).toBe("max HP");
    expect(ATTRIBUTES_SET.find((x) => x[0] === 15)?.[1]).toBe("max HP");
    expect(ATTRIBUTES_ADD.find((x) => x[0] === 10)?.[1]).toBe("max HP");
    expect(commandInfo("npcstep")!.operands[1].values).toEqual([
      [0, "north"],
      [1, "east"],
      [2, "south"],
      [3, "west"],
    ]);
    const states = commandInfo("npcmovemod")!.operands[1].values!;
    expect(states.find((x) => x[0] === 1)?.[1]).toBe("walk around");
    expect(states.find((x) => x[0] === 4)?.[1]).toBe("animate in place");
    expect(commandInfo("event")!.flow).toBe("jump");
    expect(commandInfo("enterfight")!.flow).toBe("battle");
    expect(commandInfo("startchapter")!.flow).toBe("end");
    expect(commandInfo("choice")!.flow).toBe("branch");
  });
});

describe("writing instructions", () => {
  it("writes every instruction's defaults and example so they assemble", () => {
    for (const c of COMMANDS) {
      const line = formatInstruction(c.name, defaultValues(c.name));
      expect(() => assemble(wrap(line)), line).not.toThrow();
      if (c.example) expect(() => assemble(wrap(c.example!)), c.example).not.toThrow();
    }
  });

  it("reads an example's operands back to the same line", () => {
    for (const c of COMMANDS) {
      if (!c.example) continue;
      const [s] = statements(c.example);
      const values = valuesFromToks(s.op, s.toks)!;
      expect(values, c.example).not.toBeNull();
      expect(formatInstruction(c.name, values)).toBe(c.example);
    }
  });

  it("quotes text so the assembler reads it back", () => {
    expect(quoteText('He said "hi" \\ bye\nnext')).toBe('"He said \\"hi\\" \\\\ bye\\nnext"');
    const line = formatInstruction("message", ['A "quote"']);
    const [s] = statements(line);
    expect(valuesFromToks(s.op, s.toks)).toEqual(['A "quote"']);
    expect(formatInstruction("buy", [[[9, 1], [7, 2]]])).toBe("buy 9:1, 7:2");
    expect(formatInstruction("goto", ["done"])).toBe("goto @done");
    expect(formatInstruction("goto", [123])).toBe("goto #123");
    expect(() => formatInstruction("say", [1])).toThrow(/2 operand/);
  });
});

describe("references and sentences", () => {
  it("lists the resources a statement refers to", () => {
    expect(operandRefs("gaingoods", [9, 1])).toEqual([{ resType: 6, type: 9, index: 1, operand: 1 }]);
    expect(operandRefs("loadmap", [1, 2, 3, 4])).toEqual([{ resType: 2, type: 1, index: 2, operand: 1 }]);
    expect(operandRefs("say", [0, "x"])).toEqual([]);
    expect(operandRefs("say", [3, "x"])).toEqual([{ resType: 11, type: 1, index: 3, operand: 0 }]);
    expect(operandRefs("buy", [[[9, 1], [7, 2]]]).map((r) => [r.type, r.index, r.pair])).toEqual([
      [9, 1, 0],
      [7, 2, 1],
    ]);
    const fight = operandRefs("enterfight", [0, 3, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0, "lose", "win"]);
    expect(fight.map((r) => `${r.resType}-${r.type}-${r.index}`)).toEqual(["3-3-3", "11-4-1", "11-4-2", "11-4-3"]);
    expect(operandRefs("gutevent", [2, 3])).toEqual([{ resType: 1, type: 1, index: 2, operand: 0 }]);
  });

  it("renders statements in words, without names", () => {
    expect(sentence("gaingoods", [9, 1]).text).toBe("Give medicine 9-1");
    expect(sentence("if", [12, "done"]).text).toBe("If flag 12 is set, go to @done");
    expect(sentence("say", [0, "Hello  there"]).text).toBe("Say: “Hello there”");
    expect(sentence("say", [2, "Hi"]).text).toBe("portrait 2 says: “Hi”");
    expect(sentence("enterfight", [0, 3, 0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, "lose", "win"]).text).toBe("Battle with monster 3, monster 4; if won, go to @win; if lost, go to @lose");
    expect(sentence("initfight", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).text).toBe("Random battles with no monsters");
    expect(sentence("npcstep", [0, 3, 1]).text).toBe("the player turns west (frame 1)");
    expect(sentence("randrade", [250, "lucky"]).text).toBe("With a chance of 25%, go to @lucky");
    expect(sentence("timemsg", [150, "x"]).text).toBe("Message for 1.5 s: “x”");
    expect(sentence("seteventtimer", [41, 10]).text).toBe("Run event 41 after 5 s");
    expect(sentence("callback", []).text).toBe("End");
    expect(sentence("npcmovemod", [2, 4]).text).toBe("#2: animate in place");
    expect(sentence("attribtest", [1, 23, 50, "low", "high"]).text).toBe("Compare party member 1's max HP with 50: if less, go to @low; if greater, go to @high");
  });

  it("renders with a project's names, notes and per-script names", () => {
    const a = lanternPath();
    const notes = setResourceNote(setFlagNote(emptyNotes(), 12, { name: "gate open" }), "11-1-1", { name: "Mira" });
    const names: NameResolver = { ...projectNames(a, notes), npcId: (id) => (id === 1 ? "Ostra" : undefined) };
    expect(sentence("gaingoods", [9, 1], names).text).toBe("Give Herb");
    expect(sentence("loadmap", [1, 2, 1, 4], names).text).toBe("Go to GLADE, view from 1, 4");
    expect(sentence("if", [12, "x"], names).text).toBe("If “gate open” is set, go to @x");
    expect(sentence("say", [1, "Hi"], names).text).toBe("Mira says: “Hi”");
    expect(sentence("createnpc", [1, 1, 10, 6], names).text).toBe("Place Ostra at 10, 6 as Ostra (#1)");
    expect(sentence("facetoface", [0, 1], names).text).toBe("Ostra (#1) turns to the player");
    expect(sentence("buy", [[[9, 1], [7, 1]]], names).text).toBe("Open a shop selling Herb, Oak Sword");
    expect(sentence("enterfight", [0, 3, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0, "lose", "win"], names).text).toBe("Battle with Glade Wisp; if won, go to @win; if lost, go to @lose");
    const missing = sentence("gaingoods", [9, 77], names);
    expect(missing.text).toBe("Give medicine 9-77 (missing)");
    const part = missing.parts.find((p) => p.operand !== undefined)!;
    expect(part).toMatchObject({ operand: 1, kind: "item", missing: true, ref: { resType: 6, type: 9, index: 77 } });
  });

  it("finds instructions by what they do", () => {
    expect(searchCommands("give").slice(0, 2).map((c) => c.name)).toEqual(["gaingoods", "gainmoney"]);
    expect(searchCommands("battle").map((c) => c.name)).toContain("enterfight");
    expect(searchCommands("say")[0].name).toBe("say");
    expect(searchCommands("").some((c) => c.noEffect)).toBe(false);
    expect(searchCommands("music").map((c) => c.name)).toEqual(["music"]);
  });
});

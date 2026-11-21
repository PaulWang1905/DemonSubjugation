// The editor's side of three engine findings (round 2 of the new-author
// test): a yes/no question after dialogue, people who walk up and talk, and
// what the templates and snippets generate.
import { describe, expect, it } from "vitest";
import { layoutChoice } from "../src/editor/format/dialogueBox";
import { bareAnswers, checkDialogue, checkSpeakers, LEADER_SCREEN_ROW, ROWS_ABOVE_BOX, rowAboveBox, SAY_BOX_TOP, SNIPPETS } from "../src/editor/format/scriptHelp";
import { commandInfo } from "../src/editor/format/commands";
import { checkProject } from "../src/editor/format/validate";
import { blankProject } from "../src/editor/template/blank";
import { lanternPath } from "../src/editor/template/demo";
import { silentBell } from "../src/editor/template/silentBell";
import { layoutIssues } from "../src/editor/ui/DialoguePreview";
import { startingValues } from "../src/editor/ui/scriptVisualLogic";

describe("a question after dialogue (choice)", () => {
  it("knows answers that mean nothing without the question", () => {
    expect(bareAnswers("Yes", "No")).toBe(true);
    expect(bareAnswers("yes!", " no. ")).toBe(true);
    expect(bareAnswers("是", "否")).toBe(true);
    expect(bareAnswers("Rest (10 gold)", "Leave")).toBe(false);
    // 伏魔记's own: 取消 (cancel) with an answer that says what it does
    expect(bareAnswers("取消", "使用万能钥匙")).toBe(false);
  });

  it("warns in the project check and the preview, and says what to write", () => {
    const src = '@event1:\n  say 0, "Rest at the Gull Inn? 10 gold a night."\n  choice "Yes", "No", @no\n  callback\n@no:\n  callback';
    const w = checkDialogue(src);
    expect(w.filter((x) => x.message.startsWith("choice")).map((x) => x.line)).toEqual([3]);
    expect(w.find((x) => x.message.startsWith("choice"))!.message).toMatch(/question's box has closed/);
    expect(checkDialogue(src.replace('"Yes", "No"', '"Rest (10 gold)", "Leave"')).filter((x) => x.message.startsWith("choice"))).toEqual([]);
    expect(layoutIssues(layoutChoice("Yes", "No"), ["Yes", "No"]).join()).toMatch(/no longer sees/);
    expect(layoutIssues(layoutChoice("Rest (10 gold)", "Leave"), ["Rest (10 gold)", "Leave"])).toEqual([]);
  });

  it("generates answers that say what they do (a new step, the snippet, the catalog)", () => {
    const [a, b] = startingValues("choice");
    expect(bareAnswers(String(a), String(b))).toBe(false);
    const snippet = SNIPPETS.find((s) => s.label === "Yes / no question")!;
    expect(snippet.here).toMatch(/say 0, ".*\?"\n {2}choice/);
    expect(checkDialogue(snippet.here)).toEqual([]);
    expect(commandInfo("choice")!.example).not.toMatch(/"Yes"/);
    expect(commandInfo("choice")!.help).toMatch(/sees only them/);
  });

  it("the answers fit the device's box (19 letters at most)", () => {
    expect(layoutChoice("Rest (10 gold)", "Leave").overflow).toBe(false);
  });
});

describe("people who walk up and talk stand above the dialogue box", () => {
  it("measures the box from the engine: rows 0-2 are above it, the leader's row 3 is not", () => {
    expect(SAY_BOX_TOP).toEqual({ portrait: 50, plain: 55 });
    expect(ROWS_ABOVE_BOX).toBe(3);
    expect(ROWS_ABOVE_BOX * 16).toBeLessThanOrEqual(SAY_BOX_TOP.portrait);
    expect(LEADER_SCREEN_ROW).toBe(ROWS_ABOVE_BOX);
    expect(rowAboveBox({ x: 23, y: 8 })).toBe(10);
  });

  // the tester's road scene (Harbor Tale, COAST ROAD): the view from 23, 8
  // puts the leader on 27, 11; the traveller walked to 26, 11, beside them
  const scene = (to: string) =>
    [
      "@start:",
      "  loadmap 1, 2, 23, 8",
      "  createnpc 1, 4, 21, 11",
      "  if 3, @flag_set",
      `  move 1, ${to}`,
      '  say 0, "Traveller: Careful, friend. Monsters lurk in the cave to the west!"',
      "  move 1, 21, 11",
      "  deletenpc 1",
      "  setevent 3",
      "  callback",
      "@flag_set:",
      "  deletenpc 1",
      "  callback",
    ].join("\n");

  it("flags a person who stops where the box covers them, and says where to stop", () => {
    const w = checkSpeakers(scene("26, 11"));
    expect(w.map((x) => x.line)).toEqual([5]);
    expect(w[0].message).toMatch(/^move: person 1 stops at 26, 11, row 4 of the screen's 6/);
    expect(w[0].message).toMatch(/Stop them at 26, 10/);
    expect(checkSpeakers(scene("26, 10"))).toEqual([]);
    // off the screen, or not talking after: nothing to say
    expect(checkSpeakers(scene("40, 11"))).toEqual([]);
    expect(checkSpeakers("@start:\n  loadmap 1, 2, 23, 8\n  move 1, 26, 11\n  callback\n@event1:\n  say 0, \"Hi\"\n  callback")).toEqual([]);
  });

  it("the templates and the snippets have no such warnings", () => {
    for (const lib of [blankProject(), lanternPath(), silentBell()]) {
      const ps = checkProject(lib).filter((p) => /dialogue box covers|question's box/.test(p.message));
      expect(ps).toEqual([]);
    }
    for (const s of SNIPPETS) expect(checkSpeakers(s.here)).toEqual([]);
  });
});

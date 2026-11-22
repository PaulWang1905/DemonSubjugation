// The device player's key presses (src/app/deviceInput.ts) and the 4988's
// keys (src/bbk/keys.ts): what a tap, a hold and a release send, the keys
// printed beside others (Shift, then the key), and the OS's key table.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeviceInput, REPEAT_DELAY, REPEAT_RATE, type InputDevice } from "../src/app/deviceInput";
import { deviceKeys } from "../src/app/DeviceKeys";
import { Key, KEYBOARD, keyCode, pressCodes, SECOND } from "../src/bbk/keys";
import { KEY_CLASSES } from "../src/fulu/gui";

/** A device that records presses, with a key buffer the test empties, and timers the test runs. */
function rig(accepts: (k: number) => boolean = () => true) {
  const sent: number[] = [];
  let waiting = 0;
  const ram = new Uint8Array(0x8000);
  const dropped: number[] = [];
  const device: InputDevice = {
    press: (k) => (sent.push(k), waiting++),
    machine: { ram, keysWaiting: () => waiting > 0, dropKey: (k) => (dropped.push(k), (waiting = 0)) },
  };
  let now = 0, next = 1;
  const timers = new Map<number, { at: number; f: () => void }>();
  const input = new DeviceInput(() => device, accepts, {
    set: (f, ms) => (timers.set(next, { at: now + ms, f }), next++),
    clear: (t) => void timers.delete(t),
  });
  /** Let `ms` pass, firing timers as they come due. */
  const wait = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].f();
    }
    now = end;
  };
  /** The program reads every key waiting. */
  const read = () => void (waiting = 0);
  return { input, sent, dropped, ram, wait, read };
}

describe("DeviceInput", () => {
  it("a tap sends its key once, and the press is kept when it is let go", () => {
    const r = rig();
    r.input.down(Key.enter);
    r.input.up(Key.enter);
    r.wait(1000);
    expect(r.sent).toEqual([Key.enter]);
    expect(r.dropped).toEqual([]);
  });

  it("a held arrow repeats after REPEAT_DELAY, every REPEAT_RATE, only once the program has read the last press; letting go takes back a repeat not read", () => {
    const r = rig();
    r.input.down(Key.right);
    r.wait(REPEAT_DELAY - 1);
    expect(r.sent).toEqual([Key.right]);
    r.wait(1); // the program has not read the first press yet: no repeat
    expect(r.sent).toEqual([Key.right]);
    r.read();
    r.wait(REPEAT_RATE);
    expect(r.sent).toEqual([Key.right, Key.right]);
    r.read();
    r.wait(REPEAT_RATE);
    expect(r.sent).toEqual([Key.right, Key.right, Key.right]);
    r.input.up(Key.right);
    expect(r.dropped).toEqual([Key.right]);
    r.wait(1000);
    expect(r.sent.length).toBe(3);
  });

  it("R, Space and Enter do not repeat", () => {
    const r = rig();
    for (const k of [keyCode("R"), Key.space, Key.enter]) {
      r.input.down(k);
      r.read();
      r.wait(2000);
      r.input.up(k);
    }
    expect(r.sent).toEqual([keyCode("R"), Key.space, Key.enter]);
  });

  it("删除, 修改, 查找, 插入 and 帮助 are Shift and then their key, once, however long held", () => {
    const r = rig();
    for (const p of [SECOND.del, SECOND.modify, SECOND.search, SECOND.insert, SECOND.help]) {
      r.input.down(p);
      r.read();
      r.wait(2000);
      r.input.up(p);
    }
    expect(r.sent).toEqual([Key.shift, Key.left, Key.shift, Key.up, Key.shift, Key.down, Key.shift, Key.right, Key.shift, Key.lang]);
  });

  it("with the GUI's Shift latch already set and nothing waiting, only the key goes (a second Shift would clear the latch)", () => {
    const r = rig();
    r.ram[0x2b27] = 0x22; // input mode 2, latched
    r.input.down(SECOND.del);
    r.input.up(SECOND.del);
    expect(r.sent).toEqual([Key.left]);
    // a key still waiting may change the latch: Shift goes
    r.input.down(SECOND.del);
    r.input.up(SECOND.del);
    expect(r.sent).toEqual([Key.left, Key.shift, Key.left]);
  });

  it("a key held is not pressed again until let go; keys it does not accept are ignored; releaseAll lets go of all", () => {
    const r = rig((k) => k !== Key.home);
    r.input.down(Key.home);
    r.input.down(Key.up);
    r.input.down(Key.up);
    r.input.down(SECOND.insert);
    expect(r.sent).toEqual([Key.up, Key.shift, Key.right]);
    expect(r.input.isHeld(Key.up) && r.input.isHeld(SECOND.insert)).toBe(true);
    r.input.releaseAll();
    expect(r.input.isHeld(Key.up) || r.input.isHeld(SECOND.insert)).toBe(false);
  });
});

describe("the 4988's keys", () => {
  it("the on-screen row: R, Space, and 帮助 删除 修改 查找 插入 as on the device", () => {
    const codes = Object.fromEntries(deviceKeys("zh").map((k) => [k.label, pressCodes(k.press)]));
    expect(codes).toEqual({
      R: [0x13],
      空格: [Key.space],
      帮助: [Key.shift, Key.lang],
      删除: [Key.shift, Key.left],
      修改: [Key.shift, Key.up],
      查找: [Key.shift, Key.down],
      插入: [Key.shift, Key.right],
    });
    expect(deviceKeys("en").map((k) => k.name)).toEqual(["R", "Space", "Help", "Delete", "Modify", "Search", "Insert"]);
  });

  it("the computer's F1, F2, F3, Insert and Backspace are 帮助, 查找, 修改, 插入 and 删除", () => {
    expect([KEYBOARD.F1, KEYBOARD.F2, KEYBOARD.F3, KEYBOARD.Insert, KEYBOARD.Backspace, KEYBOARD.Delete]).toEqual([SECOND.help, SECOND.search, SECOND.modify, SECOND.insert, SECOND.del, SECOND.del]);
  });

  it("GuiTranslateMsg's table: Shift sets the latch ($34); after it the arrows and 中英符 are 删除 $31, 修改 $32, 查找 $33, 插入 $30, 帮助 $26", () => {
    expect(KEY_CLASSES[0][Key.shift]).toEqual([5, 0x34]);
    expect([Key.left, Key.up, Key.down, Key.right, Key.lang].map((k) => KEY_CLASSES[1][k])).toEqual([
      [5, 0x31],
      [5, 0x32],
      [5, 0x33],
      [5, 0x30],
      [5, 0x26],
    ]);
    // $29-$2C (what other dictionaries' 帮助 查找 插入 修改 keys send) mean nothing
    for (const k of [0x29, 0x2a, 0x2b, 0x2c]) expect(KEY_CLASSES[0][k]).toEqual([0, 0]);
  });

  const FW = process.env.BBK_FIRMWARE ?? "";
  it.skipIf(!FW || !existsSync(join(FW, "0E00.DAT")))("the table is the OS's own (8:$8C36)", () => {
    const os = readFileSync(join(FW, "0E00.DAT"));
    const at = (0x80 + 4 * 8) * 0x1000 + 0x8c36 - 0x5000;
    for (let k = 0; k < 64; k++) expect([os[at + 2 * k], os[at + 2 * k + 1]], `key $${k.toString(16)}`).toEqual(KEY_CLASSES[0][k]);
  });
});

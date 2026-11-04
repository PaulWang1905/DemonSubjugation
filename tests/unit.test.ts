import { describe, expect, it } from "vitest";
import { inspectDatLib } from "../src/engine";
import { Colors } from "../src/engine/graphics";
import { File, gbkBytes, objectInputOf, objectOutputOf, setPlatform, sysGbkDecode } from "../src/engine/java";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";
import type { ResImage } from "../src/engine/fmj/lib/ResImage";
import type { ResMap } from "../src/engine/fmj/lib/ResMap";
import { registerResources } from "../src/engine/fmj/registry";
import { ScriptResources } from "../src/engine/fmj/script/ScriptResources";
import { ScriptVM } from "../src/engine/fmj/script/ScriptVM";
import type { ScriptProcess } from "../src/engine/fmj/script/ScriptProcess";
import { addr, buildLib, gut, image, le16 } from "./fixtures";
import { memorySaves } from "./helpers";

function useLib(lib: Uint8Array) {
  registerResources();
  setPlatform({
    rom: new Map([["DAT.LIB", new Int8Array(lib.buffer)]]),
    saves: memorySaves(),
    exit: () => {},
    random: () => 0.5,
  });
  DatLib.reset();
}

describe("GBK codec", () => {
  it("round-trips Chinese and ASCII text", () => {
    const s = "伏魔记 ABC 123，测试！";
    expect(sysGbkDecode(gbkBytes(s))).toBe(s);
  });

  it("encodes CJK as two bytes and ASCII as one", () => {
    expect(gbkBytes("测").length).toBe(2);
    expect(gbkBytes("a").length).toBe(1);
  });
});

describe("save streams", () => {
  it("round-trips every field type", () => {
    useLib(buildLib([]));
    const f = new File("sav/test");
    const o = objectOutputOf(f);
    o.writeInt(1234);
    o.writeLong(-5);
    o.writeString("存档一");
    o.writeBoolean(true);
    o.writeIntArray([1, 2, 65535]);
    o.close();
    const i = objectInputOf(new File("sav/test"));
    expect(i.readInt()).toBe(1234);
    expect(i.readLong()).toBe(-5);
    expect(i.readString()).toBe("存档一");
    expect(i.readBoolean()).toBe(true);
    expect(i.readIntArray()).toEqual([1, 2, 65535]);
  });

  it("refuses to write resources", () => {
    useLib(buildLib([]));
    expect(() => new File("DAT.LIB").wholeWrite(new Int8Array(1))).toThrow();
  });
});

describe("DAT.LIB parsing", () => {
  const opaque = image(1, 1, [["#..#####", "........"]]);
  const transp = image(1, 2, [["# .", " #."]]);
  const map = [1, 1, 1, ...gbkBytes("测试图"), 0];
  while (map.length < 0x10) map.push(0);
  map.push(2, 1); // width, height
  map.push(0x80 | 3, 7, 0x05, 0); // walkable tile 3 with event 7, blocked tile 5
  const lib = buildLib([
    { resType: ResType.PIC, type: 1, index: 1, bytes: opaque },
    { resType: ResType.PIC, type: 1, index: 2, bytes: transp },
    { resType: ResType.MAP, type: 1, index: 1, bytes: map },
  ]);

  it("indexes resources", () => {
    expect(inspectDatLib(lib)).toEqual({ resources: 3, scripts: 0, maps: 1, playable: false });
  });

  it("decodes 1-bit images", () => {
    useLib(lib);
    const img = DatLib.getRes(ResType.PIC, 1, 1) as ResImage;
    expect([img.width, img.height, img.number]).toEqual([8, 2, 1]);
    const px = img.getBitmap(0)!.buffer;
    expect(px[0]).toBe(Colors.BLACK);
    expect(px[1]).toBe(Colors.WHITE);
    expect(px[3]).toBe(Colors.BLACK);
    expect(px[8]).toBe(Colors.WHITE);
  });

  it("decodes 2-bit images with transparency", () => {
    useLib(lib);
    const img = DatLib.getRes(ResType.PIC, 1, 2) as ResImage;
    const px = img.getBitmap(0)!.buffer;
    expect([px[0], px[1], px[2]]).toEqual([Colors.BLACK, Colors.TRANSP, Colors.WHITE]);
    expect([px[3], px[4], px[5]]).toEqual([Colors.TRANSP, Colors.BLACK, Colors.WHITE]);
  });

  it("reads maps", () => {
    useLib(lib);
    const m = DatLib.getRes(ResType.MAP, 1, 1) as ResMap;
    expect(m.mapName).toBe("测试图");
    expect([m.mapWidth, m.mapHeight]).toEqual([2, 1]);
    expect(m.canWalk(0, 0)).toBe(true);
    expect(m.canWalk(1, 0)).toBe(false);
    expect(m.getEventNum(0, 0)).toBe(7);
    expect(m.getEventNum(5, 5)).toBe(-1);
  });

  it("uses blank placeholders for missing art but throws for missing logic", () => {
    useLib(lib);
    expect(DatLib.getRes(ResType.PIC, 9, 9, true)).toBeNull();
    const ph = DatLib.getRes(ResType.PIC, 9, 9) as ResImage;
    expect([ph.width, ph.height, ph.number]).toEqual([1, 1, 1]);
    expect(() => DatLib.getRes(ResType.GRS, 9, 9)).toThrow(/res not found/);
    expect(() => DatLib.getRes(ResType.GUT, 9, 9)).toThrow(/res not found/);
  });
});

describe("script VM", () => {
  // event 1:  set v[3]=5; add v[3]+=2; ifcmp v[3]==7 goto L; setevent 9; L: setevent 10; callback
  const SET = 12, ADD = 22, IFCMP = 21, SETEVENT = 26, CALLBACK = 9;
  const code = [
    SET, ...le16(3), ...le16(5), // 0
    ADD, ...le16(3), ...le16(2), // 5
    IFCMP, ...le16(3), ...le16(7), ...addr(1, 20), // 10
    SETEVENT, ...le16(9), // 17
    SETEVENT, ...le16(10), // 20
    CALLBACK, // 23
  ];
  const lib = buildLib([{ resType: ResType.GUT, type: 1, index: 1, bytes: gut(1, 1, code, [0]) }]);

  it("compiles and runs a script with a conditional jump", () => {
    useLib(lib);
    ScriptResources.initGlobalVar();
    ScriptResources.initGlobalEvents();
    let proc: ScriptProcess | null = null;
    const game = {
      mainScene: { exitScript: () => proc!.stop() },
      gotoAddress: (a: number) => proc!.gotoAddress(a),
      triggerEvent: (e: number) => proc!.triggerEvent(e),
    };
    const parent = { game, parent: null } as never;
    const vm = new ScriptVM(parent);
    proc = vm.loadScript(1, 1);
    expect(proc.triggerEvent(1)).toBe(true);
    for (let i = 0; i < 10 && proc.running; i++) {
      proc.process();
      proc.update(40);
    }
    expect(ScriptResources.variables[3]).toBe(7);
    expect(ScriptResources.globalEvents[9]).toBe(false);
    expect(ScriptResources.globalEvents[10]).toBe(true);
    expect(proc.running).toBe(false);
  });

  it("truncates scripts at unknown opcodes, or throws in strict mode", () => {
    useLib(buildLib([{ resType: ResType.GUT, type: 1, index: 2, bytes: gut(1, 2, [SETEVENT, ...le16(4), 200, 1, 2], [0]) }]));
    const vm = new ScriptVM({ game: {}, parent: null } as never);
    const p = vm.loadScript(1, 2);
    expect(p.debugState.total).toBe(2); // SETEVENT + implicit end
    expect(vm.decodeWarnings[0]).toMatch(/ECMD: 200/);
    ScriptVM.strict = true;
    try {
      expect(() => vm.loadScript(1, 2)).toThrow(/ECMD: 200/);
    } finally {
      ScriptVM.strict = false;
    }
  });
});

// Port of fmj/lib/DatLib.kt — the DAT.LIB resource archive.
//
// Concrete resource classes are registered by ../registry.ts at boot instead
// of being imported here, which keeps the module graph free of cycles.
import { File } from "../../java";
import type { ResBase } from "./ResBase";
import type { ResImage } from "./ResImage";
import type { ResMagicChain } from "../magic/ResMagicChain";
import type { BaseMagic } from "../magic/BaseMagic";
import type { ScriptVM } from "../script/ScriptVM";

export enum ResType {
  GUT = 1, // story scripts
  MAP = 2, // maps
  ARS = 3, // characters
  MRS = 4, // magic
  SRS = 5, // special effects
  GRS = 6, // goods / items
  TIL = 7, // tiles
  ACP = 8, // character images
  GDP = 9, // goods images
  GGJ = 10, // effect images
  PIC = 11, // misc images
  MLR = 12, // chains (magic chains, level-up chains)
}

export type ResFactory = (resType: ResType, type: number) => ResBase | null;
/** Stand-ins for missing art/animations, so incomplete community archives still run. */
export type ResPlaceholder = (resType: ResType, type: number, index: number) => ResBase | null;

let factory: ResFactory | null = null;
let placeholder: ResPlaceholder | null = null;
const warned = new Set<string>();

export function registerResFactory(f: ResFactory, p?: ResPlaceholder): void {
  factory = f;
  placeholder = p ?? null;
}

export function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

export class DatLib {
  private readonly mBuffer: Int8Array;
  private readonly mDataOffset = new Map<number, number>();
  private readonly guts: { type: number; index: number }[] = [];

  constructor(buffer: Int8Array) {
    this.mBuffer = buffer;
    this.getAllResOffset();
  }

  tryCompileScripts(vm: ScriptVM): void {
    for (const g of this.guts) vm.loadScript(g.type, g.index);
  }

  /** All (resType, type, index) triples present in the archive. */
  listResources(): { resType: number; type: number; index: number }[] {
    return [...this.mDataOffset.keys()].map((k) => ({ resType: k >> 16, type: (k >> 8) & 0xff, index: k & 0xff }));
  }

  private getAllResOffset(): void {
    const b = this.mBuffer;
    let i = 0x10;
    let j = 0x2000;
    while (i < b.length && b[i] !== -1) {
      const resType = b[i++];
      const type = b[i++];
      const index = b[i++] & 0xff;
      const key = DatLib.getKey(resType, type, index);
      const block = b[j++] & 0xff;
      const low = b[j++] & 0xff;
      const high = b[j++] & 0xff;
      const value = (block * 0x4000) | ((high << 8) | low);
      this.mDataOffset.set(key, value);
      if (resType === 1) this.guts.push({ type, index });
    }
  }

  getRes(resType: ResType, type: number, index: number, allowNull = false): ResBase | null {
    const offset = this.mDataOffset.get(DatLib.getKey(resType, type, index)) ?? -1;
    let res: ResBase | null = null;
    if (offset !== -1) {
      if (!factory) throw new Error("Resource factory not registered");
      res = factory(resType, type);
      res?.setData(this.mBuffer, offset);
    }
    if (allowNull) return res;
    if (!res && placeholder) {
      const p = placeholder(resType, type, index);
      if (p) {
        warnOnce(`res:${resType}:${type}:${index}`, `Missing resource ${ResType[resType]} ${type}-${index}; using a blank placeholder`);
        return p;
      }
    }
    if (!res) throw new Error(`res not found:resType=${ResType[resType]},type=${type},index=${index}`);
    return res;
  }

  private static getKey(resType: number, type: number, index: number): number {
    return (resType << 16) | (type << 8) | index;
  }

  // -- companion ------------------------------------------------------------

  private static _instance: DatLib | null = null;

  static get instance(): DatLib {
    if (!DatLib._instance) DatLib._instance = new DatLib(File.contentsOf("DAT.LIB"));
    return DatLib._instance;
  }

  /** Drop the cached archive (used when the player imports a different game). */
  static reset(): void {
    DatLib._instance = null;
  }

  static getRes(resType: ResType, type: number, index: number, allowNull = false): ResBase | null {
    return DatLib.instance.getRes(resType, type, index, allowNull);
  }

  static getPic(type: number, index: number, allowNull = false): ResImage | null {
    return DatLib.getRes(ResType.PIC, type, index, allowNull) as ResImage | null;
  }

  static getMlr(type: number, index: number, allowNull = false): ResMagicChain | null {
    return DatLib.getRes(ResType.MLR, type, index, allowNull) as ResMagicChain | null;
  }

  static getACP(type: number, index: number, allowNull = false): ResImage | null {
    return DatLib.getRes(ResType.ACP, type, index, allowNull) as ResImage | null;
  }

  static getMrsOrNull(type: number, index: number): BaseMagic | null {
    return DatLib.getRes(ResType.MRS, type, index, true) as BaseMagic | null;
  }

  static getMrs(type: number, index: number): BaseMagic {
    return DatLib.getRes(ResType.MRS, type, index, false) as BaseMagic;
  }
}

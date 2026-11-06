// Port of src/java/java.kt — small stand-ins for the Java/Kotlin runtime pieces
// the engine relies on, plus the platform ("sys*") hooks the host provides.
//
// Conventions used throughout the port:
//  * Kotlin ByteArray  -> Int8Array (signed bytes, exactly like the JVM)
//  * Kotlin Int / Long -> number (use idiv() for integer division)

export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Kotlin `Int.toByte()` */
export function toByte(v: number): number {
  return (v << 24) >> 24;
}

export class Stack<T> {
  private items: T[];
  constructor(list: T[] = []) {
    this.items = list;
  }
  get size(): number {
    return this.items.length;
  }
  push(element: T): void {
    this.items.push(element);
  }
  pop(): T | null {
    return this.items.length === 0 ? null : (this.items.pop() as T);
  }
  peek(): T | null {
    return this.items.length === 0 ? null : this.items[this.items.length - 1];
  }
  clear(): void {
    this.items.length = 0;
  }
  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }
  toArray(): T[] {
    return this.items;
  }
  static create<T>(): Stack<T> {
    return new Stack<T>([]);
  }
}

export class Random {
  nextInt(rng: number): number {
    return Math.floor(random() * rng);
  }
  nextBoolean(): boolean {
    return this.nextInt(2) === 1;
  }
}

export interface Coder {
  encode(out: ObjectOutput): void;
  decode(coder: ObjectInput): void;
}

export interface ObjectOutput {
  writeInt(v: number): void;
  writeByte(v: number): void;
  writeLong(v: number): void;
  writeString(v: string): void;
  writeBoolean(v: boolean): void;
  writeIntArray(v: ArrayLike<number>): void;
  close(): void;
}

export interface ObjectInput {
  readInt(): number;
  readByte(): number;
  readLong(): number;
  readString(): string;
  readBoolean(): boolean;
  readIntArray(): number[];
  /** Bytes left to read. */
  remaining(): number;
  close(): void;
}

export interface Runnable {
  run(): void;
}

// ---------------------------------------------------------------------------
// GBK text codec. The original data files store all text as GBK / GB2312.

let gbkDecoder: TextDecoder | null = null;
let gbkEncodeTable: Map<string, number> | null = null;

function decoder(): TextDecoder {
  if (!gbkDecoder) gbkDecoder = new TextDecoder("gbk");
  return gbkDecoder;
}

function buildEncodeTable(): Map<string, number> {
  const table = new Map<string, number>();
  const dec = decoder();
  const pair = new Uint8Array(2);
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue;
      pair[0] = hi;
      pair[1] = lo;
      const ch = dec.decode(pair);
      if (ch.length === 1 && ch !== "�" && !table.has(ch)) {
        table.set(ch, (hi << 8) | lo);
      }
    }
  }
  return table;
}

export function sysGbkDecode(data: ArrayLike<number>): string {
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data[i] & 0xff;
  return decoder().decode(bytes);
}

export function sysGbkEncode(str: string): Int8Array {
  if (!gbkEncodeTable) gbkEncodeTable = buildEncodeTable();
  const out: number[] = [];
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const v = gbkEncodeTable.get(ch);
    if (v === undefined) {
      out.push(0x3f); // '?'
    } else {
      out.push(toByte(v >> 8), toByte(v & 0xff));
    }
  }
  return Int8Array.from(out);
}

export function gbkString(buf: Int8Array, offset = 0, length = buf.length - offset): string {
  return sysGbkDecode(buf.subarray(offset, offset + length));
}

export function getCString(buf: Int8Array, from = 0): Int8Array {
  const src = from === 0 ? buf : buf.slice(from);
  const ind = src.indexOf(0);
  return ind === -1 ? src : src.slice(0, ind);
}

export function gbkBytes(s: string): Int8Array {
  return sysGbkEncode(s);
}

export const System = {
  arraycopy<T>(
    src: ArrayLike<T> & { [i: number]: T },
    srcPos: number,
    dest: { [i: number]: T; length: number },
    destPos: number,
    length: number,
  ): void {
    for (let i = 0; i < length; i++) {
      dest[destPos + i] = src[srcPos + i];
    }
  },
};

export class ArrayQueue<T> extends Array<T> {
  pushItem(item: T): void {
    this.push(item);
  }
  popItem(): T | null {
    return this.length === 0 ? null : (this.shift() as T);
  }
}

// ---------------------------------------------------------------------------
// Platform hooks (the Kotlin `external fun sys*` declarations).

export interface SaveStorage {
  get(path: string): string | null;
  set(path: string, value: string | null): void;
  has(path: string): boolean;
}

/**
 * Supplies glyphs when the HZK16 / ASC16 font files are not available.
 * `hzk(n)` returns the 32 bytes of GB2312 glyph n (row-major 94x94 grid
 * starting at 0xA1A1), `asc(c)` the 16 bytes of ASCII character c.
 */
export interface FontFallback {
  hzk(glyph: number): ArrayLike<number>;
  asc(code: number): ArrayLike<number>;
}

export interface Platform {
  /** Read-only game resources keyed by file name: "DAT.LIB", "HZK16", "ASC16". */
  rom: Map<string, Int8Array>;
  /** Used for text when HZK16 / ASC16 are missing from `rom`. */
  fontFallback?: FontFallback;
  /** Persistent storage for "sav/..." paths. */
  saves: SaveStorage;
  exit(): void;
  random(): number;
}

let platform: Platform | null = null;

export function setPlatform(p: Platform): void {
  platform = p;
}

export function getPlatform(): Platform {
  if (!platform) throw new Error("Platform not initialised");
  return platform;
}

export function random(): number {
  return platform ? platform.random() : Math.random();
}

export function sysExit(): void {
  platform?.exit();
}

function hexEncode(arr: Int8Array): string {
  const tbl = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i] & 0xff;
    s += tbl[b >> 4] + tbl[b & 0xf];
  }
  return s;
}

function hexDecode(s: string): Int8Array {
  const n = s.length >> 1;
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = toByte(parseInt(s.substr(i * 2, 2), 16) || 0);
  }
  return out;
}

export class File {
  constructor(private readonly path: string) {}

  static contentsOf(path: string): Int8Array {
    return new File(path).readAll();
  }

  private isSave(): boolean {
    return this.path.startsWith("sav/");
  }

  exists(): boolean {
    const p = getPlatform();
    return this.isSave() ? p.saves.has(this.path) : p.rom.has(this.path);
  }

  createNewFile(): void {}

  readAll(): Int8Array {
    const p = getPlatform();
    if (this.isSave()) {
      const s = p.saves.get(this.path);
      if (s == null) throw new Error("File not found: " + this.path);
      return hexDecode(s);
    }
    const data = p.rom.get(this.path);
    if (!data) throw new Error("File not found: " + this.path);
    return data;
  }

  wholeWrite(buf: Int8Array): void {
    const p = getPlatform();
    if (!this.isSave()) throw new Error("Resources are read-only: " + this.path);
    p.saves.set(this.path, hexEncode(buf));
  }

  close(): void {}
}

class ObjectInputStream implements ObjectInput {
  private readonly buffer: Int8Array;
  private cur = 0;
  constructor(private readonly file: File) {
    this.buffer = file.readAll();
  }
  readByte(): number {
    return this.buffer[this.cur++];
  }
  private readBytes(n: number): Int8Array {
    const c = this.cur;
    this.cur += n;
    return this.buffer.slice(c, c + n);
  }
  readInt(): number {
    const b = this.readBytes(2);
    return (b[0] & 0xff) | ((b[1] & 0xff) << 8);
  }
  readLong(): number {
    const b = this.readBytes(4);
    return (b[0] & 0xff) | ((b[1] & 0xff) << 8) | ((b[2] & 0xff) << 16) | ((b[3] & 0xff) << 24);
  }
  readString(): string {
    const len = this.readInt();
    return gbkString(this.readBytes(len), 0, len);
  }
  readBoolean(): boolean {
    return this.readByte() !== 0;
  }
  readIntArray(): number[] {
    const len = this.readInt();
    const out = new Array<number>(len);
    for (let i = 0; i < len; i++) out[i] = this.readInt();
    return out;
  }
  remaining(): number {
    return Math.max(0, this.buffer.length - this.cur);
  }
  close(): void {
    this.file.close();
  }
}

class ObjectOutputStream implements ObjectOutput {
  private buffer: number[] = [];
  constructor(private readonly file: File) {}
  writeInt(v: number): void {
    this.buffer.push(toByte(v), toByte(v >> 8));
  }
  writeByte(v: number): void {
    this.buffer.push(toByte(v));
  }
  writeLong(v: number): void {
    const i = v | 0;
    this.buffer.push(toByte(i), toByte(i >> 8), toByte(i >> 16), toByte(i >> 24));
  }
  writeString(v: string): void {
    const bytes = gbkBytes(v);
    this.writeInt(bytes.length);
    for (let i = 0; i < bytes.length; i++) this.buffer.push(bytes[i]);
  }
  writeBoolean(v: boolean): void {
    this.writeByte(v ? 1 : 0);
  }
  writeIntArray(v: ArrayLike<number>): void {
    this.writeInt(v.length);
    for (let i = 0; i < v.length; i++) this.writeInt(v[i]);
  }
  close(): void {
    this.file.wholeWrite(Int8Array.from(this.buffer));
    this.file.close();
  }
}

export function readArray<T>(io: ObjectInput, read: (io: ObjectInput) => T): T[] {
  const len = io.readInt();
  const out: T[] = [];
  for (let i = 0; i < len; i++) out.push(read(io));
  return out;
}

export function writeArray<T>(out: ObjectOutput, objs: T[], write: (out: ObjectOutput, obj: T) => void): void {
  out.writeInt(objs.length);
  for (const o of objs) write(out, o);
}

export function objectInputOf(f: File): ObjectInput {
  return new ObjectInputStream(f);
}

export function objectOutputOf(f: File): ObjectOutput {
  return new ObjectOutputStream(f);
}

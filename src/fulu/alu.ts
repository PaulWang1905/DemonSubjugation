// What Fulu's handlers work with: the machine they answer for, and an ALU
// with the 65C02's flags, so that a handler can leave the flags exactly as
// the OS's own code does by doing its arithmetic the same way.

import { B, C, N, U, V, Z } from "../bbk/cpu";
import type { Machine } from "../bbk/machine";
import type { Fulu } from "./fulu";

export let m: Machine;
export let ram: Uint8Array;
export let cpu: Machine["cpu"];

/** Bind to the machine of the Fulu that is answering. */
export function use(os: Fulu): void {
  m = os.machine;
  ram = m.ram;
  cpu = m.cpu;
}

// ---- flags and arithmetic ----

export const setP = (mask: number, bits: number) => void (cpu.p = (cpu.p & ~mask) | bits);
export const nz = (v: number) => (setP(N | Z, (v & N) | (v ? 0 : Z)), v);
export const clc = () => setP(C, 0);
export const sec = () => setP(C, C);
export const carry = () => cpu.p & C;
export function adc(a: number, b: number): number {
  const r = a + b + carry();
  setP(C | V, (r >> 8) | (~(a ^ b) & (a ^ r) & 0x80 ? V : 0));
  return nz(r & 0xff);
}
export const sbc = (a: number, b: number) => adc(a, b ^ 0xff);
export const cmp = (a: number, b: number) => (setP(C, a >= b ? C : 0), nz((a - b) & 0xff));
export const rol = (v: number, c = carry()) => (setP(C, v >> 7), nz(((v << 1) | c) & 0xff));
export const asl = (v: number) => rol(v, 0);
export const ror = (v: number, c = carry()) => (setP(C, v & 1), nz((v >> 1) | (c << 7)));
export const lsr = (v: number) => ror(v, 0);
/** PLP of a value pushed by PHP. */
export const plp = (p: number) => void (cpu.p = (p | U) & ~B);

// ---- memory ----

export const rd = (a: number) => m.read(a & 0xffff);
export const wr = (a: number, v: number) => m.write(a & 0xffff, v);
export const word = (zp: number) => ram[zp] | (ram[zp + 1] << 8);
export const get16 = (a: number) => rd(a) | (rd(a + 1) << 8);
export function put16(a: number, v: number): void {
  wr(a, v & 0xff);
  wr(a + 1, (v >> 8) & 0xff);
}
/** Set a zero-page word. */
export function set16(zp: number, v: number): void {
  ram[zp] = v & 0xff;
  ram[zp + 1] = (v >> 8) & 0xff;
}
export const long = (a: number) => (rd(a) | (rd(a + 1) << 8) | (rd(a + 2) << 16) | (rd(a + 3) << 24)) >>> 0;
export function store(a: number, v: number): void {
  for (let i = 0; i < 4; i++) wr(a + i, (v >>> (8 * i)) & 0xff);
}

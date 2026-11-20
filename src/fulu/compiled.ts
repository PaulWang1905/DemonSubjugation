// The C compiler's idioms in the OS's compiled C, each as it compiles (the
// same instructions' effects on registers, flags, zero page and the software
// stack), for OS functions done as the compiled code does them (calendar.ts,
// gui.ts's $EA25, menu.ts).

import { adc, clc, cpu, nz, os, plp, ram, rd, sbc, sec, word, wr } from "./alu";
import { sp } from "./itoa";

/** n bytes of locals (PHP / SEI / SEC / SBC / PLP). */
export function reserve(n: number): void {
  const p = cpu.p;
  sec();
  ram[0x28] = sbc(ram[0x28], n);
  ram[0x29] = cpu.a = sbc(ram[0x29], 0);
  plp(p);
}

/** The software stack moved up by n, flags kept (PHP / SEI / CLC / ADC / PLP). */
export function drop(n: number): void {
  const p = cpu.p;
  clc();
  ram[0x28] = adc(ram[0x28], n);
  ram[0x29] = cpu.a = adc(ram[0x29], 0);
  plp(p);
}

/** The return with a byte in A: locals dropped, A and flags kept (PHP / SEI / TAY / CLC / ADC / TYA / PLP). */
export function leave(n: number): void {
  const p = cpu.p, a = cpu.a;
  cpu.y = a;
  drop(n);
  cpu.a = a;
  plp(p);
}

/** A = L[n]. */
export function getB(n: number): number {
  cpu.y = n;
  return (cpu.a = nz(rd(sp() + n)));
}

/** L[n] = A (LDY #n, its flags, / STA). */
export function setB(n: number, v = cpu.a): void {
  cpu.a = v;
  cpu.y = nz(n);
  wr(sp() + n, v);
}

/** *($23) = A (LDY #0, its flags, / STA). */
export function put23(): void {
  cpu.y = nz(0);
  wr(word(0x23), cpu.a);
}

/** $zp16 = #v (LDA / STA, LDA / STA). */
export function imm(zp: number, v: number): void {
  ram[zp] = v & 0xff;
  ram[zp + 1] = cpu.a = nz((v >> 8) & 0xff);
}

/** $20 += k, a constant (LDA $20 / CLC / ADC / STA / LDA $21 / ADC / STA). */
export function add20(k: number): void {
  clc();
  ram[0x20] = adc(ram[0x20], k & 0xff);
  ram[0x21] = cpu.a = adc(ram[0x21], k >> 8);
}

/** $20 -= k, a constant (LDA $20 / SEC / SBC / STA / LDA $21 / SBC / STA). */
export function sub20(k: number): void {
  sec();
  ram[0x20] = sbc(ram[0x20], k & 0xff);
  ram[0x21] = cpu.a = sbc(ram[0x21], k >> 8);
}

/** $20 = $20 + $23 or - $23. */
export function add2023(): void {
  clc();
  ram[0x20] = adc(ram[0x20], ram[0x23]);
  ram[0x21] = cpu.a = adc(ram[0x21], ram[0x24]);
}
export function sub2023(): void {
  sec();
  ram[0x20] = sbc(ram[0x20], ram[0x23]);
  ram[0x21] = cpu.a = sbc(ram[0x21], ram[0x24]);
}

/** A far call, then its arguments dropped. */
export function call(entry: number, args: number): void {
  os.call(entry);
  drop(args);
}

/** A far call returning a byte: TAX, its arguments dropped, TXA. */
export function callByte(entry: number, args: number): number {
  os.call(entry);
  cpu.x = cpu.a;
  drop(args);
  return (cpu.a = nz(cpu.x));
}

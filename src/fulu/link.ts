// The link cable: the serial port between two devices, as the OS drives it.
//
// The OS opens the port ($E8D1: its speed and mode, the receive ring
// buffer's indexes cleared), sends through the transmit register $08,
// waiting for each byte to go ($09 bit 5, resident $E90D), and reads what
// the RXD interrupt has put in the ring ($E910); $E8D4 closes it.
//
// Fulu has no partner device: as on a device with nothing plugged in, what
// is sent goes (the transmitter does not need a partner: each byte takes its
// time on the wire and the port is ready again) and nothing ever arrives
// (no RXD interrupt, no type-7 message from GuiGetMsg). The games then time
// out and show their own "could not connect" (docs/fulu-notes.md, "The link
// cable"). The firmware emulator (src/bbk/machine.ts, and BA4988.cpp it is
// modelled on) has no transmitter: $09 bit 5 never comes up there, and a
// send waits forever.

import { I } from "../bbk/cpu";
import { CPU_HZ } from "../bbk/machine";
import { carry, cmp, cpu, fn, m, nz, os, plp, ram, rd, rol, setP, word, wr } from "./alu";

/** The port's registers: transmit / receive data, status (bit 5: the byte sent), speed (divisor, 2 bytes), control (read: bit 0, the receiver empty), mode. */
const DATA = 0x08, STATUS = 0x09, DIVISOR = 0x242, CONTROL = 0x244, MODE = 0x245;
/** The OS's variables: speed and mode asked for, bytes to send and sent, room and bytes read. */
const SPEED = 0x2034, MODE_ASKED = 0x2035, TO_SEND = 0x2032, SENT = 0x2033, ROOM = 0x2030, READ = 0x2031;
/** The receive ring buffer: its pointer ($3E/$3F), read and write indexes (mod 128), and its error byte (set by the RXD interrupt). */
const RING = 0x2279, RING_READ = 0x202e, RING_WRITE = 0x202f, RING_ERROR = 0x2278;
/** The top byte of the OS's events: bit 1 (event bit 25), data arrived (GuiGetMsg's type 7). */
const EVENTS_TOP = 0x2021;
/** The power-off delay (minutes) and its countdown, which sending and reading start again. */
const POWER_OFF = 0x2027, POWER_COUNTDOWN = 0x2028;

/**
 * The baud rates of the speeds 0-4 (as the divisors suggest). The OS's
 * divisor is the port's clock, about 1 MHz, over the rate, rounded (a clock
 * of 999.5 kHz gives all five of its table): about a bit's time in µs.
 */
const BAUD = [1200, 2400, 4800, 7200, 14400];
const divisor = (baud: number) => Math.round(999_500 / baud);
/** Bits on the wire for a byte: start, 8 data, stop. */
const BITS = 10;

export const LINK = {
  /**
   * $E8D1(speed, mode): open the port. A must be 0 (else returns 0); the
   * mode (0-3, else returns 0) sets $0245 to mode × $40, then the speed (0-4,
   * else returns 0) sets the divisor $0242/3; the ring's pointer, its indexes
   * and error byte, and the status are cleared, and $0244 = $43 turns the
   * port on. Returns 1.
   */
  0xe8d1: fn(0x7a7a, () => {
    if (cmp(cpu.a, 0)) return void (cpu.a = nz(0));
    const sp = word(0x28);
    cpu.y = 1;
    ram[SPEED] = rd(sp);
    const mode = (ram[MODE_ASKED] = rd(sp + 1));
    // (compared with 0, 1, 2 and 3 in turn, up to the one it is: C is left set)
    cmp(mode, Math.min(mode, 3));
    if (mode > 3) return void (cpu.a = nz(0));
    wr(MODE, nz(mode * 0x40));
    cmp(ram[SPEED], 5);
    if (carry()) return void (cpu.a = nz(0));
    const y = rol(ram[SPEED]), d = divisor(BAUD[ram[SPEED]]);
    wr(DIVISOR, d & 0xff);
    wr(DIVISOR + 1, d >> 8);
    cpu.y = y + 1;
    ram[0x3e] = RING & 0xff;
    ram[0x3f] = RING >> 8;
    ram[RING_READ] = ram[RING_WRITE] = 0;
    ram[RING_ERROR] = 0;
    wr(STATUS, 0);
    wr(CONTROL, 0x43);
    cpu.a = nz(1);
  }),
  // $E8D4: close: $0244 = 0 and $2021 bit 1 cleared (flags kept: PHP ... PLP), A = 1
  0xe8d4: fn(0x7b0d, () => {
    const p = cpu.p;
    wr(CONTROL, 0);
    ram[EVENTS_TOP] = cpu.a = ram[EVENTS_TOP] & 0xfd;
    cpu.p = p;
    cpu.a = nz(1);
  }),
};

/**
 * $E90D (JMP $F98F)(p), n in A: send n bytes from p through $08, each when
 * the one before has gone ($09 bit 5, cleared by writing $DF). On the device
 * each byte takes its time on the wire (BITS bits at the port's speed, while
 * the OS waits): Fulu charges that time. It returns, by its last load, the
 * power-off delay $2027 (also put in $2028: the countdown starts again),
 * not whether it sent; Y = n (1 if none), C set.
 */
function send(): void {
  const n = (ram[TO_SEND] = cpu.a), sp = word(0x28);
  cpu.y = 1;
  ram[0x3c] = rd(sp);
  ram[0x3d] = rd(sp + 1);
  const p = word(0x3c);
  cmp(n, 0);
  if (n) {
    ram[SENT] = 0;
    for (let y = 0; y < n; y++) {
      wr(DATA, rd(p + y));
      wr(STATUS, 0xdf);
      ram[SENT]++;
    }
    cpu.y = n;
    cmp(ram[SENT], n);
    if (os.timed) m.stall(Math.round((n * BITS * (rd(DIVISOR) | (rd(DIVISOR + 1) << 8)) * CPU_HZ) / 1_000_000));
  }
  ram[POWER_COUNTDOWN] = cpu.a = nz(ram[POWER_OFF]);
}

/**
 * $E910 (JMP $F9D8)(p, &n): read up to n bytes from the receive ring into p;
 * n is set to how many. If the RXD interrupt marked an error ($2278), n = 0,
 * the ring is emptied, $2021 bit 1 cleared, and the error is returned (and
 * cleared); else 0. The ring is read with interrupts off; when it is empty
 * the OS reads on from $08 while $0244 bit 0 is clear, and clears $2021
 * bit 1. Read, $0244 bit 0 is the receiver's "empty" (the RXD interrupt, at
 * $F7CC, also reads $08 while it is clear): with nothing plugged in it is
 * set, and Fulu returns. (On the firmware emulator $0244 is a plain register:
 * after $E8D4 has written 0 there, that loop never ends.)
 */
function receive(): void {
  ram[POWER_COUNTDOWN] = ram[POWER_OFF];
  const sp = word(0x28);
  ram[0x40] = rd(sp);
  ram[0x41] = rd(sp + 1);
  ram[0x3c] = rd(sp + 2);
  ram[0x3d] = rd(sp + 3);
  const to = word(0x40), count = word(0x3c);
  cpu.y = 0;
  ram[ROOM] = rd(count);
  if (cmp(ram[RING_ERROR], 0) !== 0) {
    wr(count, 0);
    ram[EVENTS_TOP] &= 0xfd;
    ram[RING_WRITE] = ram[RING_READ] = 0;
    const error = ram[RING_ERROR];
    ram[RING_ERROR] = 0;
    cpu.a = nz(error);
    return;
  }
  ram[READ] = 0;
  nz(0);
  const p = cpu.p;
  setP(I, I);
  const ring = word(0x3e);
  for (;;) {
    if (ram[RING_READ] === ram[RING_WRITE]) {
      ram[EVENTS_TOP] &= 0xfd;
      break;
    }
    wr(to + ram[READ], rd(ring + ram[RING_READ]));
    ram[RING_READ] = (ram[RING_READ] + 1) & 0x7f;
    ram[READ] = (ram[READ] + 1) & 0xff;
    if (ram[READ] >= ram[ROOM]) break;
  }
  plp(p);
  wr(count, ram[READ]);
  cpu.a = nz(0);
}

export const LINK_HELPERS: Record<number, () => void> = { 0xe90d: send, 0xe910: receive };

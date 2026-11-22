// Keeping an emulated device between visits: like the real 4988, it stays
// as it was left (its memory, its flash with the program and saves).
//
// The flash is what holds a game's own save slots, so it is never thrown
// away with the machine: restarting the device, or a program that ended,
// starts the program again on the same flash. Besides the device kept for
// each game, the player keeps save states (the whole device at a moment,
// in numbered slots) and writes them to a file and back.
import { FileType, listFiles, type FlashFile } from "../bbk/flashfs";
import { gamInfo } from "../bbk/gam";
import type { Machine, MachineState } from "../bbk/machine";
import { deleteDevice, getDevice, putDevice, type StoredDevice } from "../storage/db";

/** A device whose state is kept: on the firmware, or on Fulu. */
type Kept = { machine: Machine };

/** How many save-state slots each game has. */
export const SLOTS = 3;

/** A short digest of the OS ROM: a saved device only resumes on the same OS. */
export async function osDigest(os: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", os as BufferSource);
  return [...new Uint8Array(d).subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pipe(data: BufferSource, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
}

const gunzip = async (data: ArrayBuffer) => new Uint8Array(await pipe(data, new DecompressionStream("gzip")));

/**
 * The last flash compressed, for each device's flash: a running device is put
 * away every 30 seconds, and its 2 MB flash seldom changes (only when the
 * program saves), so it is compressed again only when it has.
 */
const packed = new WeakMap<Uint8Array, { copy: Uint8Array; gz: ArrayBuffer }>();

/** Whether two byte arrays of the same length hold the same bytes (a word at a time where they line up). */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  const n = a.length >> 2;
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0) {
    const x = new Uint32Array(a.buffer, a.byteOffset, n), y = new Uint32Array(b.buffer, b.byteOffset, n);
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
    for (let i = n * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A device's flash, gzipped. */
async function gzipFlash(data: Uint8Array): Promise<ArrayBuffer> {
  const last = packed.get(data);
  if (last && sameBytes(last.copy, data)) return last.gz;
  const copy = data.slice();
  const gz = await pipe(copy as BufferSource, new CompressionStream("gzip"));
  packed.set(data, { copy, gz });
  return gz;
}

/** A device as stored: its state and its gzipped flash. */
async function pack(id: string, os: string, device: Kept): Promise<StoredDevice> {
  // (the state and the flash at the same moment: the flash is copied before it is compressed)
  const state = device.machine.saveState();
  const flash = await gzipFlash(device.machine.flash.data);
  return { id, os, state, flash, savedAt: Date.now() };
}

/** Put a stored device's state and flash into `device`; false if it is for another OS. */
async function unpack(saved: StoredDevice | null, os: string, device: Kept): Promise<boolean> {
  if (!saved || saved.os !== os) return false;
  device.machine.flash.data.set(await gunzip(saved.flash));
  device.machine.loadState(saved.state);
  return true;
}

export async function saveDevice(id: string, os: string, device: Kept): Promise<void> {
  await putDevice(await pack(id, os, device));
}

/** Put a saved device back; false if there is none for this OS. */
export async function restoreDevice(id: string, os: string, device: Kept): Promise<boolean> {
  return unpack(await getDevice(id), os, device);
}

/** The flash of a saved device (the program and its save slots), whatever state it was left in. */
export async function savedFlash(id: string): Promise<Uint8Array | null> {
  const saved = await getDevice(id);
  return saved ? gunzip(saved.flash) : null;
}

/** The program `gam` as installed in `flash`, if it is. */
export function installedProgram(flash: Uint8Array, gam: Uint8Array): FlashFile | null {
  const name = gamInfo(gam).name;
  return listFiles(flash).find((f) => f.type === FileType.game && f.size === gam.length && f.name === name) ?? null;
}

export const forgetDevice = deleteDevice;

// ---- save states: the whole device at a moment, in numbered slots ----

const slotId = (id: string, n: number) => `${id}@slot${n}`;

/** When each slot was saved (null: empty), for slots 1 to SLOTS. */
export async function slotTimes(id: string): Promise<(number | null)[]> {
  return Promise.all(Array.from({ length: SLOTS }, async (_, i) => (await getDevice(slotId(id, i + 1)))?.savedAt ?? null));
}

export async function saveSlot(id: string, n: number, os: string, device: Kept): Promise<void> {
  await putDevice(await pack(slotId(id, n), os, device));
}

/** Put the device saved in slot n back; false if there is none for this OS. */
export async function loadSlot(id: string, n: number, os: string, device: Kept): Promise<boolean> {
  return unpack(await getDevice(slotId(id, n)), os, device);
}

/** Forget a game's slots (when it is removed). */
export async function forgetSlots(id: string): Promise<void> {
  for (let n = 1; n <= SLOTS; n++) await deleteDevice(slotId(id, n));
}

// ---- a device in a file: its saves (the flash) and its state ----

const FORMAT = "fmj-react-4988-device";

/** Typed arrays as {t, b} (base64) so that a state survives JSON. */
function toJson(v: unknown): unknown {
  if (v instanceof Uint8Array || v instanceof Uint16Array || v instanceof Int32Array) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { t: v.constructor.name, b: btoa(s) };
  }
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
  return v;
}

function fromJson(v: unknown): unknown {
  if (v && typeof v === "object" && "t" in v && "b" in v && typeof v.b === "string") {
    const bytes = Uint8Array.from(atob(v.b), (c) => c.charCodeAt(0));
    if (v.t === "Uint16Array") return new Uint16Array(bytes.buffer);
    if (v.t === "Int32Array") return new Int32Array(bytes.buffer);
    return bytes;
  }
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromJson(x)]));
  return v;
}

/** The device as a file to download: its flash (the game's saves) and its state. */
export async function exportDevice(game: string, os: string, device: Kept): Promise<Blob> {
  const d = await pack("", os, device);
  const file = { format: FORMAT, version: 1, game, os, savedAt: d.savedAt, state: toJson(d.state), flash: toJson(new Uint8Array(d.flash)) };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

/** A device read back from such a file, to be stored under `id`; throws if the file is not one. */
export async function importDevice(id: string, file: Blob): Promise<{ device: StoredDevice; game: string }> {
  let data: { format?: string; game?: string; os?: string; savedAt?: number; state?: unknown; flash?: unknown };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("not a save file");
  }
  const flash = fromJson(data.flash);
  if (data.format !== FORMAT || !(flash instanceof Uint8Array) || typeof data.os !== "string") throw new Error("not a save file");
  const buffer = flash.slice().buffer;
  const device = { id, os: data.os, state: fromJson(data.state) as MachineState, flash: buffer, savedAt: data.savedAt ?? Date.now() };
  return { device, game: data.game ?? "" };
}

/** Store a device read from a file. */
export const storeDevice = putDevice;

// Keeping an emulated device between visits: like the real 4988, it stays
// as it was left (its memory, its flash with the program and saves).
import type { Device } from "../bbk/device";
import { deleteDevice, getDevice, putDevice } from "../storage/db";

/** A short digest of the OS ROM: a saved device only resumes on the same OS. */
export async function osDigest(os: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", os as BufferSource);
  return [...new Uint8Array(d).subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pipe(data: BufferSource, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
}

export async function saveDevice(id: string, os: string, device: Device): Promise<void> {
  const flash = await pipe(device.machine.flash.data as BufferSource, new CompressionStream("gzip"));
  await putDevice({ id, os, state: device.machine.saveState(), flash, savedAt: Date.now() });
}

/** Put a saved device back; false if there is none for this OS. */
export async function restoreDevice(id: string, os: string, device: Device): Promise<boolean> {
  const saved = await getDevice(id);
  if (!saved || saved.os !== os) return false;
  device.machine.flash.data.set(new Uint8Array(await pipe(saved.flash, new DecompressionStream("gzip"))));
  device.machine.loadState(saved.state);
  return true;
}

export const forgetDevice = deleteDevice;

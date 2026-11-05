// Classify files the player drops in: game archives (*.lib / DAT.LIB),
// fonts (HZK16 / ASC16) and the hex-encoded "*.js" bundles used by the
// fmj.kt web builds (`fmj.rom["NAME"] = "HEX";`).
import { inspectDatLib } from "../engine";

export interface ImportedArchive {
  kind: "game";
  name: string;
  fileName: string;
  data: Uint8Array;
  info: { resources: number; scripts: number; maps: number; playable: boolean };
}

export interface ImportedFont {
  kind: "font";
  font: "HZK16" | "ASC16";
  data: Uint8Array;
}

export type Imported = ImportedArchive | ImportedFont;

export interface ImportResult {
  items: Imported[];
  errors: string[];
}

const ASC16_SIZE = 4096; // 256*16

function decodeGbk(bytes: Uint8Array): string {
  try {
    return new TextDecoder("gbk").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** Game title stored in the LIB header ("LIB" + NUL-terminated GBK name). */
export function libTitle(data: Uint8Array): string | null {
  if (data.length < 0x10 || data[0] !== 0x4c || data[1] !== 0x49 || data[2] !== 0x42) return null;
  let end = 3;
  while (end < 12 && data[end] !== 0) end++; // the title ends where the index length starts
  const name = decodeGbk(data.subarray(3, end)).trim();
  return name || null;
}

function looksLikeLib(data: Uint8Array): boolean {
  return data.length > 0x2000 && data[0] === 0x4c && data[1] === 0x49 && data[2] === 0x42;
}

function hexToBytes(hex: string): Uint8Array {
  const n = hex.length >> 1;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function classify(name: string, data: Uint8Array, errors: string[]): Imported | null {
  const upper = name.toUpperCase();
  const base = upper.replace(/\.(BIN|DAT)$/, "");
  if (base === "HZK16" || (data.length >= 200_000 && data.length <= 300_000 && !looksLikeLib(data))) {
    return { kind: "font", font: "HZK16", data };
  }
  if (base === "ASC16" || (data.length === ASC16_SIZE && !looksLikeLib(data))) {
    return { kind: "font", font: "ASC16", data };
  }
  if (looksLikeLib(data) || upper.endsWith(".LIB")) {
    try {
      const info = inspectDatLib(data);
      if (!info.playable) throw new Error("it has no starting script (GUT 1-1), so it is not a BBK RPG archive or it is damaged");
      const title = libTitle(data);
      const fileTitle = name.replace(/\.lib$/i, "");
      // The header has room for a short title only; a file name that carries
      // the full title on from it is the better name.
      const full = title && fileTitle.length > title.length && fileTitle.startsWith(title) ? fileTitle : null;
      return { kind: "game", name: full ?? title ?? fileTitle, fileName: name, data, info };
    } catch (e) {
      errors.push(`${name}: not a valid game archive (${(e as Error).message})`);
      return null;
    }
  }
  errors.push(`${name}: unrecognised file (expected a .lib archive, HZK16 or ASC16)`);
  return null;
}

export async function importFiles(files: File[]): Promise<ImportResult> {
  const items: Imported[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      if (f.name.toLowerCase().endsWith(".js")) {
        const text = await f.text();
        const re = /\[\s*["']([^"']+)["']\s*\]\s*=\s*["']([0-9A-Fa-f]+)["']/g;
        let m: RegExpExecArray | null;
        let found = 0;
        while ((m = re.exec(text))) {
          found++;
          const item = classify(m[1], hexToBytes(m[2]), errors);
          if (item) items.push(item);
        }
        if (!found) errors.push(`${f.name}: no fmj.rom["…"] entries found`);
      } else {
        const item = classify(f.name, new Uint8Array(await f.arrayBuffer()), errors);
        if (item) items.push(item);
      }
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  return { items, errors };
}

/** Stable id for an archive, so saves follow the file if it is re-imported. */
export async function archiveId(data: Uint8Array): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
    return [...new Uint8Array(digest)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193) >>> 0;
    return `f${h.toString(16)}${data.length.toString(16)}`;
  }
}

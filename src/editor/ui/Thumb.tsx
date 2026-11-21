// Small pictures beside resources in the sidebar: a sprite's first frame (a
// walking sprite facing south), an item icon, a character's or an item's
// sprite or icon. Drawn once per resource version (cached by its bytes).
import { decodeImage } from "../format/decode";
import { findEntry, type LibArchive, type LibEntry } from "../format/lib";
import { DARK, LIGHT } from "./pixels";

const cache = new WeakMap<Uint8Array, string | null>();

/** An image resource's frame as a PNG data URL (transparent stays transparent). */
function frameUrl(data: Uint8Array, frame: (count: number) => number): string | null {
  if (cache.has(data)) return cache.get(data)!;
  let url: string | null = null;
  try {
    const { frames } = decodeImage(data);
    const f = frames[frame(frames.length)] ?? frames[0];
    if (f && f.width && f.height && f.width <= 160 && f.height <= 160) {
      const c = document.createElement("canvas");
      c.width = f.width;
      c.height = f.height;
      const ctx = c.getContext("2d");
      if (ctx) {
        const img = ctx.createImageData(f.width, f.height);
        for (let i = 0; i < f.pixels.length; i++) {
          const v = f.pixels[i];
          if (v === 2) continue;
          img.data.set([...(v === 1 ? DARK : LIGHT), 255], i * 4);
        }
        ctx.putImageData(img, 0, 0);
        url = c.toDataURL();
      }
    }
  } catch {
    url = null;
  }
  cache.set(data, url);
  return url;
}

/** Which image stands for a resource, and which of its frames. */
function source(a: LibArchive, e: LibEntry): { data: Uint8Array; frame: (n: number) => number } | null {
  const southStanding = (n: number) => (n >= 12 ? 7 : 0);
  const img = (resType: number, type: number, index: number, frame = (_: number) => 0) => {
    const t = index ? findEntry(a, resType, type, index) : undefined;
    return t ? { data: t.data, frame } : null;
  };
  switch (e.resType) {
    case 8:
      return { data: e.data, frame: e.type === 1 || e.type === 2 ? southStanding : () => 0 };
    case 9:
      return { data: e.data, frame: () => 0 };
    case 6:
      return img(9, e.data[0], e.data[5] ?? 0);
    case 3:
      if (e.type === 3) return img(8, 3, e.data[0x2e] ?? 0);
      return img(8, e.type, e.data[0x16] ?? 0, e.type === 4 ? () => 0 : southStanding);
    default:
      return null;
  }
}

export function Thumb({ archive, entry }: { archive: LibArchive; entry: LibEntry }) {
  const s = source(archive, entry);
  const url = s && frameUrl(s.data, s.frame);
  if (!url) return null;
  return <img className="thumb" src={url} alt="" aria-hidden="true" draggable={false} />;
}

/** Whether a kind of resource shows a thumbnail (to keep the list's columns even). */
export const hasThumb = (resType: number) => resType === 3 || resType === 6 || resType === 8 || resType === 9;

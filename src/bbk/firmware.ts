// The Longman 4988's firmware, as dumped from a device: 2 MB images of each
// physical region. The OS (0xE00000) and the font ROM (0x800000) are needed;
// the rest (data ROMs, the four dictionary channels, the factory flash with
// the built-in files) make the dictionary itself complete.
//
// File names follow the dumps in circulation: BA4988's set (0E00.DAT,
// 4988.font, 0400_3F.DAT, 4988.flash, ...) and gam4980's (E.BIN, 8.BIN).

export const REGION_SIZE = 0x200000;

export type RegionId = "os" | "font" | "dataA" | "dataC" | "flash" | `ch4.${number}` | `ch6.${number}`;

export interface Firmware {
  regions: Partial<Record<RegionId, Uint8Array>>;
}

const CHANNEL_SUFFIX: Record<string, number> = { "3F": 0, "7F": 1, BF: 2, FF: 3 }; // PB bits 7-6

/** The region a firmware file holds, from its name; null if it is not one. */
export function regionOf(fileName: string): RegionId | null {
  const n = fileName.toUpperCase().replace(/^.*[\\/]/, "");
  if (n === "E.BIN" || n === "0E00.DAT") return "os";
  if (n === "8.BIN" || n === "4988.FONT") return "font";
  if (n === "0A00.DAT") return "dataA";
  if (n === "0C00.DAT") return "dataC";
  if (n === "4988.FLASH") return "flash";
  const ch = /^0([46])00_([37BF]F)\.DAT$/.exec(n);
  return ch ? (`ch${ch[1]}.${CHANNEL_SUFFIX[ch[2]]}` as RegionId) : null;
}

export const REQUIRED_REGIONS: RegionId[] = ["os", "font"];

export const ALL_REGIONS: RegionId[] = [
  "os", "font", "dataA", "dataC", "flash",
  ...[0, 1, 2, 3].flatMap((c) => [`ch4.${c}`, `ch6.${c}`] as RegionId[]),
];

/** Missing required regions (empty when the firmware can boot). */
export function missingRegions(fw: Firmware): RegionId[] {
  return REQUIRED_REGIONS.filter((r) => !fw.regions[r]);
}

/** Add a dumped file; returns its region, or null if the name or size is not a firmware image. */
export function addFirmwareFile(fw: Firmware, fileName: string, data: Uint8Array): RegionId | null {
  const r = regionOf(fileName);
  if (!r || data.length !== REGION_SIZE) return null;
  fw.regions[r] = data;
  return r;
}

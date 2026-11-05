// Password-protected games: the site serves the file encrypted, and the
// browser decrypts it with the password the player types. Nothing readable is
// published. Format: "FMJE", version 1, PBKDF2 iterations (u32 LE), 16-byte
// salt, 12-byte IV, then the AES-256-GCM ciphertext (with its tag).
// scripts/encrypt-game.mjs writes these files.

const MAGIC = [0x46, 0x4d, 0x4a, 0x45]; // "FMJE"
const HEAD = 4 + 1 + 4 + 16 + 12;

export interface LockedGame {
  name: string;
  fileName: string;
  url: string;
  desc: string;
}

/** The locked games on the Games page. */
export const LOCKED_GAMES: LockedGame[] = [
  {
    name: "Fumo Ji (English)",
    fileName: "Fumo Ji (English).lib",
    url: "/locked/fumo-ji-en.fmje",
    desc: "伏魔记 (BBK, 2004), translated into English. Password protected.",
  },
];

async function keyFor(password: string, salt: Uint8Array, iterations: number, usage: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export class WrongPassword extends Error {}

/** Decrypt a locked game; throws WrongPassword when the password does not fit. */
export async function decryptGame(file: Uint8Array, password: string): Promise<Uint8Array> {
  if (file.length < HEAD + 16 || MAGIC.some((b, i) => file[i] !== b) || file[4] !== 1) throw new Error("Not a locked game file");
  const iterations = new DataView(file.buffer, file.byteOffset).getUint32(5, true);
  const salt = file.slice(9, 25);
  const iv = file.slice(25, 37);
  const key = await keyFor(password, salt, iterations, "decrypt");
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, file.slice(HEAD)));
  } catch {
    throw new WrongPassword("Wrong password");
  }
}

/** Encrypt a game (used by tests; scripts/encrypt-game.mjs does the same). */
export async function encryptGame(data: Uint8Array, password: string, iterations = 600_000): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt, iterations, "encrypt");
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource));
  const out = new Uint8Array(HEAD + body.length);
  out.set(MAGIC, 0);
  out[4] = 1;
  new DataView(out.buffer).setUint32(5, iterations, true);
  out.set(salt, 9);
  out.set(iv, 25);
  out.set(body, HEAD);
  return out;
}

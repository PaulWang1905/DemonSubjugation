import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { decryptGame, encryptGame, LOCKED_GAMES, WrongPassword } from "../src/app/lockedGame";

describe("locked games", () => {
  it("decrypts with the right password and refuses a wrong one", async () => {
    const data = new TextEncoder().encode("LIB test game data");
    const file = await encryptGame(data, "open sesame", 1000);
    expect(await decryptGame(file, "open sesame")).toEqual(data);
    await expect(decryptGame(file, "open sesamE")).rejects.toBeInstanceOf(WrongPassword);
  });

  it("ships every locked game encrypted, with no readable LIB inside", () => {
    for (const g of LOCKED_GAMES) {
      const path = "public" + g.url;
      expect(existsSync(path)).toBe(true);
      const b = readFileSync(path);
      expect(b.subarray(0, 5)).toEqual(Buffer.from([0x46, 0x4d, 0x4a, 0x45, 1]));
      for (const word of ["Fumo Ji", "Qingfeng", "Prologue"]) expect(b.includes(Buffer.from(word))).toBe(false);
    }
  });
});

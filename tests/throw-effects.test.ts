// What 投掷 (throw) shows, by the original (_00240841): only a thrown weapon
// (type 8) with an effect of its own plays one; a sword thrown, or a thrown
// weapon without one, plays none. Needs FMJ_DATA_DIR (the real archive).
import { describe, expect, it } from "vitest";
import { createEngine } from "../src/engine";
import { throwAni } from "../src/engine/fmj/combat/actions/ItemActionBase";
import { DatLib, ResType } from "../src/engine/fmj/lib/DatLib";
import { loadRealResources, memorySaves } from "./helpers";

const res = loadRealResources();

describe.skipIf(!res)("throw effects (real archive)", () => {
  it("only thrown weapons with an effect play one", () => {
    createEngine({ resources: res!, saves: memorySaves() });
    const goods = (type: number, index: number) => DatLib.getRes(ResType.GRS, type, index) as never as { type: number; ani?: unknown };
    expect(throwAni(goods(8, 1) as never)).not.toBeNull(); // 梅花镖: SRS 2-3
    expect(throwAni(goods(8, 8) as never)).not.toBeNull(); // 唤风符: its own
    expect(throwAni(goods(8, 6) as never)).toBeNull(); // 穿心镖: none
    for (let i = 1; i <= 32; i++) expect(throwAni(goods(7, i) as never)).toBeNull(); // swords: none
  });
});

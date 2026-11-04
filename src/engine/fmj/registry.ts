// Maps DAT.LIB resource kinds to classes (the `when` table in DatLib.getRes).
import { Monster } from "./characters/Monster";
import { NPC } from "./characters/NPC";
import { Player } from "./characters/Player";
import { ResLevelupChain } from "./characters/ResLevelupChain";
import { SceneObj } from "./characters/SceneObj";
import { GoodsDecorations } from "./goods/GoodsDecorations";
import { GoodsDrama } from "./goods/GoodsDrama";
import { GoodsEquipment } from "./goods/GoodsEquipment";
import { GoodsHiddenWeapon } from "./goods/GoodsHiddenWeapon";
import { GoodsMedicine } from "./goods/GoodsMedicine";
import { GoodsMedicineChg4Ever } from "./goods/GoodsMedicineChg4Ever";
import { GoodsMedicineLife } from "./goods/GoodsMedicineLife";
import { GoodsStimulant } from "./goods/GoodsStimulant";
import { GoodsTudun } from "./goods/GoodsTudun";
import { GoodsWeapon } from "./goods/GoodsWeapon";
import { ResType, registerResFactory } from "./lib/DatLib";
import type { ResBase } from "./lib/ResBase";
import { ResGut } from "./lib/ResGut";
import { ResImage } from "./lib/ResImage";
import { ResMap } from "./lib/ResMap";
import { ResSrs } from "./lib/ResSrs";
import { MagicAttack } from "./magic/MagicAttack";
import { MagicAuxiliary } from "./magic/MagicAuxiliary";
import { MagicEnhance } from "./magic/MagicEnhance";
import { MagicRestore } from "./magic/MagicRestore";
import { MagicSpecial } from "./magic/MagicSpecial";
import { ResMagicChain } from "./magic/ResMagicChain";

function goods(type: number): ResBase | null {
  if (type >= 1 && type <= 5) return new GoodsEquipment();
  switch (type) {
    case 6: return new GoodsDecorations();
    case 7: return new GoodsWeapon();
    case 8: return new GoodsHiddenWeapon();
    case 9: return new GoodsMedicine();
    case 10: return new GoodsMedicineLife();
    case 11: return new GoodsMedicineChg4Ever();
    case 12: return new GoodsStimulant();
    case 13: return new GoodsTudun();
    case 14: return new GoodsDrama();
  }
  return null;
}

function magic(type: number): ResBase | null {
  switch (type) {
    case 1: return new MagicAttack();
    case 2: return new MagicEnhance();
    case 3: return new MagicRestore();
    case 4: return new MagicAuxiliary();
    case 5: return new MagicSpecial();
  }
  return null;
}

export function registerResources(): void {
  registerResFactory((resType, type) => {
    switch (resType) {
      case ResType.GUT: return new ResGut();
      case ResType.MAP: return new ResMap();
      case ResType.ARS:
        switch (type) {
          case 1: return new Player();
          case 2: return new NPC();
          case 3: return new Monster();
          case 4: return new SceneObj();
        }
        return null;
      case ResType.MRS: return magic(type);
      case ResType.SRS: return new ResSrs();
      case ResType.GRS: return goods(type);
      case ResType.TIL:
      case ResType.ACP:
      case ResType.GDP:
      case ResType.GGJ:
      case ResType.PIC:
        return new ResImage();
      case ResType.MLR:
        if (type === 1) return new ResMagicChain();
        if (type === 2) return new ResLevelupChain();
        return null;
    }
    return null;
  }, (resType, type, index) => {
    switch (resType) {
      case ResType.TIL:
      case ResType.ACP:
      case ResType.GDP:
      case ResType.GGJ:
      case ResType.PIC:
        return ResImage.placeholder(type, index);
      case ResType.SRS:
        return ResSrs.placeholder(type, index);
    }
    return null;
  });
}

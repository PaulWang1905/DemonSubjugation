// Port of fmj/Global.kt
import { Colors, type Color } from "../graphics";

export const Global = {
  COLOR_WHITE: Colors.WHITE as Color,
  COLOR_BLACK: Colors.BLACK as Color,
  COLOR_TRANSP: Colors.TRANSP as Color,

  fgColor: Colors.BLACK as Color,
  bgColor: Colors.WHITE as Color,

  SCREEN_WIDTH: 160,
  SCREEN_HEIGHT: 96,

  MAP_LEFT_OFFSET: 8,

  KEY_UP: 1,
  KEY_DOWN: 2,
  KEY_LEFT: 3,
  KEY_RIGHT: 4,
  KEY_PAGEUP: 5,
  KEY_PAGEDOWN: 6,
  KEY_ENTER: 7,
  KEY_CANCEL: 8,

  disableSave: false,
  delta: 40,
};

export enum ScreenViewType {
  SCREEN_DEV_LOGO,
  SCREEN_GAME_LOGO,
  SCREEN_MENU,
  SCREEN_MAIN_GAME,
  SCREEN_GAME_FAIL,
  SCREEN_SAVE_GAME,
  SCREEN_LOAD_GAME,
}

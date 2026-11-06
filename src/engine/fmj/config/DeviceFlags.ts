// Switches the original engine keeps beside the game: the melody the MUSIC
// command asked for and how many more times it plays, the system menu's
// music switch, and the map coordinates ENABLESHOWPOS turns on. All of them
// are saved, as on the device (save bytes 0x34-0x36 and 0x68).
//
// The melodies themselves are the device's built-in tunes (SysPlayMelody),
// which no game file contains, so nothing is heard; the state still follows
// the original so menus, saves and scripts behave the same.
import type { ObjectInput, ObjectOutput } from "../../java";

/** Marks the block saved after the script variables (older saves end before it). */
const SAVE_MARK = 0x4644;

export const DeviceFlags = {
  /** MUSIC n: the melody number (0 = none). */
  melody: 0,
  /** MUSIC times: plays left, 0xff = for ever, 0 = stopped. */
  repeat: 0,
  /** System menu, Settings: music on or off. */
  music: true,
  /** ENABLESHOWPOS / DISABLESHOWPOS. */
  showPos: false,

  /** A new game (_0020239E): music on, nothing playing, no coordinates. */
  reset(): void {
    DeviceFlags.melody = 0;
    DeviceFlags.repeat = 0;
    DeviceFlags.music = true;
    DeviceFlags.showPos = false;
  },

  /** MUSIC n times (_0023A64B): 0 times means for ever; melody 0 or music off stops it. */
  playMusic(n: number, times: number): void {
    DeviceFlags.melody = n & 0xff;
    DeviceFlags.repeat = times & 0xff || 0xff;
    if (DeviceFlags.melody === 0 || !DeviceFlags.music) DeviceFlags.repeat = 0;
  },

  /** System menu, Settings: switch the music on (the melody starts again) or off. */
  setMusic(on: boolean): void {
    DeviceFlags.music = on;
  },

  write(out: ObjectOutput): void {
    out.writeInt(SAVE_MARK);
    out.writeByte(DeviceFlags.melody);
    out.writeByte(DeviceFlags.repeat);
    out.writeByte(DeviceFlags.music ? 1 : 0);
    out.writeByte(DeviceFlags.showPos ? 1 : 0);
  },

  /** Read the block if the save has one; older saves get the defaults. */
  read(coder: ObjectInput): void {
    DeviceFlags.reset();
    if (coder.remaining() < 6 || coder.readInt() !== SAVE_MARK) return;
    DeviceFlags.melody = coder.readByte() & 0xff;
    DeviceFlags.repeat = coder.readByte() & 0xff;
    DeviceFlags.music = coder.readByte() !== 0;
    DeviceFlags.showPos = coder.readByte() !== 0;
  },
};

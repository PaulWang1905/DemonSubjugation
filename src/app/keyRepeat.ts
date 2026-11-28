// How a held key repeats, in both players (the FMJ React engine's,
// useEngineKeys.ts, and the 4988's, deviceInput.ts), from the keyboard and
// the on-screen keys alike: the first repeat after REPEAT_DELAY ms, then one
// every REPEAT_RATE ms, each one more press of the key.
//
// What the real 4988 does cannot be read from its firmware: the OS repeats
// nothing. Its keyboard interrupt (7:$764D) takes one code from KEYCODE per
// interrupt into its 16-place ring, masked to six bits (no flag for a
// repeat), and nothing else in the OS reads KEYCODE or a key's state, or sets
// a repeat rate; GuiGetMsg and SysGetKey only read the ring. So any repeat
// comes from the keyboard hardware, whose timing is in no file we have (the
// reference emulators repeat by the host: BA4988 Windows' own key repeat,
// gam4980 after 20 frames, then every 5).
//
// The two players used 250 / 100 (FMJ React) and 300 / 90 (the device); both
// now use FMJ React's. There each repeat is one step on the map at once, so
// its rate is that engine's walking pace, which nothing about the original
// says to change. On the device a repeat is sent only once the program has
// read the last press; 异世大陆 reads sooner than that, so its walk follows
// the rate: a step every 100 ms instead of 90, the first repeat 50 ms sooner
// (measured on the firmware and on Fulu: 14 steps in the first 1.5 s either
// way). Menus move a line every 100 ms instead of 90.
export const REPEAT_DELAY = 250;
export const REPEAT_RATE = 100;

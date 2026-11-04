// Port of fmj/script/ScriptResources.kt — global event flags and variables.
import type { ObjectInput, ObjectOutput } from "../../java";

export const ScriptResources = {
  /** Global event flags 1-2400. */
  globalEvents: new Array<boolean>(2401).fill(false),
  /** Global variables 0-199, local variables 200-239. */
  variables: new Int32Array(240),

  initLocalVar(): void {
    for (let i = 200; i <= 239; i++) ScriptResources.variables[i] = 0;
  },

  initGlobalVar(): void {
    for (let i = 0; i <= 199; i++) ScriptResources.variables[i] = 0;
  },

  initGlobalEvents(): void {
    for (let i = 1; i <= 2400; i++) ScriptResources.globalEvents[i] = false;
  },

  setEvent(num: number): void {
    ScriptResources.globalEvents[num] = true;
  },

  clearEvent(num: number): void {
    ScriptResources.globalEvents[num] = false;
  },

  write(out: ObjectOutput): void {
    for (let i = 1; i <= 2400; i++) out.writeBoolean(ScriptResources.globalEvents[i]);
    for (let i = 0; i <= 239; i++) out.writeInt(ScriptResources.variables[i]);
  },

  read(coder: ObjectInput): void {
    for (let i = 1; i <= 2400; i++) ScriptResources.globalEvents[i] = coder.readBoolean();
    for (let i = 0; i <= 239; i++) ScriptResources.variables[i] = coder.readInt();
  },
};

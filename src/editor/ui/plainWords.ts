// The project check's words for authors: its messages name script lines by
// their instruction ("loadmap: map 1-9 does not exist") and labels with "@";
// outside the Text view they read in the editor's words ("Show map: map 1-9
// does not exist", "unknown label done").
import { commandInfo } from "../format/commands";

export function plainProblem(message: string): string {
  let m = message;
  const op = /^([a-z]+): /.exec(m);
  const info = op ? commandInfo(op[1]) : undefined;
  if (op && info) m = `${info.title}: ${m.slice(op[0].length)}`;
  return m
    .replace(/\blabel @([A-Za-z_]\w*)/g, "label $1")
    .replace(/@([A-Za-z_]\w*)/g, "◆ $1")
    .replace(/"?\.event (\d+)"?/g, "event $1");
}

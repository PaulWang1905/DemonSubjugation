// The export dialog once the file is saved: what was saved (its name and
// size) and how to play it.
import { pathOf } from "../../app/router";
import "./exportSaved.css";

interface Props {
  file: string;
  size: number;
  format: "lib" | "gam";
  /** The .gam holds the RPG kit's engine (it also runs on Fulu and the device). */
  kit: boolean;
  onAgain: () => void;
  onClose: () => void;
}

/** A size in words ("412 KB"). */
export function sizeWords(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ExportSaved({ file, size, format, kit, onAgain, onClose }: Props) {
  const games = (
    <a href={pathOf("games")} target="_blank" rel="noopener">
      Games page
    </a>
  );
  return (
    <form method="dialog" className="export-saved" onSubmit={(e) => (e.preventDefault(), onClose())}>
      <h2 id="export-saved-title">Saved</h2>
      <p role="status">
        <strong>{file}</strong> ({sizeWords(size)}) is in your browser's downloads.
      </p>
      <div>
        <h3>To play it</h3>
        <ol className="small export-steps">
          <li>Open the {games} (it opens in a new tab; this project stays here).</li>
          <li>Press “Add a game” and choose {file}, or drop the file on the page.</li>
          <li>
            {format === "lib"
              ? "It plays on FMJ React. To keep working on it later, open it from the editor's start page (Open a file)."
              : kit
                ? "It plays on FMJ React and on Fulu; it also runs on a 4988 device or its original OS, like the game its engine came from."
                : "It plays on FMJ React. (For Fulu or a device, export again with the RPG kit's engine.)"}
          </li>
        </ol>
      </div>
      <p className="muted small">The project itself is kept in this browser and saved as you work; the file is a copy to keep or share.</p>
      <div className="row">
        <button type="button" className="ghost" onClick={onAgain}>
          Export another…
        </button>
        <div className="spacer" />
        <button type="submit" autoFocus>
          Done
        </button>
      </div>
    </form>
  );
}

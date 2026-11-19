// Export a project: its resource library (.lib), or a 4988 program (.gam)
// holding it, in the site's own container or with the RPG kit's engine taken
// from a .gam the user owns (src/bbk/gamBuild.ts).
import { useEffect, useRef, useState } from "react";
import { buildGam, donorProblem, type GamEngine } from "../../bbk/gamBuild";
import { gamInfo } from "../../bbk/gam";

interface Props {
  name: string;
  /** The project's library, built when exporting (it throws when the project cannot be built). */
  lib: () => Uint8Array;
  onClose: () => void;
}

type Format = "lib" | "gam";

function download(bytes: Uint8Array, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ExportDialog({ name, lib, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<Format>("gam");
  const [kit, setKit] = useState(false);
  const [donor, setDonor] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [donorError, setDonorError] = useState<string | null>(null);
  const [engine, setEngine] = useState<GamEngine>("react");
  const [english, setEnglish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = (name.replace(/[^\w一-鿿-]+/g, "_") || "game") + (format === "lib" ? ".lib" : ".gam");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  // (Fulu needs the kit's engine)
  useEffect(() => {
    if (!kit && engine === "fulu") setEngine("react");
  }, [kit, engine]);

  const pickDonor = async (f: File | undefined) => {
    if (!f) return;
    const data = new Uint8Array(await f.arrayBuffer());
    const problem = donorProblem(data);
    setDonorError(problem ? `${f.name}: ${problem}.` : null);
    setDonor(problem ? null : { name: `${gamInfo(data).name || f.name}`, data });
  };

  const run = () => {
    try {
      const bytes = lib();
      if (format === "lib") download(bytes, file);
      else download(buildGam(bytes, name, engine, kit ? donor?.data : undefined, kit && english), file);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ready = format === "lib" || !kit || !!donor;
  return (
    <dialog ref={dialog} className="export-dialog" onClose={onClose} onCancel={onClose}>
      <form method="dialog" onSubmit={(e) => (e.preventDefault(), run())}>
        <h2>Export “{name}”</h2>

        <fieldset>
          <legend>File</legend>
          <label className="choice">
            <input type="radio" name="fmt" checked={format === "gam"} onChange={() => setFormat("gam")} />
            <span>
              <strong>.gam</strong> — a 4988 program, for the Games page (and, with the RPG kit's engine, for Fulu and the device)
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="fmt" checked={format === "lib"} onChange={() => setFormat("lib")} />
            <span>
              <strong>.lib</strong> — the game's resources alone, for FMJ React and other fmj players
            </span>
          </label>
        </fieldset>

        {format === "gam" && (
          <>
            <fieldset>
              <legend>Engine inside the .gam</legend>
              <label className="choice">
                <input type="radio" name="kit" checked={!kit} onChange={() => setKit(false)} />
                <span>
                  <strong>None</strong> — plays on FMJ React. On a device it only ends; no BBK code is in the file.
                </span>
              </label>
              <label className="choice">
                <input type="radio" name="kit" checked={kit} onChange={() => setKit(true)} />
                <span>
                  <strong>The RPG kit's engine, from a .gam you own</strong> — one made with BBK's RPG kit (the 伏魔记 series, 英雄坛说). Its program is
                  kept and its game replaced by yours, so it also runs on Fulu and the original OS. Share such a file only if you may share that game.
                </span>
              </label>
              {kit && (
                <div className="donor">
                  <label className="button ghost small">
                    {donor ? "Choose another .gam…" : "Choose the .gam…"}
                    <input type="file" accept=".gam,.GAM" hidden onChange={(e) => void pickDonor(e.target.files?.[0])} />
                  </label>
                  <span className="small">{donor ? `Engine from ${donor.name}` : "None chosen"}</span>
                  {donorError && <p className="error small">{donorError}</p>}
                </div>
              )}
              {kit && (
                <label className="choice">
                  <input type="checkbox" checked={english} onChange={(e) => setEnglish(e.target.checked)} />
                  <span>
                    <strong>English menus</strong> — the engine's own menus and messages (属性 魔法 物品 系统, battle commands, shops, saving) in
                    English, for a game in English. Each is replaced by English of the same length, so nothing else in the engine changes.
                  </span>
                </label>
              )}
            </fieldset>

            <fieldset>
              <legend>Opens on this site with</legend>
              <label className="choice">
                <input type="radio" name="engine" checked={engine === "react"} onChange={() => setEngine("react")} />
                <span>
                  <strong>FMJ React</strong> (default) — HD text, wider maps, More text, the debug menu
                </span>
              </label>
              <label className={kit ? "choice" : "choice disabled"}>
                <input type="radio" name="engine" checked={engine === "fulu"} disabled={!kit} onChange={() => setEngine("fulu")} />
                <span>
                  <strong>Fulu</strong> — the 4988's OS stand-in, running the kit's engine as the device does{kit ? "" : " (needs the RPG kit's engine)"}
                </span>
              </label>
              <p className="muted small">Players can still pick another engine for it on the Games page.</p>
            </fieldset>
          </>
        )}

        {error && <p className="error small">{error}</p>}
        <div className="row">
          <span className="muted small">{file}</span>
          <div className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!ready}>
            Export
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Opens a modal <dialog> when it mounts, the way every editor dialog does.
// Two things the browser does not do for a dialog that React removes:
// - focus goes back to what had it before (the browser only does that on
//   dialog.close(); a dialog closed by Escape or Close is unmounted instead,
//   and focus fell to the page's body);
// - a dialog taller than the window opens at its top, even when the control
//   it focuses (the Close button of Help) is further down.
import { useEffect, type RefObject } from "react";

export function useShowModal(dialog: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    if (d) d.scrollTop = 0;
    return () => {
      // (only when focus would otherwise be lost: the dialog may have moved it on purpose)
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
      if (opener?.isConnected && lost) opener.focus({ preventScroll: true });
    };
  }, [dialog]);
}

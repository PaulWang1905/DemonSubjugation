// Notes the step palette shows for things an author looks for that the
// engine does not have (no step would match, or only unrelated ones): what
// to do instead, with the steps that come closest.

export interface PaletteNote {
  id: string;
  title: string;
  text: string;
  /** Steps that help, by instruction name, with their button text. */
  steps: { name: string; label: string }[];
}

const NOTES: (PaletteNote & { words: string[] })[] = [
  {
    id: "dark",
    words: ["dark", "darkness", "darken", "light", "lights", "lit", "lighting", "lamp", "torch", "night", "dim", "fade", "black", "shadow"],
    title: "No darkness in this engine",
    text:
      "Every map is drawn fully lit, and no step dims or fades the screen. Make a place look dark with dark tiles (paint it with the darker tiles, or draw a darker tileset), and say it in words. A picture can be shown over the map with Play animation, and a lamp or torch object can show its lit frame with Open object.",
    steps: [
      { name: "movie", label: "Play animation" },
      { name: "boxopen", label: "Open object" },
      { name: "message", label: "Show message" },
    ],
  },
];

/** The note for a search, if a word of it asks for something the engine lacks. */
export function paletteNote(query: string): PaletteNote | null {
  const words = query.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!words.length) return null;
  const n = NOTES.find((x) => words.some((w) => x.words.includes(w) || (w.length >= 4 && x.words.some((k) => k.startsWith(w)))));
  if (!n) return null;
  const { words: _w, ...note } = n;
  return note;
}

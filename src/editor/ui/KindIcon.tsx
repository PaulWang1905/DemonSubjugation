// A small icon for each kind of resource (a map, a script, a person…), for
// the tabs: shorter than the kind's name, which stays in the tooltip and
// for screen readers.
type Ref = { resType: number; type: number };

type Shape = "map" | "script" | "person" | "party" | "monster" | "object" | "item" | "spell" | "art" | "tiles" | "film" | "table";

export function kindShape(r: Ref): Shape {
  switch (r.resType) {
    case 1:
      return "script";
    case 2:
      return "map";
    case 3:
      return r.type === 1 ? "party" : r.type === 3 ? "monster" : r.type === 4 ? "object" : "person";
    case 4:
      return "spell";
    case 5:
      return "film";
    case 6:
      return "item";
    case 7:
      return "tiles";
    case 12:
      return "table";
    default:
      return "art";
  }
}

const PATHS: Record<Shape, string> = {
  // a folded map
  map: "M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14",
  // a page with lines
  script: "M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M5.5 7.5h5M5.5 10h5M5.5 12.5h3",
  // head and shoulders
  person: "M8 2.2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2zM2.8 14.5c.4-3 2.5-5 5.2-5s4.8 2 5.2 5",
  // head, shoulders and a star
  party: "M7 2.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM2 14.5c.4-2.9 2.3-4.8 5-4.8 1.3 0 2.4.4 3.3 1.2M12.5 9.5l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.5.9.3-1.7-1.2-1.2 1.7-.2z",
  // horns and eyes
  monster: "M3 6.5 1.8 2.2l3.3 2.4A6 6 0 0 1 8 4a6 6 0 0 1 2.9.6l3.3-2.4L13 6.5c.6.8 1 1.9 1 3 0 2.8-2.7 5-6 5s-6-2.2-6-5c0-1.1.4-2.2 1-3zM6 9.2h.01M10 9.2h.01",
  // a chest
  object: "M2 7h12v6.5H2zM2 7V5.5C2 3.8 3.3 2.5 5 2.5h6c1.7 0 3 1.3 3 3V7M7 7v2.5h2V7",
  // a flask
  item: "M6 1.8h4M6.5 1.8v4L2.8 12.2c-.6 1 .1 2.3 1.3 2.3h7.8c1.2 0 1.9-1.3 1.3-2.3L9.5 5.8v-4M4.6 9.5h6.8",
  // a sparkle
  spell: "M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8l5.2-1.3z",
  // a picture
  art: "M1.8 2.8h12.4v10.4H1.8zM1.8 11l3.6-3.6 3 3 2-2 3.8 3.8M10.5 5.6h.01",
  // a grid of tiles
  tiles: "M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z",
  // a film strip
  film: "M2.5 1.5h11v13h-11zM5 1.5v13M11 1.5v13M2.5 5h2.5M2.5 8h2.5M2.5 11h2.5M11 5h2.5M11 8h2.5M11 11h2.5",
  // a table
  table: "M1.8 2.5h12.4v11H1.8zM1.8 6h12.4M1.8 9.7h12.4M6 2.5v11",
};

/** The kind's icon (decorative: give the kind's name in the text or aria-label beside it). */
export function KindIcon({ of, className }: { of: Ref; className?: string }) {
  return (
    <svg className={className ?? "kind-icon"} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d={PATHS[kindShape(of)]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

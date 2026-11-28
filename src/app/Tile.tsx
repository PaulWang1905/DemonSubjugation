// A tile of the Games page's library: an LCD cover with its number and the
// name in pixel type, what it is, and what can be done with it.
import { Fragment, type ReactNode } from "react";

export const Arrow = () => (
  <span className="h-arrow" aria-hidden="true">
    →
  </span>
);

export function Tile({ no, art, meta, title, children, className }: { no: number; art: string; meta: string; title: string; children: ReactNode; className?: string }) {
  return (
    <li className={`g-tile${className ? ` ${className}` : ""}`}>
      <div className="g-art" aria-hidden="true">
        <span className="h-game-no">{String(no).padStart(2, "0")}</span>
        <span className="g-logo">{art}</span>
      </div>
      <div className="g-body">
        {/* (each part keeps together: a date does not break in two) */}
        <p className="h-meta">
          {meta.split(" · ").map((part, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              <span className="g-meta-part">{part}</span>
            </Fragment>
          ))}
        </p>
        <h3 title={title}>{title}</h3>
        {children}
      </div>
    </li>
  );
}


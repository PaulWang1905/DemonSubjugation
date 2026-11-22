// What shows while a game or a project loads: what is opening, the step
// under way (with how far it is, when it counts), the steps done and to
// come, and a moving mark, so a slow start never looks frozen. The mark and
// the bar move on the compositor (opacity and transform only), so they keep
// moving even while the page works in one long step; with reduced motion
// they stand still. The editor's project loading uses the full card; the
// players use the compact one over their screen.
import "./loading.css";

export interface LoadingStepView {
  label: string;
  /** For a step that counts: done so far, and how many in all. */
  done?: number;
  total?: number;
  /** Say how far as a percentage (for counts that mean nothing to a person, such as emulated frames). */
  percent?: boolean;
}

/** "37 of 185", or "20%". */
function countText(s: LoadingStepView, of: string, done = s.done ?? 0): string {
  return s.percent ? `${Math.round((Math.min(done, s.total!) / s.total!) * 100)}%` : `${done} ${of} ${s.total}`;
}

interface Props {
  /** A small line above the title ("BBK Maker"). */
  kicker?: string;
  /** What is opening ("Opening 伏魔记…"). */
  title: string;
  steps: readonly LoadingStepView[];
  /** The step under way: those before it are done. */
  current: number;
  /** "of" in "37 of 185" (for the page's language). */
  of?: string;
  /** Over a player's screen: one line and a bar. */
  compact?: boolean;
  /** The screen reader's name for the bar. */
  progressLabel?: string;
}

/** How far along, 0-1: the steps done, and the counted part of the one under way. */
export function loadingProgress(steps: readonly LoadingStepView[], current: number): number {
  if (!steps.length) return 0;
  const s = steps[Math.min(current, steps.length - 1)];
  const part = s && s.total ? Math.min(1, (s.done ?? 0) / s.total) : 0;
  return Math.min(1, (Math.min(current, steps.length) + part) / steps.length);
}

/** The mark that moves while something loads (eight LCD cells in a ring). */
export function LoadingMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "ld-mark small" : "ld-mark"} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ ["--i" as string]: i }} />
      ))}
    </span>
  );
}

export function LoadingScreen({ kicker, title, steps, current, of = "of", compact = false, progressLabel = "Progress" }: Props) {
  const now = steps[Math.min(current, steps.length - 1)];
  const pct = Math.round(loadingProgress(steps, current) * 100);
  const count = now && now.total ? countText(now, of) : null;
  const bar = (
    <div className="ld-bar" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={now ? `${now.label}${count ? `: ${count}` : ""}` : undefined}>
      <span className="ld-fill" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
  if (compact)
    return (
      <div className="ld-screen ld-compact" role="status" aria-live="polite" aria-busy="true">
        <div className="ld-chip">
          <LoadingMark small />
          <div className="ld-chip-text">
            <strong>{title}</strong>
            {now && (
              <span>
                {now.label}
                {count && <span className="ld-count"> · {count}</span>}
              </span>
            )}
            {bar}
          </div>
        </div>
      </div>
    );
  return (
    <div className="ld-screen ld-page" role="status" aria-live="polite" aria-busy="true">
      <div className="ld-card">
        <div className="ld-head">
          <LoadingMark />
          <div>
            {kicker && <p className="ld-kicker">{kicker}</p>}
            <h2 className="ld-title">{title}</h2>
          </div>
        </div>
        {bar}
        <ol className="ld-steps">
          {steps.map((s, i) => {
            const state = i < current ? "done" : i === current ? "now" : "next";
            return (
              <li key={i} className={state} aria-current={state === "now" ? "step" : undefined}>
                <span className="ld-tick" aria-hidden="true">
                  {state === "done" ? "✓" : state === "now" ? "›" : "·"}
                </span>
                <span className="ld-label">{s.label}</span>
                {s.total ? <span className="ld-count">{countText(s, of, state === "done" ? s.total : state === "now" ? (s.done ?? 0) : 0)}</span> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// The site's pages besides Games and the editor: Home, Guide and About,
// and the footer they share.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttractScreen } from "./AttractScreen";
import { GitHubMark, REPO_URL } from "./links";
import { Link } from "./router";
import { useSiteLang } from "./siteLang";
import { SITE_TEXT } from "./siteText";

type PlayDemo = (which?: "bell" | "lantern") => void;

/** A "→" that slides on hover (decorative). */
const Arrow = () => (
  <span className="h-arrow" aria-hidden="true">
    →
  </span>
);

/**
 * How far the page has scrolled through `el`, whose sticky content sits `top`
 * pixels from the top of the window: 0 when it starts, 1 when its end is in view.
 */
function scrollProgress(el: HTMLElement, top: number): number {
  const r = el.getBoundingClientRect();
  const span = el.offsetHeight - (window.innerHeight - top);
  return span > 0 ? Math.min(1, Math.max(0, (top - r.top) / span)) : 1;
}

/** The scroll-driven hero runs on big enough screens, unless motion is reduced. */
const SCROLL_HERO = "(min-width: 1000px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)";

/** Smaller screens start with the title hidden below the game (it rises when scrolled to). */
const revealAtFirst = () =>
  typeof matchMedia === "function" && !matchMedia(SCROLL_HERO).matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HomePage({ onPlayDemo, onOpenGames, busy }: { onPlayDemo: PlayDemo; onOpenGames: (files: File[]) => void; busy: boolean }) {
  const [preview, setPreview] = useState(true);
  // the visitor's own game: a file picker, and the upload section takes a drop
  const input = useRef<HTMLInputElement>(null);
  const choose = () => input.current?.click();
  const [drag, setDrag] = useState(false);
  const hidePreview = useCallback(() => setPreview(false), []);
  const t = SITE_TEXT[useSiteLang()];
  const hero = useRef<HTMLElement>(null);
  const monitor = useRef<HTMLElement>(null);

  // The hero: the live game first fills the window; scrolling shrinks it to
  // its place while the title comes in below it. (A layout effect: the first
  // state is set before the page is painted, so the end state never flashes.)
  useLayoutEffect(() => {
    const el = hero.current;
    const mon = monitor.current;
    if (!el || !mon) return;
    const mq = matchMedia(SCROLL_HERO);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    // smaller screens: the title waits below the game and rises when scrolled to
    const copy = el.querySelector(".h-hero-copy");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) el.classList.add("h-in");
      },
      { threshold: 0.2 },
    );
    if (copy) io.observe(copy);
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!mq.matches) {
        el.style.removeProperty("--p");
        mon.style.transform = "";
        el.classList.toggle("h-reveal", !still.matches);
        return;
      }
      el.classList.remove("h-reveal");
      // (the stage sticks under the top bar)
      const bar = (document.querySelector(".topbar") as HTMLElement | null)?.offsetHeight ?? 0;
      el.style.setProperty("--bar", `${bar}px`);
      const p = scrollProgress(el, bar);
      el.style.setProperty("--p", p.toFixed(4));
      // from the window-filling size (q = 1) to the monitor's place in the grid (q = 0)
      const stage = mon.offsetParent as HTMLElement | null;
      if (!stage) return;
      const w = mon.offsetWidth;
      const h = mon.offsetHeight;
      // (room above, and below for the scroll hint)
      const top = 20;
      const bottom = 84;
      const s0 = Math.min((stage.clientWidth - 2 * top) / w, (stage.clientHeight - top - bottom) / h);
      const x0 = (stage.clientWidth - w * s0) / 2 - mon.offsetLeft;
      const y0 = top + (stage.clientHeight - top - bottom - h * s0) / 2 - mon.offsetTop;
      const k = Math.min(1, p / 0.45);
      const q = 1 - k * k * (3 - 2 * k); // smoothstep
      mon.style.transform = `translate(${(x0 * q).toFixed(1)}px, ${(y0 * q).toFixed(1)}px) scale(${(1 + (s0 - 1) * q).toFixed(4)})`;
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    // (again once the game's canvas has its size, and whenever it changes)
    const ro = new ResizeObserver(queue);
    ro.observe(mon);
    ro.observe(el);
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    mq.addEventListener("change", queue);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
      mq.removeEventListener("change", queue);
    };
  }, [preview]);

  // The showcase: the picture follows the line being read.
  const [shown, setShown] = useState(0);
  const lines = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setShown(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const l of lines.current) if (l) io.observe(l);
    return () => io.disconnect();
  }, []);

  const games = [
    { key: "bell" as const, art: "THE SILENT BELL", name: "The Silent Bell", meta: t.bellMeta, text: t.bellText },
    { key: "lantern" as const, art: "LANTERN PATH", name: "Lantern Path", meta: t.lanternMeta, text: t.lanternText },
  ];
  const does = [
    { to: "games" as const, title: t.doPlay.title, text: <>{t.doPlay.text}</>, link: t.doPlay.link },
    {
      to: "editor" as const,
      title: t.doMake.title,
      text: (
        <>
          {t.doMake.text[0]}
          <code>{t.doMake.text[1]}</code>
          {t.doMake.text[2]}
        </>
      ),
      link: t.doMake.link,
    },
    { to: "about" as const, title: t.doPrivate.title, text: <>{t.doPrivate.text}</>, link: t.doPrivate.link },
  ];
  const noArrow = (s: string) => s.replace(/^▶\s*/, "").replace(/\s*→$/, "");
  return (
    <div className="h-home">
      <section className={revealAtFirst() ? "h-hero h-reveal" : "h-hero"} id="top" ref={hero}>
        <div className="h-stage">
          <div className="h-hero-copy">
            <h1 className="h-title">
              {t.heroLines.map((l, i) => (
                <span key={i} className={i === 1 ? "accent" : undefined} style={{ "--i": i } as React.CSSProperties}>
                  {l}
                </span>
              ))}
            </h1>
            <p className="h-lead">
              {t.heroLead[0]}
              <em>{t.heroLead[1]}</em>
              {t.heroLead[2]}
            </p>
            <div className="h-cta">
              <button className="h-btn h-btn-primary" onClick={choose} disabled={busy}>
                {t.uploadCta}
                <span className="h-arrow" aria-hidden="true">
                  ↑
                </span>
              </button>
              <button className="h-link" onClick={() => onPlayDemo("bell")}>
                {t.tryBell}
                <span className="h-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          </div>
          {preview && (
            <figure className="h-monitor" ref={monitor}>
              <div className="h-monitor-bar" aria-hidden="true">
                <span className="h-rec">{t.monitor.live}</span>
                <span>{t.monitor.title}</span>
                <span>{t.monitor.res}</span>
              </div>
              <div className="h-monitor-screen">
                <AttractScreen onError={hidePreview} />
              </div>
            </figure>
          )}
          <span className="h-scroll-hint" aria-hidden="true">
            {t.scrollHint}
          </span>
        </div>
      </section>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onOpenGames(files);
        }}
      />
      <section
        className={drag ? "h-upload drag" : "h-upload"}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const files = [...e.dataTransfer.files];
          if (files.length) onOpenGames(files);
        }}
      >
        <div className="h-upload-copy">
          <h2>{t.upload.title}</h2>
          <p>
            {t.upload.text[0]}
            <strong>{t.upload.text[1]}</strong>
            {t.upload.text[2]}
          </p>
        </div>
        <div className="h-upload-zone">
          <button className="h-btn h-btn-dark" onClick={choose} disabled={busy}>
            {busy ? t.upload.busy : t.upload.button}
            <span className="h-arrow" aria-hidden="true">
              ↑
            </span>
          </button>
          <span className="h-upload-drop">{t.upload.drop}</span>
          <span className="h-upload-hint">{t.upload.hint}</span>
        </div>
      </section>

      <section className="h-show">
        <header className="h-show-head">
          <h2>{t.betterTitle}</h2>
          <p>{t.betterSub}</p>
        </header>
        <div className="h-show-body">
          <div className="h-show-lines">
            {t.better.map((b, i) => (
              <article key={b.title} className={i === shown ? "on" : undefined} data-i={i} ref={(el) => {
                  lines.current[i] = el;
                }}
              >
                <img className="h-show-inline" src={b.img} alt={b.alt} width={800} height={480} loading="lazy" />
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </article>
            ))}
          </div>
          <div className="h-show-media" aria-hidden="true">
            <div className="h-show-frame">
              {t.better.map((b, i) => (
                <img key={b.img} src={b.img} alt="" className={i === shown ? "on" : undefined} width={800} height={480} />
              ))}
              <span className="h-show-count">
                {String(shown + 1).padStart(2, "0")} / {String(t.better.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.doTitle}</h2>
        </header>
        <div className="h-rows">
          {does.map((d, i) => (
            <Link key={d.to} to={d.to} className="h-row">
              <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="h-row-title">{d.title}</span>
              <span className="h-row-text">{d.text}</span>
              <span className="h-row-link">
                {noArrow(d.link)}
                <Arrow />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <h2>{t.startTitle}</h2>
          <p>{t.startSub}</p>
        </header>
        <div className="h-games">
          {games.map((g, i) => (
            <article key={g.key} className="h-game">
              <button className="h-game-art" onClick={() => onPlayDemo(g.key)} aria-label={`${noArrow(t.play)} ${g.name}`}>
                <span className="h-game-no">{String(i + 1).padStart(2, "0")}</span>
                <span className="h-game-logo">{g.art}</span>
              </button>
              <div className="h-game-body">
                <p className="h-meta">{g.meta}</p>
                <h3>{g.name}</h3>
                <p>{g.text}</p>
                <button className="h-btn h-btn-dark" onClick={() => onPlayDemo(g.key)}>
                  {noArrow(t.play)}
                  <Arrow />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

    </div>
  );
}

export function GuidePage() {
  const g = SITE_TEXT[useSiteLang()].guide;
  return (
    <div className="library page">
      <header className="page-head">
        <p className="eyebrow">{g.eyebrow}</p>
        <h1>{g.title}</h1>
        <p className="lead">{g.lead}</p>
      </header>

      <section className="how">
        <header className="section-head">
          <h2 className="section-title">{g.stepsTitle}</h2>
        </header>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <h3>{g.step1.title}</h3>
            <p>
              {g.step1.text[0]}
              <em>{g.step1.text[1]}</em>
              {g.step1.text[2]}
              <em>{g.step1.text[3]}</em>
              {g.step1.text[4]}
              <code>{g.step1.text[5]}</code>
              {g.step1.text[6]}
              <Link to="games">{g.step1.text[7]}</Link>
              {g.step1.text[8]}
            </p>
          </li>
          <li>
            <span className="step-n">2</span>
            <h3>{g.step2.title}</h3>
            <p>{g.step2.text}</p>
          </li>
          <li>
            <span className="step-n">3</span>
            <h3>{g.step3.title}</h3>
            <p>
              {g.step3.text[0]}
              <Link to="editor">{g.step3.text[1]}</Link>
              {g.step3.text[2]}
              <code>{g.step3.text[3]}</code>
              {g.step3.text[4]}
            </p>
          </li>
        </ol>
      </section>

      <section>
        <header className="section-head">
          <h2 className="section-title">{g.controlsTitle}</h2>
          <p className="section-sub">{g.controlsSub}</p>
        </header>
        <div className="about-body">
          <table className="keys guide-keys">
            <thead>
              <tr>
                {g.keysHead.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.keys.map(([what, keys, pad]) => (
                <tr key={what}>
                  <th>{what}</th>
                  <td>{keys}</td>
                  <td>{pad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <header className="section-head">
          <h2 className="section-title">{g.tipsTitle}</h2>
        </header>
        <ul className="tips">
          {g.tips.map((tip) => (
            <li key={tip.title}>
              <h3>{tip.title}</h3>
              <p>{tip.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function AboutPage() {
  const a = SITE_TEXT[useSiteLang()].about;
  return (
    <div className="library page">
      <header className="page-head">
        <p className="eyebrow">{a.eyebrow}</p>
        <h1>{a.title}</h1>
      </header>
      <div className="about-body">
        <p>
          {a.p1[0]}
          <em>{a.p1[1]}</em>
          {a.p1[2]}
        </p>
        <p>{a.p2}</p>
        <dl className="facts">
          {a.facts.map(([k, v], i) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {i === a.facts.length - 1 ? (
                  <a href={REPO_URL} target="_blank" rel="noreferrer">
                    {v}
                  </a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <header className="section-head">
        <h2 className="section-title">{a.builtTitle}</h2>
      </header>
      <ul className="tips">
        <li>
          <h3>
            <a href="https://gitee.com/bgwp/fmj.kt" target="_blank" rel="noreferrer">
              fmj.kt
            </a>
          </h3>
          <p>{a.fmjkt}</p>
        </li>
        <li>
          <h3>
            <a href="https://gitee.com/BA4988/fmj-engine" target="_blank" rel="noreferrer">
              fmj-engine
            </a>
          </h3>
          <p>{a.fmjEngine}</p>
        </li>
        <li>
          <h3>baye-fmj-app</h3>
          <p>{a.baye}</p>
        </li>
      </ul>

      <header className="section-head">
        <h2 className="section-title">{a.privacyTitle}</h2>
      </header>
      <div className="about-body">
        <p>{a.privacy}</p>
        <p>
          {a.issue[0]}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            {a.issue[1]}
          </a>
          {a.issue[2]}
        </p>
      </div>
    </div>
  );
}

/** Shown for an address the site does not have. */
export function NotFoundPage({ onPlayDemo }: { onPlayDemo: PlayDemo }) {
  return (
    <div className="library page">
      <section className="not-found">
        <div className="not-found-screen" aria-hidden="true">
          <span className="nf-code">404</span>
          <span className="nf-line">THE PATH ENDS HERE</span>
        </div>
        <p className="eyebrow">Page not found</p>
        <h1>This road leads nowhere</h1>
        <p className="lead">
          There is no page at <code>{location.pathname}</code>. It may have moved, or the link may be mistyped.
        </p>
        <div className="cta">
          <Link to="home" className="button big">
            Go to the home page
          </Link>
          <Link to="games" className="button big ghost">
            Your games
          </Link>
        </div>
        <p className="fine">
          <button className="link" onClick={() => onPlayDemo("bell")}>
            Or play The Silent Bell →
          </button>
        </p>
      </section>
    </div>
  );
}

export function SiteFooter({ onPlayDemo }: { onPlayDemo: PlayDemo }) {
  const t = SITE_TEXT[useSiteLang()];
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img src="/favicon.svg" alt="" width={24} height={24} />
        <strong>FMJ React</strong>
        <span className="muted">{t.footerTagline}</span>
      </div>
      <nav className="footer-links" aria-label={t.footerLabel}>
        <button className="link" onClick={() => onPlayDemo("bell")}>
          {t.footerPlay}
        </button>
        {(["games", "guide", "about", "editor"] as const).map((p) => (
          <Link key={p} to={p} className="link">
            {t.nav[p]}
          </Link>
        ))}
        <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
          <GitHubMark /> {t.footerSource}
        </a>
        <a className="link" href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
          {t.footerIssue}
        </a>
      </nav>
      <p className="muted small">
        {t.footerCredit[0]}
        <a href="https://gitee.com/bgwp/fmj.kt" target="_blank" rel="noreferrer">
          fmj.kt
        </a>
        {t.footerCredit[1]}
        <a href="https://gitee.com/BA4988/fmj-engine" target="_blank" rel="noreferrer">
          fmj-engine
        </a>
        {t.footerCredit[2]}
      </p>
      <p className="footer-wordmark" aria-hidden="true">
        {t.wordmark}
      </p>
    </footer>
  );
}

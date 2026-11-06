// The site's pages besides Games and the editor: Home, Guide and About,
// and the footer they share.
import { useCallback, useState } from "react";
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

export function HomePage({ onPlayDemo }: { onPlayDemo: PlayDemo }) {
  const [preview, setPreview] = useState(true);
  const hidePreview = useCallback(() => setPreview(false), []);
  const t = SITE_TEXT[useSiteLang()];
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
  return (
    <div className="h-home">
      <section className="h-hero" id="top">
        <div className="h-hero-copy">
          <p className="h-kicker">
            <span>{t.kicker[0]}</span>
            <span>{t.kicker[1]}</span>
          </p>
          <h1 className="h-title">
            {t.heroLines.map((l, i) => (
              <span key={i} className={i === 1 ? "accent" : undefined}>
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
            <button className="h-btn h-btn-primary" onClick={() => onPlayDemo("bell")}>
              {t.playBell.replace(/^▶\s*/, "")}
              <Arrow />
            </button>
            <Link to="games" className="h-btn h-btn-line">
              {t.browse}
              <Arrow />
            </Link>
          </div>
          <Link to="editor" className="h-textlink">
            {t.makeOwn}
          </Link>
          <ul className="h-specs" aria-label={t.highlightsLabel}>
            {t.highlights.map((h, i) => (
              <li key={h}>
                <span className="h-num">{String(i + 1).padStart(2, "0")}</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
        {preview && (
          <figure className="h-monitor">
            <div className="h-monitor-bar" aria-hidden="true">
              <span className="h-rec">{t.monitor.live}</span>
              <span>{t.monitor.title}</span>
              <span>{t.monitor.res}</span>
            </div>
            <div className="h-monitor-screen">
              <AttractScreen onError={hidePreview} />
            </div>
            <figcaption>
              <em>{t.caption[0]}</em>
              {t.caption[1]}
            </figcaption>
          </figure>
        )}
      </section>

      <div className="h-ticker" aria-hidden="true">
        <div className="h-ticker-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {t.ticker.map((w) => (
                <span key={w} className="h-ticker-item">
                  {w}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="h-section">
        <header className="h-sec-head">
          <span className="h-index">01</span>
          <h2>{t.startTitle}</h2>
          <p>{t.startSub}</p>
        </header>
        <div className="h-games">
          {games.map((g, i) => (
            <article key={g.key} className="h-game">
              <button className="h-game-art" onClick={() => onPlayDemo(g.key)} aria-label={`${t.play.replace(/^▶\s*/, "")} ${g.name}`}>
                <span className="h-game-no">{String(i + 1).padStart(2, "0")}</span>
                <span className="h-game-logo">{g.art}</span>
              </button>
              <div className="h-game-body">
                <p className="h-meta">{g.meta}</p>
                <h3>{g.name}</h3>
                <p>{g.text}</p>
                <button className="h-btn h-btn-dark" onClick={() => onPlayDemo(g.key)}>
                  {t.play.replace(/^▶\s*/, "")}
                  <Arrow />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <span className="h-index">02</span>
          <h2>{t.betterTitle}</h2>
          <p>{t.betterSub}</p>
        </header>
        <ul className="h-grid">
          {t.better.map((b, i) => (
            <li key={b.title}>
              <span className="h-cell-no">{`A.${String(i + 1).padStart(2, "0")}`}</span>
              <span className="h-stat" aria-hidden="true">
                {b.stat}
              </span>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="h-section">
        <header className="h-sec-head">
          <span className="h-index">03</span>
          <h2>{t.doTitle}</h2>
          <p>{t.doSub}</p>
        </header>
        <div className="h-rows">
          {does.map((d, i) => (
            <Link key={d.to} to={d.to} className="h-row">
              <span className="h-row-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="h-row-title">{d.title}</span>
              <span className="h-row-text">{d.text}</span>
              <span className="h-row-link">
                {d.link.replace(/\s*→$/, "")}
                <Arrow />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="h-band">
        <div>
          <span className="h-index">04</span>
          <h2>{t.ctaTitle}</h2>
          <p>{t.ctaText}</p>
        </div>
        <Link to="guide" className="h-btn h-btn-primary">
          {t.ctaButton}
          <Arrow />
        </Link>
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

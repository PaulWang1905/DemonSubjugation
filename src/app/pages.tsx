// The site's pages besides Games and the editor: Home, Guide and About,
// and the footer they share.
import { useCallback, useState } from "react";
import { AttractScreen } from "./AttractScreen";
import { GitHubMark, REPO_URL } from "./links";
import { Link } from "./router";
import { useSiteLang } from "./siteLang";
import { SITE_TEXT } from "./siteText";

type PlayDemo = (which?: "bell" | "lantern") => void;

export function HomePage({ onPlayDemo }: { onPlayDemo: PlayDemo }) {
  const [preview, setPreview] = useState(true);
  const hidePreview = useCallback(() => setPreview(false), []);
  const t = SITE_TEXT[useSiteLang()];
  return (
    <div className="library page">
      <section className="hero" id="top">
        <div className="hero-text">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p className="lead">
            {t.heroLead[0]}
            <em>{t.heroLead[1]}</em>
            {t.heroLead[2]}
          </p>
          <div className="cta">
            <button className="big" onClick={() => onPlayDemo("bell")}>
              {t.playBell}
            </button>
            <Link to="games" className="button big ghost">
              {t.browse}
            </Link>
          </div>
          <p className="fine">
            <Link to="editor" className="link">
              {t.makeOwn}
            </Link>
          </p>
          <ul className="highlights" aria-label={t.highlightsLabel}>
            {t.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
        {preview && (
          <figure className="hero-screen">
            <div className="device">
              <div className="device-screen">
                <AttractScreen onError={hidePreview} />
              </div>
              <div className="device-keys" aria-hidden="true">
                <span className="dpad" />
                <span className="ab">
                  <i />
                  <i />
                </span>
              </div>
            </div>
            <figcaption>
              <em>{t.caption[0]}</em>
              {t.caption[1]}
            </figcaption>
          </figure>
        )}
      </section>

      <header className="section-head">
        <h2 className="section-title">{t.startTitle}</h2>
        <p className="section-sub">{t.startSub}</p>
      </header>
      <section className="featured">
        <article className="feature-game">
          <div className="card-art" aria-hidden="true">
            <span>THE SILENT BELL</span>
          </div>
          <div className="feature-game-body">
            <h3>The Silent Bell</h3>
            <p className="muted small">{t.bellMeta}</p>
            <p>{t.bellText}</p>
            <button onClick={() => onPlayDemo("bell")}>{t.play}</button>
          </div>
        </article>
        <article className="feature-game">
          <div className="card-art" aria-hidden="true">
            <span>LANTERN PATH</span>
          </div>
          <div className="feature-game-body">
            <h3>Lantern Path</h3>
            <p className="muted small">{t.lanternMeta}</p>
            <p>{t.lanternText}</p>
            <button onClick={() => onPlayDemo("lantern")}>{t.play}</button>
          </div>
        </article>
      </section>

      <header className="section-head">
        <h2 className="section-title">{t.betterTitle}</h2>
        <p className="section-sub">{t.betterSub}</p>
      </header>
      <section className="features better">
        {t.better.map((b) => (
          <article key={b.title}>
            <span className="feat-icon" aria-hidden="true">
              {b.icon}
            </span>
            <h3>{b.title}</h3>
            <p>{b.text}</p>
          </article>
        ))}
      </section>

      <header className="section-head">
        <h2 className="section-title">{t.doTitle}</h2>
        <p className="section-sub">{t.doSub}</p>
      </header>
      <section className="features">
        <article>
          <span className="feat-icon" aria-hidden="true">
            ▶
          </span>
          <h3>{t.doPlay.title}</h3>
          <p>{t.doPlay.text}</p>
          <Link to="games" className="link">
            {t.doPlay.link}
          </Link>
        </article>
        <article>
          <span className="feat-icon" aria-hidden="true">
            ✎
          </span>
          <h3>{t.doMake.title}</h3>
          <p>
            {t.doMake.text[0]}
            <code>{t.doMake.text[1]}</code>
            {t.doMake.text[2]}
          </p>
          <Link to="editor" className="link">
            {t.doMake.link}
          </Link>
        </article>
        <article>
          <span className="feat-icon" aria-hidden="true">
            ◆
          </span>
          <h3>{t.doPrivate.title}</h3>
          <p>{t.doPrivate.text}</p>
          <Link to="about" className="link">
            {t.doPrivate.link}
          </Link>
        </article>
      </section>

      <section className="cta-band">
        <div>
          <h2>{t.ctaTitle}</h2>
          <p>{t.ctaText}</p>
        </div>
        <Link to="guide" className="button big">
          {t.ctaButton}
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
    </footer>
  );
}

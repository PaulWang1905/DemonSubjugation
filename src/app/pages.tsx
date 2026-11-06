// The site's pages besides Games and the editor: Home, Guide and About,
// and the footer they share.
import { useCallback, useState } from "react";
import { AttractScreen } from "./AttractScreen";
import { KEY_HELP } from "./keys";
import { GitHubMark, REPO_URL } from "./links";
import { Link } from "./router";

type PlayDemo = (which?: "bell" | "lantern") => void;

export function HomePage({ onPlayDemo }: { onPlayDemo: PlayDemo }) {
  const [preview, setPreview] = useState(true);
  const hidePreview = useCallback(() => setPreview(false), []);
  return (
    <div className="library page">
      <section className="hero" id="top">
        <div className="hero-text">
          <p className="eyebrow">BBK electronic-dictionary RPG engine</p>
          <h1>Play and make pocket RPGs in your browser.</h1>
          <p className="lead">
            The engine behind 伏魔记 and the many community games made for it, rebuilt for the web. Start with <em>The Silent Bell</em>, a
            twenty-minute adventure made for this site, open a game you own, or build your own.
          </p>
          <div className="cta">
            <button className="big" onClick={() => onPlayDemo("bell")}>
              ▶ Play The Silent Bell
            </button>
            <Link to="games" className="button big ghost">
              Browse your games
            </Link>
          </div>
          <p className="fine">
            <Link to="editor" className="link">
              Or make your own game in the editor →
            </Link>
          </p>
          <ul className="highlights" aria-label="Highlights">
            <li>Runs in the browser</li>
            <li>Keyboard and touch</li>
            <li>Saves on your device</li>
            <li>Free, nothing uploaded</li>
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
              <em>Lantern Path</em>, the short demo, playing itself.
            </figcaption>
          </figure>
        )}
      </section>

      <header className="section-head">
        <h2 className="section-title">Two games to start with</h2>
        <p className="section-sub">Both were made for this site with its own editor, and both are free to play.</p>
      </header>
      <section className="featured">
        <article className="feature-game">
          <div className="card-art" aria-hidden="true">
            <span>THE SILENT BELL</span>
          </div>
          <div className="feature-game-body">
            <h3>The Silent Bell</h3>
            <p className="muted small">About 20 minutes · two heroes · four bosses</p>
            <p>
              Every dawn the great bell of Bellhaven rings the fog away. This morning it was silent. Bring back the three shards of its heartstone
              from the forest, the old quarry and the mire.
            </p>
            <button onClick={() => onPlayDemo("bell")}>▶ Play</button>
          </div>
        </article>
        <article className="feature-game">
          <div className="card-art" aria-hidden="true">
            <span>LANTERN PATH</span>
          </div>
          <div className="feature-game-body">
            <h3>Lantern Path</h3>
            <p className="muted small">About 3 minutes · a first taste</p>
            <p>The hamlet's great lantern has gone dark. Find the Spark Stone in the glade to the east and light it again.</p>
            <button onClick={() => onPlayDemo("lantern")}>▶ Play</button>
          </div>
        </article>
      </section>

      <header className="section-head">
        <h2 className="section-title">What you can do</h2>
        <p className="section-sub">Play the classics you own, try the demos, or make a game of your own.</p>
      </header>
      <section className="features">
        <article>
          <span className="feat-icon" aria-hidden="true">
            ▶
          </span>
          <h3>Play</h3>
          <p>Keyboard or on-screen keypad, three save slots per game, LCD colour palettes, 2× and 4× speed, and English or Chinese menus.</p>
          <Link to="games" className="link">
            Your games →
          </Link>
        </article>
        <article>
          <span className="feat-icon" aria-hidden="true">
            ✎
          </span>
          <h3>Make</h3>
          <p>
            Paint maps, write story scripts, design characters, items and spells, draw sprites and time spell effects. Playtest in one click and
            export a <code>.lib</code>.
          </p>
          <Link to="editor" className="link">
            Open the editor →
          </Link>
        </article>
        <article>
          <span className="feat-icon" aria-hidden="true">
            ◆
          </span>
          <h3>Private</h3>
          <p>Nothing is uploaded. Games, saves and projects stay in this browser, and the site ships no game content apart from its own demos.</p>
          <Link to="about" className="link">
            About the project →
          </Link>
        </article>
      </section>

      <section className="cta-band">
        <div>
          <h2>New to BBK games?</h2>
          <p>The guide covers the controls, saving, playing on a phone and the options worth knowing.</p>
        </div>
        <Link to="guide" className="button big">
          Read the guide
        </Link>
      </section>
    </div>
  );
}

export function GuidePage() {
  return (
    <div className="library page">
      <header className="page-head">
        <p className="eyebrow">Guide</p>
        <h1>How to play</h1>
        <p className="lead">Everything you need to pick up a game, play it on any device and keep your progress.</p>
      </header>

      <section className="how">
        <header className="section-head">
          <h2 className="section-title">Three steps</h2>
        </header>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <h3>Pick a game</h3>
            <p>
              Start with <em>The Silent Bell</em> or <em>Lantern Path</em>, open a <code>.lib</code> archive you own, or add one from a link on the{" "}
              <Link to="games">Games</Link> page.
            </p>
          </li>
          <li>
            <span className="step-n">2</span>
            <h3>Play anywhere</h3>
            <p>Keyboard on a computer, a full-screen keypad on a phone. Save at any time; saves stay in this browser.</p>
          </li>
          <li>
            <span className="step-n">3</span>
            <h3>Make your own</h3>
            <p>
              On a computer, open the <Link to="editor">editor</Link>: paint maps, write the story, draw sprites, playtest in one click and export a{" "}
              <code>.lib</code>.
            </p>
          </li>
        </ol>
      </section>

      <section>
        <header className="section-head">
          <h2 className="section-title">Controls</h2>
          <p className="section-sub">On a phone the keypad appears by itself: slide your thumb on the d-pad to turn, and hold a direction with A.</p>
        </header>
        <div className="about-body">
          <table className="keys guide-keys">
            <thead>
              <tr>
                <th>Action</th>
                <th>Keyboard</th>
                <th>Phone keypad</th>
              </tr>
            </thead>
            <tbody>
              {KEY_HELP.map(([what, keys], i) => (
                <tr key={what}>
                  <th>{what}</th>
                  <td>{keys}</td>
                  <td>{["D-pad", "A (OK)", "B (Back)", "PgUp / PgDn"][i] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <header className="section-head">
          <h2 className="section-title">Tips</h2>
        </header>
        <ul className="tips">
          <li>
            <h3>Saving</h3>
            <p>Press Back on the map to open the menu, then System → Save. Each game has three save slots, kept in this browser.</p>
          </li>
          <li>
            <h3>Full screen</h3>
            <p>The ⛶ button shows only the game. On an iPhone, add the site to your home screen to play without the browser bars.</p>
          </li>
          <li>
            <h3>Pixel or HD text</h3>
            <p>
              Text is Pixel (the handheld's 16×16 bitmap look) or HD (redrawn at your screen's full resolution). Pick a font for Chinese and one for English
              under it; each look remembers its own.
            </p>
          </li>
          <li>
            <h3>More text per page</h3>
            <p>The experimental More text option fits more words into dialogue, menus and descriptions, so there is less paging.</p>
          </li>
          <li>
            <h3>Original engine rules</h3>
            <p>On by default: battles, items and scripts follow the original device's engine. Turn it off for fmj.kt's simpler rules.</p>
          </li>
          <li>
            <h3>Your own fonts</h3>
            <p>
              Have the device's <code>HZK16</code> and <code>ASC16</code> files? Add them on the Games page for the original font.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="library page">
      <header className="page-head">
        <p className="eyebrow">About</p>
        <h1>A pocket RPG engine, rebuilt for the web</h1>
      </header>
      <div className="about-body">
        <p>
          In the 2000s, BBK electronic dictionaries shipped with a small role-playing game engine. <em>伏魔记</em> was its best-known game, and fans went on
          to make many more for it.
        </p>
        <p>
          FMJ React brings that engine to the web. It is a TypeScript port of the open-source fmj.kt re-implementation, checked against a reconstruction
          of the original engine so that battles, scripts and items behave as they did on the device. On top it adds sharp text, a phone layout, more
          text per page and a complete game editor.
        </p>
        <dl className="facts">
          <div>
            <dt>Engine</dt>
            <dd>TypeScript and React, no plugins</dd>
          </div>
          <div>
            <dt>Licence</dt>
            <dd>GPL-2.0, like fmj.kt</dd>
          </div>
          <div>
            <dt>Game data</dt>
            <dd>None included apart from the demos</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <header className="section-head">
        <h2 className="section-title">Built on</h2>
      </header>
      <ul className="tips">
        <li>
          <h3>
            <a href="https://gitee.com/bgwp/fmj.kt" target="_blank" rel="noreferrer">
              fmj.kt
            </a>
          </h3>
          <p>An open-source re-implementation of the BBK engine. FMJ React's engine is ported from it (GPL-2.0).</p>
        </li>
        <li>
          <h3>
            <a href="https://gitee.com/BA4988/fmj-engine" target="_blank" rel="noreferrer">
              fmj-engine
            </a>
          </h3>
          <p>A reconstruction of the original engine from its machine code, used to check how the device really behaved.</p>
        </li>
        <li>
          <h3>baye-fmj-app</h3>
          <p>A fork of the engine whose fixes and extra script commands were taken in.</p>
        </li>
      </ul>

      <header className="section-head">
        <h2 className="section-title">Privacy</h2>
      </header>
      <div className="about-body">
        <p>
          Nothing you open is uploaded: games, saves, fonts and editor projects stay in this browser. The site counts page visits with Vercel Web
          Analytics, without cookies. Game content belongs to its respective owners.
        </p>
        <p>
          Found a problem or have an idea?{" "}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            Open an issue on GitHub
          </a>
          .
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
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img src="/favicon.svg" alt="" width={24} height={24} />
        <strong>FMJ React</strong>
        <span className="muted">Play and make pocket RPGs in your browser.</span>
      </div>
      <nav className="footer-links" aria-label="Footer">
        <button className="link" onClick={() => onPlayDemo("bell")}>
          Play the demo
        </button>
        <Link to="games" className="link">
          Games
        </Link>
        <Link to="guide" className="link">
          Guide
        </Link>
        <Link to="about" className="link">
          About
        </Link>
        <Link to="editor" className="link">
          Editor
        </Link>
        <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
          <GitHubMark /> Source on GitHub
        </a>
        <a className="link" href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
          Report a problem
        </a>
      </nav>
      <p className="muted small">
        Engine ported from{" "}
        <a href="https://gitee.com/bgwp/fmj.kt" target="_blank" rel="noreferrer">
          fmj.kt
        </a>{" "}
        (GPL-2.0) with fixes from the baye-fmj-app fork, and checked against{" "}
        <a href="https://gitee.com/BA4988/fmj-engine" target="_blank" rel="noreferrer">
          fmj-engine
        </a>
        , a reconstruction of the original engine. Game content belongs to its respective owners.
      </p>
    </footer>
  );
}

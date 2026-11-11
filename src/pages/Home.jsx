import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import ProjectGrid from "../components/ProjectGrid";
import ProjectMark from "../components/ProjectMark";
import { projects, places } from "../data/projects";

const Globe = lazy(() => import("../components/Globe"));
const filters = ["All work", "AI / ML", "Full-stack"];

export default function Home() {
  const [filter, setFilter] = useState("All work");
  const [showGlobe, setShowGlobe] = useState(false);
  const featured = projects[0];
  const remaining = projects.slice(1).filter((project) => filter === "All work" || project.disciplines.includes(filter));

  return (
    <main id="main-content">
      <section className="page-container hero animate-fade-up" aria-labelledby="intro-title">
        <div className="hero-topline">
          <p className="eyebrow">Full-stack development & applied AI</p>
          <span className="eyebrow">Eindhoven, Netherlands</span>
        </div>
        <div className="hero-layout">
          <div>
            <h1 id="intro-title">From trained models<br /><span className="text-ink-muted">to working products.</span></h1>
            <p className="hero-description">I’m Benjamin, an ICT student at Fontys. I build the models, APIs, and interfaces that turn ideas in audio, news, and esports into software you can use.</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link className="action action-primary" to="/#work">Explore my work <span aria-hidden="true">↘</span></Link>
              <a className="action" href="mailto:bentakaki7@gmail.com">Get in touch <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <aside className="hero-aside" aria-label="A quick introduction">
            <p className="eyebrow mb-5">A little context</p>
            <p className="text-lg font-light leading-relaxed">An interest in how things work.<br />A habit of building them.</p>
            <dl className="mt-7 text-sm">
              <div><dt>Studying</dt><dd>BSc ICT · Fontys</dd></div>
              <div><dt>Focus</dt><dd>Full-stack + AI/ML</dd></div>
              <div><dt>Beyond code</dt><dd>Music & esports</dd></div>
            </dl>
            <div className="flex gap-6 mt-6">
              <a className="text-link" href="https://github.com/BenjaminLTakaki" target="_blank" rel="noreferrer">GitHub ↗</a>
              <a className="text-link" href="https://linkedin.com/in/benjamin-takaki" target="_blank" rel="noreferrer">LinkedIn ↗</a>
            </div>
          </aside>
        </div>
      </section>

      <section id="work" className="page-container work-section" aria-labelledby="work-title">
        <div className="section-heading">
          <div><p className="eyebrow mb-3">01 / Selected work</p><h2 id="work-title">Ideas, made tangible.</h2></div>
          <p className="text-sm text-ink-muted max-w-64">Applied machine learning.<br />The software around it.</p>
        </div>
        <article className="featured-project">
          <div className="featured-art">
            <ProjectMark project={featured} />
            <div className="featured-art-caption"><span>Player ratings → bracket probabilities</span><span>01 / {String(projects.length).padStart(2, "0")}</span></div>
          </div>
          <div className="featured-copy">
            <p className="eyebrow">Featured / Interactive demo</p>
            <h3>Forecast the bracket.<br />Explore the uncertainty.</h3>
            <p className="text-base font-medium">{featured.title}</p>
            <p className="text-sm leading-relaxed text-ink-muted">Bayesian player ratings meet a tournament simulator. Pick match winners and see how the championship probabilities change.</p>
            <p className="evidence-note"><span className="font-medium text-ink">66.8% accuracy</span> across 244 held-out games from 2025 internationals. Calibration and limitations explained in the case study.</p>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <Link to="/forecaster" className="action action-primary">Try the forecaster <span aria-hidden="true">↗</span></Link>
              <Link to="/project/lol-forecaster" className="text-link px-2 py-3">Read case study →</Link>
            </div>
          </div>
        </article>
        <div className="project-toolbar">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter other projects">
            {filters.map((label) => <button key={label} type="button" aria-pressed={filter === label} onClick={() => setFilter(label)} className={`filter-button ${filter === label ? "is-active" : ""}`}>{label}</button>)}
          </div>
          <p className="eyebrow" role="status">{remaining.length} more projects</p>
        </div>
        <ProjectGrid projects={remaining} />
      </section>

      <section className="capabilities-section" aria-labelledby="capabilities-title">
        <div className="page-container capabilities-layout">
          <div><p className="eyebrow mb-4">02 / How I build</p><h2 id="capabilities-title">Both sides<br />of the product.</h2><p className="text-sm leading-relaxed text-ink-muted mt-5 max-w-80">From a useful prediction to an interface someone can actually work with.</p></div>
          <div className="capability-list">
            <div><span className="eyebrow">01</span><div><h3>Model the problem</h3><p>Audio representations, sequence models, text embeddings, Bayesian ratings, and calibrated probabilities.</p><Link className="text-link" to="/project/guitarscribe">PyTorch & audio ML in GuitarScribe →</Link></div></div>
            <div><span className="eyebrow">02</span><div><h3>Build the experience</h3><p>React and Vue interfaces, Python APIs, OAuth flows, and relational data.</p><Link className="text-link" to="/project/spotify-cover-generator">A full-stack generation pipeline →</Link></div></div>
            <div><span className="eyebrow">03</span><div><h3>Take it to delivery</h3><p>Client requirements, API integrations, admin tooling, and deployment.</p><Link className="text-link" to="/project/freelance-portfolios">Explore freelance delivery →</Link></div></div>
          </div>
        </div>
      </section>

      <section id="about" className="page-container about-section" aria-labelledby="about-title">
        <p className="eyebrow mb-6">03 / The person behind the work</p>
        <div className="about-layout">
          <div><h2 id="about-title">Curious by nature.<br />International by upbringing.</h2><p className="mt-6 text-base leading-relaxed text-ink-muted max-w-prose">I’m studying ICT at Fontys University of Applied Sciences, specialising in machine learning and AI. My projects tend to start with something I care about: understanding a guitar recording, forecasting a tournament, seeing how different outlets cover the same story, or helping someone put their work online.</p><p className="mt-4 text-base leading-relaxed text-ink-muted max-w-prose">Having lived in Thailand, Senegal, India, Japan, and now the Netherlands, I bring an international perspective to the teams I work with.</p></div>
          <div className="about-details">
            <div><p className="eyebrow mb-3">Education</p><p className="font-medium text-sm">Bachelor of ICT</p><p className="text-sm text-ink-muted mt-1">Fontys University · 2024–present</p><p className="text-sm mt-5">International French Baccalaureate, Honours</p><p className="text-sm text-ink-muted mt-1">Lycée Français International de Tokyo · 2024</p></div>
            <div><p className="eyebrow mb-3">Languages</p><p className="text-sm leading-loose text-ink-muted">English C2 · French C2<br />Japanese B1 · Dutch A1</p></div>
          </div>
        </div>
        <details className="places-disclosure" onToggle={(event) => setShowGlobe(event.currentTarget.open)}>
          <summary>Five places that shaped my perspective <span aria-hidden="true">+</span></summary>
          {showGlobe && <Suspense fallback={<p className="py-12 text-sm text-ink-muted" role="status">Loading places…</p>}><Globe places={places} /></Suspense>}
        </details>
      </section>

      <section id="contact" className="contact-section" aria-labelledby="contact-title">
        <div className="page-container">
          <p className="eyebrow mb-5">04 / Let’s talk</p>
          <div className="contact-layout"><div><h2 id="contact-title">Have a place for<br />a builder like me?</h2><p className="text-base text-bg/75 mt-5 max-w-prose">Let’s talk about full-stack development, applied AI, and what I could contribute to your team.</p></div><a className="action action-paper" href="mailto:bentakaki7@gmail.com">Email Benjamin <span aria-hidden="true">↗</span></a></div>
          <a className="contact-email" href="mailto:bentakaki7@gmail.com">bentakaki7@gmail.com</a>
        </div>
      </section>
      <footer className="page-container site-footer"><span>© {new Date().getFullYear()} Benjamin Takaki</span><div className="flex flex-wrap gap-6"><Link to="/privacy">Privacy</Link><a href="https://github.com/BenjaminLTakaki" target="_blank" rel="noreferrer">GitHub ↗</a><a href="https://linkedin.com/in/benjamin-takaki" target="_blank" rel="noreferrer">LinkedIn ↗</a><Link to="/#main-content">Back to top ↑</Link></div></footer>
    </main>
  );
}

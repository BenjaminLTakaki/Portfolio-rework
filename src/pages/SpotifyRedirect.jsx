import { Link } from "react-router-dom";

export default function SpotifyRedirect() {
  return (
    <main id="main-content" className="page-container pt-32 pb-24">
      <Link to="/project/spotify-cover-generator" className="text-link">← About this project</Link>
      <p className="eyebrow mt-12 mb-5">Spotify Cover Generator / Demo status</p>
      <h1 className="text-4xl sm:text-6xl font-light tracking-tight max-w-2xl">The hosted demo is currently unavailable.</h1>
      <p className="text-base leading-relaxed text-ink-muted max-w-prose mt-6">The external service returned an error when checked on September 7, 2026. You can still explore the project’s architecture, or try the service again in a separate tab.</p>
      <div className="flex flex-wrap gap-4 mt-8"><Link className="action action-primary" to="/project/spotify-cover-generator">Explore the project →</Link><a className="action" href="https://spotify-cover-59is.onrender.com/" target="_blank" rel="noreferrer">Try external service ↗</a></div>
    </main>
  );
}

import { useEffect } from "react";
import { Link } from "react-router-dom";

// What this site itself collects. Certior has its own policy (public/certior/privacy.html). Keep both true to the code.
export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy | Benjamin Takaki";
    return () => { document.title = "Benjamin Takaki | Full-stack & AI/ML Developer"; };
  }, []);
  return (
    <main id="main-content" className="page-container pt-32 pb-24">
      <Link to="/" className="text-link">← Home</Link>
      <p className="eyebrow mt-12 mb-5">Privacy</p>
      <h1 className="text-4xl sm:text-6xl font-light tracking-tight max-w-2xl">Nothing here tracks you.</h1>
      <div className="max-w-prose mt-8 space-y-5 text-base leading-relaxed text-ink-muted">
        <p>This site sets no cookies, keeps nothing in your browser, and runs no analytics, ads or trackers. Its fonts and images, the globe’s included, come from this site, so a page loads nothing from anyone else’s servers.</p>
        <p>The site runs on Render, with Cloudflare in front of it. Like any web host, they see your IP address and the pages you ask for, and keep logs of that under their own policies.</p>
        <p>The forecaster runs in your browser. The <Link to="/lol" className="underline underline-offset-4">/lol</Link> pages show League of Legends match history from Riot Games’ public API for the players listed there.</p>
        <p><a href="/certior/privacy.html" className="underline underline-offset-4">Certior has its own privacy policy</a>: the app counts anonymous daily totals and loads YouTube only after you turn videos on.</p>
        <p>Links to GitHub, LinkedIn and Ko-fi take you to those sites, which have their own policies. If you email me, your message stays in my inbox and goes nowhere else.</p>
        <p>Questions: <a href="mailto:bentakaki7@gmail.com" className="underline underline-offset-4">bentakaki7@gmail.com</a>.</p>
      </div>
    </main>
  );
}

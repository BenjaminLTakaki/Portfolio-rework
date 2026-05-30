import { Link } from "react-router-dom";

// Players shown on the hub. Mirrors the keys in server/players.js — kept here so
// the static hub needs no API call to render its links.
const PLAYERS = [
  { key: "ben", name: "Ben", riotId: "NoAnimeNoLife#ANIME", role: "Top lane" },
  { key: "raf", name: "Raf", riotId: "FrogChango#GOAT", role: "Jungle" },
  { key: "imout", name: "Imout", riotId: "Imout#999", role: "Jungle" },
];

export default function LolHub() {
  return (
    <main className="pt-28 pb-24 px-6 lg:px-12 max-w-screen-xl mx-auto animate-fade-up">
      <Link
        to="/"
        className="mb-14 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
      >
        <span className="text-base leading-none">←</span>
        Back
      </Link>

      <header className="mb-16">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted">
          League of Legends / Ranked Solo&nbsp;&amp;&nbsp;Duo
        </p>
        <h1 className="max-w-[16ch] text-[clamp(2.4rem,6.5vw,5.6rem)] font-light tracking-[-0.055em] leading-[0.9] text-ink">
          Ranked, in numbers.
        </h1>
        <p className="mt-6 max-w-prose text-sm leading-[1.75] text-ink-muted">
          Self-updating dashboards built from full Ranked match histories via the
          Riot API. Pick a player.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1] sm:grid-cols-2">
        {PLAYERS.map((p) => (
          <Link
            key={p.key}
            to={`/lol/${p.key}`}
            className="group bg-bg p-8 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ink/[0.03]"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {p.role}
            </p>
            <p className="mt-3 flex items-baseline gap-2 text-[clamp(1.6rem,3vw,2.2rem)] font-light tracking-tight text-ink leading-none">
              {p.name}
              <span className="text-ink-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1">
                →
              </span>
            </p>
            <p className="mt-3 font-mono text-[11px] text-ink-muted">{p.riotId}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

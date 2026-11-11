import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { simulate, SLOT_ROUNDS, canLock, updateLocks } from "../lib/forecaster";

const ease = "transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]";
const pct = (p) => (p * 100).toFixed(1) + "%";

function MatchCard({ slot, data, onLock, onUnlock, locks }) {
  if (!data) return null;
  const { a, b, pA, locked } = data;
  const row = (team, p) => {
    const winner = locked === team;
    const loser = locked && locked !== team;
    return (
      <button
        disabled={!canLock(slot, locks)}
        aria-label={locked ? `Undo result for ${slot}` : `Lock ${team} as winner in ${slot}`}
        onClick={() => (locked ? onUnlock(slot) : onLock(slot, team))}
        className={`relative flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left ${ease} enabled:hover:bg-ink/[0.04] disabled:cursor-default ${loser ? "opacity-40" : ""}`}
      >
        <span className={`truncate text-[13px] ${p >= 0.5 || winner ? "font-medium text-ink" : "text-ink-muted"}`}>
          {team}
          {winner && <span className="ml-1.5 font-mono text-[12px]">✓</span>}
        </span>
        {!locked && (
          <span className="font-mono text-[12px] tabular-nums text-ink-muted">{pct(p)}</span>
        )}
        {!locked && (
          <span
            className="absolute bottom-0 left-0 h-px bg-ink/25"
            style={{ width: pct(p) }}
          />
        )}
      </button>
    );
  };
  return (
    <div className="w-[196px]">
      <div className={`overflow-hidden rounded-md border ${locked ? "border-ink/35" : "border-ink/[0.12]"} divide-y divide-ink/[0.08] bg-bg`}>
        {row(a, pA)}
        {row(b, 1 - pA)}
      </div>
      <p className="mt-1.5 px-1 font-mono text-[12px] leading-snug text-ink-faint">
        {locked ? "locked · click to undo" : !canLock(slot, locks) ? "projection · resolve earlier rounds to lock" : "choose a winner"}
      </p>
    </div>
  );
}

function Section({ label, rounds, slots, onLock, onUnlock, locks }) {
  return (
    <div className="mt-12">
      <p className="mb-5 font-mono text-[12px] uppercase tracking-[0.24em] text-ink-faint">{label}</p>
      <div className="flex gap-10 overflow-x-auto pb-3">
        {rounds.map((r) => (
          <div key={r.name} className="flex flex-col">
            <p className="mb-3 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.18em] text-ink-muted">
              {r.name}
            </p>
            <div className="flex grow flex-col justify-around gap-5">
              {r.slots.map((s) => (
                <MatchCard key={s} slot={s} data={slots[s]} onLock={onLock} onUnlock={onUnlock} locks={locks} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Forecaster() {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const [locks, setLocks] = useState({});

  useEffect(() => {
    fetch("/forecaster/msi_2026.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("model file missing"))))
      .then(setModel)
      .catch((e) => setError(e.message));
  }, []);

  const result = useMemo(
    () => (model ? simulate(model, locks, 20000) : null),
    [model, locks],
  );

  if (error)
    return <main id="main-content" className="pt-28 px-6 max-w-screen-xl mx-auto text-sm text-ink-muted">{error}</main>;
  if (!model || !result)
    return <main id="main-content" className="pt-28 px-6 max-w-screen-xl mx-auto font-mono text-[12px] uppercase tracking-[0.2em] text-ink-faint">Simulating…</main>;

  const v = model.meta.validation;
  const onLock = (slot, team) => setLocks((current) => updateLocks(current, slot, team));
  const onUnlock = (slot) => setLocks((current) => updateLocks(current, slot));

  return (
    <main id="main-content" className="pt-28 pb-24 px-6 lg:px-12 max-w-screen-xl mx-auto animate-fade-up">
      <Link
        to="/project/lol-forecaster"
        className={`-mt-3 mb-11 py-3 inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-ink-muted ${ease} hover:text-ink`}
      >
        <span className="text-base leading-none">←</span>
        About this model
      </Link>

      <header className="mb-4">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.26em] text-ink-muted">
          Esports forecasting / Bayesian player ratings
        </p>
        <h1 className="max-w-[16ch] text-[clamp(2.4rem,6.5vw,5.6rem)] font-light tracking-[-0.055em] leading-[0.9] text-ink">
          {model.name}, forecast.
        </h1>
        <p className="mt-6 max-w-[62ch] text-sm leading-[1.75] text-ink-muted">
          Win probabilities for every series in the bracket, from OpenSkill player
          ratings trained on {model.meta.trainedGames.toLocaleString()} professional
          games. The simulation runs in your browser: 20,000 brackets per click.
          Start in Upper Round 1 and select a winner. Later matches unlock once
          their participants are known; changing a result clears dependent picks.
        </p>
        <p className="mt-3 text-sm text-ink-muted">Saved model snapshot, not a live results feed. Each run is a Monte Carlo estimate.</p>
      </header>

      <div className="mt-10 flex flex-wrap items-baseline gap-x-10 gap-y-3 border-y border-ink/[0.08] py-5">
        {[
          [`${(v.accuracy * 100).toFixed(1)}%`, `holdout accuracy, ${v.year} internationals`],
          [v.brierCalibrated.toFixed(3), "Brier score (0.25 = coin flip)"],
          [model.meta.trainedPlayers.toLocaleString(), "players rated"],
          [Object.keys(locks).length || "0", "results locked"],
        ].map(([n, l]) => (
          <p key={l} className="font-mono text-[12px] text-ink-faint">
            <span className="text-[15px] font-medium tabular-nums text-ink">{n}</span>
            <span className="ml-2 uppercase tracking-[0.14em]">{l}</span>
          </p>
        ))}
        {Object.keys(locks).length > 0 && (
          <button
            onClick={() => setLocks({})}
            className={`font-mono text-[12px] uppercase tracking-[0.18em] text-ink-muted underline underline-offset-4 ${ease} hover:text-ink`}
          >
            clear locks
          </button>
        )}
      </div>

      <Section
        label="Upper bracket"
        rounds={SLOT_ROUNDS.filter((r) => r.section === "upper")}
        slots={result.slots}
        locks={locks}
        onLock={onLock}
        onUnlock={onUnlock}
      />
      <Section
        label="Lower bracket"
        rounds={SLOT_ROUNDS.filter((r) => r.section === "lower")}
        slots={result.slots}
        locks={locks}
        onLock={onLock}
        onUnlock={onUnlock}
      />

      <div className="mt-16">
        <p className="mb-5 font-mono text-[12px] uppercase tracking-[0.24em] text-ink-faint">Title odds</p>
        <div className="overflow-x-auto" role="region" aria-label="Tournament title odds" tabIndex={0}>
        <table className="w-full min-w-[540px] max-w-3xl border-collapse">
          <thead>
            <tr className="border-b border-ink/[0.12]">
              {["Team", "Region", "Strength", "Grand final", "Champion"].map((h) => (
                <th key={h} className="py-2.5 pr-6 text-left font-mono text-[12px] uppercase tracking-[0.18em] text-ink-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.odds.map((r) => (
              <tr key={r.team} className="border-b border-ink/[0.06]">
                <td className="py-2.5 pr-6 text-[13px] font-medium text-ink">{r.team}</td>
                <td className="py-2.5 pr-6 font-mono text-[12px] text-ink-muted">{r.region}</td>
                <td className="py-2.5 pr-6 font-mono text-[12px] tabular-nums text-ink-muted">{r.strength.toFixed(1)}</td>
                <td className="py-2.5 pr-6 font-mono text-[12px] tabular-nums text-ink-muted">{pct(r.grandFinal)}</td>
                <td className="py-2.5 pr-6 font-mono text-[12px] tabular-nums text-ink">{pct(r.champion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-16 max-w-[62ch] border-t border-ink/[0.08] pt-8">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.22em] text-ink-faint">Method</p>
        <p className="text-sm leading-[1.75] text-ink-muted">
          Each player carries an OpenSkill (Plackett-Luce) rating learned from{" "}
          {model.meta.trainingYears[0]}–{model.meta.trainingYears.at(-1)} match data.
          Team strength is the roster's mean rating plus a region offset learned
          only from international events, minus a roster-continuity discount.
          Game probabilities use exported Platt-calibration parameters;
          series and bracket outcomes come from Monte Carlo simulation. The model
          export reports {v.year} evaluation accuracy of {(v.msiAccuracy * 100).toFixed(0)}%
          on MSI and {(v.worldsAccuracy * 100).toFixed(0)}% on Worlds. These scores are
          not recomputed in the browser. Teams without match history use default
          player ratings and the available regional offset.
        </p>
      </div>
    </main>
  );
}

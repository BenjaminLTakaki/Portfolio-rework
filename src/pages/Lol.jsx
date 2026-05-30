import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  computeStats,
  championBreakdown,
  detectStreaks,
  recentForm,
  timeOfDay,
  roleMatchupAnalysis,
  jungleStats,
  tierProgression,
  championSynergy,
} from "../lib/lolAnalysis";

export default function Lol() {
  const { player: playerKey } = useParams();
  const [player, setPlayer] = useState(null);
  const [matches, setMatches] = useState(null);
  const [roleMatchups, setRoleMatchups] = useState([]);
  const [matchTeams, setMatchTeams] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMatches(null);
    setError(null);
    fetch(`/api/lol/${playerKey}/dashboard`)
      .then((r) => {
        if (r.status === 404) throw new Error(`unknown player “${playerKey}”`);
        if (!r.ok) throw new Error("dashboard API unavailable");
        return r.json();
      })
      .then(({ player: p, matches: m, roleMatchups: rm, matchTeams: mt }) => {
        setPlayer(p);
        setMatches(m);
        setRoleMatchups(rm || []);
        setMatchTeams(mt || []);
      })
      .catch((e) => setError(e.message));
  }, [playerKey]);

  const data = useMemo(() => {
    if (!matches || matches.length === 0 || !player) return null;
    return {
      stats: computeStats(matches),
      champs: championBreakdown(matches),
      streaks: detectStreaks(matches),
      form: recentForm(matches),
      time: timeOfDay(matches),
      roles: roleMatchupAnalysis(roleMatchups, player.role),
      jungle: player.role === "JUNGLE" ? jungleStats(matches) : null,
      progression: tierProgression(matches),
      synergy: championSynergy(matchTeams),
    };
  }, [matches, roleMatchups, matchTeams, player]);

  if (error) return <Centered>Couldn’t load match data — {error}</Centered>;
  if (!data) return <Centered>Loading match history…</Centered>;

  const { stats, champs, streaks, form, time, roles, jungle, progression, synergy } = data;
  const isJungle = player.role === "JUNGLE";

  return (
    <main className="pt-28 pb-24 px-6 lg:px-12 max-w-screen-xl mx-auto animate-fade-up">
      <Link
        to="/lol"
        className="mb-14 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink"
      >
        <span className="text-base leading-none">←</span>
        All players
      </Link>

      {/* Header */}
      <header className="mb-16">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.26em] text-ink-muted">
          League of Legends / Ranked Solo&nbsp;&amp;&nbsp;Duo · {titleCase(player.role)}
        </p>
        <h1 className="max-w-[14ch] text-[clamp(2.4rem,6.5vw,5.6rem)] font-light tracking-[-0.055em] leading-[0.9] text-ink">
          {player.name}, in numbers.
        </h1>
        <p className="mt-6 max-w-prose text-sm leading-[1.75] text-ink-muted">
          A self-updating dashboard built from {player.name}’s full Ranked match
          history via the Riot API. {stats.total} games analysed — from{" "}
          <span className="text-ink">{shortDate(stats.oldest.date_utc)}</span> to{" "}
          <span className="text-ink">{shortDate(stats.newest.date_utc)}</span>.
        </p>
        <p className="mt-3 font-mono text-[11px] text-ink-faint">{player.riotId}</p>
      </header>

      {/* Headline stats */}
      <SectionLabel>Overview</SectionLabel>
      <div className="mb-20 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1] lg:grid-cols-4">
        <Stat label="Games" value={stats.total} sub={`${stats.wins}W / ${stats.losses}L`} />
        <Stat label="Win rate" value={`${stats.winrate.toFixed(1)}%`} sub="ranked solo/duo" />
        <Stat
          label="Avg KDA"
          value={stats.kda.toFixed(2)}
          sub={`${stats.avgKills.toFixed(1)} / ${stats.avgDeaths.toFixed(1)} / ${stats.avgAssists.toFixed(1)}`}
        />
        <Stat
          label="Most played"
          value={champs[0]?.champion ?? "—"}
          sub={champs[0] ? `${champs[0].games} games · ${champs[0].winrate.toFixed(0)}% WR` : ""}
        />
      </div>

      {/* Recent form */}
      <SectionLabel>Recent form · last {form.length}</SectionLabel>
      <div className="mb-20 flex flex-wrap gap-1.5">
        {form.map((g, i) => (
          <span
            key={i}
            title={`${g.win ? "Win" : "Loss"} · ${g.champion} · ${shortDate(g.date_utc)}`}
            className={`flex h-9 w-9 items-center justify-center rounded font-mono text-[11px] font-medium ${
              g.win ? "bg-ink text-bg" : "border border-ink/20 text-ink-muted"
            }`}
          >
            {g.win ? "W" : "L"}
          </span>
        ))}
      </div>

      {/* Champions + Streaks */}
      <div className="mb-20 grid grid-cols-1 gap-16 lg:grid-cols-2">
        <div>
          <SectionLabel>Champion pool</SectionLabel>
          <div className="space-y-4">
            {champs.map((c) => (
              <BarRow key={c.champion} label={c.champion} winrate={c.winrate} games={c.games} max={champs[0].games} />
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Streaks</SectionLabel>
          <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1]">
            <Stat label="Longest win streak" value={streaks.longestWin} sub="games" />
            <Stat label="Longest loss streak" value={streaks.longestLoss} sub="games" />
          </div>
          <ul className="space-y-3">
            {streaks.all
              .slice()
              .sort((a, b) => b.length - a.length)
              .slice(0, 5)
              .map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 border-b border-ink/[0.08] pb-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                    {s.type === "WIN" ? "🔥" : "💀"} {s.length}-game {s.type.toLowerCase()} streak
                  </span>
                  <span className="text-right font-mono text-[11px] text-ink-faint">
                    {shortDate(s.start_date)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </div>

      {/* Time of day */}
      <SectionLabel>Win rate by hour · your local time</SectionLabel>
      <div className="mb-6 flex items-end gap-[3px]">
        {time.hourly.map((h) => (
          <HourBar key={h.hour} hour={h} />
        ))}
      </div>
      <div className="mb-10 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] text-ink-muted">
        {time.parts.map((p) => (
          <span key={p.label}>
            {p.label}{" "}
            <span className="text-ink">{p.games ? `${p.winrate.toFixed(0)}%` : "—"}</span>{" "}
            <span className="text-ink-faint">({p.games}g)</span>
          </span>
        ))}
      </div>
      {time.best && time.worst && (
        <div className="mb-20 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1] sm:grid-cols-2">
          <Stat
            label={`Best hour (≥${time.minGames}g)`}
            value={`${pad(time.best.hour)}:00`}
            sub={`${time.best.winrate.toFixed(0)}% over ${time.best.games} games`}
          />
          <Stat
            label={`Worst hour (≥${time.minGames}g)`}
            value={`${pad(time.worst.hour)}:00`}
            sub={`${time.worst.winrate.toFixed(0)}% over ${time.worst.games} games`}
          />
        </div>
      )}

      {/* Jungle metrics — only for junglers */}
      {isJungle && jungle && (
        <>
          <SectionLabel>Jungle · pathing &amp; objectives</SectionLabel>
          <div className="mb-20 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1] lg:grid-cols-5">
            <Stat label="CS / min" value={jungle.csPerMin.toFixed(1)} sub={`${jungle.jungleCsPerMin.toFixed(1)} jungle`} />
            <Stat label="Avg vision" value={jungle.avgVision.toFixed(0)} sub="score / game" />
            <Stat label="First blood" value={`${jungle.firstBloodRate.toFixed(0)}%`} sub="of games" />
            <Stat label="Objectives stolen" value={jungle.objectivesStolen} sub={`${jungle.games} games`} />
            <Stat
              label="Epic takedowns"
              value={(jungle.dragonsPerGame + jungle.baronsPerGame).toFixed(1)}
              sub="drakes+barons / game"
            />
          </div>
        </>
      )}

      {/* Role matchups — top lane (ranged/melee) or jungle (enemy jungler) */}
      {roles && (
        <>
          <SectionLabel>
            {isJungle
              ? "Jungle · enemy jungler matchups"
              : "Top lane · ranged vs melee matchups"}
          </SectionLabel>
          {!isJungle && (
            <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1] sm:grid-cols-3">
              <Stat label="Top lane games" value={roles.total} sub={`${roles.winrate.toFixed(0)}% overall WR`} />
              <Stat
                label="vs Ranged"
                value={`${roles.ranged.winrate.toFixed(0)}%`}
                sub={`${roles.ranged.wins}W / ${roles.ranged.games - roles.ranged.wins}L · ${roles.ranged.games}g`}
              />
              <Stat
                label="vs Melee"
                value={`${roles.melee.winrate.toFixed(0)}%`}
                sub={`${roles.melee.wins}W / ${roles.melee.games - roles.melee.wins}L · ${roles.melee.games}g`}
              />
            </div>
          )}
          {isJungle && (
            <div className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-ink/[0.1] bg-ink/[0.1] sm:grid-cols-1">
              <Stat label="Jungle games" value={roles.total} sub={`${roles.winrate.toFixed(0)}% overall WR`} />
            </div>
          )}
          {(() => {
            const list = isJungle ? roles.topEnemies : roles.topEnemiesRanged;
            if (!list.length) return null;
            return (
              <div className="mb-20 space-y-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
                  {isJungle ? "Most-faced enemy junglers" : "Most-faced ranged tops"}
                </p>
                {list.map((c) => (
                  <BarRow key={c.champion} label={c.champion} winrate={c.winrate} games={c.games} max={list[0].games} />
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* Champion synergy — who's good/bad to have as ally vs enemy */}
      {synergy && (
        <>
          <SectionLabel>
            Champion synergy · your win rate by who's in the game (≥{synergy.minGames}g)
          </SectionLabel>
          <div className="mb-4 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-2">
            <SynergyList title="🟢 Best allies on your team" rows={synergy.highlights.bestAllies} />
            <SynergyList title="🔴 Worst allies on your team" rows={synergy.highlights.worstAllies} />
            <SynergyList title="😄 Easiest enemies — you beat them most" rows={synergy.highlights.easiestEnemies} />
            <SynergyList title="💀 Hardest enemies — your nemeses" rows={synergy.highlights.hardestEnemies} />
          </div>
          <p className="mb-20 font-mono text-[10px] leading-relaxed text-ink-faint">
            Correlational, not causal — a champ can top the list simply for being
            strong/meta during your winning games.
          </p>
        </>
      )}

      {/* Tier progression — only when the data actually carries tier info */}
      {progression.length > 0 && (
        <>
          <SectionLabel>Rank progression</SectionLabel>
          <ol className="mb-20 space-y-4">
            {progression.map((p) => (
              <li key={p.tier} className="flex items-baseline justify-between gap-4 border-b border-ink/[0.08] pb-3">
                <span className="font-mono text-[12px] uppercase tracking-wider text-ink">
                  {p.tier} {p.division}
                </span>
                <span className="font-mono text-[11px] text-ink-faint">{shortDate(p.date_utc)}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="h-px bg-ink/[0.07] my-12" />
      <p className="font-mono text-[11px] text-ink-faint">
        Data via the Riot Games API · refreshed daily · not endorsed by Riot Games.
      </p>
    </main>
  );
}

/* ---------- presentational helpers ---------- */

function Centered({ children }) {
  return (
    <main className="flex h-screen items-center justify-center px-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted text-center">
        {children}
      </p>
    </main>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
      {children}
    </p>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-bg p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">{label}</p>
      <p className="mt-3 text-[clamp(1.4rem,3vw,2rem)] font-light tracking-tight text-ink leading-none">
        {value}
      </p>
      {sub && <p className="mt-2 font-mono text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

function BarRow({ label, winrate, games, max }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <span className="font-mono text-[11px] text-ink-muted">
          {games}g · <span className="text-ink">{winrate.toFixed(0)}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
        <div
          className="h-full rounded-full bg-ink/70"
          style={{ width: `${Math.max(4, (games / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function SynergyList({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
        {title}
      </p>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li
            key={r.champion}
            className="flex items-baseline justify-between gap-4 border-b border-ink/[0.08] pb-2"
          >
            <span className="text-sm text-ink">{r.champion}</span>
            <span className="font-mono text-[11px] text-ink-muted">
              <span className="text-ink">{r.winrate.toFixed(0)}%</span>{" "}
              <span className="text-ink-faint">
                ({r.wins}/{r.games})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HourBar({ hour }) {
  const h = 8 + (hour.games ? (hour.winrate / 100) * 56 : 0);
  const dim = !hour.reliable;
  return (
    <div className="group relative flex flex-1 flex-col items-center">
      <div className="flex h-16 w-full items-end">
        <div
          className={`w-full rounded-t-sm ${hour.games === 0 ? "bg-ink/[0.06]" : dim ? "bg-ink/25" : "bg-ink/70"}`}
          style={{ height: `${hour.games === 0 ? 4 : h}px` }}
          title={`${pad(hour.hour)}:00 — ${hour.games ? `${hour.winrate.toFixed(0)}% (${hour.games}g)` : "no games"}`}
        />
      </div>
      {hour.hour % 6 === 0 && (
        <span className="mt-1 font-mono text-[9px] text-ink-faint">{pad(hour.hour)}</span>
      )}
    </div>
  );
}

/* ---------- formatting ---------- */

function pad(n) {
  return String(n).padStart(2, "0");
}

// "JUNGLE" -> "Jungle"
function titleCase(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// "Tuesday, 30 September 2025 at 14:11 UTC" -> "30 Sep 2025"
function shortDate(s) {
  if (!s) return "";
  const m = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return s;
  return `${m[1]} ${m[2].slice(0, 3)} ${m[3]}`;
}

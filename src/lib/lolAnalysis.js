// Pure analysis helpers for the /lol dashboard. These mirror the Python
// scripts in LEAGUE_SCRIPTS/ (analyze_matches, pattern_analysis,
// time_winrate_analysis, top_lane_analysis) but run client-side on the JSON
// the daily updater publishes to /lol/matches.json and /lol/top_games.json.

const TIER_ORDER = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
  "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
];

const STREAK_THRESHOLD = 4;

// --- sorting -------------------------------------------------------------

export function sortByTime(matches) {
  return [...matches].sort((a, b) => a.timestamp - b.timestamp);
}

// --- overall stats -------------------------------------------------------

export function computeStats(matches) {
  const total = matches.length;
  if (total === 0) return null;

  const wins = matches.filter((m) => m.win).length;
  const losses = total - wins;

  const kills = sum(matches, "kills");
  const deaths = sum(matches, "deaths");
  const assists = sum(matches, "assists");
  const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;

  const sorted = sortByTime(matches);

  return {
    total,
    wins,
    losses,
    winrate: (wins / total) * 100,
    kills,
    deaths,
    assists,
    avgKills: kills / total,
    avgDeaths: deaths / total,
    avgAssists: assists / total,
    kda,
    oldest: sorted[0],
    newest: sorted[sorted.length - 1],
  };
}

// --- champion breakdown --------------------------------------------------

export function championBreakdown(matches, limit = 8) {
  const map = new Map();
  for (const m of matches) {
    const c = m.champion || "Unknown";
    const e = map.get(c) || { champion: c, games: 0, wins: 0 };
    e.games += 1;
    if (m.win) e.wins += 1;
    map.set(c, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, winrate: (e.wins / e.games) * 100 }))
    .sort((a, b) => b.games - a.games)
    .slice(0, limit);
}

// --- tier progression (first game at each new tier) ----------------------

export function tierProgression(matches) {
  const progression = [];
  let highest = -1;
  for (const m of sortByTime(matches)) {
    const tier = (m.tier || "UNKNOWN").toUpperCase();
    const rank = TIER_ORDER.indexOf(tier);
    if (rank > highest) {
      highest = rank;
      progression.push({
        tier,
        division: m.division,
        date_utc: m.date_utc,
        champion: m.champion,
        win: m.win,
      });
    }
  }
  return progression;
}

// --- streaks -------------------------------------------------------------

export function detectStreaks(matches) {
  const ordered = sortByTime(matches);
  const streaks = [];
  let i = 0;
  while (i < ordered.length) {
    let j = i + 1;
    while (j < ordered.length && ordered[j].win === ordered[i].win) j += 1;
    const length = j - i;
    if (length >= STREAK_THRESHOLD) {
      streaks.push({
        type: ordered[i].win ? "WIN" : "LOSS",
        length,
        start_date: ordered[i].date_utc,
        end_date: ordered[j - 1].date_utc,
        champions: [...new Set(ordered.slice(i, j).map((m) => m.champion))],
      });
    }
    i = j;
  }
  return {
    all: streaks,
    longestWin: Math.max(0, ...streaks.filter((s) => s.type === "WIN").map((s) => s.length)),
    longestLoss: Math.max(0, ...streaks.filter((s) => s.type === "LOSS").map((s) => s.length)),
  };
}

// --- recent form (most recent N games, newest first) ---------------------

export function recentForm(matches, n = 20) {
  return sortByTime(matches)
    .slice(-n)
    .reverse()
    .map((m) => ({ win: m.win, champion: m.champion, date_utc: m.date_utc }));
}

// --- time of day (local browser time) ------------------------------------

const DAY_PARTS = [
  { label: "Night", range: [0, 6] },
  { label: "Morning", range: [6, 12] },
  { label: "Afternoon", range: [12, 18] },
  { label: "Evening", range: [18, 24] },
];

export function timeOfDay(matches, minGames = 10) {
  const hours = Array.from({ length: 24 }, () => ({ games: 0, wins: 0 }));
  for (const m of matches) {
    const h = new Date(m.timestamp).getHours(); // local time
    hours[h].games += 1;
    if (m.win) hours[h].wins += 1;
  }

  const hourly = hours.map((h, hour) => ({
    hour,
    games: h.games,
    wins: h.wins,
    winrate: h.games ? (h.wins / h.games) * 100 : 0,
    reliable: h.games >= minGames,
  }));

  const parts = DAY_PARTS.map(({ label, range }) => {
    let games = 0;
    let wins = 0;
    for (let h = range[0]; h < range[1]; h += 1) {
      games += hours[h].games;
      wins += hours[h].wins;
    }
    return { label, games, wins, winrate: games ? (wins / games) * 100 : 0 };
  });

  const reliable = hourly.filter((h) => h.reliable && h.games > 0);
  const best = reliable.length ? reliable.reduce((a, b) => (b.winrate > a.winrate ? b : a)) : null;
  const worst = reliable.length ? reliable.reduce((a, b) => (b.winrate < a.winrate ? b : a)) : null;

  return { hourly, parts, best, worst, minGames };
}

// --- top lane (ranged vs melee) ------------------------------------------

export function topLaneAnalysis(topGames) {
  const total = topGames.length;
  if (total === 0) return null;

  const vsRanged = topGames.filter((g) => g.enemy_is_ranged);
  const vsMelee = topGames.filter((g) => !g.enemy_is_ranged);

  const wr = (arr) => (arr.length ? (arr.filter((g) => g.win).length / arr.length) * 100 : 0);

  const enemyCounts = new Map();
  for (const g of vsRanged) {
    const e = enemyCounts.get(g.enemy_top) || { champion: g.enemy_top, games: 0, wins: 0 };
    e.games += 1;
    if (g.win) e.wins += 1;
    enemyCounts.set(g.enemy_top, e);
  }
  const topRanged = [...enemyCounts.values()]
    .map((e) => ({ ...e, winrate: (e.wins / e.games) * 100 }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);

  return {
    total,
    winrate: wr(topGames),
    ranged: { games: vsRanged.length, wins: vsRanged.filter((g) => g.win).length, winrate: wr(vsRanged) },
    melee: { games: vsMelee.length, wins: vsMelee.filter((g) => g.win).length, winrate: wr(vsMelee) },
    topRanged,
  };
}

// --- helpers -------------------------------------------------------------

function sum(arr, key) {
  return arr.reduce((acc, m) => acc + (m[key] || 0), 0);
}

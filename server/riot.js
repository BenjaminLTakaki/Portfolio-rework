// Riot API client — Node port of the old LEAGUE_SCRIPTS/update_data.py +
// riot_common.py. Does an incremental fetch: resolve PUUID, page the most
// recent ranked match IDs, and for each match not already in Neon, fetch the
// full detail ONCE and upsert the slim match row, the top-lane row (when you
// played TOP), and the ally/enemy team comp.
//
// Uses native fetch (Node 18+). No third-party HTTP client needed.

import {
  upsertMatch,
  upsertTopGame,
  upsertMatchTeam,
  existingMatchIds,
} from "./db.js";

const REGIONAL_HOST = "https://europe.api.riotgames.com";
const QUEUE_RANKED = 420;
const PAGE_SIZE = 100;
const RECENT_LOOKBACK = 200; // a daily run only needs the most recent games
const DEFAULT_RETRY_MS = 10_000;

// Champions commonly played as ranged tops (kept in sync with the old
// top_lane_analysis / update_data.py set).
const RANGED_TOP_CHAMPS = new Set([
  "Teemo", "Vayne", "Quinn", "Kennen", "Gnar", "Kayle", "Jayce",
  "Gangplank", "Vladimir", "Heimerdinger", "Ryze", "Karma", "Lissandra",
  "Akshan", "Cassiopeia", "Graves", "Lucian", "Ezreal", "Smolder",
  "Hwei", "Zoe", "Viktor", "Orianna", "Syndra", "Azir", "Corki",
  "Tristana", "Caitlyn", "Ashe", "Jhin", "Senna",
]);

function creds() {
  const apiKey = (process.env.RIOT_API_KEY || "").trim();
  if (!apiKey) throw new Error("RIOT_API_KEY is not set.");
  return {
    apiKey,
    gameName: (process.env.RIOT_GAME_NAME || "NoAnimeNoLife").trim(),
    tagLine: (process.env.RIOT_TAG_LINE || "ANIME").trim(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with automatic rate-limit retry via the Retry-After header.
async function riotGet(url, apiKey) {
  while (true) {
    const res = await fetch(url, { headers: { "X-Riot-Token": apiKey } });

    if (res.ok) return res.json();

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : DEFAULT_RETRY_MS;
      console.log(`    [Rate limit] waiting ${waitMs / 1000}s…`);
      await sleep(waitMs);
      continue;
    }

    if (res.status === 401) throw new Error("Riot 401 — invalid API key.");
    if (res.status === 403) throw new Error("Riot 403 — forbidden / expired key.");
    if (res.status === 404) throw new Error(`Riot 404 — not found: ${url}`);

    const body = await res.text().catch(() => "");
    throw new Error(`Riot ${res.status}: ${body}`);
  }
}

async function getPuuid(gameName, tagLine, apiKey) {
  const url = `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    gameName
  )}/${encodeURIComponent(tagLine)}`;
  const data = await riotGet(url, apiKey);
  return data.puuid;
}

// Newest-first ranked match IDs, up to ~RECENT_LOOKBACK.
async function getRecentMatchIds(puuid, apiKey) {
  const ids = [];
  let start = 0;
  while (ids.length < RECENT_LOOKBACK) {
    const url = `${REGIONAL_HOST}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${QUEUE_RANKED}&start=${start}&count=${PAGE_SIZE}`;
    const page = await riotGet(url, apiKey);
    if (!page.length) break;
    ids.push(...page);
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return ids;
}

function utcDateString(tsMs) {
  // e.g. "Tuesday, 30 September 2025 at 14:11 UTC" — mirrors the Python format.
  const d = new Date(tsMs);
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(d);
  return `${date} at ${time} UTC`;
}

function extractMatch(raw, puuid) {
  const info = raw.info;
  const p = info.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  const tsMs = info.gameCreation;
  return {
    match_id: raw.metadata.matchId,
    timestamp: tsMs,
    date_utc: utcDateString(tsMs),
    duration_mins: Math.round((info.gameDuration / 60) * 10) / 10,
    champion: p.championName,
    tier: p.tier ?? "UNKNOWN",
    division: p.rank ?? "UNKNOWN",
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
  };
}

function extractTopInfo(raw, puuid) {
  const info = raw.info;
  const me = info.participants.find((x) => x.puuid === puuid);
  if (!me || (me.teamPosition || "").toUpperCase() !== "TOP") return null;

  const enemyTop = info.participants.find(
    (x) => x.teamId !== me.teamId && (x.teamPosition || "").toUpperCase() === "TOP"
  );
  const enemyChamp = enemyTop ? enemyTop.championName : "Unknown";

  return {
    match_id: raw.metadata.matchId,
    date_utc: utcDateString(info.gameCreation),
    win: me.win,
    your_champion: me.championName,
    enemy_top: enemyChamp,
    enemy_is_ranged: RANGED_TOP_CHAMPS.has(enemyChamp),
  };
}

function extractTeams(raw, puuid) {
  const info = raw.info;
  const me = info.participants.find((x) => x.puuid === puuid);
  if (!me) return null;
  return {
    match_id: raw.metadata.matchId,
    timestamp: info.gameCreation,
    win: me.win,
    you: me.championName,
    allies: info.participants
      .filter((x) => x.teamId === me.teamId && x.puuid !== puuid)
      .map((x) => x.championName),
    enemies: info.participants
      .filter((x) => x.teamId !== me.teamId)
      .map((x) => x.championName),
  };
}

// Incremental refresh. Returns the number of new matches stored.
export async function refreshFromRiot() {
  const { apiKey, gameName, tagLine } = creds();

  const puuid = await getPuuid(gameName, tagLine, apiKey);
  const recentIds = await getRecentMatchIds(puuid, apiKey);
  const known = await existingMatchIds();
  const newIds = recentIds.filter((id) => !known.has(id));

  if (!newIds.length) {
    console.log("[refresh] no new matches.");
    return 0;
  }

  console.log(`[refresh] fetching ${newIds.length} new match(es)…`);

  let added = 0;
  // Oldest new match first, so stored order stays chronological-ish.
  for (const id of newIds.reverse()) {
    const raw = await riotGet(`${REGIONAL_HOST}/lol/match/v5/matches/${id}`, apiKey);

    const slim = extractMatch(raw, puuid);
    if (slim) {
      await upsertMatch(slim);
      added += 1;
    }
    const top = extractTopInfo(raw, puuid);
    if (top) await upsertTopGame(top);
    const teams = extractTeams(raw, puuid);
    if (teams) await upsertMatchTeam(teams);
  }

  console.log(`[refresh] added ${added} match(es).`);
  return added;
}

// Riot API client. Fetches ranked match data for a configured player and upserts
// the slim match row (incl. jungle metrics), the role matchup (enemy in the
// player's role), and the ally/enemy team comp into Neon.
//
// Uses native fetch (Node 18+).

import {
  upsertMatch,
  upsertRoleMatchup,
  upsertMatchTeam,
  existingMatchIds,
} from "./db.js";
import { getPlayer } from "./players.js";

const REGIONAL_HOST = "https://europe.api.riotgames.com";
const QUEUE_RANKED = 420;
const PAGE_SIZE = 100;
const RECENT_LOOKBACK = 200; // a daily run only needs the most recent games
const DEFAULT_RETRY_MS = 10_000;

// Champions commonly played as ranged in lane/jungle. Used to flag the enemy
// matchup as ranged vs melee (most relevant for top lane, kept generic).
const RANGED_CHAMPS = new Set([
  "Teemo", "Vayne", "Quinn", "Kennen", "Gnar", "Kayle", "Jayce",
  "Gangplank", "Vladimir", "Heimerdinger", "Ryze", "Karma", "Lissandra",
  "Akshan", "Cassiopeia", "Graves", "Lucian", "Ezreal", "Smolder",
  "Hwei", "Zoe", "Viktor", "Orianna", "Syndra", "Azir", "Corki",
  "Tristana", "Caitlyn", "Ashe", "Jhin", "Senna", "Kindred",
]);

function apiKey() {
  const key = (process.env.RIOT_API_KEY || "").trim();
  if (!key) throw new Error("RIOT_API_KEY is not set.");
  return key;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with automatic rate-limit retry via the Retry-After header.
async function riotGet(url, key) {
  while (true) {
    const res = await fetch(url, { headers: { "X-Riot-Token": key } });

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

async function getPuuid(gameName, tagLine, key) {
  const url = `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    gameName
  )}/${encodeURIComponent(tagLine)}`;
  const data = await riotGet(url, key);
  return data.puuid;
}

// Ranked match IDs, newest-first. limit=null pages the FULL history.
async function getMatchIds(puuid, key, limit = RECENT_LOOKBACK) {
  const ids = [];
  let start = 0;
  while (limit === null || ids.length < limit) {
    const url = `${REGIONAL_HOST}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${QUEUE_RANKED}&start=${start}&count=${PAGE_SIZE}`;
    const page = await riotGet(url, key);
    if (!page.length) break;
    ids.push(...page);
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return ids;
}

function utcDateString(tsMs) {
  // e.g. "Tuesday, 30 September 2025 at 14:11 UTC"
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
    // Jungle / general metrics
    cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    jungle_cs: p.neutralMinionsKilled ?? 0,
    vision_score: p.visionScore ?? 0,
    dragon_kills: p.dragonKills ?? 0,
    baron_kills: p.baronKills ?? 0,
    first_blood: Boolean(p.firstBloodKill || p.firstBloodAssist),
    objectives_stolen: p.objectivesStolen ?? 0,
  };
}

// Enemy champion in the player's own role (TOP -> enemy top, JUNGLE -> enemy jg).
function extractRoleMatchup(raw, puuid, role) {
  const info = raw.info;
  const me = info.participants.find((x) => x.puuid === puuid);
  if (!me || (me.teamPosition || "").toUpperCase() !== role) return null;

  const enemy = info.participants.find(
    (x) => x.teamId !== me.teamId && (x.teamPosition || "").toUpperCase() === role
  );
  const enemyChamp = enemy ? enemy.championName : "Unknown";

  return {
    match_id: raw.metadata.matchId,
    date_utc: utcDateString(info.gameCreation),
    win: me.win,
    your_champion: me.championName,
    role,
    enemy_champion: enemyChamp,
    enemy_is_ranged: RANGED_CHAMPS.has(enemyChamp),
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

// Core fetch loop shared by incremental refresh and full back-fill.
async function fetchInto(playerKey, idLimit) {
  const player = getPlayer(playerKey);
  if (!player) throw new Error(`Unknown player: ${playerKey}`);

  const key = apiKey();
  const puuid = await getPuuid(player.gameName, player.tagLine, key);
  const ids = await getMatchIds(puuid, key, idLimit);
  const known = await existingMatchIds(playerKey);
  const newIds = ids.filter((id) => !known.has(id));

  if (!newIds.length) {
    console.log(`[${playerKey}] no new matches.`);
    return 0;
  }

  console.log(`[${playerKey}] fetching ${newIds.length} new match(es)…`);

  let added = 0;
  // Oldest new match first, so stored order stays chronological-ish.
  for (const id of newIds.reverse()) {
    const raw = await riotGet(`${REGIONAL_HOST}/lol/match/v5/matches/${id}`, key);

    const slim = extractMatch(raw, puuid);
    if (slim) {
      await upsertMatch(playerKey, slim);
      added += 1;
    }
    const matchup = extractRoleMatchup(raw, puuid, player.role);
    if (matchup) await upsertRoleMatchup(playerKey, matchup);
    const teams = extractTeams(raw, puuid);
    if (teams) await upsertMatchTeam(playerKey, teams);

    if (added % 25 === 0 && added > 0) {
      console.log(`  [${playerKey}] …${added} stored`);
    }
  }

  console.log(`[${playerKey}] added ${added} match(es).`);
  return added;
}

// Incremental refresh (recent games only) — used by the daily cron.
export function refreshFromRiot(playerKey) {
  return fetchInto(playerKey, RECENT_LOOKBACK);
}

// Full history back-fill — used once when adding a new player.
export function backfillPlayer(playerKey) {
  return fetchInto(playerKey, null);
}

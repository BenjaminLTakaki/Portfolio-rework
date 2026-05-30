// Neon Postgres data layer for the /lol dashboard.
//
// Uses the @neondatabase/serverless HTTP driver (neon() tagged-template), which
// works fine from a long-running Node server and needs no connection pooling
// config. All queries are parameterised via the tagged template, so values are
// never string-interpolated into SQL.
//
// Tables mirror the slim shapes the old Python scripts produced, so the frontend
// consumes identical fields:
//   matches      — one row per ranked game (your stats)
//   top_games    — top-lane matchup rows (only when you played TOP)
//   match_teams  — ally/enemy champion lists per game (powers synergy)

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env (local) or the Render env vars."
  );
}

export const sql = neon(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS matches (
      match_id      text PRIMARY KEY,
      timestamp     bigint,
      date_utc      text,
      duration_mins real,
      champion      text,
      tier          text,
      division      text,
      win           boolean,
      kills         integer,
      deaths        integer,
      assists       integer
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS top_games (
      match_id        text PRIMARY KEY,
      date_utc        text,
      win             boolean,
      your_champion   text,
      enemy_top       text,
      enemy_is_ranged boolean
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS match_teams (
      match_id  text PRIMARY KEY,
      timestamp bigint,
      win       boolean,
      you       text,
      allies    jsonb,
      enemies   jsonb
    )
  `;
}

// ---------------------------------------------------------------------------
// Reads (oldest -> newest, matching the old JSON ordering)
// ---------------------------------------------------------------------------

// Postgres bigint columns come back from the driver as strings (to avoid
// precision loss). The frontend expects `timestamp` to be a JS number (as the
// old JSON was), so coerce it here at the boundary.
function numberTimestamp(rows) {
  for (const r of rows) r.timestamp = Number(r.timestamp);
  return rows;
}

export async function getMatches() {
  const rows = await sql`SELECT match_id, timestamp, date_utc, duration_mins, champion,
                    tier, division, win, kills, deaths, assists
             FROM matches ORDER BY timestamp ASC`;
  return numberTimestamp(rows);
}

export async function getTopGames() {
  return sql`SELECT match_id, date_utc, win, your_champion, enemy_top, enemy_is_ranged
             FROM top_games`;
}

export async function getMatchTeams() {
  const rows = await sql`SELECT match_id, timestamp, win, you, allies, enemies
             FROM match_teams ORDER BY timestamp ASC`;
  return numberTimestamp(rows);
}

// ---------------------------------------------------------------------------
// Upserts (idempotent — re-running never duplicates a match)
// ---------------------------------------------------------------------------

export async function upsertMatch(m) {
  await sql`
    INSERT INTO matches (match_id, timestamp, date_utc, duration_mins, champion,
                         tier, division, win, kills, deaths, assists)
    VALUES (${m.match_id}, ${m.timestamp}, ${m.date_utc}, ${m.duration_mins},
            ${m.champion}, ${m.tier}, ${m.division}, ${m.win}, ${m.kills},
            ${m.deaths}, ${m.assists})
    ON CONFLICT (match_id) DO NOTHING
  `;
}

export async function upsertTopGame(g) {
  await sql`
    INSERT INTO top_games (match_id, date_utc, win, your_champion, enemy_top, enemy_is_ranged)
    VALUES (${g.match_id}, ${g.date_utc}, ${g.win}, ${g.your_champion},
            ${g.enemy_top}, ${g.enemy_is_ranged})
    ON CONFLICT (match_id) DO NOTHING
  `;
}

export async function upsertMatchTeam(t) {
  await sql`
    INSERT INTO match_teams (match_id, timestamp, win, you, allies, enemies)
    VALUES (${t.match_id}, ${t.timestamp}, ${t.win}, ${t.you},
            ${JSON.stringify(t.allies)}, ${JSON.stringify(t.enemies)})
    ON CONFLICT (match_id) DO NOTHING
  `;
}

// Set of match IDs already stored, so the incremental fetch can skip them.
export async function existingMatchIds() {
  const rows = await sql`SELECT match_id FROM matches`;
  return new Set(rows.map((r) => r.match_id));
}

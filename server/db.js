// Neon Postgres data layer for the /lol dashboards.
//
// Uses the @neondatabase/serverless HTTP driver (neon() tagged-template). All
// queries are parameterised via the tagged template, so values are never
// string-interpolated into SQL.
//
// Multi-player: every table carries a `player` key (e.g. "ben", "raf") and uses
// a composite primary key (player, match_id) so two tracked players who share a
// game don't collide.
//
// Tables:
//   matches       — one row per ranked game (your stats + jungle metrics)
//   match_teams   — ally/enemy champion lists per game (powers synergy)
//   role_matchups — your-role-vs-enemy-same-role matchup (top: ranged/melee;
//                   jungle: enemy jungler)

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env (local) or the Render env vars."
  );
}

export const sql = neon(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Schema (final shape — fresh installs get this; existing DBs are brought here
// by server/migrate-multiplayer.js)
// ---------------------------------------------------------------------------

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS matches (
      player           text NOT NULL DEFAULT 'ben',
      match_id         text NOT NULL,
      timestamp        bigint,
      date_utc         text,
      duration_mins    real,
      champion         text,
      tier             text,
      division         text,
      win              boolean,
      kills            integer,
      deaths           integer,
      assists          integer,
      cs               integer,
      jungle_cs        integer,
      vision_score     integer,
      dragon_kills     integer,
      baron_kills      integer,
      first_blood      boolean,
      objectives_stolen integer,
      PRIMARY KEY (player, match_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS match_teams (
      player    text NOT NULL DEFAULT 'ben',
      match_id  text NOT NULL,
      timestamp bigint,
      win       boolean,
      you       text,
      allies    jsonb,
      enemies   jsonb,
      PRIMARY KEY (player, match_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS role_matchups (
      player          text NOT NULL DEFAULT 'ben',
      match_id        text NOT NULL,
      date_utc        text,
      win             boolean,
      your_champion   text,
      role            text,
      enemy_champion  text,
      enemy_is_ranged boolean,
      PRIMARY KEY (player, match_id)
    )
  `;
}

// ---------------------------------------------------------------------------
// Reads (player-scoped, oldest -> newest)
// ---------------------------------------------------------------------------

// Postgres bigint columns come back from the driver as strings (to avoid
// precision loss). The frontend expects `timestamp` to be a JS number, so
// coerce it here at the boundary.
function numberTimestamp(rows) {
  for (const r of rows) r.timestamp = Number(r.timestamp);
  return rows;
}

export async function getMatches(player) {
  const rows = await sql`
    SELECT match_id, timestamp, date_utc, duration_mins, champion, tier, division,
           win, kills, deaths, assists, cs, jungle_cs, vision_score,
           dragon_kills, baron_kills, first_blood, objectives_stolen
    FROM matches WHERE player = ${player} ORDER BY timestamp ASC`;
  return numberTimestamp(rows);
}

export async function getRoleMatchups(player) {
  return sql`
    SELECT match_id, date_utc, win, your_champion, role, enemy_champion, enemy_is_ranged
    FROM role_matchups WHERE player = ${player}`;
}

export async function getMatchTeams(player) {
  const rows = await sql`
    SELECT match_id, timestamp, win, you, allies, enemies
    FROM match_teams WHERE player = ${player} ORDER BY timestamp ASC`;
  return numberTimestamp(rows);
}

// ---------------------------------------------------------------------------
// Upserts (idempotent — re-running never duplicates a match)
// ---------------------------------------------------------------------------

export async function upsertMatch(player, m) {
  await sql`
    INSERT INTO matches (player, match_id, timestamp, date_utc, duration_mins,
                         champion, tier, division, win, kills, deaths, assists,
                         cs, jungle_cs, vision_score, dragon_kills, baron_kills,
                         first_blood, objectives_stolen)
    VALUES (${player}, ${m.match_id}, ${m.timestamp}, ${m.date_utc},
            ${m.duration_mins}, ${m.champion}, ${m.tier}, ${m.division}, ${m.win},
            ${m.kills}, ${m.deaths}, ${m.assists}, ${m.cs}, ${m.jungle_cs},
            ${m.vision_score}, ${m.dragon_kills}, ${m.baron_kills},
            ${m.first_blood}, ${m.objectives_stolen})
    ON CONFLICT (player, match_id) DO NOTHING
  `;
}

export async function upsertRoleMatchup(player, g) {
  await sql`
    INSERT INTO role_matchups (player, match_id, date_utc, win, your_champion,
                               role, enemy_champion, enemy_is_ranged)
    VALUES (${player}, ${g.match_id}, ${g.date_utc}, ${g.win}, ${g.your_champion},
            ${g.role}, ${g.enemy_champion}, ${g.enemy_is_ranged})
    ON CONFLICT (player, match_id) DO NOTHING
  `;
}

export async function upsertMatchTeam(player, t) {
  await sql`
    INSERT INTO match_teams (player, match_id, timestamp, win, you, allies, enemies)
    VALUES (${player}, ${t.match_id}, ${t.timestamp}, ${t.win}, ${t.you},
            ${JSON.stringify(t.allies)}, ${JSON.stringify(t.enemies)})
    ON CONFLICT (player, match_id) DO NOTHING
  `;
}

// Set of match IDs already stored for a player, so fetches can skip them.
export async function existingMatchIds(player) {
  const rows = await sql`SELECT match_id FROM matches WHERE player = ${player}`;
  return new Set(rows.map((r) => r.match_id));
}

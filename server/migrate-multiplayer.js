// One-shot migration: bring an existing single-player Neon DB up to the
// multi-player schema. Idempotent — safe to run more than once.
//
//   - adds `player` (default 'ben') + jungle metric columns to `matches`
//   - adds `player` to `match_teams`
//   - switches both primary keys to composite (player, match_id)
//   - creates `role_matchups` and copies `top_games` into it (role 'TOP')
//   - drops the now-unused `top_games`
//
// Run:  node server/migrate-multiplayer.js

import "dotenv/config";
import { sql, ensureSchema } from "./db.js";

async function main() {
  console.log("Ensuring base schema (creates role_matchups if missing)…");
  await ensureSchema();

  console.log("Adding columns to matches…");
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS player text NOT NULL DEFAULT 'ben'`;
  for (const col of [
    "cs integer", "jungle_cs integer", "vision_score integer",
    "dragon_kills integer", "baron_kills integer",
    "first_blood boolean", "objectives_stolen integer",
  ]) {
    // sql.query lets us run a dynamic DDL string (no user input — fixed list).
    await sql.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS ${col}`);
  }

  console.log("Adding player to match_teams…");
  await sql`ALTER TABLE match_teams ADD COLUMN IF NOT EXISTS player text NOT NULL DEFAULT 'ben'`;

  console.log("Switching primary keys to (player, match_id)…");
  await sql`ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_pkey`;
  await sql`ALTER TABLE matches ADD PRIMARY KEY (player, match_id)`;
  await sql`ALTER TABLE match_teams DROP CONSTRAINT IF EXISTS match_teams_pkey`;
  await sql`ALTER TABLE match_teams ADD PRIMARY KEY (player, match_id)`;

  // Migrate top_games -> role_matchups (only if the old table still exists).
  const [{ exists }] = await sql`
    SELECT to_regclass('public.top_games') IS NOT NULL AS exists`;
  if (exists) {
    console.log("Copying top_games -> role_matchups…");
    await sql`
      INSERT INTO role_matchups (player, match_id, date_utc, win, your_champion,
                                 role, enemy_champion, enemy_is_ranged)
      SELECT 'ben', match_id, date_utc, win, your_champion, 'TOP', enemy_top, enemy_is_ranged
      FROM top_games
      ON CONFLICT (player, match_id) DO NOTHING`;
    console.log("Dropping top_games…");
    await sql`DROP TABLE top_games`;
  } else {
    console.log("top_games already gone — skipping copy.");
  }

  const counts = await sql`SELECT player, count(*)::int AS n FROM matches GROUP BY player ORDER BY player`;
  console.log("✅ Migration complete. matches by player:", counts);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

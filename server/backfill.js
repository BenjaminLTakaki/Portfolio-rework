// One-shot full-history back-fill for a single player. Use when adding a new
// player to PLAYERS — fetches their entire ranked history from Riot into Neon.
//
// Run:  node server/backfill.js raf
//
// Rate-limited (personal key: 100 req / 2 min), so a few hundred games take a
// while. Resumable — re-running only fetches matches not already stored.

import "dotenv/config";
import { ensureSchema } from "./db.js";
import { backfillPlayer } from "./riot.js";
import { getPlayer } from "./players.js";

const key = process.argv[2];

if (!key || !getPlayer(key)) {
  console.error(
    `Usage: node server/backfill.js <player>\n` +
    `Unknown or missing player "${key ?? ""}". Known: see server/players.js`
  );
  process.exit(1);
}

async function main() {
  await ensureSchema();
  console.log(`Back-filling full history for "${key}"…`);
  const added = await backfillPlayer(key);
  console.log(`✅ Done. Added ${added} match(es) for ${key}.`);
}

main().catch((err) => {
  console.error("❌ Back-fill failed:", err);
  process.exit(1);
});

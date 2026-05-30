// One-shot migration: create the schema and load the existing static JSON
// (public/lol/*.json) into Neon. Safe to re-run — upserts skip rows already
// present. After this succeeds, the static JSON files are no longer needed.
//
// Run:  npm run seed   (or:  node server/seed.js)

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ensureSchema,
  upsertMatch,
  upsertTopGame,
  upsertMatchTeam,
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "public", "lol");

async function loadJson(name) {
  try {
    const raw = await readFile(path.join(DATA_DIR, name), "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`  (skipping ${name} — not found)`);
      return [];
    }
    throw err;
  }
}

async function main() {
  console.log("Ensuring schema…");
  await ensureSchema();

  const [matches, topGames, matchTeams] = await Promise.all([
    loadJson("matches.json"),
    loadJson("top_games.json"),
    loadJson("match_teams.json"),
  ]);

  console.log(`Seeding ${matches.length} matches…`);
  for (const m of matches) await upsertMatch(m);

  console.log(`Seeding ${topGames.length} top games…`);
  for (const g of topGames) await upsertTopGame(g);

  console.log(`Seeding ${matchTeams.length} team comps…`);
  for (const t of matchTeams) await upsertMatchTeam(t);

  console.log("✅ Seed complete.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});

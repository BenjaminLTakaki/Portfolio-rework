// Node web server for the portfolio.
//
// Responsibilities:
//   - Serve the built Vite SPA (dist/) with SPA-history fallback.
//   - Expose a small read API the /lol dashboard fetches at runtime:
//       GET /api/lol/dashboard  -> { matches, topGames, matchTeams }
//       GET /api/health         -> Postgres version (DB smoke test)
//   - Run a daily node-cron job that incrementally refreshes data from the
//     Riot API into Neon — keeping the dashboard current without a redeploy.

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import cron from "node-cron";

import { sql, ensureSchema, getMatches, getTopGames, getMatchTeams } from "./db.js";
import { refreshFromRiot } from "./riot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const PORT = process.env.PORT || 3000;

const app = express();

// --- API -------------------------------------------------------------------

app.get("/api/health", async (_req, res) => {
  try {
    const [{ version }] = await sql`SELECT version()`;
    res.type("text/plain").send(version);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/lol/dashboard", async (_req, res) => {
  try {
    const [matches, topGames, matchTeams] = await Promise.all([
      getMatches(),
      getTopGames(),
      getMatchTeams(),
    ]);
    res.json({ matches, topGames, matchTeams });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Static SPA + history fallback ----------------------------------------

app.use(express.static(DIST_DIR));

// Any non-API GET that isn't a real file falls back to index.html so
// react-router can handle the route on the client.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

// --- Daily refresh ---------------------------------------------------------

async function runRefresh(label) {
  try {
    const added = await refreshFromRiot();
    console.log(`[cron] ${label}: +${added} match(es).`);
  } catch (err) {
    // Never let a Riot/API hiccup crash the server.
    console.error(`[cron] ${label} failed:`, err.message || err);
  }
}

// 06:17 UTC daily (same slot the old GitHub Action used).
cron.schedule("17 6 * * *", () => runRefresh("daily"), { timezone: "UTC" });

// --- Boot ------------------------------------------------------------------

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to ensure DB schema:", err);
    process.exit(1);
  });

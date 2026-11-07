// Node web server for the portfolio.
//
// Responsibilities:
//   - Serve the built Vite SPA (dist/) with SPA-history fallback.
//   - Expose a small read API the /lol dashboard fetches at runtime:
//       GET /api/lol/dashboard  -> { matches, topGames, matchTeams }
//       GET /api/health         -> Postgres version (DB smoke test)
//   - Run a daily node-cron job that incrementally refreshes data from the
//     Riot API into Neon — keeping the dashboard current without a redeploy.
//   - Certior (the news app, built in the swipe-news repo, formerly Swipe News) at /certior:
//       start its feed build every 10 minutes (swipeNews.js), keep anonymous daily usage totals and show them at
//       /certior-stats (swipeNewsStats.js), and give shared story links a preview of that story (swipeNewsPreview.js).
//       Old /swipe-news addresses redirect to /certior.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import cron from "node-cron";

import { sql, ensureSchema, getMatches, getRoleMatchups, getMatchTeams } from "./db.js";
import { refreshFromRiot } from "./riot.js";
import { PLAYERS, publicPlayer } from "./players.js";
import { makeFeedRefresher, movedTo } from "./swipeNews.js";
import { cleanEvents, makeStats, statsAuth } from "./swipeNewsStats.js";
import { makePreview } from "./swipeNewsPreview.js";

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

app.get("/api/lol/:player/dashboard", async (req, res) => {
  const key = req.params.player;
  const player = publicPlayer(key);
  if (!player) {
    return res.status(404).json({ error: `Unknown player: ${key}` });
  }
  try {
    const [matches, roleMatchups, matchTeams] = await Promise.all([
      getMatches(key),
      getRoleMatchups(key),
      getMatchTeams(key),
    ]);
    res.json({ player, matches, roleMatchups, matchTeams });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Certior (formerly Swipe News) ---------------------------------------------

const refreshFeed = makeFeedRefresher({ token: process.env.SWIPE_NEWS_DISPATCH_TOKEN });
cron.schedule("*/10 * * * *", refreshFeed, { timezone: "UTC" });

// A visit also starts a build, so a server that was asleep still catches up.
app.use("/certior", (_req, _res, next) => {
  refreshFeed();
  next();
});

// The app moved from /swipe-news. Its old offline service worker gets a version that removes itself (it would keep
// serving the cached old app), and every other old address redirects, so links, shares and installs keep working.
app.get("/swipe-news/sw.js", (_req, res) => res.type("js").set("Cache-Control", "no-cache").sendFile(path.join(__dirname, "swipe-news-retired-sw.js")));
app.use("/swipe-news", movedTo("/certior"));
app.get("/swipe-news-stats", (_req, res) => res.redirect(301, "/certior-stats"));

// Anonymous daily totals: the app posts a small batch of counts when you leave it (sendBeacon).
const stats = makeStats(sql);
app.post("/api/swipe-news/events", express.json({ limit: "4kb", type: () => true }), async (req, res) => {
  const events = cleanEvents(req.body);
  res.status(204).end();
  if (events.length) await stats.record(events).catch((err) => console.error("[swipe-news] counts not saved:", err.message || err));
});
const statsGate = statsAuth(process.env.SWIPE_STATS_PASSWORD);
app.get("/api/swipe-news/stats", statsGate, async (_req, res) => {
  try {
    res.json({ rows: await stats.rows(60) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
app.get("/certior-stats", statsGate, (_req, res) => res.sendFile(path.join(__dirname, "swipe-news-stats.html")));

// A shared story's link previews that story (WhatsApp, iMessage, social media).
const indexFile = path.join(DIST_DIR, "certior", "index.html");
let indexHtml = null;
app.get(["/certior/", "/certior/index.html"], makePreview({ readIndex: async () => (indexHtml ??= await readFile(indexFile, "utf8")) }));

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
  for (const key of Object.keys(PLAYERS)) {
    try {
      const added = await refreshFromRiot(key);
      console.log(`[cron] ${label} ${key}: +${added} match(es).`);
    } catch (err) {
      // Never let a Riot/API hiccup crash the server.
      console.error(`[cron] ${label} ${key} failed:`, err.message || err);
    }
  }
}

// 06:17 UTC daily (same slot the old GitHub Action used).
cron.schedule("17 6 * * *", () => runRefresh("daily"), { timezone: "UTC" });

// --- Boot ------------------------------------------------------------------

ensureSchema()
  .then(() => stats.ensure())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to ensure DB schema:", err);
    process.exit(1);
  });

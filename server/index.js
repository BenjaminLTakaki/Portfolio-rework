// Node web server for the portfolio.
//
// Responsibilities:
//   - Serve the built Vite SPA (dist/) with SPA-history fallback.
//   - Expose a small read API the /lol dashboard fetches at runtime:
//       GET /api/lol/dashboard  -> { matches, topGames, matchTeams }
//       GET /api/health         -> { ok } (can the database be reached)
//   - Run a daily node-cron job that incrementally refreshes data from the
//     Riot API into Neon — keeping the dashboard current without a redeploy.
//   - Certior (the news app, built in the swipe-news repo, formerly Swipe News) at /certior:
//       start its feed build every 10 minutes (swipeNews.js), keep anonymous daily usage totals and show them at
//       /certior-stats (swipeNewsStats.js), and give shared story links a preview of that story (swipeNewsPreview.js).
//       Old /swipe-news addresses redirect to /certior. Posts the day's card to Instagram (certiorInstagram.js).

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import express from "express";
import cron from "node-cron";

import { sql, ensureSchema, getMatches, getRoleMatchups, getMatchTeams } from "./db.js";
import { refreshFromRiot } from "./riot.js";
import { PLAYERS, publicPlayer } from "./players.js";
import { makeFeedRefresher, movedTo } from "./swipeNews.js";
import { cleanEvents, makeStats, rateLimit, readAuth, statsAuth } from "./swipeNewsStats.js";
import { makePreview } from "./swipeNewsPreview.js";
import { makeInstagramPoster, sqlStore } from "./certiorInstagram.js";
import { isPage, sitemap, withHead } from "./pages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");
const PORT = process.env.PORT || 3000;

const app = express();
app.disable("x-powered-by");

// Headers every answer gets. A browser only acts on Strict-Transport-Security over HTTPS, so it does nothing on localhost.
// ponytail: no Content-Security-Policy for scripts (Certior's pages, the scenes and YouTube would each need their own
// rules, and a wrong one breaks the page); frame-ancestors is the part that needs no upkeep
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000",
    "Content-Security-Policy": "frame-ancestors 'self'",
    "X-Frame-Options": "SAMEORIGIN",
  });
  next();
});

// --- API -------------------------------------------------------------------

app.get("/api/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ ok: true });
  } catch (err) {
    console.error("[health]", err.message || err);      // the reason goes to the log, not to whoever asks
    res.status(503).json({ ok: false });
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
    console.error("[lol]", key, err.message || err);
    res.status(500).json({ error: "The match history can't be loaded right now." });
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
app.get("/project/swipe-news", (_req, res) => res.redirect(301, "/project/certior"));

// Anonymous daily totals: the app posts a small batch of counts when you leave it (sendBeacon).
const stats = makeStats(sql);
app.post("/api/swipe-news/events", rateLimit(), express.json({ limit: "4kb", type: () => true }), async (req, res) => {
  const events = cleanEvents(req.body);
  res.status(204).end();
  if (events.length) await stats.record(events).catch((err) => console.error("[swipe-news] counts not saved:", err.message || err));
});
const statsGate = statsAuth(process.env.SWIPE_STATS_PASSWORD);
// the numbers, for the password or the read-only key Claude's MCP uses (mcp/certior.mjs): reading only, never posting
const readGate = readAuth(process.env.CERTIOR_READ_TOKEN, statsGate);
app.get("/api/swipe-news/stats", readGate, async (_req, res) => {
  try {
    res.json({ rows: await stats.rows(60) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
app.get("/certior-stats", statsGate, (_req, res) => res.sendFile(path.join(__dirname, "swipe-news-stats.html")));

// A story as a Reel, posted to Instagram only when you press the button on /certior-stats (token in IG_ACCESS_TOKEN;
// without it this does nothing), as many a day as you like.
// ponytail: no schedule, by choice; to go back to automatic, cron.schedule("0 18 * * *", () => instagram.run(), ...),
// once a day: run() has no daily cap any more
const igStore = sqlStore(sql);
const instagram = makeInstagramPoster({
  store: igStore,
  // in a worker thread: drawing a Reel takes minutes of CPU here, and this thread has to keep answering meanwhile
  render: (story, now) => new Promise((ok, fail) => {
    const w = new Worker(new URL("./certiorReel.js", import.meta.url), { workerData: { certiorReel: { story, now: now.toISOString() } } });
    w.once("message", ok);
    w.once("error", fail);
    w.once("exit", (code) => fail(new Error(`the Reel's worker stopped (${code})`)));      // after a message: no effect
  }),
  envToken: process.env.IG_ACCESS_TOKEN,
  igUserId: process.env.IG_USER_ID,
  publicBase: "https://www.benjamintakaki.com",
});
app.get("/api/certior/instagram/:file", instagram.media);
app.get("/api/certior/instagram-status", statsGate, async (_req, res) => {
  try {
    const stored = await igStore.token(), systemUser = /^EAA/.test(process.env.IG_ACCESS_TOKEN || "");
    res.json({
      setUp: !!(process.env.IG_ACCESS_TOKEN || stored), recent: await igStore.recent(7),
      postedDays: await igStore.postedDays(30), job: instagram.job(),
      // a system user's token never expires; an Instagram Login one is refreshed weekly, and a failed refresh shows here
      token: systemUser ? { kind: "system" } : stored ? { kind: "instagram", refreshed: new Date(stored.at).toISOString() } : null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
// Instagram's numbers for each Reel: views, reach, watch time, skip rate, likes, comments, shares, saves
app.get("/api/certior/insights", readGate, async (_req, res) => {
  try {
    res.json(await instagram.insights());
  } catch (err) {
    res.status(err.status || 502).json({ error: String(err.message || err) });
  }
});
// a story's Reel for the stats page to show and download (?cover: its cover); made once a day, shared with the post.
// ?ready starts making it and answers within 20 s whether it's done, so no request outlasts Cloudflare's 100 s.
app.get("/api/certior/reel/:id", statsGate, async (req, res) => {
  try {
    const reel = instagram.preview(req.params.id);
    if ("ready" in req.query) {
      const made = reel.then(() => true);
      made.catch(() => {});      // failing after this answer: the next ?ready reports it
      return res.json({ ready: await Promise.race([made, new Promise((r) => setTimeout(r, 20e3, false))]) });
    }
    const { mp4, cover } = await reel;
    res.set("Cache-Control", "no-store").sendFile("cover" in req.query ? cover : mp4);
  } catch (err) {
    res.status(err.status || 502).json({ error: String(err.message || err) });
  }
});
// the caption a story's Reel goes out with, shown on the stats page before posting
app.get("/api/certior/caption/:id", statsGate, async (req, res) => {
  try {
    res.json({ caption: await instagram.caption(req.params.id) });
  } catch (err) {
    res.status(err.status || 502).json({ error: String(err.message || err) });
  }
});
// starts the post and answers at once: it takes a few minutes, and the page follows it through instagram-status
app.post("/api/certior/instagram-run", statsGate, express.json(), (req, res) => res.json(instagram.start(req.body?.story)));

// A shared story's link previews that story (WhatsApp, iMessage, social media).
const indexFile = path.join(DIST_DIR, "certior", "index.html");
let indexHtml = null;
app.get(["/certior/", "/certior/index.html"], makePreview({ readIndex: async () => (indexHtml ??= await readFile(indexFile, "utf8")) }));

// --- Static SPA + history fallback ----------------------------------------

app.get("/sitemap.xml", (_req, res) => res.type("xml").send(sitemap()));

const ASSETS = path.join(DIST_DIR, "assets") + path.sep;
app.use(express.static(DIST_DIR, {
  setHeaders(res, file) {
    // Vite puts a hash of the contents in every name under /assets, so those never change; a page is asked for each time
    if (file.startsWith(ASSETS)) res.set("Cache-Control", "public, max-age=31536000, immutable");
    else if (file.endsWith(".html")) res.set("Cache-Control", "no-cache");
  },
}));

// Any other GET gets index.html so react-router can draw the page: with 200 if the app has that page, else with 404
// (the app then shows "Page not found"), so a search engine doesn't file every wrong address as a copy of the home page.
let spaHtml = null;
app.use(async (req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  spaHtml ??= await readFile(path.join(DIST_DIR, "index.html"), "utf8");
  res.status(isPage(req.path) ? 200 : 404).set("Cache-Control", "no-cache").type("html").send(withHead(spaHtml, req.path));
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

// The site is served even when the database can't be reached: the pages are files, and only /lol and the stats need it.
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
ensureSchema()
  .then(() => stats.ensure())
  .then(() => igStore.ensure())
  .catch((err) => console.error("The database is not ready, so /lol and the Certior stats will fail:", err.message || err));

// Certior (formerly Swipe News) usage: anonymous daily totals only. The app sends counts like { visit: 1, watched_left: 3 } when you leave
// it; each becomes +n on (day, name). No cookies, IDs or IP addresses are stored, so nothing here can be traced to a
// person or linked across days. The stats page (password in SWIPE_STATS_PASSWORD) reads the totals back.
import crypto from "node:crypto";

// Only these names are kept: anything else in a request is dropped, so nobody can fill the table with junk names.
export const EVENT_NAME =
  /^(visit|new|age_(0|1|2_7|8_30|31_plus)|homescreen|browser|mode_(videos|text)|story|watched_(left|center|right|state|unrated)|story_compared|story_watched|share|shared_open|compare|recap|search|world|ref:[a-z0-9.-]{1,40})$/;
export const MAX_PER_NAME = 200; // one batch from one visit; more is a bug or abuse
export const MAX_NAMES = 30;
// ponytail: a caller can still post small fake batches; add a per-address rate limit (in memory, never stored) if that shows up

/** The valid [name, n] pairs of a request body; everything else is dropped. */
export function cleanEvents(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.entries(body)
    .filter(([name, n]) => EVENT_NAME.test(name) && Number.isInteger(n) && n > 0)
    .slice(0, MAX_NAMES)
    .map(([name, n]) => [name, Math.min(n, MAX_PER_NAME)]);
}

export function makeStats(sql) {
  return {
    async ensure() {
      await sql`
        CREATE TABLE IF NOT EXISTS swipe_news_daily (
          day   date    NOT NULL,
          name  text    NOT NULL,
          n     integer NOT NULL,
          PRIMARY KEY (day, name)
        )`;
    },
    async record(events, day = new Date().toISOString().slice(0, 10)) {
      await Promise.all(events.map(([name, n]) => sql`
        INSERT INTO swipe_news_daily (day, name, n) VALUES (${day}, ${name}, ${n})
        ON CONFLICT (day, name) DO UPDATE SET n = swipe_news_daily.n + EXCLUDED.n`));
    },
    async rows(days = 60) {
      return sql`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, name, n FROM swipe_news_daily
        WHERE day > current_date - ${days}::int ORDER BY day, name`;
    },
  };
}

const digest = (s) => crypto.createHash("sha256").update(s).digest();      // equal lengths, for timingSafeEqual

/** HTTP Basic auth with one password; without SWIPE_STATS_PASSWORD set, the page simply doesn't exist. */
export function statsAuth(password) {
  return (req, res, next) => {
    if (!password) return res.status(404).end();
    const encoded = (req.get("authorization") || "").replace(/^Basic\s+/i, "");
    const given = Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":");
    if (given && crypto.timingSafeEqual(digest(given), digest(password))) return next();
    res.set("WWW-Authenticate", 'Basic realm="Certior stats"').status(401).send("Password needed");
  };
}

/** Reading the numbers without the password: a read-only key (CERTIOR_READ_TOKEN, 32+ characters) sent as
 *  "Authorization: Bearer <key>", for Claude's MCP (mcp/certior.mjs). It only opens GETs it's put on, so it can't post
 *  or make Reels; without one set, it opens nothing. Anything else goes through the password. */
export function readAuth(token, passwordGate) {
  return (req, res, next) => {
    const given = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") || "")?.[1];
    if (!given) return passwordGate(req, res, next);
    if (req.method === "GET" && token?.length >= 32 && crypto.timingSafeEqual(digest(given), digest(token))) return next();
    res.status(401).send("Wrong key");
  };
}

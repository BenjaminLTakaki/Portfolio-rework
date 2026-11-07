// Posts the day's Certior card to Instagram by itself, for free, through Instagram's own API (Instagram Login, publishing
// to your own professional account). Nobody checks a post before it goes out, so the guardrails matter:
//   - only a story from the last 24 hours that Left, Center and Right all covered (the most outlets wins),
//   - never a story that shares a clip with one posted in the last week,
//   - no post at all on a day without such a story.
// Instagram fetches the image from a public URL: the server serves the JPEG it just drew, from memory, at
// /api/certior/instagram/<day>.jpg. The access token lasts 60 days; it is refreshed weekly and kept in the database.
const IG = "https://graph.instagram.com"; // ponytail: unversioned calls use Meta's oldest supported version; pin one if that ever bites
const FEED = "https://benjaminltakaki.github.io/certior-news/feed.json";
const SIDES = [["left", "Left"], ["center", "Center"], ["right", "Right"]];
const DAY_MS = 864e5;
export const REFRESH_AFTER_MS = 7 * DAY_MS;
const STATUS_TRIES = 20, STATUS_WAIT_MS = 3000;

const outlets = (s) => new Set(s.clips.map((c) => c.channel)).size;
const firstOf = (s, col) => s.clips.find((c) => c.column === col);

/** The day's story: the last 24 h, all three sides, no clip posted this week; most outlets first. Null on a quiet day. */
export function pickStory(stories, now, postedClipIds) {
  return stories
    .filter((s) => now - Date.parse(s.first || s.updated) < DAY_MS)
    .filter((s) => SIDES.every(([col]) => firstOf(s, col)))
    .filter((s) => !s.clips.some((c) => postedClipIds.has(c.id)))
    .sort((a, b) => outlets(b) - outlets(a))[0] || null;
}

export function captionFor(s) {
  return [
    `Same story, three sides. ${outlets(s)} outlets covered it:`,
    "",
    ...SIDES.map(([col, label]) => { const c = firstOf(s, col); return `${label} (${c.channel}): ${c.title}`; }),
    "",
    "Every outlet's take, side by side, in Certior: link in bio.",
    "",
    "#news #media #mediabias #certior",
  ].join("\n");
}

/** The poster's memory in Neon: the token, and what was posted when. */
export function sqlStore(sql) {
  return {
    async ensure() {
      await sql`CREATE TABLE IF NOT EXISTS certior_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
      await sql`CREATE TABLE IF NOT EXISTS certior_instagram (
        day date PRIMARY KEY, story_id text NOT NULL, headline text NOT NULL, clip_ids text[] NOT NULL,
        media_id text, at timestamptz NOT NULL DEFAULT now())`;
    },
    async token() {
      const [row] = await sql`SELECT value, updated_at FROM certior_settings WHERE key = 'ig_token'`;
      return row ? { value: row.value, at: new Date(row.updated_at).getTime() } : null;
    },
    async saveToken(value) {
      await sql`INSERT INTO certior_settings (key, value, updated_at) VALUES ('ig_token', ${value}, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    },
    // a day is claimed before posting, so two runs can't both post; a failed post gives it back
    async claim(day, s) {
      const rows = await sql`INSERT INTO certior_instagram (day, story_id, headline, clip_ids)
        VALUES (${day}, ${s.id}, ${s.headline}, ${s.clips.map((c) => c.id)}) ON CONFLICT (day) DO NOTHING RETURNING day`;
      return rows.length === 1;
    },
    async posted(day, mediaId) { await sql`UPDATE certior_instagram SET media_id = ${mediaId} WHERE day = ${day}`; },
    async release(day) { await sql`DELETE FROM certior_instagram WHERE day = ${day} AND media_id IS NULL`; },
    async hasDay(day) { return (await sql`SELECT 1 FROM certior_instagram WHERE day = ${day}`).length > 0; },
    async recentClipIds(days) {
      const rows = await sql`SELECT clip_ids FROM certior_instagram WHERE day > current_date - ${days}::int`;
      return new Set(rows.flatMap((r) => r.clip_ids));
    },
    async recent(n) {
      return sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, headline, media_id FROM certior_instagram ORDER BY day DESC LIMIT ${n}`;
    },
  };
}

export function makeInstagramPoster({ store, render, envToken, publicBase, fetchFn = fetch, now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = console }) {
  let image = null; // { file, jpg }: served for Instagram to fetch

  async function call(method, pathname, params) {
    const url = new URL(IG + pathname);
    const init = { method };
    if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    else init.body = new URLSearchParams(params);
    const res = await fetchFn(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(`Instagram ${pathname}: ${body.error?.message || res.status}`);
    return body;
  }

  // The stored token, refreshed when a week old (each refresh gives 60 more days). The env var only seeds it.
  async function token() {
    let saved = await store.token();
    if (!saved && envToken) { await store.saveToken(envToken); saved = { value: envToken, at: now() }; }
    if (!saved) return null;
    if (now() - saved.at > REFRESH_AFTER_MS) {
      try {
        const { access_token } = await call("GET", "/refresh_access_token", { grant_type: "ig_refresh_token", access_token: saved.value });
        await store.saveToken(access_token);
        return access_token;
      } catch (err) {
        log.error(`[certior] Instagram token not refreshed: ${err.message}`);      // the old one still works for a while
      }
    }
    return saved.value;
  }

  async function run() {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (await store.hasDay(day)) return { skipped: "already posted today" };
    const access_token = await token();
    if (!access_token) return { skipped: "not set up: no IG_ACCESS_TOKEN" };
    const res = await fetchFn(`${FEED}?t=${now()}`);
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const story = pickStory((await res.json()).stories, now(), await store.recentClipIds(7));
    if (!story) return { skipped: "no story from the last day that all three sides covered" };
    if (!(await store.claim(day, story))) return { skipped: "already posted today" };
    try {
      const file = `${day}.jpg`;
      image = { file, jpg: await render(story, firstOf(story, "center").id, new Date(now())) };
      const { user_id } = await call("GET", "/me", { fields: "user_id", access_token });
      const { id: container } = await call("POST", `/${user_id}/media`, { image_url: `${publicBase}/api/certior/instagram/${file}`, caption: captionFor(story), access_token });
      for (let i = 0; ; i++) {      // Instagram fetches and checks the image first
        const { status_code } = await call("GET", `/${container}`, { fields: "status_code", access_token });
        if (status_code === "FINISHED") break;
        if (status_code === "ERROR" || i >= STATUS_TRIES) throw new Error(`Instagram didn't accept the image (${status_code})`);
        await wait(STATUS_WAIT_MS);
      }
      const { id: mediaId } = await call("POST", `/${user_id}/media_publish`, { creation_id: container, access_token });
      await store.posted(day, mediaId);
      log.log(`[certior] posted to Instagram: ${story.headline}`);
      return { posted: story.headline, mediaId };
    } catch (err) {
      await store.release(day);      // the next scheduled try can post it
      throw err;
    }
  }

  return {
    run,
    /** GET /api/certior/instagram/:file: the image Instagram fetches; only today's, and only once drawn. */
    image(req, res) {
      if (!image || req.params.file !== image.file) return res.status(404).end();
      res.type("jpeg").set("Cache-Control", "no-store").send(image.jpg);
    },
  };
}

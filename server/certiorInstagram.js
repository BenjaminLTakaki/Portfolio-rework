// Posts the day's Certior story to Instagram as a Reel (certiorReel.js), for free, through Instagram's own API
// (publishing to your own professional account), when you press the button on /certior-stats. The guardrails:
//   - only a story from the last 24 hours that Left, Center and Right all covered (the stats page offers the ones
//     with the most outlets; without a choice, the most outlets wins),
//   - never a story that shares a clip with one posted in the last week,
//   - at most one post a day.
// Instagram fetches the video and its cover from a public URL: the server serves the files it just made at
// /api/certior/instagram/<day>.mp4 and .jpg while that post is made. Two kinds of token work:
//   - IGAA... (Instagram Login): lasts 60 days, refreshed weekly and kept in the database; graph.instagram.com.
//   - EAA... (a system user's token, from Business settings; new Meta apps only get this kind): never expires, so it is
//     used straight from IG_ACCESS_TOKEN; graph.facebook.com, with the Instagram account's ID in IG_USER_ID.
// ponytail: unversioned calls use Meta's oldest supported version; pin one if that ever bites
const IG = "https://graph.instagram.com", FB = "https://graph.facebook.com";
const FEED = "https://benjaminltakaki.github.io/certior-news/feed.json";
const SIDES = [["left", "Left"], ["center", "Center"], ["right", "Right"]];
const DAY_MS = 864e5;
export const REFRESH_AFTER_MS = 7 * DAY_MS;
const STATUS_TRIES = 60, STATUS_WAIT_MS = 5000;      // Instagram takes a minute or two to process a video

const outlets = (s) => new Set(s.clips.map((c) => c.channel)).size;
const firstOf = (s, col) => s.clips.find((c) => c.column === col);

/** A story that may go out: from the last 24 h, all three sides, no clip posted this week. */
const allowed = (s, now, postedClipIds) => now - Date.parse(s.first || s.updated) < DAY_MS
  && SIDES.every(([col]) => firstOf(s, col)) && !s.clips.some((c) => postedClipIds.has(c.id));

/** The day's story: allowed, most outlets first. Null on a quiet day. */
export function pickStory(stories, now, postedClipIds) {
  return stories.filter((s) => allowed(s, now, postedClipIds)).sort((a, b) => outlets(b) - outlets(a))[0] || null;
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
    // a day is claimed before posting, so two runs can't both post; a failed post gives it back, and one that was cut
    // off (the server restarted mid-post) stops counting after 15 minutes
    async claim(day, s) {
      const rows = await sql`INSERT INTO certior_instagram (day, story_id, headline, clip_ids)
        VALUES (${day}, ${s.id}, ${s.headline}, ${s.clips.map((c) => c.id)})
        ON CONFLICT (day) DO UPDATE SET story_id = EXCLUDED.story_id, headline = EXCLUDED.headline, clip_ids = EXCLUDED.clip_ids, at = now()
          WHERE certior_instagram.media_id IS NULL AND certior_instagram.at < now() - interval '15 minutes'
        RETURNING day`;
      return rows.length === 1;
    },
    async posted(day, mediaId) { await sql`UPDATE certior_instagram SET media_id = ${mediaId} WHERE day = ${day}`; },
    async release(day) { await sql`DELETE FROM certior_instagram WHERE day = ${day} AND media_id IS NULL`; },
    async hasDay(day) {
      return (await sql`SELECT 1 FROM certior_instagram WHERE day = ${day} AND (media_id IS NOT NULL OR at > now() - interval '15 minutes')`).length > 0;
    },
    async postedDays(days) {      // the days a Reel went out: the stats page marks them on its chart
      const rows = await sql`SELECT to_char(day, 'YYYY-MM-DD') AS day FROM certior_instagram WHERE media_id IS NOT NULL AND day > current_date - ${days}::int`;
      return rows.map((r) => r.day);
    },
    async recentClipIds(days) {
      const rows = await sql`SELECT clip_ids FROM certior_instagram WHERE day > current_date - ${days}::int AND media_id IS NOT NULL`;
      return new Set(rows.flatMap((r) => r.clip_ids));
    },
    async recent(n) {
      return sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, headline, media_id,
        (media_id IS NULL AND at < now() - interval '15 minutes') AS stale FROM certior_instagram ORDER BY day DESC LIMIT ${n}`;
    },
  };
}

export function makeInstagramPoster({ store, render, envToken, igUserId, publicBase, fetchFn = fetch, now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = console }) {
  let media = null; // { day, mp4, cover }: the post being made, served for Instagram to fetch
  let job = null; // the post started from the stats page: { running, step } while it's made, then how it ended
  const reels = new Map(); // "day:story id" -> the Reel's files (a promise): made once, for the preview and the post
  const systemUser = /^EAA/.test(envToken || "");
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const step = (text) => { if (job?.running) job.step = text; };

  async function call(method, pathname, params) {
    const url = new URL((systemUser ? FB : IG) + pathname);
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
    if (systemUser) return envToken;
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

  async function stories() {
    const res = await fetchFn(`${FEED}?t=${now()}`);
    if (!res.ok) throw new Error(`feed ${res.status}`);
    return (await res.json()).stories;
  }

  // A story's Reel, made once for the clips it shows (a story gains and swaps clips during the day, and the caption is
  // always written from the latest): the stats page's preview and the post share it. A failed one can be tried again.
  // One is made at a time: making one takes much of a small server's memory.
  // ponytail: the files stay in the temp folder until the server restarts (every deploy); prune them if that ever matters
  let making = Promise.resolve();
  function reel(story) {
    const shown = story.topic === "sports" ? story.clips.slice(0, 3) : SIDES.map(([col]) => firstOf(story, col));
    const key = `${today()}:${story.id}:${shown.map((c) => c?.id).join(",")}`;
    for (const k of reels.keys()) if (!k.startsWith(today())) reels.delete(k);
    if (!reels.has(key)) {
      const made = making.then(() => render(story, new Date(now())));
      making = made.catch(() => {});
      reels.set(key, made.catch((err) => { reels.delete(key); throw err; }));
    }
    return reels.get(key);
  }

  /** The Reel of a story in the feed, for the stats page to show. */
  async function preview(storyId) {
    const story = (await stories()).find((s) => s.id === storyId);
    if (!story) throw Object.assign(new Error("that story isn't in the feed any more"), { status: 404 });
    if (!SIDES.every(([col]) => firstOf(story, col))) throw Object.assign(new Error("a Reel needs all three sides"), { status: 400 });
    return reel(story);
  }

  // Posts a story's Reel: the one picked on the stats page, or else the day's biggest.
  async function run(storyId) {
    const day = today();
    if (await store.hasDay(day)) return { skipped: "already posted today" };
    const access_token = await token();
    if (!access_token) return { skipped: "not set up: no IG_ACCESS_TOKEN" };
    if (systemUser && !igUserId) return { skipped: "not set up: no IG_USER_ID (needed with a system user's token)" };
    const all = await stories(), postedClipIds = await store.recentClipIds(7);
    const story = storyId ? all.find((s) => s.id === storyId) : pickStory(all, now(), postedClipIds);
    if (!story) return { skipped: storyId ? "that story isn't in the feed any more" : "no story from the last day that all three sides covered" };
    if (!allowed(story, now(), postedClipIds)) return { skipped: "only a story from the last day that all three sides covered, and none that shares a clip with this week's posts" };
    if (!(await store.claim(day, story))) return { skipped: "already posted today" };
    try {
      step("Making the Reel");
      media = { day, ...(await reel(story)) };
      const user_id = systemUser ? igUserId : (await call("GET", "/me", { fields: "user_id", access_token })).user_id;
      step("Sending it to Instagram");
      const file = `${publicBase}/api/certior/instagram/${day}`;
      const { id: container } = await call("POST", `/${user_id}/media`, {
        media_type: "REELS", video_url: `${file}.mp4`, cover_url: `${file}.jpg`, share_to_feed: "true", caption: captionFor(story), access_token,
      });
      step("Instagram is processing the video");
      for (let i = 0; ; i++) {      // Instagram fetches the video and checks it first
        const { status_code, status } = await call("GET", `/${container}`, { fields: "status_code,status", access_token });
        if (status_code === "FINISHED") break;
        if (status_code === "ERROR" || status_code === "EXPIRED" || i >= STATUS_TRIES) throw new Error(`Instagram didn't accept the video (${status || status_code})`);
        await wait(STATUS_WAIT_MS);
      }
      step("Publishing");
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
    preview,
    /** The caption a story's Reel goes out with, so the stats page can show it before you post. */
    async caption(storyId) {
      const story = (await stories()).find((s) => s.id === storyId);
      if (!story) throw Object.assign(new Error("that story isn't in the feed any more"), { status: 404 });
      return captionFor(story);
    },
    /** Starts a post in the background (it takes a few minutes), so the stats page can follow it with job(). */
    start(storyId) {
      if (!job?.running) {
        job = { running: true, step: "Starting" };
        run(storyId).then((result) => { job = result; }, (err) => {
          log.error(`[certior] Instagram post failed: ${err.message || err}`);
          job = { error: String(err.message || err) };
        });
      }
      return job;
    },
    job: () => job,
    /** GET /api/certior/instagram/:file: the Reel and cover Instagram fetches; only the post being made. */
    media(req, res) {
      const ext = media && req.params.file.startsWith(media.day) ? req.params.file.slice(media.day.length) : "";
      if (ext !== ".mp4" && ext !== ".jpg") return res.status(404).end();
      res.set("Cache-Control", "no-store").sendFile(ext === ".mp4" ? media.mp4 : media.cover);
    },
  };
}

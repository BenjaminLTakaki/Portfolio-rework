import assert from "node:assert/strict";
import test from "node:test";

import { cleanEvents, makeStats, statsAuth } from "./swipeNewsStats.js";
import { makePreview, withPreview } from "./swipeNewsPreview.js";

// --- anonymous counts --------------------------------------------------------

test("only known count names and sane numbers are kept", () => {
  const got = cleanEvents({
    visit: 1, watched_left: 3, "ref:tiktok.com": 1, share: 999,
    email: 1, "ref:<script>": 1, story: -2, compare: 1.5, mode_videos: "1", "ref:": 1,
  });
  assert.deepEqual(got, [["visit", 1], ["watched_left", 3], ["ref:tiktok.com", 1], ["share", 200]]);
  assert.deepEqual(cleanEvents(null), []);
  assert.deepEqual(cleanEvents([["visit", 1]]), []);
});

test("counts add up per day and name", async () => {
  const calls = [];
  const sql = (strings, ...values) => (calls.push([strings.join("?"), values]), Promise.resolve([]));
  await makeStats(sql).record([["visit", 1], ["share", 2]], "2026-11-07");
  assert.equal(calls.length, 2);
  assert.match(calls[0][0], /ON CONFLICT \(day, name\) DO UPDATE SET n = swipe_news_daily\.n \+ EXCLUDED\.n/);
  assert.deepEqual(calls.map(([, v]) => v), [["2026-11-07", "visit", 1], ["2026-11-07", "share", 2]]);
});

test("the stats page needs the password, and doesn't exist without one", () => {
  const run = (password, header) => {
    const res = { code: 200, headers: {}, status(c) { this.code = c; return this; }, set(k, v) { this.headers[k] = v; return this; }, send() { return this; }, end() { return this; } };
    let passed = false;
    statsAuth(password)({ get: () => header }, res, () => { passed = true; });
    return passed ? "ok" : res.code;
  };
  const basic = (pw) => `Basic ${Buffer.from(`ben:${pw}`).toString("base64")}`;
  assert.equal(run("", basic("x")), 404);
  assert.equal(run("s3cret:pw", basic("s3cret:pw")), "ok");      // a colon in the password is fine
  assert.equal(run("s3cret", basic("wrong")), 401);
  assert.equal(run("s3cret", undefined), 401);
});

// --- link previews -----------------------------------------------------------

const INDEX = `<head>
  <title>Swipe News</title>
  <!-- og: default -->
  <meta property="og:title" content="Swipe News">
  <!-- /og -->
  <link rel="stylesheet" href="style.css">
</head>`;
const STORY = {
  id: "s_abc123", headline: `Strike shuts ports <script>alert(1)</script> & "more"`,
  clips: [
    { id: "vidLeft0001", column: "left", channel: "DW News", title: "Ports close as unions strike" },
    { id: "vidCenter01", column: "center", channel: "Reuters", title: "Port strike halts trade" },
    { id: "vidRight001", column: "right", channel: "Fox News", title: "Union chaos at the ports" },
  ],
};

test("a shared story's link previews its headline, each side and its clip, escaped", () => {
  const html = withPreview(INDEX, STORY, "vidCenter01");
  assert.ok(!html.includes("<script>alert(1)</script>") && html.includes("&#60;script&#62;"));
  assert.match(html, /<title>Strike shuts ports .* \| Swipe News<\/title>/);
  assert.match(html, /og:description" content="Left \(DW News\): Ports close as unions strike \/ Center \(Reuters\): Port strike halts trade \/ Right/);
  assert.match(html, /og:image" content="https:\/\/i\.ytimg\.com\/vi\/vidCenter01\/hqdefault\.jpg"/);
  assert.equal((html.match(/og:title/g) || []).length, 1, "the default block is replaced, not repeated");
  assert.match(html, /<link rel="stylesheet" href="style\.css">/);
});

function serve(preview, query) {
  return new Promise((resolve) => {
    const res = { type() { return this; }, set() { return this; }, send: (body) => resolve({ body }) };
    preview({ query }, res, () => resolve({ next: true }));
  });
}

test("previews find the story (by clip if its id changed), cache the feed, and fall back to the plain page", async () => {
  let fetches = 0;
  const fetchFn = async (url) => (fetches++, { ok: true, json: async () => ({ stories: url.endsWith("feed.json") ? [STORY] : [] }) });
  const preview = makePreview({ readIndex: async () => INDEX, fetchFn, log: { error() {} } });
  assert.match((await serve(preview, { story: "s_abc123" })).body, /og:image/);
  assert.match((await serve(preview, { story: "s_renamed1", clip: "vidRight001" })).body, /vidRight001/);
  assert.equal(fetches, 1, "the feed is fetched once, then cached");
  assert.deepEqual(await serve(preview, {}), { next: true });
  assert.deepEqual(await serve(preview, { story: "<bad>" }), { next: true });
  assert.deepEqual(await serve(preview, { story: "s_unknown1" }), { next: true });
  const broken = makePreview({ readIndex: async () => INDEX, fetchFn: async () => { throw new Error("offline"); }, log: { error() {} } });
  assert.deepEqual(await serve(broken, { story: "s_abc123" }), { next: true });
});

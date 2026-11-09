import assert from "node:assert/strict";
import test from "node:test";

import { captionFor, makeInstagramPoster, pickStory, REFRESH_AFTER_MS } from "./certiorInstagram.js";

const NOW = Date.parse("2026-11-08T17:00:00Z");
const ago = (h) => new Date(NOW - h * 3600e3).toISOString();
const clip = (id, column, channel = id) => ({ id, column, channel, title: `${channel} headline` });
const story = (id, hours, ...clips) => ({ id, headline: `Story ${id}`, first: ago(hours), clips });
const threeSides = (id, hours, extra = 0) => story(id, hours, clip(`${id}L`, "left"), clip(`${id}C`, "center"), clip(`${id}R`, "right"),
  ...Array.from({ length: extra }, (_, i) => clip(`${id}x${i}`, "center")));

test("the day's story: last 24 h, all three sides, not posted this week, most outlets", () => {
  const stories = [
    threeSides("old", 30, 9),                                            // too old
    story("twoSides", 2, clip("a", "left"), clip("b", "center"), clip("c", "center")),
    threeSides("small", 3),
    threeSides("big", 5, 4),
    threeSides("posted", 1, 9),                                          // a clip went out this week
  ];
  assert.equal(pickStory(stories, NOW, new Set(["postedC"])).id, "big");
  assert.equal(pickStory([stories[0], stories[1]], NOW, new Set()), null, "a quiet day posts nothing");
});

test("the caption names each side's outlet and headline, and points to the bio", () => {
  const c = captionFor(threeSides("s", 1));
  assert.match(c, /^Same story, three sides\. 3 outlets covered it:/);
  assert.match(c, /Left \(sL\): sL headline\nCenter \(sC\): sC headline\nRight \(sR\): sR headline/);
  assert.match(c, /link in bio/);
  assert.ok(c.length < 2200, "Instagram's caption limit");
});

function memoryStore(token) {
  const posts = new Map();      // "day:story id" -> { s, mediaId, permalink }
  return {
    posts, saved: token ? { value: token.value, at: token.at } : null,
    async token() { return this.saved; },
    async saveToken(value) { this.saved = { value, at: NOW }; },
    async claim(day, s) { const k = `${day}:${s.id}`; if (posts.has(k)) return false; posts.set(k, { s, mediaId: null }); return true; },
    async posted(day, id, mediaId, permalink) { Object.assign(posts.get(`${day}:${id}`), { mediaId, permalink }); },
    async release(day, id) { if (posts.get(`${day}:${id}`)?.mediaId == null) posts.delete(`${day}:${id}`); },
    async recentClipIds() { return new Set([...posts.values()].filter((p) => p.mediaId).flatMap((p) => p.s.clips.map((c) => c.id))); },
  };
}

// a fake Instagram: records every call; `fail` names a step to fail
function fakeInstagram({ statuses = ["IN_PROGRESS", "FINISHED"], fail } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? Object.fromEntries(init.body) : {};
    calls.push([init.method || "GET", u.hostname.startsWith("graph.") ? u.pathname : "feed", { ...Object.fromEntries(u.searchParams), ...body }, u.hostname]);
    const json = (data, ok = true) => ({ ok, json: async () => data });
    if (!u.hostname.startsWith("graph.")) return json({ stories: [threeSides("big", 2, 3), threeSides("small", 1)] });
    if (fail && u.pathname.endsWith(fail)) return json({ error: { message: "nope" } }, false);
    if (u.pathname === "/refresh_access_token") return json({ access_token: "fresh-token" });
    if (u.pathname === "/me") return json({ user_id: "17841" });
    if (u.pathname === "/17841/media") return json({ id: "container1" });
    if (u.pathname === "/container1") return json({ status_code: statuses.shift() ?? "FINISHED" });
    if (u.pathname === "/17841/media_publish") return json({ id: "media99" });
    if (u.pathname === "/media99") return json({ permalink: "https://www.instagram.com/reel/abc/" });
    throw new Error(`unexpected ${u.pathname}`);
  };
  return { calls, fetchFn };
}

const rendered = [];
const poster = (store, ig, extra = {}) => makeInstagramPoster({
  store, fetchFn: ig.fetchFn, render: async (s) => { rendered.push(s.id); return { mp4: `/tmp/${s.id}.mp4`, cover: `/tmp/${s.id}-cover.jpg` }; },
  envToken: "env-token", publicBase: "https://www.example.com", now: () => NOW, wait: async () => {}, log: { log() {}, error() {} }, ...extra,
});
// what the media route sends: a file path, or a 404
const served = (p, file) => {
  let out = 404;
  p.media({ params: { file } }, { set() { return this; }, sendFile(f) { out = f; }, status() { return this; }, end() {} });
  return out;
};

test("posts a Reel: video and cover served for Instagram, caption, publish, recorded; any number a day, each story once", async () => {
  const store = memoryStore(), ig = fakeInstagram(), p = poster(store, ig);
  const result = await p.run();
  assert.deepEqual(result, { posted: "Story big", mediaId: "media99" });
  const create = ig.calls.find(([, path]) => path === "/17841/media")[2];
  assert.equal(create.media_type, "REELS");
  assert.equal(create.video_url, "https://www.example.com/api/certior/instagram/2026-11-08-big.mp4");
  assert.equal(create.cover_url, "https://www.example.com/api/certior/instagram/2026-11-08-big.jpg");
  assert.match(create.caption, /^Same story, three sides\. 6 outlets/);
  assert.equal(create.access_token, "env-token");
  assert.equal(served(p, "2026-11-08-big.mp4"), "/tmp/big.mp4");
  assert.equal(served(p, "2026-11-08-big.jpg"), "/tmp/big-cover.jpg");
  assert.equal(served(p, "2026-11-07-big.mp4"), 404, "only the post being made");
  assert.equal(store.posts.get("2026-11-08:big").mediaId, "media99");
  assert.equal(store.posts.get("2026-11-08:big").permalink, "https://www.instagram.com/reel/abc/", "kept, so the stats page can link the post");
  assert.deepEqual(await p.run(), { posted: "Story small", mediaId: "media99" }, "a second post the same day: the next story");
  assert.equal(served(p, "2026-11-08-big.mp4"), 404, "each post at its own address");
  assert.match((await p.run("big")).skipped, /shares a clip/, "never the same story twice");
  assert.equal(ig.calls.filter(([, path]) => path === "/17841/media_publish").length, 2);
});

test("a failed post is given back, so the next scheduled try can post", async () => {
  const store = memoryStore(), p = poster(store, fakeInstagram({ fail: "/media_publish" }));
  await assert.rejects(p.run(), /Instagram \/17841\/media_publish: nope/);
  assert.equal(store.posts.size, 0);
  await assert.rejects(poster(store, fakeInstagram({ statuses: ["ERROR"] })).run(), /didn't accept the video/);
  assert.deepEqual(await poster(store, fakeInstagram()).run(), { posted: "Story big", mediaId: "media99" });
});

test("the token: seeded from the env, refreshed when a week old, and nothing happens without one", async () => {
  const fresh = memoryStore({ value: "stored", at: NOW - REFRESH_AFTER_MS + 1000 }), ig1 = fakeInstagram();
  await poster(fresh, ig1).run();
  assert.equal(ig1.calls.some(([, path]) => path === "/refresh_access_token"), false);
  const old = memoryStore({ value: "stored", at: NOW - REFRESH_AFTER_MS - 1000 }), ig2 = fakeInstagram();
  await poster(old, ig2).run();
  assert.equal(old.saved.value, "fresh-token");
  assert.equal(ig2.calls.find(([, path]) => path === "/17841/media")[2].access_token, "fresh-token");
  assert.deepEqual(await poster(memoryStore(), fakeInstagram(), { envToken: "" }).run(), { skipped: "not set up: no IG_ACCESS_TOKEN" });
});

test("a system user's token (EAA...): graph.facebook.com, the account from IG_USER_ID, never stored or refreshed", async () => {
  const store = memoryStore({ value: "bad old token", at: NOW - REFRESH_AFTER_MS - 1000 }), ig = fakeInstagram();
  const sys = { envToken: "EAAsystem", igUserId: "17841" };
  assert.deepEqual(await poster(store, ig, sys).run(), { posted: "Story big", mediaId: "media99" });
  const graph = ig.calls.filter(([, path]) => path !== "feed");
  assert.ok(graph.every(([, , , host]) => host === "graph.facebook.com"));
  assert.ok(graph.every(([, , p]) => p.access_token === "EAAsystem"), "the env token wins over the stored one");
  assert.equal(graph.some(([, path]) => path === "/me" || path === "/refresh_access_token"), false);
  assert.deepEqual(await poster(memoryStore(), fakeInstagram(), { envToken: "EAAsystem" }).run(), { skipped: "not set up: no IG_USER_ID (needed with a system user's token)" });
});

test("posts the story picked on the stats page, but never one that breaks the rules", async () => {
  const p = poster(memoryStore(), fakeInstagram());
  assert.deepEqual(await p.run("small"), { posted: "Story small", mediaId: "media99" });
  const store = memoryStore();
  store.posts.set("2026-11-05:small", { s: threeSides("small", 1), mediaId: "old" });      // its clips went out this week
  assert.match((await poster(store, fakeInstagram()).run("small")).skipped, /shares a clip/);
  assert.match((await poster(memoryStore(), fakeInstagram()).run("gone")).skipped, /isn't in the feed/);
});

test("the button starts the post in the background and the page can follow it", async () => {
  let finish;
  const p = poster(memoryStore(), fakeInstagram(), { wait: () => new Promise((r) => { finish = r; }) });
  const job = p.start("big");
  assert.equal(job.running, true);
  assert.equal(p.start("small"), job, "one post at a time");
  while (!finish) await new Promise((r) => setImmediate(r));
  assert.equal(p.job().step, "Instagram is processing the video");
  finish();
  while (p.job().running) await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.job(), { posted: "Story big", mediaId: "media99" });
  const failing = poster(memoryStore(), fakeInstagram({ fail: "/media" }));
  failing.start();
  while (failing.job().running) await new Promise((r) => setImmediate(r));
  assert.match(failing.job().error, /Instagram \/17841\/media: nope/);
});

test("the stats page is shown the exact caption a Reel goes out with", async () => {
  const p = poster(memoryStore(), fakeInstagram());
  assert.equal(await p.caption("big"), captionFor(threeSides("big", 2, 3)));
  await assert.rejects(p.caption("gone"), /isn't in the feed/);
});

test("a story's Reel is made once: the preview and the post share it", async () => {
  rendered.length = 0;
  const p = poster(memoryStore(), fakeInstagram());
  assert.deepEqual(await p.preview("big"), { mp4: "/tmp/big.mp4", cover: "/tmp/big-cover.jpg" });
  await p.preview("big");
  await p.run("big");
  assert.deepEqual(rendered, ["big"]);
  await assert.rejects(p.preview("gone"), /isn't in the feed/);
});

test("a story whose clips changed gets a new Reel, so the video always matches the caption", async () => {
  rendered.length = 0;
  let stories = [threeSides("big", 2, 3)], t = NOW;
  const ig = fakeInstagram(), p = poster(memoryStore(), ig, {
    now: () => t,
    fetchFn: async (url, init) => (new URL(url).hostname.startsWith("graph.") ? ig.fetchFn(url, init) : { ok: true, json: async () => ({ stories }) }),
  });
  await p.preview("big");
  stories = [{ ...stories[0], clips: [clip("bigL2", "left"), ...stories[0].clips] }];      // a new Left clip comes first
  t += 61e3;      // the feed is kept for a minute
  await p.preview("big");
  await p.preview("big");
  assert.deepEqual(rendered, ["big", "big"], "made again once, for the new clips only");
});

test("a feed that fails to load again keeps the last one, so a Reel being made isn't given up on", async () => {
  let down = false, t = NOW;
  const ig = fakeInstagram(), p = poster(memoryStore(), ig, {
    now: () => t,
    fetchFn: async (url, init) => {
      if (!new URL(url).hostname.startsWith("graph.") && down) throw new TypeError("fetch failed");
      return ig.fetchFn(url, init);
    },
  });
  await p.preview("big");
  down = true; t += 61e3;      // past the minute the feed is kept for, and GitHub doesn't answer
  assert.deepEqual(await p.preview("big"), { mp4: "/tmp/big.mp4", cover: "/tmp/big-cover.jpg" });
  await assert.rejects(poster(memoryStore(), ig, { fetchFn: async () => { throw new TypeError("fetch failed"); } }).preview("big"), /fetch failed/);      // never loaded: says so
});

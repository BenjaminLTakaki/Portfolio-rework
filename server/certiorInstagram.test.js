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
  const days = new Map();
  return {
    days, saved: token ? { value: token.value, at: token.at } : null,
    async token() { return this.saved; },
    async saveToken(value) { this.saved = { value, at: NOW }; },
    async claim(day, s) { if (days.has(day)) return false; days.set(day, { s, mediaId: null }); return true; },
    async posted(day, mediaId) { days.get(day).mediaId = mediaId; },
    async release(day) { if (days.get(day)?.mediaId == null) days.delete(day); },
    async hasDay(day) { return days.has(day); },
    async recentClipIds() { return new Set([...days.values()].flatMap((d) => d.s.clips.map((c) => c.id))); },
  };
}

// a fake Instagram: records every call; `fail` names a step to fail
function fakeInstagram({ statuses = ["IN_PROGRESS", "FINISHED"], fail } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? Object.fromEntries(init.body) : {};
    calls.push([init.method || "GET", u.hostname === "graph.instagram.com" ? u.pathname : "feed", { ...Object.fromEntries(u.searchParams), ...body }]);
    const json = (data, ok = true) => ({ ok, json: async () => data });
    if (u.hostname !== "graph.instagram.com") return json({ stories: [threeSides("big", 2, 3), threeSides("small", 1)] });
    if (fail && u.pathname.endsWith(fail)) return json({ error: { message: "nope" } }, false);
    if (u.pathname === "/refresh_access_token") return json({ access_token: "fresh-token" });
    if (u.pathname === "/me") return json({ user_id: "17841" });
    if (u.pathname === "/17841/media") return json({ id: "container1" });
    if (u.pathname === "/container1") return json({ status_code: statuses.shift() });
    if (u.pathname === "/17841/media_publish") return json({ id: "media99" });
    throw new Error(`unexpected ${u.pathname}`);
  };
  return { calls, fetchFn };
}

const poster = (store, ig, extra = {}) => makeInstagramPoster({
  store, fetchFn: ig.fetchFn, render: async (s) => Buffer.from(`jpeg of ${s.id}`), envToken: "env-token",
  publicBase: "https://www.example.com", now: () => NOW, wait: async () => {}, log: { log() {}, error() {} }, ...extra,
});

test("posts the day's card once: image served for Instagram, caption, publish, recorded", async () => {
  const store = memoryStore(), ig = fakeInstagram(), p = poster(store, ig);
  const result = await p.run();
  assert.deepEqual(result, { posted: "Story big", mediaId: "media99" });
  const create = ig.calls.find(([, path]) => path === "/17841/media")[2];
  assert.equal(create.image_url, "https://www.example.com/api/certior/instagram/2026-11-08.jpg");
  assert.match(create.caption, /^Same story, three sides\. 6 outlets/);
  assert.equal(create.access_token, "env-token");
  let served;
  p.image({ params: { file: "2026-11-08.jpg" } }, { type() { return this; }, set() { return this; }, send(b) { served = String(b); }, status() { return this; }, end() {} });
  assert.equal(served, "jpeg of big");
  assert.equal(store.days.get("2026-11-08").mediaId, "media99");
  assert.deepEqual(await p.run(), { skipped: "already posted today" });
  assert.equal(ig.calls.filter(([, path]) => path === "/17841/media_publish").length, 1, "never twice a day");
});

test("a failed post is given back, so the next scheduled try can post", async () => {
  const store = memoryStore(), p = poster(store, fakeInstagram({ fail: "/media_publish" }));
  await assert.rejects(p.run(), /Instagram \/17841\/media_publish: nope/);
  assert.equal(store.days.has("2026-11-08"), false);
  await assert.rejects(poster(store, fakeInstagram({ statuses: ["ERROR"] })).run(), /didn't accept the image/);
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

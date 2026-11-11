import assert from "node:assert/strict";
import test from "node:test";

import { makeFeedRefresher } from "./certiorFeed.js";

const quiet = { error() {} };

test("does nothing without a token", async () => {
  let calls = 0;
  const refresh = makeFeedRefresher({ token: "", fetchFn: async () => (calls++, { ok: true }), log: quiet });
  assert.equal(await refresh(), false);
  assert.equal(calls, 0);
});

test("starts at most one build per gap, however many visitors arrive", async () => {
  let calls = 0;
  let time = 0;
  const refresh = makeFeedRefresher({ token: "t", fetchFn: async () => (calls++, { ok: true }), now: () => time, log: quiet });
  assert.equal(await refresh(), true);
  assert.equal(await refresh(), false);
  time = 9 * 60 * 1000;
  assert.equal(await refresh(), true);
  assert.equal(calls, 2);
});

test("a GitHub failure is logged and never thrown", async () => {
  const seen = [];
  const log = { error: (m) => seen.push(m) };
  const refresh = makeFeedRefresher({ token: "secret", fetchFn: async () => { throw new Error("offline"); }, log });
  assert.equal(await refresh(), false);
  assert.match(seen[0], /offline/);
  assert.doesNotMatch(seen[0], /secret/);
});

test("old /swipe-news addresses redirect to /certior, query and all", async () => {
  const { movedTo } = await import("./certiorFeed.js");
  const go = (url) => { let to; movedTo("/certior")({ url }, { redirect: (code, where) => { to = [code, where]; } }); return to; };
  assert.deepEqual(go("/"), [301, "/certior/"]);
  assert.deepEqual(go("/?story=s_abc&clip=xyz&ref=instagram"), [301, "/certior/?story=s_abc&clip=xyz&ref=instagram"]);
  assert.deepEqual(go("/privacy.html"), [301, "/certior/privacy.html"]);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import ffmpeg from "ffmpeg-static";

import { renderReel } from "./certiorReel.js";
import { findPlace } from "./certiorReelMap.js";

const clip = (column, channel, title, extra = {}) => ({ id: `${channel}1`, column, channel, title, ...extra });
const STORY = {
  id: "s1", headline: "A story", topic: "politics", first: "2026-11-07T15:47:51Z", clips: [
    clip("left", "CNN", "Man arrested near White House allegedly threatened to kill Trump", { lean: "lean-left", country: "US", published: "2026-11-07T19:51:20Z" }),
    clip("center", "WION", "US: Three Firearms Seized From Stolen Car Near White House", { lean: "center", country: "India", note: "A note." }),
    clip("right", "Fox News", "Armed migrant ARRESTED near White House after CHILLING confession", { lean: "right", country: "US" }),
  ],
};

test("a Reel Instagram takes: 1080x1920 H.264 4:2:0 with AAC sound, 8.8 s, placed on the map, and a JPEG cover", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-test-"));
  try {
    const { mp4, cover, duration, place } = await renderReel(STORY, { out: path.join(dir, "r.mp4"), now: new Date("2026-11-08T17:00:00Z") });
    const info = await new Promise((done) => execFile(ffmpeg, ["-hide_banner", "-i", mp4], (_e, _o, err) => done(err)));
    assert.match(info, /Video: h264 .*yuv420p\(tv, bt709.*1080x1920/);
    assert.match(info, /Audio: aac .*48000 Hz, stereo/);
    const [, s] = info.match(/Duration: 00:00:(\d+\.\d+)/);
    assert.ok(Math.abs(+s - duration) < 0.1 && duration > 8 && duration < 10, `${s} s`);      // fast: the title, three headlines, the app
    assert.equal(place, "Washington, D.C.");      // three outlets say "White House"
    assert.deepEqual([...(await fs.readFile(cover)).subarray(0, 2)], [0xff, 0xd8]);
    await assert.rejects(renderReel({ ...STORY, clips: STORY.clips.slice(1) }, { out: path.join(dir, "x.mp4") }), /all three sides/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the map's pin goes where the story happened, and nowhere when that isn't clear", () => {
  const at = (headline, titles = [], topic = "other") => findPlace({ headline, topic, clips: titles.map((t) => ({ title: t })) })?.label ?? null;
  assert.equal(at("Six killed in Krakow shooting"), "Kraków");      // a city in the story's own headline
  assert.equal(at("Israel: Eisenkot tapped to form new government"), "Israel");      // a country as a dateline
  assert.equal(at("Trump reveals the US launched 'minor' strikes on Iran overnight"), "Iran");      // where, not who
  assert.equal(at("Paraguay swears in new president", ["Santiago Peña is put under house arrest"]), null);      // a name, not Chile's capital
  assert.equal(at("Spain win Padel World Cup in Qatar", [], "sports"), null);      // sport: teams, not places
  assert.equal(at("Is it the end of the road for Tesla's Cybertruck?"), null);
});

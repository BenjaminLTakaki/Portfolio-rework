import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import ffmpeg from "ffmpeg-static";

import { renderReel } from "./certiorReel.js";

const clip = (column, channel, title) => ({ id: `${channel}1`, column, channel, title });
const STORY = {
  id: "s1", headline: "A story", topic: "politics", clips: [
    clip("left", "CNN", "Man arrested near White House allegedly threatened to kill Trump"),
    clip("center", "WION", "US: Three Firearms Seized From Stolen Car Near White House"),
    clip("right", "Fox News", "Armed migrant ARRESTED near White House after CHILLING confession"),
  ],
};

test("a Reel Instagram takes: 1080x1920 H.264 4:2:0 with AAC sound, narrated, about 20 s, and a JPEG cover", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-test-"));
  try {
    // the clips' ids are made up, so no frames: the Reel has to come out without them
    const { mp4, cover, duration, voiced } = await renderReel(STORY, { out: path.join(dir, "r.mp4") });
    const info = await new Promise((done) => execFile(ffmpeg, ["-hide_banner", "-i", mp4], (_e, _o, err) => done(err)));
    assert.match(info, /Video: h264 .*yuv420p\(tv, bt709.*1080x1920/);
    assert.match(info, /Audio: aac .*48000 Hz, stereo/);
    assert.ok(voiced, "the voice failed (the first run fetches Kokoro's ~90 MB model)");
    const [, s] = info.match(/Duration: 00:00:(\d+\.\d+)/);
    assert.ok(Math.abs(+s - duration) < 0.1 && duration > 14 && duration < 32, `${s} s`);
    assert.deepEqual([...(await fs.readFile(cover)).subarray(0, 2)], [0xff, 0xd8]);
    await assert.rejects(renderReel({ ...STORY, clips: STORY.clips.slice(1) }, { out: path.join(dir, "x.mp4") }), /all three sides/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

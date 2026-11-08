// The day's story as a Reel: 1080x1920, about 12 s, made to hold people past the first seconds (the first one, a
// still card brought in a panel at a time, lost half its viewers in 3 s).
//   0 s     a hook, big and centred: "Same story. / 3 headlines.", over a progress bar in the three sides' colours
//   0.65 s  the hook moves up out of the way and Left, Center and Right slide in, their headlines blurred (you can see
//           who's coming, "RIGHT · Fox News", not what they said); each is revealed in turn for as long as it takes
//           to read, while its part of the bar fills and the ones already read dim
//   then    all three together to compare, a question for the comments, and the end card.
// Headlines word for word with their outlets, as on the card; no logos, no thumbnails, no footage. Drawn on the same
// Skia canvas and Inter as the card, encoded by ffmpeg (ffmpeg-static: Render has none), sound from certiorReelAudio.js.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import ffmpeg from "ffmpeg-static";

import { soundtrack } from "./certiorReelAudio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(path.join(here, "fonts", "InterVariable.ttf"), "Inter");
const ICON = path.join(here, "..", "public", "certior", "icons", "icon-192.png");
const END_CARD = path.join(here, "certior-endcard.mp4");      // the tutorials' end card: the logo, "Link in bio"

const W = 1080, H = 1920, FPS = 30, X = 80, CW = W - 2 * X;
const C = { bg: "#0b0c0f", ink: "#f6f7f9", muted: "#a9aeb7", panel: "rgba(23,25,30,.92)" };
const SIDES = [["left", "LEFT", "#4a90ff"], ["center", "CENTER", "#b9bdc6"], ["right", "RIGHT", "#ef5a52"]];
const HOOK = ["Same story.", "3 headlines."], ASK = ["Which headline", "would you click?"];
const BIG = 124, BIG_LH = 130, S1 = 0.6;      // the hook's size, and its scale once it has moved up
const Y0 = 700, Y1 = 330;                      // the hook's top: centred, then under the header
const PANELS_TOP = Y1 + 2 * BIG_LH * S1 + 22 + 12 + 32, PANELS_END = 1490;      // above Instagram's caption
const PAD = 34, PILL = 42, GAP = 20;
const SIZES = [[58, 68], [55, 65], [52, 62], [48, 58], [44, 53], [40, 48]];      // the headlines' [size, line height]: smaller, never cut
const MOVE = 0.65, MOVE_D = 0.35, FIRST = 0.85, END_LEN = 1.9;      // the end card is complete by 1.1 s
const readTime = (text) => Math.min(2.6, Math.max(1.7, 0.5 + 0.15 * text.split(/\s+/).length));

const ease = (p) => 1 - (1 - Math.min(Math.max(p, 0), 1)) ** 3;
const inOut = (p) => { p = Math.min(Math.max(p, 0), 1); return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; };
const prog = (t, t0, d) => ease((t - t0) / d);
const lerp = (a, b, k) => a + (b - a) * k;

/** Writes the Reel (mp4) and its cover (jpg) for a story Left, Center and Right all covered. Returns their paths. */
export async function renderReel(story, { now = new Date(), out = path.join(os.tmpdir(), `certior-reel-${story.id}-${Date.now()}.mp4`) } = {}) {
  // the first clip from each side, as on the card (sport: the first three outlets)
  const blocks = story.topic === "sports"
    ? story.clips.slice(0, 3).map((k) => ({ label: k.channel.toUpperCase(), color: C.muted, outlet: "", title: k.title }))
    : SIDES.map(([col, label, color]) => {
      const k = story.clips.find((c) => c.column === col);
      if (!k) throw new Error(`no ${col} clip: a Reel needs all three sides`);
      return { label, color, outlet: k.channel, title: k.title };
    });
  const E = [FIRST + 0.15];      // when each side's headline is revealed
  for (const b of blocks.slice(0, 2)) E.push(E.at(-1) + readTime(b.title));
  const CMP = E[2] + readTime(blocks[2].title), ASK_AT = CMP + 0.6, END = CMP + 2.4, DUR = END + 0.3 + END_LEN;

  // --- layout: the largest headline size at which all three fit
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  const font = (weight, size) => { ctx.font = `${weight} ${size}px Inter`; };
  const wrap = (text, width) => {
    const lines = [];
    for (const w of text.split(/\s+/)) {
      const t = lines.length ? `${lines.at(-1)} ${w}` : w;
      if (lines.length && ctx.measureText(t).width <= width) lines[lines.length - 1] = t; else lines.push(w);
    }
    return lines;
  };
  const panelH = (n, lh) => PAD + PILL + 18 + n * lh + PAD - 8;
  let size, lh, quotes;
  for ([size, lh] of SIZES) {
    font(600, size);
    quotes = blocks.map((b) => wrap(`“${b.title}”`, CW - 2 * PAD));
    if (quotes.reduce((a, q) => a + panelH(q.length, lh), 0) + 2 * GAP <= PANELS_END - PANELS_TOP) break;
  }
  const heights = quotes.map((q) => panelH(q.length, lh));
  const tops = heights.map((_, i) => PANELS_TOP + heights.slice(0, i).reduce((a, h) => a + h + GAP, 0));
  // each headline blurred once (blurring every frame is slow); its reveal cross-fades from that to the sharp text
  const blurred = quotes.map((q, i) => {
    const c = createCanvas(CW, heights[i]), x = c.getContext("2d");
    x.font = `600 ${size}px Inter`; x.fillStyle = C.ink; x.textBaseline = "top"; x.filter = "blur(16px)";
    q.forEach((l, j) => x.fillText(l, PAD, PAD + PILL + 18 + j * lh));
    return c;
  });

  // the still parts, drawn once: the card's background (Left's blue and Right's red glowing in from opposite corners), the header
  const bg = createCanvas(W, H), b = bg.getContext("2d");
  b.fillStyle = C.bg; b.fillRect(0, 0, W, H);
  for (const [x, y, color] of [[0, 120, "rgba(74,144,255,.24)"], [W, H - 160, "rgba(239,90,82,.2)"]]) {
    const g = b.createRadialGradient(x, y, 0, x, y, 950);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = g; b.fillRect(0, 0, W, H);
  }
  const icon = await loadImage(ICON);
  b.save(); b.beginPath(); b.roundRect(X, 236, 52, 52, 13); b.clip(); b.drawImage(icon, X, 236, 52, 52); b.restore();
  b.textBaseline = "middle";
  b.font = "700 30px Inter"; b.fillStyle = C.ink; b.fillText("Certior", X + 68, 263);
  const topic = story.topic && story.topic !== "other" ? ` · ${story.topic[0].toUpperCase()}${story.topic.slice(1)}` : "";
  b.font = "500 26px Inter"; b.fillStyle = C.muted; b.textAlign = "right";
  b.fillText(now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) + topic, X + CW, 263);

  function draw(t) {
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    const m = inOut((t - MOVE) / MOVE_D), s = lerp(1, S1, m), y = lerp(Y0, Y1, m);

    // the hook, later the question: drawn at full size and scaled, so it stays sharp as it moves
    const swap = prog(t, ASK_AT, 0.3), pop = prog(t, 0.15, 0.25);
    ctx.save(); ctx.translate(X, y); ctx.scale(s, s);
    font(800, BIG); ctx.textBaseline = "top"; ctx.fillStyle = C.ink;
    ctx.globalAlpha = 1 - swap; ctx.fillText(HOOK[0], 0, 0);
    ctx.globalAlpha = (1 - swap) * pop; ctx.fillText(HOOK[1], 0, BIG_LH + 24 * (1 - pop));
    if (swap > 0) { ctx.globalAlpha = swap; ASK.forEach((l, i) => ctx.fillText(l, 0, i * BIG_LH + 30 * (1 - swap))); }
    ctx.restore();

    // the bar: a part per side, filling while that side is on
    const by = y + 2 * BIG_LH * s + lerp(44, 22, m), bh = lerp(18, 12, m), segW = (CW - 20) / 3;
    blocks.forEach((bk, i) => {
      const x = X + i * (segW + 10), fill = Math.min(Math.max((t - E[i]) / ((E[i + 1] ?? CMP) - E[i]), 0), 1);
      ctx.fillStyle = bk.color;
      ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.roundRect(x, by, segW, bh, bh / 2); ctx.fill();
      if (fill > 0) { ctx.globalAlpha = 1; ctx.beginPath(); ctx.roundRect(x, by, Math.max(bh, segW * fill), bh, bh / 2); ctx.fill(); }
    });

    // the sides: all three slide in with their headlines blurred; each is revealed in turn with a ring in its colour,
    // dims once the next one is on, and all three come back to full strength to compare
    blocks.forEach((bk, i) => {
      const next = E[i + 1] ?? CMP, h = heights[i], enter = prog(t, FIRST + i * 0.08, 0.4);
      if (enter <= 0) return;
      const a = enter * (1 - (i < 2) * 0.5 * (prog(t, next, 0.3) - prog(t, CMP, 0.35))), shown = prog(t, E[i], 0.35);
      ctx.save(); ctx.translate(0, tops[i] + 70 * (1 - enter)); ctx.globalAlpha = a;
      ctx.fillStyle = C.panel; ctx.beginPath(); ctx.roundRect(X, 0, CW, h, 30); ctx.fill();
      const ring = shown * (1 - prog(t, next, 0.3));
      if (ring > 0) {
        ctx.globalAlpha = a * ring * 0.85; ctx.strokeStyle = bk.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(X + 1.5, 1.5, CW - 3, h - 3, 28.5); ctx.stroke(); ctx.globalAlpha = a;
      }
      font(800, 24); ctx.textBaseline = "middle";
      const pw = ctx.measureText(bk.label).width + 36;
      ctx.fillStyle = bk.color; ctx.beginPath(); ctx.roundRect(X + PAD, PAD, pw, PILL, PILL / 2); ctx.fill();
      ctx.fillStyle = C.bg; ctx.fillText(bk.label, X + PAD + 18, PAD + PILL / 2 + 1);
      if (bk.outlet) { font(600, 30); ctx.fillStyle = C.muted; ctx.fillText(bk.outlet, X + PAD + pw + 16, PAD + PILL / 2 + 1); }
      if (shown < 1) { ctx.globalAlpha = a * 0.55 * (1 - shown); ctx.drawImage(blurred[i], X, 0); }
      if (shown > 0) {
        font(600, size); ctx.fillStyle = C.ink; ctx.textBaseline = "top"; ctx.globalAlpha = a * shown;
        quotes[i].forEach((l, j) => ctx.fillText(l, X + PAD, PAD + PILL + 18 + j * lh));
      }
      ctx.restore();
    });
  }

  // --- the cover (all three sides, under the hook), the sound, then every frame through ffmpeg
  const cover = out.replace(/\.mp4$/i, "") + "-cover.jpg";
  draw(CMP + 0.45);
  await fs.writeFile(cover, await canvas.encode("jpeg", 92));
  const wav = out.replace(/\.mp4$/i, "") + ".wav";
  await fs.writeFile(wav, soundtrack([{ t: MOVE, type: "swipe" }, ...E.map((t, i) => ({ t, type: "arc", i })), { t: ASK_AT, type: "tap" },
    { t: END + 0.2, type: "end" }, ...[0, 1, 2].map((i) => ({ t: END + 0.35 + i * 0.15, type: "arc", i }))], DUR, END));      // in time with the end card's arcs

  // ffmpeg fades the last frame into the end card (held on its first frame for the fade, then played); standard HD colour
  const norm = `fps=${FPS},settb=AVTB,setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`;
  const enc = spawn(ffmpeg, ["-v", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-i", END_CARD, "-i", wav,
    "-filter_complex", `[0:v]${norm}[a];[1:v]tpad=start_duration=0.3:start_mode=clone,trim=duration=${(0.3 + END_LEN).toFixed(2)},setpts=PTS-STARTPTS,${norm}[b];` +
      `[a][b]xfade=transition=fade:duration=0.3:offset=${END.toFixed(3)},format=yuv420p[v]`,
    "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-preset", "veryfast", "-tune", "animation", "-crf", "18", "-threads", "2",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", DUR.toFixed(3), "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
  let errors = "";
  enc.stderr.on("data", (d) => { errors += d; });
  enc.stdin.on("error", () => {});      // a broken pipe: reported by the write below and ffmpeg's exit
  const done = new Promise((ok, fail) => {
    enc.on("error", fail);
    enc.on("close", (code) => (code ? fail(new Error(`ffmpeg exited with ${code}: ${errors.trim().slice(-300)}`)) : ok()));
  });
  const write = (buf) => new Promise((ok, fail) => enc.stdin.write(buf, (e) => (e ? fail(e) : ok())));
  try {
    for (let n = 0, frames = Math.ceil((END + 0.3) * FPS) + 1; n < frames; n++) {
      draw(Math.min(n / FPS, END));
      await write(canvas.data());
    }
    enc.stdin.end();
  } catch (err) {
    enc.kill();      // ffmpeg stopped reading: its own error says why
  }
  try { await done; } finally { await fs.rm(wav, { force: true }); }
  return { mp4: out, cover, duration: DUR };
}

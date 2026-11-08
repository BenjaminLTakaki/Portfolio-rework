// The day's story as a Reel: 1080x1920, about 20 s, narrated, with each outlet's own clip in it. The first Reel, a
// still card brought in a panel at a time, lost half its viewers in 3 s; the second was text alone over a synthesised
// tune that sounded like a ringtone.
//   hook     the three clips side by side, Left on the left, under "Same story. / 3 sides.", said aloud
//   sides    a swipe sideways to each, as in the app: its clip filling the screen (a widescreen one whole, under the
//            header), slowly zooming through three frames of it, its outlet, and its headline lit word by word as the
//            voice reads it
//   compare  the three headlines together, and "Which one would you click?"
//   end      the logo's arcs drawn in, "Link in bio", as in the tutorials
// Headlines word for word with their outlets, as on the card. The clips are the three frames YouTube takes from every
// video (i.ytimg.com: no key, no quota), blurred as the tutorials blur a playing clip, never sharp. The voice is Kokoro,
// run here for free (certiorReelAudio.js). Without either (a network error, a crash) the Reel still renders: dark
// boxes, or a reader's timing.
// Made to fit a small server: one ffmpeg with one thread and a frame or two in flight, the voice in its own process.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import ffmpeg from "ffmpeg-static";

import { soundtrack, speak, VOICE_RATE } from "./certiorReelAudio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(path.join(here, "fonts", "InterVariable.ttf"), "Inter");
const ICON = path.join(here, "..", "public", "certior", "icons", "icon-192.png");

const W = 1080, H = 1920, FPS = 30, X = 80, CW = W - 2 * X;
const C = { bg: "#0b0c0f", ink: "#f6f7f9", muted: "#a9aeb7", tint: "#4a90ff", panel: "rgba(23,25,30,.86)" };
const SIDES = [["left", "LEFT", "#4a90ff", "on the left"], ["center", "CENTER", "#b9bdc6", "in the center"], ["right", "RIGHT", "#ef5a52", "on the right"]];
const TOP = 330, BOTTOM = 1490;      // under the header, above Instagram's caption
const COL = (W - 12) / 3, HEAD = 860;      // the hook's three clips, side by side; a side's headline, from here down to BOTTOM
const PAD = 34, PILL = 46, GAP = 20, SWIPE = 0.4, END_LEN = 1.9;
const SIZES = [[76, 84], [70, 78], [64, 72], [58, 66], [52, 60], [48, 56], [44, 52], [40, 48], [36, 44], [32, 40]];      // headline [size, line height]: smaller, never cut
// the logo (certior-mark.svg): three arcs of one circle, Left's blue on top, Center's grey left, Right's red below
const MARK = [[-42.3, -126.3, "#4a90ff"], [-135.6, -224.4, "#b9bdc6"], [126.3, 42.3, "#ef5a52"]].map(([a, b, c]) => [a * Math.PI / 180, b * Math.PI / 180, c]);
const readTime = (text) => Math.min(3.6, Math.max(1.8, 0.6 + 0.24 * text.split(/\s+/).length));      // without a voice
const spoken = (s) => s.replace(/\s*\|\s*/g, ". ").replace(/[\p{Extended_Pictographic}\p{Variation_Selector}]/gu, "").trim();      // what the voice reads

const clamp = (p) => Math.min(Math.max(p, 0), 1);
const ease = (p) => 1 - (1 - clamp(p)) ** 3;
const inOut = (p) => { p = clamp(p); return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; };
const prog = (t, t0, d) => ease((t - t0) / d);
const lerp = (a, b, k) => a + (b - a) * k;

/** The three frames YouTube takes from a clip (a quarter, half and three quarters in), cut to the picture inside its
 *  black bars and blurred once. */
async function framesOf(id) {
  const got = await Promise.all(["hq1", "hq2", "hq3"].map(async (f) => {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${f}.jpg`, { signal: AbortSignal.timeout(8000) });
      return r.ok ? await loadImage(Buffer.from(await r.arrayBuffer())) : null;
    } catch { return null; }
  }));
  // the frames are 480x360 with black bars: left and right of an upright clip, above and below a 16:9 one. The
  // picture is the widest box inside them across the three (a dark scene would pass for bars in one of them)
  const imgs = got.filter(Boolean);
  let [x0, x1, y0, y1] = [480, 0, 360, 0];
  for (const img of imgs) {
    const t = createCanvas(480, 360).getContext("2d");
    t.drawImage(img, 0, 0, 480, 360);
    const d = t.getImageData(0, 0, 480, 360).data, lum = (x, y) => (d[(y * 480 + x) * 4] + d[(y * 480 + x) * 4 + 1] + d[(y * 480 + x) * 4 + 2]) / 3;
    const col = (x) => { let s = 0; for (let y = 0; y < 360; y += 4) s += lum(x, y); return s / 90; };
    const row = (y) => { let s = 0; for (let x = 0; x < 480; x += 4) s += lum(x, y); return s / 120; };
    let a = 0, b = 479, c = 0, e = 359;
    while (a < 160 && col(a) < 20) a++;
    while (b > 320 && col(b) < 20) b--;
    while (c < 120 && row(c) < 20) c++;
    while (e > 240 && row(e) < 20) e--;
    [x0, x1, y0, y1] = [Math.min(x0, a), Math.max(x1, b), Math.min(y0, c), Math.max(y1, e)];
  }
  const sx = x0 + 2, sy = y0 + 2, sw = x1 - x0 - 3, sh = y1 - y0 - 3;      // and a pixel or two of the bars' soft edge
  return imgs.map((img) => {
    const c = createCanvas(sw, sh), x = c.getContext("2d");
    x.filter = "blur(8.5px) brightness(.9) saturate(1.2)";      // as the tutorials blur a clip: 7 px across a 393 px phone
    x.drawImage(img, sx, sy, sw, sh, -0.06 * sw, -0.06 * sh, 1.12 * sw, 1.12 * sh);      // 12% larger, as in the tutorials, so the blur has no rim
    return c;
  });
}

/** Writes the Reel (mp4) and its cover (jpg) for a story Left, Center and Right all covered. Returns their paths. */
export async function renderReel(story, { now = new Date(), out = path.join(os.tmpdir(), `certior-reel-${story.id}-${Date.now()}.mp4`) } = {}) {
  // the first clip from each side, as on the card (sport: the first three outlets)
  const sports = story.topic === "sports";
  const blocks = (sports ? story.clips.slice(0, 3).map((k) => [k, k.channel.toUpperCase(), C.muted, `${k.channel}.`])
    : SIDES.map(([col, label, color, where]) => {
      const k = story.clips.find((c) => c.column === col);
      if (!k) throw new Error(`no ${col} clip: a Reel needs all three sides`);
      return [k, label, color, `${k.channel}, ${where}.`];
    })).map(([k, label, color, intro]) => ({ label, color, intro, title: k.title, id: k.id, outlet: sports ? k.country || "" : k.channel,
    source: (sports ? [k.country] : [k.channel, k.country]).filter(Boolean).join(" · ") }));
  const HOOK = ["Same story.", sports ? "3 outlets." : "3 sides."], ASK = ["Which one", "would you click?"];

  // the voice and the frames, side by side; each line of the voice without the silence around it
  const script = [HOOK.join(" "), ...blocks.flatMap((b) => [b.intro, spoken(b.title)]), ASK.join(" ")];
  const [voice, frames] = await Promise.all([
    speak(script).then((v) => v.map((a) => {
      let i = 0, j = a.length;
      while (i < j && Math.abs(a[i]) < 0.02) i++;
      while (j > i && Math.abs(a[j - 1]) < 0.02) j--;
      return a.subarray(Math.max(0, i - 600), Math.min(a.length, j + 1200));
    }), (err) => { console.warn(`Certior Reel without a voice: ${err.message}`); return null; }),
    Promise.all(blocks.map((b) => framesOf(b.id))),
  ]);

  // --- the timeline: scene k (hook, the three sides, compare) is on screen alone from A[k], and swipes off at B[k]
  const L = voice ? voice.map((a) => a.length / VOICE_RATE) : [1, ...blocks.flatMap((b) => [0.9, readTime(b.title)]), 1.3];
  const say = [[0.15, 0]], A = [0], B = [Math.max(1.9, 0.15 + L[0] + 0.35)];
  blocks.forEach((b, i) => {
    A.push(B.at(-1) + SWIPE);
    const intro = A.at(-1) - 0.1, head = intro + L[1 + 2 * i] + 0.12;
    say.push([intro, 1 + 2 * i], [head, 2 + 2 * i]);
    b.h = [head - A.at(-1), head - A.at(-1) + L[2 + 2 * i]];      // the headline is read over this, in the scene's time
    B.push(head + L[2 + 2 * i] + 0.5);
  });
  A.push(B.at(-1) + SWIPE); say.push([A.at(-1) + 0.1, L.length - 1]);
  const END = Math.max(A.at(-1) + 2.6, A.at(-1) + 0.1 + L.at(-1) + 1.1), DUR = END + 0.3 + END_LEN;
  B.push(END);

  // --- layout: each headline in words at the largest size that fits, lit in turn as it is read
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
  for (const b of blocks) {
    for ([b.size, b.lh] of SIZES) { font(700, b.size); b.lines = wrap(`“${b.title}”`, CW - 60); if (b.lines.length * b.lh <= BOTTOM - HEAD) break; }      // clear of Instagram's buttons
    const top = BOTTOM - b.lines.length * b.lh;      // the headline sits on BOTTOM
    const words = b.lines.flatMap((l, n) => { let x = 0; return l.split(" ").map((w) => { const at = { w, x, y: top + n * b.lh }; x += ctx.measureText(`${w} `).width; return at; }); });
    const weight = (w) => w.w.length + (/[,.;:!?]”?$/.test(w.w) ? 4 : 1), total = words.reduce((a, w) => a + weight(w), 0);
    let sum = 0;
    for (const w of words) { w.at = lerp(b.h[0], b.h[1], sum / total) - 0.05; sum += weight(w); }
    b.words = words;
  }
  // compare: the three panels, at the largest size at which all three fit under the question
  const PANELS = TOP + 2 * 100 + 70, panelH = (n, lh) => PAD + PILL + 16 + n * lh + PAD - 8;
  let size, lh, quotes;
  for ([size, lh] of SIZES.filter(([s]) => s <= 48)) {
    font(600, size);
    quotes = blocks.map((b) => wrap(`“${b.title}”`, CW - 2 * PAD));
    if (quotes.reduce((a, q) => a + panelH(q.length, lh), 0) + 2 * GAP <= BOTTOM - PANELS) break;
  }
  const heights = quotes.map((q) => panelH(q.length, lh));
  const tops = heights.map((_, i) => PANELS + heights.slice(0, i).reduce((a, h) => a + h + GAP, 0));

  // the still parts, drawn once: the card's background (Left's blue and Right's red glowing in from opposite corners),
  // and the header above every scene
  const plain = createCanvas(W, H), p = plain.getContext("2d");
  p.fillStyle = C.bg; p.fillRect(0, 0, W, H);
  for (const [x, y, color] of [[0, 120, "rgba(74,144,255,.24)"], [W, H - 160, "rgba(239,90,82,.2)"]]) {
    const g = p.createRadialGradient(x, y, 0, x, y, 950);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    p.fillStyle = g; p.fillRect(0, 0, W, H);
  }
  const header = createCanvas(W, TOP), hd = header.getContext("2d");
  const icon = await loadImage(ICON);
  hd.save(); hd.beginPath(); hd.roundRect(X, 236, 52, 52, 13); hd.clip(); hd.drawImage(icon, X, 236, 52, 52); hd.restore();
  hd.textBaseline = "middle"; hd.shadowColor = "rgba(0,0,0,.5)"; hd.shadowBlur = 12;
  hd.font = "700 30px Inter"; hd.fillStyle = C.ink; hd.fillText("Certior", X + 68, 263);
  const topic = story.topic && story.topic !== "other" ? ` · ${story.topic[0].toUpperCase()}${story.topic.slice(1)}` : "";
  hd.font = "500 26px Inter"; hd.fillStyle = C.ink; hd.textAlign = "right";
  hd.fillText(now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) + topic, X + CW, 263);

  // a clip over d s in a box: its frames in turn, each fading in over the last, slowly zooming. It covers the box; with
  // `top`, a widescreen clip is shown whole instead, no lower than `top`, over a dim copy of itself (stretched to cover
  // a tall box it would be a blur of colour; upright ones fill it as they are)
  function clip(f, u, d, x, y, w, h, r = 0, top = null) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = "#15171c"; ctx.fill(); ctx.clip();
    const base = ctx.globalAlpha, z = 1.03 + 0.09 * clamp(u / d), per = d / Math.max(f.length, 1);
    const put = (img, s, oy) => { const iw = img.width * s, ih = img.height * s; ctx.drawImage(img, x + (w - iw) / 2, y + (oy ?? (h - ih) / 2), iw, ih); };
    f.forEach((img, k) => {
      const a = k ? clamp((u - k * per + 0.25) / 0.5) : 1, cover = Math.max(w / img.width, h / img.height) * z;
      if (a <= 0) return;
      ctx.globalAlpha = base * a;
      if (top == null || img.width < 1.4 * img.height) return put(img, cover);
      const whole = Math.min(w / img.width, h / img.height) * z;
      ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = base * a * 0.45; put(img, cover);
      ctx.globalAlpha = base * a; put(img, whole, Math.min(top, (h - img.height * whole) / 2));
    });
    ctx.restore();
  }
  // a side's pill, then where it comes from
  function pill(b, x, y) {
    font(800, 24); ctx.textBaseline = "middle";
    const pw = ctx.measureText(b.label).width + 36;
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(x, y, pw, PILL, PILL / 2); ctx.fill();
    ctx.fillStyle = C.bg; ctx.fillText(b.label, x + 18, y + PILL / 2 + 1);
    font(600, 30); ctx.fillStyle = C.ink; ctx.fillText(b.source, x + pw + 16, y + PILL / 2 + 1);
  }
  // the background's colour over the whole frame, as alpha stops [y, alpha] down it
  const shade = (...stops) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [y, a] of stops) g.addColorStop(y / H, `rgba(11,12,15,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };

  // the hook: the three clips side by side, Left on the left, rising in turn, under "Same story. / 3 sides."
  function hook(u) {
    ctx.drawImage(plain, 0, 0);
    const rise = blocks.map((_, i) => prog(u, i * 0.08, 0.5));
    blocks.forEach((b, i) => { ctx.globalAlpha = rise[i]; clip(frames[i], u, 3 * B[0], i * (COL + 6), 260 * (1 - rise[i]), COL, H); });
    ctx.globalAlpha = 1; shade([0, 0.6], [600, 0.3], [1100, 0.3], [1600, 0.85], [H, 0.9]);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    blocks.forEach((b, i) => {      // under the words, each its pill and outlet, above Instagram's buttons
      const cx = i * (COL + 6) + COL / 2, y = 1090 + 260 * (1 - rise[i]);
      ctx.globalAlpha = rise[i]; font(800, 24);
      const pw = ctx.measureText(b.label).width + 36;
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(cx - pw / 2, y, pw, PILL, PILL / 2); ctx.fill();
      ctx.fillStyle = C.bg; ctx.fillText(b.label, cx, y + PILL / 2 + 1);
      font(600, 30); if (ctx.measureText(b.outlet).width > COL - 24) font(600, 24);
      ctx.fillStyle = C.ink; ctx.fillText(b.outlet, cx, y + PILL + 34);
    });
    font(800, 116); ctx.textBaseline = "top"; ctx.fillStyle = C.ink;
    ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 4;
    HOOK.forEach((l, j) => { const a = prog(u, 0.1 + j * 0.25, 0.3); ctx.globalAlpha = a; ctx.fillText(l, W / 2, 740 + j * 124 + 30 * (1 - a)); });
    ctx.shadowColor = "transparent"; ctx.textAlign = "left";
  }
  // a side: its clip filling the screen, its pill, and its headline lit word by word as it is read
  function side(i, u) {
    const b = blocks[i], d = B[i + 1] - A[i + 1];
    ctx.drawImage(plain, 0, 0);
    if (frames[i].length) clip(frames[i], u, d, 0, 0, W, H, 0, 470);
    shade([0, 0.6], [520, 0.15], [HEAD - 160, 0.25], [BOTTOM, 0.88], [H, 0.92]);
    pill(b, X, 372);
    font(700, b.size); ctx.textBaseline = "top"; ctx.fillStyle = C.ink; ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 18;
    for (const w of b.words) { ctx.globalAlpha = lerp(0.35, 1, prog(u, w.at, 0.12)); ctx.fillText(w.w, X + w.x, w.y); }
    ctx.shadowColor = "transparent";
  }
  // compare: the question, and the three headlines over their clips
  function compare(u) {
    ctx.drawImage(plain, 0, 0);
    font(800, 92); ctx.textBaseline = "top"; ctx.fillStyle = C.ink;
    ASK.forEach((l, j) => { const a = prog(u, -0.3 + j * 0.12, 0.35); ctx.globalAlpha = a; ctx.fillText(l, X, TOP + 30 + j * 100 + 24 * (1 - a)); });      // in place as the swipe lands
    blocks.forEach((b, i) => {
      const a = prog(u, -0.1 + i * 0.1, 0.4), y = tops[i] + 50 * (1 - a), h = heights[i];
      ctx.globalAlpha = a * 0.6; clip(frames[i], u, 9, X, y, CW, h, 30);
      ctx.globalAlpha = a; ctx.fillStyle = C.panel; ctx.beginPath(); ctx.roundRect(X, y, CW, h, 30); ctx.fill();
      pill(b, X + PAD, y + PAD);
      font(600, size); ctx.textBaseline = "top"; ctx.fillStyle = C.ink;
      quotes[i].forEach((l, j) => ctx.fillText(l, X + PAD, y + PAD + PILL + 16 + j * lh));
    });
  }
  const scenes = [hook, (u) => side(0, u), (u) => side(1, u), (u) => side(2, u), compare];

  function draw(t) {
    ctx.globalAlpha = 1;
    const at = B.findIndex((b) => t < b), k = at < 0 ? B.length - 1 : at;
    const scene = (n, dx) => { ctx.save(); ctx.translate(dx, 0); scenes[n](t - A[n]); ctx.restore(); };
    if (k > 0 && t < A[k]) { const p = inOut((t - B[k - 1]) / SWIPE); scene(k - 1, -p * W); scene(k, (1 - p) * W); }      // a swipe, as in the app
    else scene(k, 0);
    // on top: the bar, a part per side filling while that side is on, and the header
    const bar = prog(t, B[0], SWIPE), segW = (CW - 20) / 3;
    blocks.forEach((b, i) => {
      if (bar <= 0) return;
      const x = X + i * (segW + 10), fill = clamp((t - A[i + 1]) / (B[i + 1] - A[i + 1]));
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.28 * bar; ctx.beginPath(); ctx.roundRect(x, TOP, segW, 12, 6); ctx.fill();
      if (fill > 0) { ctx.globalAlpha = bar; ctx.beginPath(); ctx.roundRect(x, TOP, Math.max(12, segW * fill), 12, 6); ctx.fill(); }
    });
    ctx.globalAlpha = 1; ctx.drawImage(header, 0, 0);
  }

  // the end card at u s: the logo's arcs drawn in, then the name, "Link in bio" and the small print
  function drawEnd(u) {
    ctx.globalAlpha = 1;
    ctx.drawImage(plain, 0, 0);
    ctx.lineWidth = 52;
    MARK.forEach(([a, b, color], i) => {
      const k = prog(u, 0.05 + i * 0.15, 0.3);
      if (k <= 0) return;
      ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(W / 2, 740, 114, a, a + (b - a) * k, true); ctx.stroke();
    });
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const name = prog(u, 0.45, 0.3), link = prog(u, 0.75, 0.25), small = prog(u, 0.95, 0.25);
    ctx.globalAlpha = name; ctx.fillStyle = C.ink; font(700, 104); ctx.fillText("certior", W / 2, 985 + 20 * (1 - name));
    ctx.globalAlpha = link; font(700, 40);
    const lw = ctx.measureText("Link in bio").width + 88;
    ctx.fillStyle = C.tint; ctx.beginPath(); ctx.roundRect((W - lw) / 2, 1100, lw, 92, 46); ctx.fill();
    ctx.fillStyle = C.ink; ctx.fillText("Link in bio", W / 2, 1147);
    ctx.globalAlpha = small; ctx.fillStyle = C.muted; font(500, 32); ctx.fillText("Free. No account. No ads.", W / 2, 1250);
    ctx.textAlign = "left";
  }

  // --- the cover (the hook, all in), the sound, then every frame through ffmpeg
  const cover = out.replace(/\.mp4$/i, "") + "-cover.jpg";
  draw(1.3);
  await fs.writeFile(cover, await canvas.encode("jpeg", 92));
  let peak = process.memoryUsage().rss;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 250);
  const wav = out.replace(/\.mp4$/i, "") + ".wav";
  await fs.writeFile(wav, soundtrack([{ t: 0, type: "swipe" }, ...B.slice(0, -1).map((t) => ({ t, type: "swipe" })),
    ...(voice ? say.map(([t, k]) => ({ t, type: "voice", pcm: voice[k], sr: VOICE_RATE })) : []), { t: END + 0.2, type: "end" }], DUR, END));

  // One thread, a short queue, and no look-ahead or B-frames: ffmpeg otherwise holds dozens of frames, and starts a
  // thread with its own per CPU it sees (a small server reports its host's many). About 80 MB, against ~600 MB for the
  // first version; the file comes out bigger, which doesn't matter, Instagram re-encodes it.
  let errors = "";
  const enc = spawn(ffmpeg, ["-v", "error", "-y", "-filter_threads", "1",
    "-thread_queue_size", "2", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", "-i", wav,
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",      // standard HD colour
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-preset", "veryfast", "-crf", "18", "-threads", "1", "-x264-params", "rc-lookahead=0:bframes=0:ref=1:sync-lookahead=0",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",      // as loud as Reels usually are, so the voice carries on a phone
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
  enc.stderr.on("data", (d) => { errors += d; });
  enc.stdin.on("error", () => {});      // a broken pipe: reported by the write below and ffmpeg's exit
  const done = new Promise((ok, fail) => {
    enc.on("error", fail);
    enc.on("close", (code) => (code ? fail(new Error(`ffmpeg exited with ${code}: ${errors.trim().slice(-300)}`)) : ok()));
  });
  const write = (buf) => new Promise((ok, fail) => enc.stdin.write(buf, (e) => (e ? fail(e) : ok())));

  try {
    for (let n = 0, frames = Math.round(DUR * FPS); n < frames; n++) {
      const t = n / FPS, fade = (t - END) / 0.3;
      if (t < END) draw(t);
      else if (fade < 1) { draw(END); ctx.globalAlpha = ease(fade); ctx.drawImage(plain, 0, 0); }      // fades to the end card
      else drawEnd(t - END - 0.3);
      await write(canvas.data());
    }
    enc.stdin.end();
  } catch (err) {
    enc.kill();      // ffmpeg stopped reading: its own error says why
  }
  try { await done; } finally { clearInterval(sampler); await fs.rm(wav, { force: true }); }
  return { mp4: out, cover, duration: DUR, voiced: Boolean(voice), peakMB: Math.round(peak / 2 ** 20) };
}

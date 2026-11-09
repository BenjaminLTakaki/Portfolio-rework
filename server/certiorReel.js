// The day's story as a Reel: 1080x1920, 8.8 s, made the way the Reel template (certior-reel-template v5) makes it.
// No voice and no outlet footage: the sound is quiet effects on the cuts, and a song from Instagram's library goes on
// top when it's posted.
//   0.0  hook     the story's title from the first frame, over a crash zoom onto where it happened: the city or
//                 country its headlines name (certiorReelMap.js), with a pin; with no clear place, onto the world
//   1.5  sides    Left, Center and Right headlines snap in 0.6 s apart, as the app's Compare sheet shows them: the
//                 side's dot and name, a panel with the headline in the serif, "Outlet · Rating · Country" under it
//   5.0  the app  as when you tap Compare: the headlines dim and the Compare Headlines sheet slides up on the iPhone's
//                 sheet curve, drawn from the app's own styles (public/certior/style.css), every outlet in it
//   6.5  end      the brand lockup draws in (certior-wordmark.svg's arcs), then the tagline, Link in bio, the URL
// Headlines are word for word. Made to fit a small server: frames drawn one at a time into one ffmpeg, one thread.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import vm from "node:vm";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import ffmpeg from "ffmpeg-static";

import { effects } from "./certiorReelAudio.js";
import { findPlace, LEVELS, mapAround, merc, unmerc } from "./certiorReelMap.js";

const font = (f) => path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts", f);
GlobalFonts.registerFromPath(font("InterVariable.ttf"), "Inter");
GlobalFonts.registerFromPath(font("InterDisplay-Black.otf"), "InterDisplayBlack");
GlobalFonts.registerFromPath(font("InterDisplay-SemiBold.otf"), "InterDisplaySemi");
// the app's headline serif is New York on an iPhone, which Apple licenses only for mock-ups: Source Serif 4 (OFL)
// stands in, cut at a display size for the big headlines, and at the app's own sizes (17 and 22 px), which is what
// a browser picks from the variable font and so where the app's lines break
GlobalFonts.registerFromPath(font("SourceSerif4-Semibold-48.ttf"), "SerifDisplay");
GlobalFonts.registerFromPath(font("SourceSerif4-Semibold-17.ttf"), "SerifText");
GlobalFonts.registerFromPath(font("SourceSerif4-Semibold-22.ttf"), "SerifTitle");
// a full garbage collection on demand, without starting node with --expose-gc
let gc = () => {};
try { v8.setFlagsFromString("--expose-gc"); gc = vm.runInNewContext("gc"); } catch { /* without it, memory just runs higher */ }
const ASC = { Inter: 0.96875, InterDisplayBlack: 0.96875, InterDisplaySemi: 0.96875, SerifDisplay: 1.036, SerifText: 1.036, SerifTitle: 1.036 };
const DESC = { Inter: 0.2412, SerifText: 0.335, SerifTitle: 0.335 };      // with ASC, what a line box centres (the app's CSS line heights)

const W = 1080, H = 1920, FPS = 30;
const SAFE_L = 60, SAFE_R = W - 150, SAFE_B = H - 420, CX = (SAFE_L + SAFE_R) / 2;      // clear of Instagram's bars
const BG = [11, 12, 15], TEXT = [246, 247, 249], GREY = [150, 154, 163], SOFT = [200, 203, 210];
// the app's colours (style.css, from oklch): its background, panels, text and sides
const APP = { bg: [7, 7, 8], surface: [23, 24, 26], surface2: [42, 43, 46], ink: [244, 245, 246], muted: [181, 183, 187], faint: [150, 152, 156] };
const SIDE = { left: [94, 168, 249], center: [200, 202, 208], right: [239, 126, 124], state: [235, 179, 83], unrated: [150, 152, 156] };
const COLUMNS = { left: "Left", center: "Center", right: "Right", state: "State-funded", unrated: "Not rated" };
const LEAN = { left: "Left", "lean-left": "Lean Left", center: "Center", "lean-right": "Lean Right", right: "Right", unrated: "Not rated" };
// the brand mark's three arcs as certior-wordmark.svg draws them, [start, sweep] in degrees, drawn the way a C is
// written (from the top right round to the bottom), in the logo's own colours
const MARK = [[-44.5, -84.4, [74, 144, 255]], [222.2, -84.4, [185, 189, 198]], [128.9, -84.4, [239, 90, 82]]];

const ZOOM_END = 0.62, T_HOOK_END = 1.5, REVEALS = [1.5, 2.1, 2.7];
const T_TRANS = 5.0, T_SHEET = 5.45, T_HIT = 6.5, T_END = 8.8;
const STACK_TOP = 385, PAD = 38, SHEET_Y = 250, END_Y = 640, MAP_Y = 760, HOOK_BOTTOM = 1340;

const clamp = (x) => Math.min(Math.max(x, 0), 1);
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x, p = 3) => 1 - (1 - clamp(x)) ** p;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** The app's sheet curve, cubic-bezier(.32, .72, 0, 1): quick to start, long to settle. */
function iosEase(x) {
  let lo = 0, hi = 1, s = 0.5;
  for (let i = 0; i < 30; i++) {      // the curve's parameter for this x
    s = (lo + hi) / 2;
    if (0.96 * s * (1 - s) ** 2 + s ** 3 < x) lo = s; else hi = s;
  }
  return 2.16 * s * (1 - s) ** 2 + 3 * s * s * (1 - s) + s ** 3;
}

const measure = createCanvas(8, 8).getContext("2d");
/** A run of text: drawn with its top at the font's ascender, as the template places text. */
function T(text, fam, weight, size, color, tracking = 0) {
  measure.font = `${weight} ${size}px ${fam}`;
  measure.letterSpacing = `${tracking * size}px`;
  return { text, css: `${weight} ${size}px ${fam}`, size, asc: ASC[fam] * size, color, ls: `${tracking * size}px`, width: measure.measureText(text).width };
}
function put(ctx, t, x, top, alpha = 1, align = "left") {
  if (alpha <= 0.003 || !t.text) return;
  ctx.font = t.css; ctx.letterSpacing = t.ls; ctx.fillStyle = rgba(t.color, alpha); ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(t.text, x, top + t.asc);
  ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function wrap(text, css, width) {
  measure.font = css; measure.letterSpacing = "0px";
  const lines = [];
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const t = lines.length ? `${lines.at(-1)} ${w}` : w;
    if (lines.length && measure.measureText(t).width <= width) lines[lines.length - 1] = t; else lines.push(w);
  }
  return lines;
}
const ago = (iso, now) => {
  const m = Math.max(0, (now - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.round(m)}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** The app's Compare Headlines sheet for a story, as public/certior/app.js builds it and style.css draws it, at the
 *  Reel's width (the app's 393 pt across 1080 px), as far down as the Reel shows it. The clip `nowId` has the tick. */
function drawSheet(story, now, nowId) {
  const k = W / 393, cv = createCanvas(W, H - SHEET_Y + 40), x = cv.getContext("2d"), bottom = cv.height / k;
  x.scale(k, k);
  x.fillStyle = rgba(APP.bg); x.fillRect(0, 0, 393, bottom);
  // a line of text in a CSS line box: the font's ascent and descent centred in the line height
  const line = (text, fam, weight, size, lh, color, left, top, align = "left") => {
    x.font = `${weight} ${size}px ${fam}`; x.fillStyle = rgba(color); x.textAlign = align;
    x.fillText(text, left, top + (lh - (ASC[fam] + DESC[fam]) * size) / 2 + ASC[fam] * size);
    x.textAlign = "left";
  };
  x.fillStyle = rgba(APP.surface2); x.beginPath(); x.roundRect(178.5, 6, 36, 5, 2.5); x.fill();      // the grabber
  line("Compare Headlines", "Inter", 600, 17, 22.1, APP.ink, 16, 22.95);
  line("Done", "Inter", 600, 17, 22.1, APP.ink, 377, 22.95, "right");
  let y = 62;
  for (const l of wrap(story.headline, "600 22px SerifTitle", 361)) { line(l, "SerifTitle", 600, 22, 28, APP.ink, 16, y); y += 28; }
  const sports = story.topic === "sports";
  for (const [col, label] of Object.entries(COLUMNS)) {
    const clips = story.clips.filter((c) => c.column === col);
    if (!clips.length || y > bottom) continue;
    if (!sports) {
      y += 28;
      x.fillStyle = rgba(SIDE[col]); x.beginPath(); x.arc(36, y + 9, 4, 0, 2 * Math.PI); x.fill();
      line(label, "Inter", 400, 13, 18, APP.muted, 47, y);
      line(`${clips.length} ${clips.length === 1 ? "outlet" : "outlets"}`, "Inter", 400, 13, 18, APP.faint, 361, y, "right");
      y += 25;
      if (col === "state") {
        for (const l of wrap("YouTube notes that a government funds these outlets, in whole or in part, so they aren’t placed on the US left–right scale.", "400 13px Inter", 329)) {
          line(l, "Inter", 400, 13, 18, APP.muted, 32, y); y += 18;
        }
        y += 8;
      }
    }
    // the group: a panel of cells, a hairline between them
    const cells = clips.map((c) => {
      const title = wrap(c.title, "600 17px SerifText", 301);
      const rest = [!sports && (col === "state" ? "State-funded" : LEAN[c.lean]), c.published && ago(c.published, now), c.country].filter(Boolean).join(" · ");
      const note = c.note ? wrap(c.note, "400 13px Inter", 301) : [];
      return { c, title, rest, note, h: 24 + title.length * 22 + 3 + 18 + (note.length ? 3 + note.length * 18 : 0) };
    });
    x.fillStyle = rgba(APP.surface); x.beginPath(); x.roundRect(16, y, 361, cells.reduce((a, c) => a + c.h, 0), 12); x.fill();
    for (const [i, cell] of cells.entries()) {
      if (i) { x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(32, y, 345, 1); }
      let ty = y + 12;
      for (const l of cell.title) { line(l, "SerifText", 600, 17, 22, APP.ink, 32, ty); ty += 22; }
      ty += 3;
      x.font = "700 13px Inter";
      const bw = x.measureText(cell.c.channel).width;
      line(cell.c.channel, "Inter", 700, 13, 18, APP.muted, 32, ty);
      if (cell.rest) line(` · ${cell.rest}`, "Inter", 400, 13, 18, APP.muted, 32 + bw, ty);
      ty += 18;
      if (cell.note.length) { ty += 3; for (const l of cell.note) { line(l, "Inter", 400, 13, 18, APP.faint, 32, ty); ty += 18; } }
      if (cell.c.id === nowId) {      // the tick: a 6 x 12 box's right and bottom borders, turned 45 degrees
        x.save(); x.translate(356, y + cell.h / 2 - 2); x.rotate(Math.PI / 4); x.translate(-3, -6);
        x.strokeStyle = rgba(APP.ink); x.lineWidth = 2.2; x.lineJoin = "miter"; x.beginPath();
        x.moveTo(0, 10.9); x.lineTo(4.9, 10.9); x.lineTo(4.9, 0); x.stroke(); x.restore();
      }
      y += cell.h;
    }
  }
  return cv;
}

/** Writes the Reel (mp4) and its cover (jpg) for a story Left, Center and Right all covered. Returns their paths. */
export async function renderReel(story, { now = new Date(), out = path.join(os.tmpdir(), `certior-reel-${story.id}-${Date.now()}.mp4`) } = {}) {
  // the first clip from each side, as on the card (sport: the first three outlets, no sides)
  const sports = story.topic === "sports";
  const picks = sports ? story.clips.slice(0, 3).map((c) => [c, null]) : ["left", "center", "right"].map((col) => {
    const c = story.clips.find((k) => k.column === col);
    if (!c) throw new Error(`no ${col} clip: a Reel needs all three sides`);
    return [c, col];
  });
  // the sound first: its buffers are freed and reused before the canvases exist
  let peak = process.memoryUsage().rss;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 250);
  const wav = out.replace(/\.mp4$/i, "") + ".wav";
  await fs.writeFile(wav, effects({ duration: T_END, land: ZOOM_END, reveals: REVEALS, transition: T_TRANS, endHit: T_HIT + 0.1 }));

  // --- where it happened, and the map around it
  const place = findPlace(story);
  const [tx, ty] = place ? merc(place.lon, place.lat) : merc(15, 25);
  const s1 = !place ? W / 1.4e7 : place.kind === "country" ? W / 1.2e6 : W / 2.4e5, s0 = s1 / (!place ? 2.2 : 10.8);
  const reach = W / 2.4e5 / s1;      // the city zoom's offsets and drift, at this zoom
  const layers = place ? mapAround(place.lon, place.lat, 40, 25) : mapAround(0, 0, 360, 180, 2);
  function camera(t) {
    let s, cx, cy, rot, tilt;
    if (t < ZOOM_END) {
      const u = easeOut(prog(t, 0, ZOOM_END)), off = (1 - u) ** 2 * reach;
      s = Math.exp(lerp(Math.log(s0), Math.log(s1), u));
      [cx, cy, rot, tilt] = [tx - 900e3 * off, ty - 1300e3 * off, lerp(-14, 0, u), lerp(10, 38, u)];
    } else {
      const k = t - ZOOM_END;
      s = s1 * (1 + 0.045 * k);
      [cx, cy, rot, tilt] = [tx + 260 * k * reach, ty + 120 * k * reach, 0.55 * k, 38 + 0.4 * k];
    }
    const r = (rot * Math.PI) / 180, tl = (tilt * Math.PI) / 180;
    return { s, cx, cy, cr: Math.cos(r), sr: Math.sin(r), st: Math.sin(tl), ct: Math.cos(tl) };
  }
  // map metres to the screen: turned, then tilted away in perspective, centred on the pin's spot
  const project = (cam, X, Y, p) => {
    const dx = (X - cam.cx) * cam.s, dy = -(Y - cam.cy) * cam.s, rx = dx * cam.cr - dy * cam.sr, ry = dx * cam.sr + dy * cam.cr;
    const Z = -ry * cam.st, f = 1700 / Math.max(1700 + Z, 1);
    p[0] = CX + rx * f; p[1] = MAP_Y + ry * cam.ct * f;
    return 1700 + Z > 60;
  };

  // --- text and layout
  const when = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(story.first || now)).replace(",", "").toUpperCase();
  const tWhen = T(when, "Inter", 600, 28, TEXT, 0.16), tLabel = place && T(place.label.toUpperCase(), "Inter", 700, 30, TEXT, 0.22);
  // the title: the largest size at which it fits in three lines and 380 px
  let hs = 130, hook;
  for (; hs > 56; hs -= 2) {
    hook = wrap(story.headline, `900 ${hs}px InterDisplayBlack`, SAFE_R - SAFE_L);
    if (hook.length <= 3 && hook.length * hs * 1.02 <= 380) break;
  }
  const tHook = hook.map((l) => T(l, "InterDisplayBlack", 900, hs, TEXT));
  let kicker = story.headline.toUpperCase();
  while (kicker.length > 8 && T(kicker, "Inter", 600, 26, TEXT, 0.16).width > SAFE_R - SAFE_L) kicker = `${kicker.slice(0, -2).trimEnd()}…`;
  const tKicker = T(kicker, "Inter", 600, 26, TEXT, 0.16), tNote = T("Headlines word for word, as published on YouTube", "Inter", 500, 28, GREY);

  // the three headlines, one size for all, the largest at which they fit together
  const maxW = SAFE_R - SAFE_L - 2 * PAD, avail = SAFE_B - STACK_TOP - 20;
  let size = 76, lh, total;
  for (; size > 40; size -= 2) {
    const n = picks.map(([c]) => wrap(c.title, `600 ${size}px SerifDisplay`, maxW).length);
    lh = Math.floor(size * 1.22);
    total = 3 * (40 + 14 + 2 * PAD + 50) + n.reduce((a, b) => a + b, 0) * lh + 2 * 40;
    if (total <= avail && n.every((v) => v <= 5)) break;
  }
  let top = STACK_TOP + (avail - total) * 0.35;
  const blocks = picks.map(([c, col]) => {
    const lines = wrap(c.title, `600 ${size}px SerifDisplay`, maxW), words = [];
    lines.forEach((l, li) => {
      let wx = 0;
      for (const w of l.split(" ")) {
        words.push({ t: T(w, "SerifDisplay", 600, size, TEXT), x: SAFE_L + PAD + wx, li });
        wx += T(`${w} `, "SerifDisplay", 600, size, TEXT).width;
      }
    });
    const rest = [!sports && LEAN[c.lean], c.country].filter(Boolean).join(" · ");
    const panel = top + 54, bottom = panel + 2 * PAD + lines.length * lh + 50;
    const b = { col, top, panel, bottom, words, n: lines.length, title: col ? T(COLUMNS[col], "Inter", 400, 31, APP.muted) : null,
      sub: [T(c.channel, "Inter", 700, 31, APP.muted), T(rest ? ` · ${rest}` : "", "Inter", 400, 31, APP.muted)] };
    top = bottom + 40;
    return b;
  });
  const sheet = drawSheet(story, now.getTime(), picks[0][0].id);
  const tName = T("certior", "InterDisplaySemi", 600, 104, TEXT), tTag = T("Every side of every story.", "InterDisplaySemi", 600, 44, SOFT);
  const tFacts = T("Free  ·  No account  ·  No ads", "Inter", 500, 32, GREY), tCta = T("Link in bio", "Inter", 700, 40, BG);
  const tUrl = T("benjamintakaki.com/certior", "Inter", 600, 32, SOFT);

  // --- the canvases: the frame, the map drawn apart (so it can glow and blur), grain, the vignette
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), mapCv = createCanvas(W, H), mx = mapCv.getContext("2d");
  let seed = 7;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const grain = [0, 1, 2, 3].map(() => {
    const g = createCanvas(W / 2, H / 2), gx = g.getContext("2d"), img = gx.createImageData(W / 2, H / 2);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + 30 * Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v)); img.data[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0);
    return g;
  });
  const vignette = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, H * 0.78);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(0.45, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.62)");

  const pt = [0, 0];
  function drawLayer(levels, cam, width, alpha) {
    if (alpha <= 0.01) return;
    const tol = 1 / cam.s;
    let li = 0;
    while (li + 1 < LEVELS.length && LEVELS[li + 1] <= 2 * tol) li++;      // within 2 px: unseen under the glow and blur
    const { segs, boxes } = levels[li], r = (2.6 * H) / cam.s;
    mx.beginPath();
    for (let i = 0; i < segs.length; i++) {
      if (boxes[4 * i + 2] < cam.cx - r || boxes[4 * i] > cam.cx + r || boxes[4 * i + 3] < cam.cy - r || boxes[4 * i + 1] > cam.cy + r) continue;
      const p = segs[i];
      for (let k = 0; k < p.length; k += 2) {
        if (!project(cam, p[k], p[k + 1], pt)) break;
        if (k) mx.lineTo(pt[0], pt[1]); else mx.moveTo(pt[0], pt[1]);
      }
    }
    mx.lineWidth = width; mx.lineJoin = "round"; mx.strokeStyle = rgba(TEXT, alpha); mx.stroke();
  }
  function drawGraticule(cam) {
    const span = W / cam.s / 111000, step = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30].find((v) => span / v <= 7) ?? 30;
    const [lonC, latC] = unmerc(cam.cx, cam.cy), n = 14;
    mx.beginPath();
    for (let j = -n; j <= n; j++) {
      for (const along of [0, 1]) {      // a meridian, then a parallel
        const fixed = Math.round((along ? latC : lonC) / step) * step + j * step;
        for (let q = 0; q < 60; q++) {
          const v = (along ? lonC : latC) - n * step + (2 * n * step * q) / 59;
          const [X, Y] = along ? merc(v, fixed) : merc(fixed, v);
          if (!project(cam, X, Y, pt)) break;
          if (q) mx.lineTo(pt[0], pt[1]); else mx.moveTo(pt[0], pt[1]);
        }
      }
    }
    mx.lineWidth = 1; mx.strokeStyle = rgba(TEXT, 0.09); mx.stroke();
  }
  // Behind the headlines the map is fully blurred and drifts slowly: drawn every third frame, and blurred at half size
  // (the same at 10 px), it costs a third as much, which matters for the world map's many lines
  const halfCv = createCanvas(W / 2, H / 2), hx = halfCv.getContext("2d");
  let halfKey = -1;
  function drawMap(t, alpha, blur) {
    const cam = camera(t), settled = blur >= 9.99, key = Math.floor((t * FPS) / 3);
    if (alpha <= 0.01) return cam;
    if (!settled || key !== halfKey) {
      mx.clearRect(0, 0, W, H);
      drawGraticule(cam);
      const close = clamp((Math.log(cam.s) - Math.log(W / 1.4e6)) / (Math.log(W / 4.5e5) - Math.log(W / 1.4e6)));
      drawLayer(layers[2], cam, 1.5, 0.42 * close);                                  // rivers, close up
      drawLayer(layers[0], cam, lerp(1.6, 1.8, close), 0.55);                        // coast
      drawLayer(layers[1], cam, lerp(1.3, 1.6, close), lerp(0.4, 0.5, close));       // borders
      if (settled) { halfKey = key; hx.clearRect(0, 0, W / 2, H / 2); hx.filter = `blur(${blur / 2}px)`; hx.drawImage(mapCv, 0, 0, W / 2, H / 2); hx.filter = "none"; }
    }
    ctx.save();
    if (settled) { ctx.globalAlpha = alpha; ctx.drawImage(halfCv, 0, 0, W, H); }
    else if (blur > 0.3) { ctx.filter = `blur(${blur}px)`; ctx.globalAlpha = alpha; ctx.drawImage(mapCv, 0, 0); }
    else {
      ctx.filter = "blur(5px)"; ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha * 0.8; ctx.drawImage(mapCv, 0, 0);
      ctx.filter = "none"; ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = alpha; ctx.drawImage(mapCv, 0, 0);
    }
    ctx.restore();
    return cam;
  }

  // the hook: when, where (coordinates, the crosshair that becomes the pin) and the title
  function drawHook(t, cam) {
    const out = 1 - easeInOut(prog(t, 1.3, 1.55)), lift = -60 * easeInOut(prog(t, 1.3, 1.55));
    if (out <= 0) return;
    put(ctx, tWhen, SAFE_L, 262, 0.75 * out);
    if (place) {
      let [lon, lat] = unmerc(cam.cx, cam.cy);
      if (t >= ZOOM_END) [lon, lat] = [place.lon, place.lat];
      const coords = `${Math.abs(lat).toFixed(4).padStart(7, "0")}° ${lat >= 0 ? "N" : "S"}    ${Math.abs(lon).toFixed(4).padStart(8, "0")}° ${lon >= 0 ? "E" : "W"}`;
      put(ctx, T(coords, "Inter", 500, 26, GREY), SAFE_L, 306, 0.85 * out);
      project(cam, tx, ty, pt);
      const [px, py] = pt, land = prog(t, ZOOM_END - 0.08, ZOOM_END + 0.5), ret = (1 - land) * out;
      if (ret > 0.01) {      // the crosshair, until the pin lands
        ctx.lineWidth = 2; ctx.strokeStyle = rgba(TEXT, 0.7 * ret); ctx.beginPath(); ctx.arc(CX, MAP_Y, 46, 0, 2 * Math.PI);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(CX + ax * 46, MAP_Y + ay * 46); ctx.lineTo(CX + ax * 72, MAP_Y + ay * 72); }
        ctx.stroke();
      }
      if (t >= ZOOM_END - 0.08) {
        ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) {      // rings going out from the pin
          const rt = prog(t, ZOOM_END - 0.05 + k * 0.28, ZOOM_END + 0.95 + k * 0.28);
          if (rt > 0 && rt < 1) { ctx.strokeStyle = rgba(TEXT, (1 - rt) * 0.8 * out); ctx.beginPath(); ctx.arc(px, py, lerp(12, 190, easeOut(rt)), 0, 2 * Math.PI); ctx.stroke(); }
        }
        const flash = 1 - prog(t, ZOOM_END - 0.04, ZOOM_END + 0.3);
        if (flash > 0) { ctx.save(); ctx.filter = "blur(26px)"; ctx.fillStyle = rgba(TEXT, 0.9 * flash * out); ctx.beginPath(); ctx.arc(px, py, 40, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); }
      }
      ctx.fillStyle = rgba(TEXT, out * clamp(land * 3)); ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI); ctx.fill();
      put(ctx, tLabel, px + 30, py - 15, out * easeOut(prog(t, ZOOM_END, ZOOM_END + 0.25)));
    }
    const sc = lerp(1.1, 1, easeOut(prog(t, 0, ZOOM_END + 0.1)));
    ctx.save(); ctx.translate(SAFE_L, HOOK_BOTTOM); ctx.scale(sc, sc); ctx.translate(-SAFE_L, -HOOK_BOTTOM);
    tHook.forEach((l, i) => put(ctx, l, SAFE_L, HOOK_BOTTOM + lift - (tHook.length - i) * hs * 1.02, out));
    ctx.restore();
  }

  // the three headlines: the side's dot and name, then the panel rising into place, its words cascading in
  function drawStack(t) {
    const ka = easeOut(prog(t, REVEALS[0] - 0.05, REVEALS[0] + 0.25)) * (1 - easeOut(prog(t, T_TRANS, T_TRANS + 0.3)));
    put(ctx, tKicker, SAFE_L, 264, 0.62 * ka);
    put(ctx, tNote, SAFE_L, 304, 0.9 * ka);
    blocks.forEach((b, i) => {
      const lt = t - REVEALS[i];
      if (lt < -0.02) return;
      const snap = easeOut(prog(lt, 0, 0.22), 4), dy = 22 * (1 - snap), x = SAFE_L + PAD - 24 * (1 - snap);
      if (b.title) {
        ctx.fillStyle = rgba(SIDE[b.col], snap); ctx.beginPath(); ctx.arc(x + 9.5, b.top + b.title.asc - 11, 9.5, 0, 2 * Math.PI); ctx.fill();
        put(ctx, b.title, x + 36, b.top, snap);
      }
      ctx.fillStyle = rgba(APP.surface, snap); ctx.beginPath(); ctx.roundRect(SAFE_L, b.panel + dy, SAFE_R - SAFE_L, b.bottom - b.panel, 29); ctx.fill();
      const y0 = b.panel + PAD + dy;
      b.words.forEach((w, k) => { const e = easeOut(prog(lt, 0.04 + k * 0.018, 0.22 + k * 0.018)); put(ctx, w.t, w.x, y0 + w.li * lh + 16 * (1 - e), e); });
      const sa = easeOut(prog(lt, 0.12, 0.4)), ys = y0 + b.n * lh + 12;
      put(ctx, b.sub[0], SAFE_L + PAD, ys, sa);
      put(ctx, b.sub[1], SAFE_L + PAD + b.sub[0].width, ys, sa);
    });
  }

  // as when you tap Compare: the headlines dim, and the sheet slides up over them on the iPhone's curve
  function drawSheetUp(t) {
    if (t < T_TRANS) return;
    ctx.fillStyle = `rgba(0,0,0,${0.6 * easeOut(prog(t, T_TRANS, T_TRANS + 0.2))})`; ctx.fillRect(0, 0, W, H);
    const y = SHEET_Y + (1 - iosEase(prog(t, T_TRANS, T_SHEET))) * (H - SHEET_Y + 40);
    ctx.save(); ctx.beginPath(); ctx.roundRect(0, y, W, H + 60, 38); ctx.clip();      // the app's 14 pt corners
    ctx.drawImage(sheet, 0, y); ctx.restore();
  }

  // the end card: everything fades to the background, the lockup draws in, then the rest
  function drawEnd(t) {
    ctx.fillStyle = rgba(BG, easeInOut(prog(t, T_HIT, T_HIT + 0.3))); ctx.fillRect(0, 0, W, H);
    const lt = t - T_HIT - 0.1, d = 200, cx = CX - (1.1 * d + tName.width) / 2 + d / 2, cy = END_Y + d / 2;
    const draw = easeInOut(prog(lt, 0, 0.6));
    ctx.lineWidth = (d / 2) * (66 / 183); ctx.lineCap = "butt";
    MARK.forEach(([start, sweep, color], i) => {
      const k = clamp(draw * 1.6 - i * 0.3);
      if (k <= 0) return;
      ctx.strokeStyle = rgba(color); ctx.beginPath();
      ctx.arc(cx, cy, (d / 2) * (150 / 183), (start * Math.PI) / 180, ((start + sweep * k) * Math.PI) / 180, sweep < 0); ctx.stroke();
    });
    const na = easeOut(prog(lt, 0.3, 0.65));      // "certior" at the wordmark's proportions: 0.52 of the mark, 0.6 of it right
    put(ctx, tName, cx + 0.6 * d - 18 * (1 - na), cy + 0.342 * tName.size - tName.asc, na);
    const y = END_Y + d, ta = easeOut(prog(lt, 0.45, 0.75));
    put(ctx, tTag, CX, y + 52 + 12 * (1 - ta), ta, "center");
    put(ctx, tFacts, CX, y + 118, easeOut(prog(lt, 0.55, 0.85)), "center");
    const ca = easeOut(prog(lt, 0.65, 1)), pulse = 1 + 0.025 * Math.sin(Math.max(0, lt - 1.2) * 5) * prog(lt, 1.2, 1.5), pw = tCta.width + 90, ph = 86;
    ctx.save(); ctx.translate(CX, y + 186 + ph / 2); ctx.scale(pulse * lerp(0.9, 1, ca), pulse * lerp(0.9, 1, ca));
    ctx.fillStyle = rgba(TEXT, ca); ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fill();
    put(ctx, tCta, 0, -tCta.asc / 2 - 4, ca, "center"); ctx.restore();
    put(ctx, tUrl, CX, y + 306, easeOut(prog(lt, 0.8, 1.15)), "center");
  }

  function frame(t) {
    ctx.save();
    ctx.fillStyle = rgba(BG); ctx.fillRect(0, 0, W, H);
    const toBg = easeInOut(prog(t, 1.3, 1.7));
    const cam = drawMap(t, (1 - 0.5 * toBg) * (1 - 0.75 * easeInOut(prog(t, T_TRANS, T_SHEET))), 10 * toBg);
    if (t < T_HOOK_END + 0.1) drawHook(t, cam);
    if (t >= REVEALS[0] - 0.05 && t < T_HIT + 0.35) { drawStack(t); drawSheetUp(t); }
    if (t >= T_HIT) drawEnd(t);
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.22; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grain[Math.floor(t * FPS) % grain.length], 0, 0, W, H);
    ctx.restore();
  }
  // motion blur where things move fast: several moments within the frame's shutter, averaged on a canvas (each one
  // drawn over the average so far), so the pixels are read out once a frame: every read is an 8 MB copy
  const samples = (t) => (t < 0.4 || (t >= T_TRANS && t <= T_SHEET + 0.05) ? 8 : t <= ZOOM_END + 0.05 || (t >= 1.28 && t <= 1.62) ? 4 : 1);
  const blurCv = createCanvas(W, H), bx = blurCv.getContext("2d");
  function render(t) {
    const n = samples(t);
    if (n === 1) { frame(t); return canvas.data(); }
    const shutter = (t < 0.35 ? 0.25 : 0.5) / FPS;
    for (let k = 0; k < n; k++) {
      frame(Math.max(0, t + shutter * ((k + 0.5) / n - 0.5)));
      bx.globalAlpha = 1 / (k + 1);
      bx.drawImage(canvas, 0, 0);
    }
    return blurCv.data();
  }

  // --- the cover (the hook, landed), the sound, then every frame through ffmpeg
  const cover = out.replace(/\.mp4$/i, "") + "-cover.jpg";
  frame(1.25);
  await fs.writeFile(cover, await canvas.encode("jpeg", 92));

  // One thread, a short queue, and no look-ahead or B-frames: ffmpeg otherwise holds dozens of frames, and starts a
  // thread with its own per CPU it sees (a small server reports its host's many). The file comes out bigger, which
  // doesn't matter, Instagram re-encodes it.
  let errors = "";
  const enc = spawn(ffmpeg, ["-v", "error", "-y", "-filter_threads", "1",
    "-thread_queue_size", "2", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", "-i", wav,
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",      // standard HD colour
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-preset", "veryfast", "-crf", "18", "-threads", "1", "-x264-params", "rc-lookahead=0:bframes=0:ref=1:sync-lookahead=0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "pipe"] });
  enc.stderr.on("data", (d) => { errors += d; });
  enc.stdin.on("error", () => {});      // a broken pipe: reported by the write below and ffmpeg's exit
  const done = new Promise((ok, fail) => {
    enc.on("error", fail);
    enc.on("close", (code) => (code ? fail(new Error(`ffmpeg exited with ${code}: ${errors.trim().slice(-300)}`)) : ok()));
  });
  const write = (buf) => new Promise((ok, fail) => enc.stdin.write(buf, (e) => (e ? fail(e) : ok())));

  gc();      // what setting up left behind
  try {
    for (let n = 0, frames = Math.round(T_END * FPS); n < frames; n++) {
      await write(render(n / FPS));
      if (n % 5 === 4) gc();      // each frame's pixels are an 8 MB copy, which the collector otherwise lets pile up
    }
    enc.stdin.end();
  } catch {
    enc.kill();      // ffmpeg stopped reading: its own error says why
  }
  try { await done; } finally { clearInterval(sampler); await fs.rm(wav, { force: true }); }
  return { mp4: out, cover, duration: T_END, place: place?.label ?? null, peakMB: Math.round(peak / 2 ** 20) };
}

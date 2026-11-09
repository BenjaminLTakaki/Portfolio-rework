// The daily Reel's map (certiorReel.js): Natural Earth's coastlines, international land borders and major rivers
// (public domain, built by data/build.mjs), and where a story happened: the city its headlines name, or else the
// country. Cautious on purpose: a place that's also a word or a name (Nice, Jordan) never counts on its own, and one
// headline alone isn't enough, so a story with no clear place gets the world map instead of a wrong pin.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const R = 6378137;
/** Web Mercator metres, and back to degrees. */
export const merc = (lon, lat) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360))];
export const unmerc = (x, y) => [(x / R) * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];

// loaded once and kept compact (a small server): every point as Int32 degrees x 1e5 in one array, each layer's lines
// as [start, end) into it, and the place names
let pts, layers, places;
function load() {
  if (pts) return;
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DATA, "map.bin.gz")));
  const a = buf.byteOffset % 4 ? new Int32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) : new Int32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  let total = 0;
  for (let layer = 0, i = 0; layer < 3; layer++) {      // how many points in all: each layer's count, lengths, points
    const n = a[i], len = a.subarray(i + 1, i + 1 + n).reduce((s, l) => s + l, 0);
    total += len;
    i += 1 + n + 2 * len;
  }
  pts = new Int32Array(2 * total);
  layers = [];
  for (let layer = 0, i = 0, o = 0; layer < 3; layer++) {
    const n = a[i++], lens = a.slice(i, i + n), spans = [];
    i += n;
    for (const len of lens) {
      spans.push(o, o + 2 * len);
      for (let k = 0, x = 0, y = 0; k < len; k++, i += 2, o += 2) { pts[o] = x += a[i]; pts[o + 1] = y += a[i + 1]; }
    }
    layers.push(spans);
  }
  places = JSON.parse(fs.readFileSync(path.join(DATA, "places.json"), "utf8"));
}

export const LEVELS = [500, 1500, 5000, 15000, 50000];      // metres between kept points; the zoom picks one

/** Coast, borders and rivers within dLon, dLat degrees of lon, lat, in Web Mercator metres, at each level of
 *  detail: per layer, per level, { segs: [Float64Array x, y...], boxes: [x0, y0, x1, y1 per seg] }. Levels finer than
 *  LEVELS[finest] are that one (a zoomed-out map never needs them). */
export function mapAround(lon, lat, dLon, dLat, finest = 0) {
  load();
  const [lo0, lo1, la0, la1] = [lon - dLon, lon + dLon, lat - dLat, lat + dLat].map((v) => v * 1e5);
  return layers.map((spans) => {
    const near = [];
    for (let s = 0; s < spans.length; s += 2) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = spans[s]; k < spans[s + 1]; k += 2) { x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k]); y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1]); }
      if (x1 < lo0 || x0 > lo1 || y1 < la0 || y0 > la1) continue;
      const m = new Float64Array(spans[s + 1] - spans[s]);
      for (let k = 0; k < m.length; k += 2) [m[k], m[k + 1]] = merc(pts[spans[s] + k] / 1e5, pts[spans[s] + k + 1] / 1e5);
      near.push(m);
    }
    const kept = new Float64Array(Math.max(0, ...near.map((p) => p.length)));      // reused, each line copied out at its size
    const levels = LEVELS.slice(finest).map((tol) => {
      const segs = [], boxes = [];
      for (const p of near) {
        let m = 2;
        kept[0] = p[0]; kept[1] = p[1];
        for (let k = 2; k < p.length - 2; k += 2) {
          if (Math.abs(p[k] - kept[m - 2]) + Math.abs(p[k + 1] - kept[m - 1]) >= tol) { kept[m++] = p[k]; kept[m++] = p[k + 1]; }
        }
        kept[m++] = p.at(-2); kept[m++] = p.at(-1);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let k = 0; k < m; k += 2) { x0 = Math.min(x0, kept[k]); x1 = Math.max(x1, kept[k]); y0 = Math.min(y0, kept[k + 1]); y1 = Math.max(y1, kept[k + 1]); }
        segs.push(kept.slice(0, m));
        boxes.push(x0, y0, x1, y1);
      }
      return { segs, boxes };
    });
    return [...Array(finest).fill(levels[0]), ...levels];
  });
}

const fold = (s) => ` ${String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
// places' names that are also everyday words or people's names: never a place on their own
const NOT_PLACES = new Set(["nice", "mobile", "reading", "split", "bath", "sale", "male", "victoria", "hope", "independence", "orange", "lincoln", "jackson",
  "aurora", "salem", "madison", "columbia", "concord", "hamilton", "richmond", "charlotte", "florence", "austin", "kingston", "mercedes", "march",
  "laval", "eugene", "marion", "troy", "georgia", "jordan", "chad", "santa", "york", "cork", "university", "college", "union", "liberty", "president", "mesa",
  "man", "bama", "of", "as", "santiago", "leon", "salvador", "regina"]);
// what headlines call a place besides its own names (by its name folded: Natural Earth writes "Washington,  D.C.")
const ALSO = { "washington d c": ["washington", "white house", "capitol hill", "pentagon"], moscow: ["kremlin"], london: ["downing street"],
  "united states": ["america"], "united kingdom": ["britain", "great britain"] };
const also = (label) => ALSO[fold(label).trim()] || [];
const expand = (s) => String(s).replace(/(^|[^A-Za-z.])(U\.S\.A\.|U\.S\.|USA|US)(?![A-Za-z])/g, "$1United States").replace(/(^|[^A-Za-z.])(U\.K\.|UK)(?![A-Za-z])/g, "$1United Kingdom");
// A country is often who acted, not where: "the US launched strikes on Iran". It counts only where the story is placed
// in it ("on Iran", "in central Japan": a word like these at most two words before) or as a dateline ("Paraguay: ...").
const PREP = /^(in|near|across|inside|over|on|into|at)$/;
function placedIn(f, n) {
  for (let i = f.indexOf(n); i >= 0; i = f.indexOf(n, i + 1)) {
    const before = f.slice(0, i).trim().split(" ").slice(-2);
    if (before.some((w) => PREP.test(w))) return true;
  }
  return false;
}

/** Where a story happened: { label, lon, lat, kind: "city" | "country" }, or null. A place counts with the story's
 *  own headline (3) or two outlets' (1 each) naming it; a city beats a country, and a city in a country the
 *  headlines also name beats one elsewhere with the same name. Sport gets none: its places are mostly teams. */
export function findPlace(story) {
  if (story.topic === "sports") return null;
  load();
  const texts = [[story.headline || "", 3], ...(story.clips || []).map((c) => [c.title || "", 1])].map(([t, w]) => {
    const raw = expand(t);
    return { f: fold(raw), dateline: raw.includes(":") ? fold(raw.split(":")[0]) : "", w };
  });
  const names = (list) => list.map(fold).filter((n) => n.trim() && !NOT_PLACES.has(n.trim()));
  const score = (ns, where = (t, n) => t.f.includes(n)) => texts.reduce((s, t) => s + (ns.some((n) => where(t, n)) ? t.w : 0), 0);
  const countries = places.countries.map(([label, alts, lon, lat]) => {
    const ns = names([label, ...alts, ...also(label)]);
    return { label, lon, lat, kind: "country", names: ns, mentioned: score(ns) > 0, score: score(ns, (t, n) => t.dateline === n || placedIn(t.f, n)) };
  });
  const named = new Set(countries.filter((c) => c.mentioned).flatMap((c) => c.names));
  let best = null;
  for (const [label, alts, country, lon, lat, pop] of places.cities) {
    let s = score(names([label, ...alts, ...also(label)]));
    if (s < 2) continue;
    if (named.has(fold(country))) s += 0.5;
    if (!best || s > best.score || (s === best.score && pop > best.pop)) best = { label, lon, lat, kind: "city", score: s, pop };
  }
  const place = best || countries.filter((c) => c.score >= 2).sort((a, b) => b.score - a.score)[0];
  return place ? { label: place.label.replace(/\s+/g, " "), lon: place.lon, lat: place.lat, kind: place.kind } : null;
}

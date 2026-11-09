// Builds this folder's map data for the daily Reel (../certiorReelMap.js) from Natural Earth, which is public domain:
//   map.bin.gz   coastlines, international land borders and major rivers, simplified to about 500 m, as Int32
//                degrees x 1e5, each point after a line's first as a step from the one before, gzipped. Disputed,
//                provisional and line-of-control borders are left out: the map takes no side.
//   places.json  cities of 100,000+ people and capitals, and countries, to find where a story happened
// The outputs are committed; run this again only to refresh them: node server/data/build.mjs
import fs from "node:fs/promises";
import zlib from "node:zlib";

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const get = async (name) => (await (await fetch(`${NE}${name}.geojson`)).json()).features;
const TOL = 0.005;      // degrees: about 500 m, two pixels at the Reel's closest zoom, where the map is soon blurred

function lines(features, keep = () => true) {
  const out = [];
  for (const { geometry: g, properties } of features) {
    if (!g || !keep(properties)) continue;
    for (const p of g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []) {
      const kept = [p[0]];
      for (const q of p.slice(1, -1)) if (Math.abs(q[0] - kept.at(-1)[0]) + Math.abs(q[1] - kept.at(-1)[1]) >= TOL) kept.push(q);
      kept.push(p.at(-1));
      if (p.length > 1) out.push(kept);
    }
  }
  return out;
}

const layers = [
  lines(await get("ne_10m_coastline")),
  lines(await get("ne_10m_admin_0_boundary_lines_land"), (p) => p.FEATURECLA === "International boundary (verify)"),
  lines(await get("ne_10m_rivers_lake_centerlines"), (p) => p.scalerank <= 7),
];
// layer by layer: how many lines, each line's length, then its points as lon, lat (steps after the first)
const ints = [];
for (const layer of layers) {
  ints.push(layer.length);
  for (const l of layer) ints.push(l.length);
  for (const l of layer) {
    let x = 0, y = 0;
    for (const [lon, lat] of l) {
      const X = Math.round(lon * 1e5), Y = Math.round(lat * 1e5);
      ints.push(X - x, Y - y);
      [x, y] = [X, Y];
    }
  }
}
await fs.writeFile(new URL("map.bin.gz", import.meta.url), zlib.gzipSync(Buffer.from(Int32Array.from(ints).buffer), { level: 9 }));

const round = (v) => Math.round(v * 1e4) / 1e4;
const cities = (await get("ne_10m_populated_places_simple")).map((f) => f.properties)
  .filter((p) => p.pop_max >= 100000 || p.adm0cap)
  .map((p) => [p.name, [...new Set([p.nameascii, ...(p.namealt || "").split("|")].filter((n) => n && n !== p.name))], p.adm0name, round(p.longitude), round(p.latitude), p.pop_max]);
const countries = (await get("ne_50m_admin_0_countries")).map((f) => f.properties)
  .map((p) => [p.NAME_LONG.length < p.NAME.length ? p.NAME_LONG : p.NAME, [...new Set([p.NAME, p.NAME_LONG, p.ADMIN, p.NAME_ALT].filter(Boolean))], round(p.LABEL_X), round(p.LABEL_Y)]);
await fs.writeFile(new URL("places.json", import.meta.url), JSON.stringify({ cities, countries }));
console.log(layers.map((l) => `${l.length} lines, ${l.reduce((a, x) => a + x.length, 0)} points`).join(" | "), `| ${cities.length} cities, ${countries.length} countries`);

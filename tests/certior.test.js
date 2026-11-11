// Certior in a real browser: npm run test:browser (needs `npx playwright install chromium` once).
// The app is served from public/ by a small file server; the feed is tests/certior-feed.json (13 stories from the live
// feed of 10 Nov 2026), and every YouTube request is blocked and recorded.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const FEED = await readFile(new URL("./certior-feed.json", import.meta.url), "utf8");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

let server, browser, base;
before(async () => {
  server = createServer(async (req, res) => {
    const file = path.join(PUBLIC, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
    if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
    try { res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/certior/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

// A phone with nothing saved, as on a first visit. Returns the page, the YouTube requests and the page errors.
async function open(storage = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const youtube = [], errors = [];
  await ctx.route(/certior-news\/(feed|search)\.json/, (r) => r.fulfill({ contentType: "application/json", body: FEED }));
  await ctx.route(/\/api\//, (r) => r.fulfill({ status: 204 }));
  await ctx.route(/youtube|ytimg|googlevideo/, (r) => { youtube.push(r.request().url()); r.abort(); });
  await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, storage);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector(".story");
  return { page, youtube, errors };
}
const story = (page, i = 0) => page.locator(`.story[data-i="${i}"]`);

test("a first visit shows the stories as text and loads nothing from YouTube", async () => {
  const { page, youtube, errors } = await open();
  assert.ok(await page.locator("#welcome").isVisible(), "the welcome card");
  assert.ok((await story(page).locator(".tc-head").first().textContent()).length > 10, "a headline");
  await page.click("#consent-text");
  assert.ok(await page.locator("#welcome").isHidden());
  assert.equal(await page.evaluate(() => localStorage.getItem("consent")), '"text"');
  assert.deepEqual(youtube, []);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("swiping sideways shows another outlet, and Compare lists every side", async () => {
  const { page, youtube, errors } = await open({ consent: "text" });
  const clip = () => page.evaluate(() => { const c = document.querySelector('.story[data-i="0"] .clips'); return Math.round(c.scrollLeft / c.clientWidth); });
  const first = await clip();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((f) => { const c = document.querySelector('.story[data-i="0"] .clips'); return Math.round(c.scrollLeft / c.clientWidth) !== f; }, first);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => { const f = document.querySelector("#feed"); return Math.round(f.scrollTop / f.clientHeight) === 1; });
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => document.querySelector("#feed").scrollTop === 0);
  await story(page).locator(".compare-btn").first().click();
  const sheet = page.locator("#compare");
  await sheet.waitFor({ state: "visible" });
  const sides = await sheet.locator(".group-title").evaluateAll((t) => t.map((e) => e.dataset.column));
  for (const side of ["left", "center", "right"]) assert.ok(sides.includes(side), `Compare has ${side}`);
  assert.ok(await sheet.locator(".headline").count() > 3);
  await sheet.locator(".done").click();
  await sheet.waitFor({ state: "hidden" });
  assert.deepEqual(youtube, []);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("Recap, World, Search and Settings open without errors", async () => {
  const { page, errors } = await open({ consent: "text" });
  for (const tab of ["recap", "world", "search", "settings", "news"]) {
    await page.click(`#tabbar button[data-tab="${tab}"]`);
    await page.waitForTimeout(300);
  }
  await page.click('#tabbar button[data-tab="search"]');
  await page.fill("#search-input", (await page.evaluate((f) => JSON.parse(f).stories[0].headline.split(" ")[0], FEED)));
  await page.press("#search-input", "Enter");
  await page.waitForTimeout(500);
  await page.click('#tabbar button[data-tab="news"]');
  assert.deepEqual(errors, []);
  await page.context().close();
});

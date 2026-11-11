import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPage, listed, sitemap, withHead } from "./pages.js";

test("a case study's link previews that case study; other pages keep the home page's", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const h = withHead(html, "/project/certior/");
  assert.match(h, /<title>Certior \| Benjamin Takaki<\/title>/);
  assert.match(h, /property="og:url" content="https:\/\/www\.benjamintakaki\.com\/project\/certior"/);
  assert.equal(h.match(/content="[^"]*(Bayesian esports|selected projects)/g), null);     // both home descriptions replaced
  assert.match(withHead(html, "/privacy"), /<title>Privacy \| Benjamin Takaki<\/title>/);
  assert.equal(withHead(html, "/forecaster"), html);
  assert.equal(withHead(html, "/project/nope"), html);
});

test("only real pages answer 200, and every listed page of the React app is one", () => {
  for (const p of ["/", "/lol", "/lol/ben", "/forecaster/", "/project/certior"]) assert.ok(isPage(p), p);
  for (const p of ["/nope", "/robots.txt", "/project/nope", "/lol/constructor", "/project", "/wp-login.php"]) assert.ok(!isPage(p), p);
  for (const p of listed.filter((p) => !p.startsWith("/certior/"))) assert.ok(isPage(p), p);      // /certior/* are files
  assert.ok(sitemap().includes("<loc>https://www.benjamintakaki.com/project/certior</loc>"));
});

// Claude's read-only window on Certior's numbers: an MCP server (stdio) that Claude Code starts from .mcp.json.
// It reads the live site with a read-only key, CERTIOR_READ_TOKEN, kept in this repo's .env (never committed) and set
// to the same value on Render. The site takes that key on these two GETs only: it can't post, make Reels or see the
// password. The key only ever goes to the site itself (or a localhost test server).
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import util from "node:util";

const BASE = /^http:\/\/localhost:\d+$/.test(process.env.CERTIOR_BASE || "") ? process.env.CERTIOR_BASE : "https://www.benjamintakaki.com";
let key = process.env.CERTIOR_READ_TOKEN;
try {
  key ||= util.parseEnv(fs.readFileSync(fileURLToPath(new URL("../.env", import.meta.url)), "utf8")).CERTIOR_READ_TOKEN;
} catch {}      // no .env: says so when a tool is used

async function get(path) {
  if (!key) throw new Error("CERTIOR_READ_TOKEN isn't set: it goes in the repo's .env, and the same value on Render");
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${key}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: the site answered ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const TOOLS = {
  reels: {
    description: "Every Reel on Certior's Instagram account, newest first, with Instagram's own numbers: views, reach, "
      + "ig_reels_avg_watch_time (ms), reels_skip_rate (percent of views that scrolled away within 3 s), likes, comments, "
      + "shares, saved, total_interactions. Reels the server posted carry their story's headline and id. Instagram's "
      + "numbers can be up to two days late; errors lists any that didn't load.",
    inputSchema: { type: "object", properties: {} },
    run: () => get("/api/certior/insights"),
  },
  stats: {
    description: "Certior's anonymous daily usage totals per UTC day: visit (devices that day), new, age_* (days since a "
      + "device's first visit), story_watched, story_compared, watched_<side>, share, shared_open, mode_*, homescreen, "
      + "ref:<site> (where visits came from, e.g. ref:instagram) and more. No personal data.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 60, description: "How many recent days (default 14)" } } },
    run: async ({ days = 14 } = {}) => {
      const from = new Date(Date.now() - Math.min(60, Math.max(1, days)) * 864e5).toISOString().slice(0, 10);
      const byDay = {};
      // ponytail: the old path, which the site keeps as an alias; /api/certior/stats once the rename is deployed
      for (const { day, name, n } of (await get("/api/swipe-news/stats")).rows) if (day > from) (byDay[day] ||= {})[name] = n;
      return byDay;
    },
  },
};

// MCP over stdio: one JSON-RPC message per line
const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined) return;      // a notification: no answer
  if (method === "initialize") {
    return send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "certior", version: "1.0.0" } } });
  }
  if (method === "ping") return send({ id, result: {} });
  if (method === "tools/list") {
    const tools = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: true } }));
    return send({ id, result: { tools } });
  }
  if (method === "tools/call") {
    const tool = Object.hasOwn(TOOLS, params?.name) ? TOOLS[params.name] : null;
    if (!tool) return send({ id, error: { code: -32602, message: `there's no tool called ${params?.name}` } });
    try {
      return send({ id, result: { content: [{ type: "text", text: JSON.stringify(await tool.run(params.arguments)) }] } });
    } catch (err) {
      return send({ id, result: { content: [{ type: "text", text: String(err.message || err) }], isError: true } });
    }
  }
  send({ id, error: { code: -32601, message: `${method} isn't supported` } });
});

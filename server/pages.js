// Which addresses are pages of the site: for the sitemap, and so an unknown address answers 404 instead of the home
// page with 200. The project pages come from the same list the site itself draws, so a new project needs nothing here.
import { projects } from "../src/data/projects.js";
import { PLAYERS } from "./players.js";

export const SITE = "https://www.benjamintakaki.com";

// For search engines: the pages meant to be found. /lol (friends' match histories) and the redirects are left out.
export const listed = ["/", ...projects.map((p) => `/project/${p.id}`), "/forecaster", "/privacy", "/certior/", "/certior/how-it-works.html", "/certior/privacy.html"];

/** True if the React app has a page at this path (see the routes in src/App.jsx). */
export function isPage(path) {
  const p = path.replace(/\/+$/, "") || "/";
  if (["/", "/lol", "/forecaster", "/privacy", "/spotifycovergenerator"].includes(p)) return true;
  if (p.startsWith("/project/")) return projects.some((x) => x.id === p.slice(9));
  if (p.startsWith("/lol/")) return Object.hasOwn(PLAYERS, p.slice(5));
  return false;
}

// The pages scripts/prerender.js renders at build time (the lazy ones, /forecaster and /lol, would render only their
// loading line), and the file each one is kept in under dist/prerender.
export const prerendered = listed.filter((p) => p === "/" || p === "/privacy" || p.startsWith("/project/"));
export const prerenderFile = (path) => `${(path.replace(/\/+$/, "") || "/").replace(/\//g, "_")}.html`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** index.html with a case study's own title and description, for link previews (LinkedIn, WhatsApp): their crawlers
 *  don't run the app's script, so without this every shared case study previews as the home page. */
const OWN_HEAD = { "/privacy": ["Privacy", "What this site collects: no cookies, no analytics, nothing beyond the host's logs."] };
export function withHead(html, path) {
  const key = path.replace(/\/+$/, ""), p = projects.find((x) => `/project/${x.id}` === key);
  const [name, summary] = p ? [p.title, p.summary] : OWN_HEAD[key] ?? [];
  if (!name) return html;
  const title = esc(`${name} | Benjamin Takaki`), desc = esc(summary), url = `${SITE}${key}`;
  const set = (attr, value) => (h) => h.replace(new RegExp(`(${attr} content=")[^"]*`), (_, a) => a + value);
  return [set('name="description"', desc), set('property="og:title"', title), set('property="og:description"', desc), set('property="og:url"', url)]
    .reduce((h, f) => f(h), html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`));
}

export const sitemap = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}\n</urlset>\n`;

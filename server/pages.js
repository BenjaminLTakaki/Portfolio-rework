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

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** index.html with a case study's own title and description, for link previews (LinkedIn, WhatsApp): their crawlers
 *  don't run the app's script, so without this every shared case study previews as the home page. */
export function withHead(html, path) {
  const p = projects.find((x) => `/project/${x.id}` === path.replace(/\/+$/, ""));
  if (!p) return html;
  const title = esc(`${p.title} | Benjamin Takaki`), desc = esc(p.summary), url = `${SITE}/project/${p.id}`;
  const set = (attr, value) => (h) => h.replace(new RegExp(`(${attr} content=")[^"]*`), (_, a) => a + value);
  return [set('name="description"', desc), set('property="og:title"', title), set('property="og:description"', desc), set('property="og:url"', url)]
    .reduce((h, f) => f(h), html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`));
}

export const sitemap = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}\n</urlset>\n`;

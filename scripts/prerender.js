// After `vite build` and the server build of src/entry-server.jsx: the HTML of each page meant to be found, in
// dist/prerender/, which the server sends instead of the empty shell. The build fails if a page lost its heading.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { render } from "../dist-ssr/entry-server.js";
import { prerendered, prerenderFile } from "../server/pages.js";
import { projects } from "../src/data/projects.js";

const shell = await readFile("dist/index.html", "utf8");
const ROOT = '<div id="root"></div>';
if (!shell.includes(ROOT)) throw new Error(`dist/index.html has no ${ROOT}`);
const expect = (path) => projects.find((p) => path === `/project/${p.id}`)?.title ?? { "/": "From trained models", "/privacy": "Nothing here tracks you" }[path];

await mkdir("dist/prerender", { recursive: true });
for (const path of prerendered) {
  const html = render(path);
  const heading = expect(path);
  if (!heading || !html.includes(heading)) throw new Error(`prerender ${path}: "${heading}" missing`);
  await writeFile(`dist/prerender/${prerenderFile(path)}`, shell.replace(ROOT, `<div id="root">${html}</div>`));
  console.log(`prerendered ${path} (${Math.round(html.length / 1024)} kB)`);
}

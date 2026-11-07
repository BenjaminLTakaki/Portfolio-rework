// Link previews for shared stories. A shared link (?story=...&clip=...) used to preview as plain "Swipe News"; now the
// page it returns carries that story's headline, one headline per side and the clip's YouTube thumbnail, so a share in
// WhatsApp, iMessage or on social media shows the story itself. Without ?story the page is served as it is.
const FEED_BASE = "https://benjaminltakaki.github.io/swipe-news/";
const SIDES = [["left", "Left"], ["center", "Center"], ["right", "Right"]];
const STORY_ID = /^s_[\w-]{6,40}$/;
const CLIP_ID = /^[\w-]{6,20}$/;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function previewTags(story, clipId) {
  const clip = story.clips.find((c) => c.id === clipId) || story.clips[0];
  const sides = SIDES.map(([col, label]) => {
    const c = story.clips.find((k) => k.column === col);
    return c && `${label} (${c.channel}): ${c.title}`;
  }).filter(Boolean);
  const outlets = new Set(story.clips.map((c) => c.channel)).size;
  const description = sides.length > 1 ? sides.join(" / ") : `${outlets} outlets covered this story. Compare them in Swipe News.`;
  const meta = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
  return [
    `<title>${escapeHtml(story.headline)} | Swipe News</title>`,
    meta("name", "description", description),
    meta("property", "og:title", story.headline),
    meta("property", "og:description", description),
    meta("property", "og:image", `https://i.ytimg.com/vi/${clip.id}/hqdefault.jpg`),
    meta("property", "og:type", "article"),
    meta("name", "twitter:card", "summary_large_image"),
  ].join("\n  ");
}

/** The app's index.html with its title and default preview block (<title> ... <!-- /og -->) swapped for the story's. */
export function withPreview(html, story, clipId) {
  return html.replace(/<title>[\s\S]*?<!-- \/og -->/, () => previewTags(story, clipId));
}

export function makePreview({ readIndex, fetchFn = fetch, now = Date.now, ttlMs = 5 * 60 * 1000, log = console }) {
  const cache = {};
  async function stories(file) {
    const hit = cache[file];
    if (hit && now() - hit.at < ttlMs) return hit.stories;
    const res = await fetchFn(FEED_BASE + file);
    if (!res.ok) throw new Error(`${file} ${res.status}`);
    cache[file] = { at: now(), stories: (await res.json()).stories };
    return cache[file].stories;
  }
  const find = (list, id, clipId) => list.find((s) => s.id === id) || (clipId && list.find((s) => s.clips.some((c) => c.id === clipId)));

  return async (req, res, next) => {
    const id = req.query.story, clipId = CLIP_ID.test(req.query.clip || "") ? req.query.clip : "";
    if (typeof id !== "string" || !STORY_ID.test(id)) return next();
    try {
      // the top stories first; an older shared story is only in the search file (larger, so second)
      const story = find(await stories("feed.json"), id, clipId) || find(await stories("search.json"), id, clipId);
      if (!story) return next();
      res.type("html").set("Cache-Control", "no-cache").send(withPreview(await readIndex(), story, clipId));
    } catch (err) {
      log.error(`[swipe-news] link preview skipped: ${err.message || err}`);
      next();      // the plain page still works
    }
  };
}

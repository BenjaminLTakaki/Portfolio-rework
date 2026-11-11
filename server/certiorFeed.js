// Starts the Swipe News feed build on GitHub. GitHub's own schedule ran once in 12 hours,
// so this server keeps the time instead. Without a token it does nothing.
const DISPATCH_URL =
  "https://api.github.com/repos/BenjaminLTakaki/certior-news/actions/workflows/update-feed.yml/dispatches";
const MIN_GAP_MS = 9 * 60 * 1000; // under the 10 minute cron, so a slightly early tick still fires

export function makeFeedRefresher({ token, fetchFn = fetch, now = Date.now, log = console }) {
  let last = -Infinity;
  return async function refresh() {
    if (!token || now() - last < MIN_GAP_MS) return false;
    last = now();
    try {
      const res = await fetchFn(DISPATCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "benjamintakaki-portfolio",
        },
        body: JSON.stringify({ ref: "main" }),
      });
      if (!res.ok) log.error(`[certior] feed build not started: HTTP ${res.status}`);
      return res.ok;
    } catch (err) {
      log.error(`[certior] feed build not started: ${err.message || err}`);
      return false;
    }
  };
}

// The app moved from /swipe-news to /certior (Swipe News is another app's name). Old links, shared stories and Home
// Screen installs keep working: every old address redirects to the same place under /certior, query and all.
export function movedTo(newBase) {
  return (req, res) => res.redirect(301, newBase + req.url);
}

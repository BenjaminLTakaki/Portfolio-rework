// Single source of truth for the players shown on the /lol dashboards.
// Add a new player here and they get an API route + page automatically
// (after a one-time back-fill of their match history).

export const PLAYERS = {
  ben: {
    key: "ben",
    name: "Ben",
    riotId: "NoAnimeNoLife#ANIME",
    gameName: "NoAnimeNoLife",
    tagLine: "ANIME",
    role: "TOP",
  },
  raf: {
    key: "raf",
    name: "Raf",
    riotId: "FrogChango#GOAT",
    gameName: "FrogChango",
    tagLine: "GOAT",
    role: "JUNGLE",
  },
};

export function getPlayer(key) {
  return PLAYERS[key] || null;
}

// Public-facing subset (no internal fields beyond what the UI needs).
export function publicPlayer(key) {
  const p = PLAYERS[key];
  if (!p) return null;
  return { key: p.key, name: p.name, riotId: p.riotId, role: p.role };
}

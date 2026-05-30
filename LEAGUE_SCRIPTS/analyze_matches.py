"""
analyze_matches.py
==================
Reads the locally saved matches.json file (produced by download_matches.py)
and prints a chronological rank tier progression — the first game played at
each new tier, with the date it was reached.

No API calls are made. Runs instantly from local data.

Tier order (low → high):
  IRON → BRONZE → SILVER → GOLD → PLATINUM → EMERALD → DIAMOND → MASTER
  → GRANDMASTER → CHALLENGER
"""

import json
from pathlib import Path
from datetime import datetime, timezone

import riot_common as rc


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MATCHES_FILE = rc.MATCHES_FILE  # <repo>/public/lol/matches.json

# Ordered list of tiers from lowest to highest
TIER_ORDER = [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
]

# Emoji per tier for a nicer display
TIER_EMOJI = {
    "IRON"        : "⚙️ ",
    "BRONZE"      : "🥉",
    "SILVER"      : "🥈",
    "GOLD"        : "🥇",
    "PLATINUM"    : "💠",
    "EMERALD"     : "💚",
    "DIAMOND"     : "💎",
    "MASTER"      : "🔮",
    "GRANDMASTER" : "🏆",
    "CHALLENGER"  : "🌟",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def tier_rank(tier: str) -> int:
    """Return numeric rank for a tier string (higher = better). Unknown = -1."""
    try:
        return TIER_ORDER.index(tier.upper())
    except ValueError:
        return -1


def load_matches(path: Path) -> list[dict]:
    """Load matches from JSON file, sorted oldest → newest by timestamp."""
    if not path.exists():
        raise SystemExit(
            f"❌ '{path}' not found.\n"
            f"   Run download_matches.py first to generate it."
        )

    with open(path, "r", encoding="utf-8") as f:
        matches = json.load(f)

    if not matches:
        raise SystemExit("❌ matches.json is empty. Nothing to analyze.")

    # Sort by timestamp ascending (oldest first) — should already be sorted
    # from download_matches.py, but enforce it here for safety
    matches.sort(key=lambda m: m["timestamp"])
    return matches


# ---------------------------------------------------------------------------
# Core analysis — tier progression
# ---------------------------------------------------------------------------

def analyze_tier_progression(matches: list[dict]) -> list[dict]:
    """
    Walk through matches chronologically and detect the first game played
    at each new (higher) tier.

    Returns:
        List of dicts with keys: tier, date_utc, match_id, champion, win
        One entry per tier reached, in chronological order.
    """
    progression = []
    highest_tier_seen = -1  # Numeric index into TIER_ORDER

    for match in matches:
        tier = match.get("tier", "UNKNOWN").upper()

        if tier == "UNKNOWN":
            continue  # Skip matches where tier data wasn't available

        rank = tier_rank(tier)

        if rank > highest_tier_seen:
            # New highest tier reached — record it
            highest_tier_seen = rank
            progression.append({
                "tier"    : tier,
                "date_utc": match["date_utc"],
                "match_id": match["match_id"],
                "champion": match["champion"],
                "win"     : match["win"],
                "division": match.get("division", "?"),
            })

    return progression


# ---------------------------------------------------------------------------
# Additional stats
# ---------------------------------------------------------------------------

def compute_stats(matches: list[dict]) -> dict:
    """Compute a few interesting summary stats from the match list."""
    total      = len(matches)
    wins       = sum(1 for m in matches if m.get("win"))
    losses     = total - wins
    winrate    = (wins / total * 100) if total > 0 else 0

    kills   = sum(m.get("kills",   0) for m in matches)
    deaths  = sum(m.get("deaths",  0) for m in matches)
    assists = sum(m.get("assists", 0) for m in matches)
    kda     = (kills + assists) / deaths if deaths > 0 else float("inf")

    # Most played champion
    champ_counts: dict[str, int] = {}
    for m in matches:
        c = m.get("champion", "Unknown")
        champ_counts[c] = champ_counts.get(c, 0) + 1
    most_played = max(champ_counts, key=champ_counts.get) if champ_counts else "N/A"
    most_played_count = champ_counts.get(most_played, 0)

    # Date range
    oldest = matches[0]["date_utc"]  if matches else "N/A"
    newest = matches[-1]["date_utc"] if matches else "N/A"

    return {
        "total"            : total,
        "wins"             : wins,
        "losses"           : losses,
        "winrate"          : winrate,
        "kills"            : kills,
        "deaths"           : deaths,
        "assists"          : assists,
        "kda"              : kda,
        "most_played"      : most_played,
        "most_played_count": most_played_count,
        "oldest_game"      : oldest,
        "newest_game"      : newest,
    }


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

def print_progression(progression: list[dict]) -> None:
    print("=" * 65)
    print("  📈 RANK TIER PROGRESSION")
    print("  (First game recorded at each new tier)")
    print("=" * 65)

    if not progression:
        print("  No tier progression data found.")
        print("  This may mean tier data was missing from match responses.")
        return

    for entry in progression:
        tier    = entry["tier"]
        emoji   = TIER_EMOJI.get(tier, "  ")
        champ   = entry["champion"]
        result  = "✅ Win" if entry["win"] else "❌ Loss"
        date    = entry["date_utc"]
        div     = entry["division"]

        print(f"\n  {emoji}  {tier} {div}")
        print(f"      📅 {date}")
        print(f"      🎮 {champ} — {result}")
        print(f"      🔗 {entry['match_id']}")

    print()


def print_stats(stats: dict) -> None:
    print("=" * 65)
    print("  📊 OVERALL STATS (from downloaded history)")
    print("=" * 65)
    print(f"  Total games   : {stats['total']}")
    print(f"  Wins / Losses : {stats['wins']}W / {stats['losses']}L  "
          f"({stats['winrate']:.1f}% WR)")
    print(f"  Avg KDA       : {stats['kills']/stats['total']:.1f} / "
          f"{stats['deaths']/stats['total']:.1f} / "
          f"{stats['assists']/stats['total']:.1f}  "
          f"(ratio: {stats['kda']:.2f})")
    print(f"  Most played   : {stats['most_played']} ({stats['most_played_count']} games)")
    print(f"  Oldest game   : {stats['oldest_game']}")
    print(f"  Newest game   : {stats['newest_game']}")
    print("=" * 65)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 65)
    print("  Riot Games — Match Analyzer (offline)")
    print("=" * 65)
    print(f"  Reading from: {MATCHES_FILE.resolve()}\n")

    matches     = load_matches(MATCHES_FILE)
    progression = analyze_tier_progression(matches)
    stats       = compute_stats(matches)

    print_progression(progression)
    print_stats(stats)


if __name__ == "__main__":
    main()
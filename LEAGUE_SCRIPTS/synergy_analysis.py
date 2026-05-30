"""
synergy_analysis.py
===================
Reads the cached team compositions (public/lol/match_teams.json, produced by
download_team_comps.py) and computes, across all your games, your winrate when
each champion is:

  - on YOUR team   (ally)  → is this champ good to have as a teammate?
  - on the ENEMY team      → how often do you win when facing this champ?

No API calls — runs instantly from the local cache.

Output file: public/lol/champion_synergy.json  (consumed by the website)

Output shape:
  {
    "generated_utc": "...",
    "total_games": 639,
    "min_games": 5,                       # threshold used for best/worst picks
    "as_ally":  [ {champion, games, wins, winrate}, ... ],   # all, sorted desc
    "as_enemy": [ {champion, games, wins, winrate}, ... ],   # all, sorted desc
    "highlights": {
      "best_allies":   [...],   # highest winrate WITH them on your team
      "worst_allies":  [...],   # lowest  winrate WITH them on your team
      "easiest_enemies": [...], # highest winrate when they're AGAINST you
      "hardest_enemies": [...], # lowest  winrate when they're AGAINST you
    }
  }

Note on interpretation: this is correlational, not causal — a champion can look
like a "great ally" simply because it was meta/strong during the games you
happened to win. The min_games threshold keeps tiny sample sizes out of the
highlight lists. "winrate" is a fraction in [0, 1]; multiply by 100 for %.
"""

import json
from collections import defaultdict
from datetime import datetime, timezone

import riot_common as rc

INPUT_FILE   = rc.DATA_DIR / "match_teams.json"
OUTPUT_FILE  = rc.DATA_DIR / "champion_synergy.json"

# Minimum games with/against a champion before it's eligible for the highlight
# lists. Stops a single 1-0 game from topping the "best ally" chart.
MIN_GAMES    = 5
HIGHLIGHT_N  = 10  # how many entries per highlight list


def tally(matches: list[dict], side: str) -> dict[str, dict]:
    """
    side == "allies" or "enemies".
    Returns {champion: {"games": n, "wins": w}} aggregating your result over
    every game where that champion appeared on the given side.
    """
    stats: dict[str, dict] = defaultdict(lambda: {"games": 0, "wins": 0})
    for m in matches:
        won = m["win"]
        # A champ can appear at most once per team; set() guards mirror oddities.
        for champ in set(m[side]):
            stats[champ]["games"] += 1
            if won:
                stats[champ]["wins"] += 1
    return stats


def to_rows(stats: dict[str, dict]) -> list[dict]:
    """Convert the tally into sorted rows with a winrate fraction."""
    rows = [
        {
            "champion": champ,
            "games": s["games"],
            "wins": s["wins"],
            "winrate": round(s["wins"] / s["games"], 4),
        }
        for champ, s in stats.items()
    ]
    # Sort by winrate desc, then by sample size desc as a tiebreaker.
    rows.sort(key=lambda r: (r["winrate"], r["games"]), reverse=True)
    return rows


def main() -> None:
    if not INPUT_FILE.exists():
        raise SystemExit(
            f"❌ {INPUT_FILE} not found.\n"
            "   Run  python download_team_comps.py  first to build the cache."
        )

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        matches = json.load(f)

    ally_rows  = to_rows(tally(matches, "allies"))
    enemy_rows = to_rows(tally(matches, "enemies"))

    eligible_allies  = [r for r in ally_rows  if r["games"] >= MIN_GAMES]
    eligible_enemies = [r for r in enemy_rows if r["games"] >= MIN_GAMES]

    result = {
        "generated_utc": datetime.now(timezone.utc)
                                 .strftime("%A, %d %B %Y at %H:%M UTC"),
        "total_games": len(matches),
        "min_games": MIN_GAMES,
        "as_ally":  ally_rows,
        "as_enemy": enemy_rows,
        "highlights": {
            "best_allies":     eligible_allies[:HIGHLIGHT_N],
            "worst_allies":    eligible_allies[-HIGHLIGHT_N:][::-1],
            "easiest_enemies": eligible_enemies[:HIGHLIGHT_N],
            "hardest_enemies": eligible_enemies[-HIGHLIGHT_N:][::-1],
        },
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # --- Console summary -----------------------------------------------------
    def show(title: str, rows: list[dict]) -> None:
        print(f"\n{title}")
        for r in rows:
            print(f"  {r['winrate']*100:5.1f}%  {r['champion']:<14} "
                  f"({r['wins']}/{r['games']})")

    print("=" * 55)
    print(f"  Champion synergy — {len(matches)} games "
          f"(min {MIN_GAMES} games for highlights)")
    print("=" * 55)
    show("🟢 Best allies to have on YOUR team:",  result["highlights"]["best_allies"])
    show("🔴 Worst allies to have on YOUR team:", result["highlights"]["worst_allies"])
    show("😄 Easiest enemies (you win most vs):", result["highlights"]["easiest_enemies"])
    show("💀 Hardest enemies (you lose most vs):", result["highlights"]["hardest_enemies"])
    print(f"\n✅ Full results written to '{OUTPUT_FILE}'.")


if __name__ == "__main__":
    main()

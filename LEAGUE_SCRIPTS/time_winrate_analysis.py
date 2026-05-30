"""
time_winrate_analysis.py
========================
Reads the locally saved matches.json (produced by download_matches.py) and
works out WHAT TIME OF DAY you win the most — and the times you win the least.

Each match has an epoch-millisecond `timestamp`. That instant is converted to
your machine's LOCAL time, then games are bucketed by hour of day (0–23) and by
broader parts of the day. For each bucket the win rate is computed and the
best / worst times are highlighted.

No API calls. Runs entirely offline.

Usage:
    python time_winrate_analysis.py
    python time_winrate_analysis.py --min-games 15   # ignore thin buckets
    python time_winrate_analysis.py --utc            # bucket by UTC, not local
"""

import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

import riot_common as rc

MATCHES_FILE = rc.MATCHES_FILE  # <repo>/public/lol/matches.json

# Broader parts of the day (start hour inclusive, end hour exclusive)
DAY_PARTS = [
    ("Night       (00:00-06:00)", range(0, 6)),
    ("Morning     (06:00-12:00)", range(6, 12)),
    ("Afternoon   (12:00-18:00)", range(12, 18)),
    ("Evening     (18:00-24:00)", range(18, 24)),
]


def load_matches(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(
            f"X '{path}' not found.\n   Run download_matches.py first to generate it."
        )
    with open(path, "r", encoding="utf-8") as f:
        matches = json.load(f)
    if not matches:
        raise SystemExit("X matches.json is empty. Nothing to analyze.")
    return matches


def local_hour(ts_ms: int, use_utc: bool) -> int:
    """Convert an epoch-ms timestamp to the hour of day (0–23)."""
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    if not use_utc:
        dt = dt.astimezone()  # convert to machine local timezone
    return dt.hour


def winrate_bar(wr: float, width: int = 20) -> str:
    filled = round(wr / 100 * width)
    return "#" * filled + "-" * (width - filled)


def summarize(buckets: dict[int, list[bool]], min_games: int):
    """Return list of (hour, games, wins, winrate) for buckets meeting min_games."""
    rows = []
    for hour in range(24):
        results = buckets.get(hour, [])
        games = len(results)
        if games == 0:
            continue
        wins = sum(results)
        wr = wins / games * 100
        rows.append((hour, games, wins, wr, games >= min_games))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Win rate by time of day.")
    parser.add_argument("--min-games", type=int, default=10,
                        help="Minimum games for a time bucket to count as reliable (default 10).")
    parser.add_argument("--utc", action="store_true",
                        help="Bucket by UTC instead of local machine time.")
    args = parser.parse_args()

    matches = load_matches(MATCHES_FILE)
    use_utc = args.utc
    tz_label = "UTC" if use_utc else "LOCAL machine time"

    # Bucket games by hour of day
    by_hour: dict[int, list[bool]] = {h: [] for h in range(24)}
    for m in matches:
        h = local_hour(m["timestamp"], use_utc)
        by_hour[h].append(bool(m.get("win")))

    total = len(matches)
    total_wins = sum(1 for m in matches if m.get("win"))

    print("=" * 64)
    print("  WIN RATE BY TIME OF DAY")
    print(f"  ({tz_label}  |  {total} games  |  {total_wins/total*100:.1f}% overall WR)")
    print("=" * 64)

    # ---- Per-hour table ----
    print("\n  Hour   Games   W-L      WinRate")
    print("  " + "-" * 56)
    rows = summarize(by_hour, args.min_games)
    for hour, games, wins, wr, reliable in rows:
        mark = " " if reliable else "*"
        losses = games - wins
        print(f"  {hour:02d}:00  {games:4d}   {wins:3d}-{losses:<3d}  "
              f"{wr:5.1f}%  {winrate_bar(wr)} {mark}")
    print("\n  * = fewer than %d games, treat as unreliable" % args.min_games)

    # ---- Parts of the day ----
    print("\n" + "=" * 64)
    print("  BY PART OF DAY")
    print("=" * 64)
    for label, hours in DAY_PARTS:
        results = [r for h in hours for r in by_hour[h]]
        games = len(results)
        if games == 0:
            print(f"  {label}:  no games")
            continue
        wins = sum(results)
        wr = wins / games * 100
        print(f"  {label}:  {games:4d} games   {wr:5.1f}%  {winrate_bar(wr)}")

    # ---- Best / worst reliable hours ----
    reliable_rows = [r for r in rows if r[4]]  # only buckets meeting min_games
    print("\n" + "=" * 64)
    print(f"  VERDICT  (hours with >= {args.min_games} games)")
    print("=" * 64)
    if not reliable_rows:
        print("  Not enough games in any single hour to call it reliably.")
        print("  Try a lower --min-games, or look at the parts-of-day table above.")
        return

    best = max(reliable_rows, key=lambda r: r[3])
    worst = min(reliable_rows, key=lambda r: r[3])

    print(f"  BEST  time to play : {best[0]:02d}:00–{best[0]:02d}:59  "
          f"-> {best[3]:.1f}% WR  ({best[2]}-{best[1]-best[2]} over {best[1]} games)")
    print(f"  WORST time to play : {worst[0]:02d}:00–{worst[0]:02d}:59  "
          f"-> {worst[3]:.1f}% WR  ({worst[2]}-{worst[1]-worst[2]} over {worst[1]} games)")

    # Best/worst part of day too
    part_stats = []
    for label, hours in DAY_PARTS:
        results = [r for h in hours for r in by_hour[h]]
        if results:
            part_stats.append((label.split("(")[0].strip(), sum(results) / len(results) * 100, len(results)))
    if part_stats:
        bp = max(part_stats, key=lambda x: x[1])
        wp = min(part_stats, key=lambda x: x[1])
        print(f"\n  Best part of day   : {bp[0]:<11} {bp[1]:.1f}% WR")
        print(f"  Worst part of day  : {wp[0]:<11} {wp[1]:.1f}% WR")
    print("=" * 64)


if __name__ == "__main__":
    main()

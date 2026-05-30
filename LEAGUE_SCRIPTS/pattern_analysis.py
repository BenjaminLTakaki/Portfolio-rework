"""
pattern_analysis.py
===================
Analyzes win/loss patterns from a locally saved matches.json file
(produced by download_matches.py — Ranked Solo/Duo only, queue 420).

Detects three pattern types chronologically:
  1. WIN STREAKS      — 4+ consecutive wins
  2. LOSS STREAKS     — 4+ consecutive losses
  3. VOLATILE PERIODS — sliding 10-game windows where results keep
                        flipping with no clear direction (winrate 35–65%
                        within the window), merged into continuous blocks

No API calls. Runs entirely offline.
"""

from pathlib import Path
import json

import riot_common as rc


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MATCHES_FILE       = rc.MATCHES_FILE  # <repo>/public/lol/matches.json
STREAK_THRESHOLD   = 4     # Min consecutive same results to be a streak
WINDOW_SIZE        = 10    # Sliding window size for volatile detection
VOLATILE_LOW       = 0.35  # Window winrate below this = loss-streaky, not volatile
VOLATILE_HIGH      = 0.65  # Window winrate above this = win-streaky, not volatile


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------

def load_matches(path: Path) -> list[dict]:
    """Load matches from JSON, sorted oldest → newest."""
    if not path.exists():
        raise SystemExit(
            f"❌ '{path}' not found.\n"
            "   Run download_matches.py first."
        )
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.sort(key=lambda m: m["timestamp"])
    return data


# ---------------------------------------------------------------------------
# Pattern detection
# ---------------------------------------------------------------------------

def detect_streaks(results: list[bool], dates: list[str], champions: list[str]):
    """
    Scan through results and detect win/loss streaks of STREAK_THRESHOLD+.

    Returns a list of streak dicts with type, start/end index, length, dates.
    """
    streaks = []
    i = 0
    n = len(results)

    while i < n:
        j = i + 1
        # Extend while same result
        while j < n and results[j] == results[i]:
            j += 1

        length = j - i
        if length >= STREAK_THRESHOLD:
            streaks.append({
                "type"      : "WIN STREAK" if results[i] else "LOSS STREAK",
                "start_idx" : i,
                "end_idx"   : j - 1,
                "length"    : length,
                "start_date": dates[i],
                "end_date"  : dates[j - 1],
                "champions" : champions[i:j],
            })
        i = j

    return streaks


def detect_volatile_periods(results: list[bool], dates: list[str]):
    """
    Slide a window of WINDOW_SIZE across results. Any window whose winrate
    falls between VOLATILE_LOW and VOLATILE_HIGH is considered volatile
    (neither winning nor losing consistently — results keep flipping).

    Adjacent volatile windows are merged into continuous blocks.

    Returns a list of volatile period dicts.
    """
    n = len(results)
    volatile_indices = set()

    for i in range(n - WINDOW_SIZE + 1):
        window = results[i : i + WINDOW_SIZE]
        winrate = sum(window) / WINDOW_SIZE
        if VOLATILE_LOW < winrate < VOLATILE_HIGH:
            for idx in range(i, i + WINDOW_SIZE):
                volatile_indices.add(idx)

    if not volatile_indices:
        return []

    # Merge contiguous volatile index ranges into blocks
    sorted_indices = sorted(volatile_indices)
    periods = []
    block_start = sorted_indices[0]
    prev = sorted_indices[0]

    for idx in sorted_indices[1:]:
        if idx > prev + 1:
            periods.append((block_start, prev))
            block_start = idx
        prev = idx
    periods.append((block_start, prev))

    # Build result dicts
    volatile_periods = []
    for start, end in periods:
        segment   = results[start : end + 1]
        wins      = sum(segment)
        losses    = len(segment) - wins
        volatile_periods.append({
            "start_idx" : start,
            "end_idx"   : end,
            "length"    : end - start + 1,
            "wins"      : wins,
            "losses"    : losses,
            "start_date": dates[start],
            "end_date"  : dates[end],
        })

    return volatile_periods


def build_flip_pattern(results: list[bool], start: int, end: int) -> str:
    """
    Build a compact W/L string for a segment, e.g. 'WWLWLLWLWL'.
    Caps at 20 chars with '…' if longer.
    """
    segment = results[start : end + 1]
    pattern = "".join("W" if r else "L" for r in segment)
    if len(pattern) > 20:
        return pattern[:20] + "…"
    return pattern


def count_flips(results: list[bool], start: int, end: int) -> int:
    """Count how many times the result changes within a segment."""
    segment = results[start : end + 1]
    return sum(1 for i in range(1, len(segment)) if segment[i] != segment[i - 1])


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

def print_streaks(streaks: list[dict]) -> None:
    if not streaks:
        print("  None found.\n")
        return

    win_streaks  = [s for s in streaks if s["type"] == "WIN STREAK"]
    loss_streaks = [s for s in streaks if s["type"] == "LOSS STREAK"]

    # --- Win streaks ---
    print(f"  {'✅ WIN STREAKS':}")
    print(f"  {'─' * 56}")
    if not win_streaks:
        print("  None found.\n")
    else:
        for s in win_streaks:
            champs = ", ".join(dict.fromkeys(s["champions"]))  # Unique, ordered
            print(f"  🔥 {s['length']}-game win streak")
            print(f"     From : {s['start_date']}")
            print(f"     To   : {s['end_date']}")
            print(f"     Champs: {champs}")
            print()

    # --- Loss streaks ---
    print(f"  {'❌ LOSS STREAKS':}")
    print(f"  {'─' * 56}")
    if not loss_streaks:
        print("  None found.\n")
    else:
        for s in loss_streaks:
            champs = ", ".join(dict.fromkeys(s["champions"]))
            print(f"  💀 {s['length']}-game loss streak")
            print(f"     From : {s['start_date']}")
            print(f"     To   : {s['end_date']}")
            print(f"     Champs: {champs}")
            print()


def print_volatile(volatile: list[dict], results: list[bool]) -> None:
    if not volatile:
        print("  None found.\n")
        return

    for v in volatile:
        pattern = build_flip_pattern(results, v["start_idx"], v["end_idx"])
        flips   = count_flips(results, v["start_idx"], v["end_idx"])
        wr      = v["wins"] / v["length"] * 100

        print(f"  🔀 {v['length']}-game volatile period  ({v['wins']}W / {v['losses']}L — {wr:.0f}% WR, {flips} flips)")
        print(f"     From   : {v['start_date']}")
        print(f"     To     : {v['end_date']}")
        print(f"     Pattern: {pattern}")
        print()


def print_summary(streaks: list[dict], volatile: list[dict], total: int) -> None:
    win_streaks  = [s for s in streaks if s["type"] == "WIN STREAK"]
    loss_streaks = [s for s in streaks if s["type"] == "LOSS STREAK"]

    longest_win  = max((s["length"] for s in win_streaks),  default=0)
    longest_loss = max((s["length"] for s in loss_streaks), default=0)
    longest_vol  = max((v["length"] for v in volatile),     default=0)

    print("=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print(f"  Total games analysed : {total}")
    print(f"  Win streaks (4+)     : {len(win_streaks)}  (longest: {longest_win} games)")
    print(f"  Loss streaks (4+)    : {len(loss_streaks)}  (longest: {longest_loss} games)")
    print(f"  Volatile periods     : {len(volatile)}  (longest: {longest_vol} games)")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("  Riot Games — Win/Loss Pattern Analyser")
    print("  (Ranked Solo/Duo | Offline)")
    print("=" * 60 + "\n")

    matches  = load_matches(MATCHES_FILE)
    total    = len(matches)

    results   = [m["win"]      for m in matches]
    dates     = [m["date_utc"] for m in matches]
    champions = [m["champion"] for m in matches]

    streaks  = detect_streaks(results, dates, champions)
    volatile = detect_volatile_periods(results, dates)

    # --- Print streaks ---
    print("=" * 60)
    print("  STREAKS  (4+ consecutive wins or losses)")
    print("=" * 60 + "\n")
    print_streaks(streaks)

    # --- Print volatile periods ---
    print("=" * 60)
    print("  VOLATILE PERIODS  (back-and-forth, no clear direction)")
    print("=" * 60 + "\n")
    print_volatile(volatile, results)

    # --- Summary ---
    print_summary(streaks, volatile, total)


if __name__ == "__main__":
    main()
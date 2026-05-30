"""
update_data.py
==============
Incremental daily updater for the website's League dashboard.

Unlike download_matches.py (which back-fills an entire history), this script is
built to run every day and do the minimum work:

  1. Resolve the Riot ID -> PUUID.
  2. Pull recent Ranked Solo/Duo match IDs (newest first), stopping early once
     it has seen enough already-known matches — so a daily run usually fetches
     only a handful of new games.
  3. For each genuinely new match, fetch the detail ONCE and update both
     data files the website reads:
       - public/lol/matches.json    (slim per-game stats)
       - public/lol/top_games.json  (top-lane matchup data, when you played TOP)
  4. Re-sort matches.json oldest -> newest and write both files atomically.

Credentials come from LEAGUE_SCRIPTS/.env locally, or from environment variables
(RIOT_API_KEY, RIOT_GAME_NAME, RIOT_TAG_LINE) in CI.

Run:
    python update_data.py
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

import riot_common as rc
from download_team_comps import extract_teams  # reuse the ally/enemy splitter

# Champions commonly played as ranged tops (kept in sync with top_lane_analysis).
RANGED_TOP_CHAMPS = {
    "Teemo", "Vayne", "Quinn", "Kennen", "Gnar", "Kayle", "Jayce",
    "Gangplank", "Vladimir", "Heimerdinger", "Ryze", "Karma", "Lissandra",
    "Akshan", "Cassiopeia", "Graves", "Lucian", "Ezreal", "Smolder",
    "Hwei", "Zoe", "Viktor", "Orianna", "Syndra", "Azir", "Corki",
    "Tristana", "Caitlyn", "Ashe", "Jhin", "Senna",
}

# When doing a daily update we don't need the full history — pull a few recent
# pages at most. If a match this far back is still unknown, we assume a longer
# gap and let the loop keep paging until it runs into known matches.
RECENT_LOOKBACK = 200


# ---------------------------------------------------------------------------
# Local JSON helpers
# ---------------------------------------------------------------------------

def load_json_list(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json_list(path: Path, data: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp.replace(path)  # atomic on the same filesystem


# ---------------------------------------------------------------------------
# Extractors (mirror download_matches.py / top_lane_analysis.py)
# ---------------------------------------------------------------------------

def extract_match_data(raw: dict, puuid: str) -> dict | None:
    info = raw["info"]
    participant = next((p for p in info["participants"] if p["puuid"] == puuid), None)
    if participant is None:
        return None

    ts_ms = info["gameCreation"]
    dt = datetime.datetime.fromtimestamp(ts_ms / 1000, tz=datetime.timezone.utc)

    return {
        "match_id": raw["metadata"]["matchId"],
        "timestamp": ts_ms,
        "date_utc": dt.strftime("%A, %d %B %Y at %H:%M UTC"),
        "duration_mins": round(info["gameDuration"] / 60, 1),
        "champion": participant["championName"],
        "tier": participant.get("tier", "UNKNOWN"),
        "division": participant.get("rank", "UNKNOWN"),
        "win": participant["win"],
        "kills": participant["kills"],
        "deaths": participant["deaths"],
        "assists": participant["assists"],
    }


def extract_top_info(raw: dict, puuid: str) -> dict | None:
    info = raw["info"]
    participants = info["participants"]

    me = next((p for p in participants if p["puuid"] == puuid), None)
    if me is None or me.get("teamPosition", "").upper() != "TOP":
        return None

    enemy_top = next(
        (p for p in participants
         if p["teamId"] != me["teamId"]
         and p.get("teamPosition", "").upper() == "TOP"),
        None,
    )
    enemy_champ = enemy_top["championName"] if enemy_top else "Unknown"

    ts_ms = info["gameCreation"]
    dt = datetime.datetime.fromtimestamp(ts_ms / 1000, tz=datetime.timezone.utc)

    return {
        "match_id": raw["metadata"]["matchId"],
        "date_utc": dt.strftime("%A, %d %B %Y at %H:%M UTC"),
        "win": me["win"],
        "your_champion": me["championName"],
        "enemy_top": enemy_champ,
        "enemy_is_ranged": enemy_champ in RANGED_TOP_CHAMPS,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    api_key, game_name, tag_line = rc.get_credentials()

    print("=" * 65)
    print("  Riot Games — Daily Incremental Updater")
    print("=" * 65)
    print(f"  Player    : {game_name}#{tag_line}")
    print(f"  matches   : {rc.MATCHES_FILE}")
    print(f"  top_games : {rc.TOP_GAMES_FILE}")
    print("=" * 65 + "\n")

    match_teams_file = rc.DATA_DIR / "match_teams.json"

    matches = load_json_list(rc.MATCHES_FILE)
    top_games = load_json_list(rc.TOP_GAMES_FILE)
    match_teams = load_json_list(match_teams_file)

    known_match_ids = {m["match_id"] for m in matches}
    known_top_ids = {g["match_id"] for g in top_games}
    known_team_ids = {t["match_id"] for t in match_teams}

    puuid = rc.get_puuid(game_name, tag_line, api_key)

    # Pull recent IDs. get_all_match_ids returns newest-first; we only need the
    # ones we haven't processed yet.
    recent_ids = rc.get_all_match_ids(puuid, api_key, max_count=RECENT_LOOKBACK)
    new_ids = [mid for mid in recent_ids if mid not in known_match_ids]

    if not new_ids:
        print("✅ No new matches since last run. Data is already up to date.")
        return

    print(f"📥 {len(new_ids)} new match(es) to fetch.\n")

    url = f"{rc.REGIONAL_HOST}/lol/match/v5/matches"
    added_matches = 0
    added_top = 0
    added_teams = 0

    # Oldest new match first, so appended order stays chronological-ish before
    # the final sort.
    for match_id in reversed(new_ids):
        raw = rc.get(f"{url}/{match_id}", params={}, api_key=api_key)

        slim = extract_match_data(raw, puuid)
        if slim and slim["match_id"] not in known_match_ids:
            matches.append(slim)
            known_match_ids.add(slim["match_id"])
            added_matches += 1

        top = extract_top_info(raw, puuid)
        if top and top["match_id"] not in known_top_ids:
            top_games.append(top)
            known_top_ids.add(top["match_id"])
            added_top += 1

        # Same raw response → no extra API call. Powers champion_synergy.json.
        teams = extract_teams(raw, puuid)
        if teams and teams["match_id"] not in known_team_ids:
            match_teams.append(teams)
            known_team_ids.add(teams["match_id"])
            added_teams += 1

        tag = "TOP" if top else "   "
        result = "Win " if slim and slim["win"] else "Loss"
        print(f"  + {match_id}  {result}  {slim['champion'] if slim else '?':14} [{tag}]")

    # Keep matches.json sorted oldest -> newest for the analysis scripts/site.
    matches.sort(key=lambda m: m["timestamp"])
    match_teams.sort(key=lambda t: t["timestamp"])

    write_json_list(rc.MATCHES_FILE, matches)
    write_json_list(rc.TOP_GAMES_FILE, top_games)
    write_json_list(match_teams_file, match_teams)

    print(
        f"\n✅ Done. +{added_matches} match(es), +{added_top} top-lane game(s), "
        f"+{added_teams} team comp(s). "
        f"Totals: {len(matches)} matches, {len(top_games)} top games, "
        f"{len(match_teams)} team comps."
    )


if __name__ == "__main__":
    main()

"""
top_lane_analysis.py
====================
Fetches all Ranked Solo/Duo matches for a given Riot ID, filters to
games where YOU played TOP lane, and reports:

  - Total top lane games
  - Games vs a ranged top laner
  - Games vs a melee top laner
  - Winrate in each category
  - Which ranged tops you faced most

Resume support: saves progress to top_games.json after every match so
interruptions never lose more than one match of work.

Routing: https://europe.api.riotgames.com (Account-V1 + Match-V5)
"""

import time
import json
import requests
from pathlib import Path

import riot_common as rc


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REGIONAL_HOST = "https://europe.api.riotgames.com"
QUEUE_RANKED  = 420
PAGE_SIZE     = 100
OUTPUT_FILE   = rc.TOP_GAMES_FILE  # <repo>/public/lol/top_games.json
DEFAULT_RETRY = 10

# Hardcoded list of champions commonly played as ranged tops.
# Includes both dedicated ranged tops and frequent flex picks.
RANGED_TOP_CHAMPS = {
    "Teemo", "Vayne", "Quinn", "Kennen", "Gnar", "Kayle", "Jayce",
    "Gangplank",  # has ranged poke
    "Vladimir",   # technically melee but played like ranged
    "Heimerdinger", "Ryze", "Karma", "Lissandra", "Akshan",
    "Cassiopeia", "Graves", "Lucian", "Ezreal", "Smolder",
    "Hwei", "Zoe", "Viktor", "Orianna", "Syndra", "Azir",
    "Corki", "Tristana", "Caitlyn", "Ashe", "Jhin", "Senna",
}


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _get(url: str, params: dict, api_key: str) -> dict | list:
    """GET with automatic rate-limit retry via Retry-After header."""
    headers = {"X-Riot-Token": api_key}
    while True:
        response = requests.get(url, headers=headers, params=params, timeout=10)

        if response.status_code == 200:
            return response.json()

        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", DEFAULT_RETRY))
            print(f"    [Rate limit] Waiting {retry_after}s…")
            time.sleep(retry_after)
            continue

        if response.status_code == 401:
            raise SystemExit("❌ Error 401 — Invalid API key.")
        if response.status_code == 403:
            raise SystemExit("❌ Error 403 — Forbidden / expired key.")
        if response.status_code == 404:
            raise SystemExit("❌ Error 404 — Player not found.")

        raise SystemExit(f"❌ Unexpected {response.status_code}: {response.text}")


# ---------------------------------------------------------------------------
# Step 1 — Resolve Riot ID → PUUID
# ---------------------------------------------------------------------------

def get_puuid(game_name: str, tag_line: str, api_key: str) -> str:
    url  = f"{REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
    data = _get(url, params={}, api_key=api_key)
    puuid = data["puuid"]
    print(f"✅ Resolved '{game_name}#{tag_line}' → PUUID: {puuid[:16]}…\n")
    return puuid


# ---------------------------------------------------------------------------
# Step 2 — Collect all Ranked Solo match IDs
# ---------------------------------------------------------------------------

def get_all_match_ids(puuid: str, api_key: str) -> list[str]:
    url     = f"{REGIONAL_HOST}/lol/match/v5/matches/by-puuid/{puuid}/ids"
    all_ids = []
    start   = 0

    print("🔍 Collecting all Ranked Solo/Duo match IDs…\n")

    while True:
        params = {"queue": QUEUE_RANKED, "start": start, "count": PAGE_SIZE}
        page: list[str] = _get(url, params=params, api_key=api_key)

        if not page:
            break

        all_ids.extend(page)
        print(f"  Page at {start:>5}: {len(page):>3} IDs  (total: {len(all_ids)})")

        if len(page) < PAGE_SIZE:
            break

        start += PAGE_SIZE

    print(f"\n✅ {len(all_ids)} match IDs collected.\n")
    return all_ids


# ---------------------------------------------------------------------------
# Step 3 — Load existing progress
# ---------------------------------------------------------------------------

def load_progress(output_file: Path) -> tuple[list[dict], set[str]]:
    if not output_file.exists():
        return [], set()
    with open(output_file, "r", encoding="utf-8") as f:
        existing = json.load(f)
    done_ids = {g["match_id"] for g in existing}
    print(f"📂 Resuming — {len(done_ids)} matches already processed.\n")
    return existing, done_ids


# ---------------------------------------------------------------------------
# Step 4 — Extract top lane info from a single match
# ---------------------------------------------------------------------------

def extract_top_info(raw: dict, puuid: str) -> dict | None:
    """
    Extract top lane data from a match detail response.

    Returns a dict if YOU played top, None otherwise.
    Fields returned:
      match_id, date_utc, win, your_champion,
      enemy_top_champion, enemy_is_ranged
    """
    info         = raw["info"]
    participants = info["participants"]

    # Find our participant
    me = next((p for p in participants if p["puuid"] == puuid), None)
    if me is None:
        return None

    # Only care about TOP lane games
    if me.get("teamPosition", "").upper() != "TOP":
        return None

    my_team_id = me["teamId"]

    # Find the enemy top laner — different team, same position
    enemy_top = next(
        (p for p in participants
         if p["teamId"] != my_team_id
         and p.get("teamPosition", "").upper() == "TOP"),
        None
    )

    enemy_champ    = enemy_top["championName"] if enemy_top else "Unknown"
    enemy_is_ranged = enemy_champ in RANGED_TOP_CHAMPS

    import datetime
    ts_ms = info["gameCreation"]
    dt    = datetime.datetime.fromtimestamp(ts_ms / 1000, tz=datetime.timezone.utc)

    return {
        "match_id"        : raw["metadata"]["matchId"],
        "date_utc"        : dt.strftime("%A, %d %B %Y at %H:%M UTC"),
        "win"             : me["win"],
        "your_champion"   : me["championName"],
        "enemy_top"       : enemy_champ,
        "enemy_is_ranged" : enemy_is_ranged,
    }


# ---------------------------------------------------------------------------
# Step 5 — Fetch and process all matches
# ---------------------------------------------------------------------------

def fetch_top_games(
    match_ids: list[str],
    puuid: str,
    api_key: str,
    output_file: Path,
) -> list[dict]:
    """
    Fetch each match, extract top lane data, save progress after every match.
    Returns the full list of top lane games found.
    """
    saved, already_done = load_progress(output_file)
    remaining = [mid for mid in match_ids if mid not in already_done]

    total      = len(match_ids)
    done_count = len(already_done)

    if not remaining:
        print("✅ All matches already processed.")
        return saved

    print(f"📥 Processing {len(remaining)} remaining matches "
          f"({done_count} already done, {total} total)…")
    print(f"   This may take a while due to rate limits.\n")

    url = f"{REGIONAL_HOST}/lol/match/v5/matches"

    for i, match_id in enumerate(remaining, start=1):
        raw  = _get(f"{url}/{match_id}", params={}, api_key=api_key)
        data = extract_top_info(raw, puuid)

        overall = done_count + i
        if data:
            saved.append(data)
            ranged_tag = "RANGED" if data["enemy_is_ranged"] else "melee "
            result_tag = "Win " if data["win"] else "Loss"
            print(f"  [{overall:>4}/{total}] TOP game found — "
                  f"{result_tag} on {data['your_champion']:12} "
                  f"vs {data['enemy_top']:15} [{ranged_tag}]")
        else:
            print(f"  [{overall:>4}/{total}] Not a top lane game — skipped")

        # Save after every match for resume support
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(saved, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Done. Results saved to '{output_file}'.")
    return saved


# ---------------------------------------------------------------------------
# Step 6 — Print final summary
# ---------------------------------------------------------------------------

def print_summary(top_games: list[dict], total_matches: int) -> None:
    total_top = len(top_games)

    if total_top == 0:
        print("\n⚠️  No top lane games found in your match history.")
        return

    vs_ranged = [g for g in top_games if g["enemy_is_ranged"]]
    vs_melee  = [g for g in top_games if not g["enemy_is_ranged"]]

    ranged_wins = sum(1 for g in vs_ranged if g["win"])
    melee_wins  = sum(1 for g in vs_melee  if g["win"])

    ranged_wr = ranged_wins / len(vs_ranged) * 100 if vs_ranged else 0
    melee_wr  = melee_wins  / len(vs_melee)  * 100 if vs_melee  else 0
    total_wr  = sum(1 for g in top_games if g["win"]) / total_top * 100

    # Count enemy champ frequency
    ranged_champ_counts: dict[str, int] = {}
    for g in vs_ranged:
        c = g["enemy_top"]
        ranged_champ_counts[c] = ranged_champ_counts.get(c, 0) + 1

    print("\n" + "=" * 60)
    print("  TOP LANE ANALYSIS — RESULTS")
    print("=" * 60)
    print(f"  Total ranked matches checked : {total_matches}")
    print(f"  Games played in TOP lane     : {total_top}  "
          f"({total_top / total_matches * 100:.1f}% of games)")
    print(f"  Overall top lane winrate     : {total_wr:.1f}%")
    print()
    print(f"  vs RANGED top laners  : {len(vs_ranged):>4} games  "
          f"({ranged_wr:.1f}% WR — "
          f"{ranged_wins}W / {len(vs_ranged) - ranged_wins}L)")
    print(f"  vs MELEE  top laners  : {len(vs_melee):>4} games  "
          f"({melee_wr:.1f}% WR — "
          f"{melee_wins}W / {len(vs_melee) - melee_wins}L)")

    if ranged_champ_counts:
        print()
        print("  Most common ranged tops faced:")
        sorted_ranged = sorted(ranged_champ_counts.items(), key=lambda x: x[1], reverse=True)
        for champ, count in sorted_ranged[:10]:
            # Per-champ winrate vs this ranged top
            champ_games = [g for g in vs_ranged if g["enemy_top"] == champ]
            champ_wr    = sum(1 for g in champ_games if g["win"]) / count * 100
            bar         = "█" * count
            print(f"    {champ:<18}: {count:>3}x  ({champ_wr:.0f}% WR)  {bar}")

    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(game_name: str, tag_line: str, api_key: str) -> None:
    print("=" * 60)
    print("  Riot Games — Top Lane Analysis")
    print("=" * 60)
    print(f"  Player     : {game_name}#{tag_line}")
    print(f"  Output file: {OUTPUT_FILE.resolve()}")
    print("=" * 60 + "\n")

    puuid     = get_puuid(game_name, tag_line, api_key)
    match_ids = get_all_match_ids(puuid, api_key)

    top_games = fetch_top_games(match_ids, puuid, api_key, OUTPUT_FILE)

    print_summary(top_games, len(match_ids))


# ---------------------------------------------------------------------------
# Credentials are loaded from LEAGUE_SCRIPTS/.env (or the environment).
# See .env.example.
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    API_KEY, GAME_NAME, TAG_LINE = rc.get_credentials()

    main(
        game_name=GAME_NAME,
        tag_line=TAG_LINE,
        api_key=API_KEY,
    )
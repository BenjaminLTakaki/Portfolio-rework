"""
download_matches.py
===================
Downloads all Ranked Solo/Duo (queue 420) match details for a given Riot ID
and saves them to a local JSON file for offline analysis.

Features:
  - Paginates all match IDs first, then fetches each match detail
  - Saves a slim version of each match (only fields needed for analysis)
  - Resume support: if interrupted, picks up from where it left off
  - Progress is written to disk after every single match fetch

Output file: matches.json (in the same directory as this script)

Slim fields saved per match:
  - match_id       : e.g. "EUW1_7549625754"
  - timestamp      : Unix ms (gameCreation)
  - date_utc       : Human-readable UTC date string
  - duration_mins  : Game duration in minutes
  - champion       : Champion played
  - tier           : e.g. "GOLD"
  - division       : e.g. "II"
  - lp_change      : Not available via Match-V5, omitted
  - win            : True / False
  - kills          : int
  - deaths         : int
  - assists        : int

Routing:
  - Account-V1 + Match-V5 → https://europe.api.riotgames.com
"""

import json
import time
import datetime
import requests
from pathlib import Path

import riot_common as rc


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REGIONAL_HOST  = "https://europe.api.riotgames.com"
QUEUE_RANKED   = 420
PAGE_SIZE      = 100
OUTPUT_FILE    = rc.MATCHES_FILE  # <repo>/public/lol/matches.json
DEFAULT_RETRY  = 10  # Fallback sleep (s) if Retry-After header is missing


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
    """Paginate Match-V5 to collect every Ranked Solo/Duo match ID."""
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
        print(f"  Page at {start:>5}: {len(page):>3} IDs  (total so far: {len(all_ids)})")

        if len(page) < PAGE_SIZE:
            break

        start += PAGE_SIZE

    print(f"\n✅ Found {len(all_ids)} Ranked Solo/Duo match IDs total.\n")
    return all_ids


# ---------------------------------------------------------------------------
# Step 3 — Extract slim fields from a raw match detail response
# ---------------------------------------------------------------------------

def extract_match_data(raw: dict, puuid: str) -> dict:
    """
    Pull only the fields we need from a full match detail response.

    Finds the participant entry matching our PUUID so we get the correct
    player's stats (tier, champion, K/D/A, win) rather than someone else's.
    """
    info = raw["info"]

    # Find our participant entry by PUUID
    participant = next(
        (p for p in info["participants"] if p["puuid"] == puuid),
        None
    )

    if participant is None:
        # Shouldn't happen, but guard against malformed responses
        return {}

    # gameCreation is milliseconds since epoch
    ts_ms = info["gameCreation"]
    dt    = datetime.datetime.fromtimestamp(ts_ms / 1000, tz=datetime.timezone.utc)

    return {
        "match_id"     : raw["metadata"]["matchId"],
        "timestamp"    : ts_ms,
        "date_utc"     : dt.strftime("%A, %d %B %Y at %H:%M UTC"),
        "duration_mins": round(info["gameDuration"] / 60, 1),
        "champion"     : participant["championName"],
        "tier"         : participant.get("tier", "UNKNOWN"),       # e.g. "GOLD"
        "division"     : participant.get("rank", "UNKNOWN"),       # e.g. "II"
        "win"          : participant["win"],
        "kills"        : participant["kills"],
        "deaths"       : participant["deaths"],
        "assists"      : participant["assists"],
    }


# ---------------------------------------------------------------------------
# Step 4 — Load existing progress (resume support)
# ---------------------------------------------------------------------------

def load_existing(output_file: Path) -> tuple[list[dict], set[str]]:
    """
    Load already-downloaded matches from disk.

    Returns:
        (list of match dicts already saved, set of match IDs already saved)
    """
    if not output_file.exists():
        return [], set()

    with open(output_file, "r", encoding="utf-8") as f:
        existing = json.load(f)

    already_done = {m["match_id"] for m in existing}
    print(f"📂 Resuming — {len(already_done)} matches already downloaded.\n")
    return existing, already_done


# ---------------------------------------------------------------------------
# Step 5 — Fetch and save all match details
# ---------------------------------------------------------------------------

def download_all_matches(
    match_ids: list[str],
    puuid: str,
    api_key: str,
    output_file: Path,
) -> None:
    """
    Fetch full match detail for every ID not yet in the output file.

    Saves progress to disk after every single match so a crash or
    interruption never loses more than one match worth of work.
    """
    # Load any previously saved progress
    saved_matches, already_done = load_existing(output_file)

    # Filter to only IDs we haven't fetched yet
    remaining = [mid for mid in match_ids if mid not in already_done]

    if not remaining:
        print("✅ All matches already downloaded. Nothing to do.")
        return

    total     = len(match_ids)
    done_count = len(already_done)

    print(f"📥 Downloading {len(remaining)} remaining matches "
          f"({done_count} already done, {total} total)…\n")
    print("   This may take a while due to API rate limits (~56 min for 563 matches).\n")

    url = f"{REGIONAL_HOST}/lol/match/v5/matches"

    for i, match_id in enumerate(remaining, start=1):
        match_url  = f"{url}/{match_id}"
        raw        = _get(match_url, params={}, api_key=api_key)
        slim       = extract_match_data(raw, puuid)

        if slim:
            saved_matches.append(slim)

        # Save to disk after every match (resume support)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(saved_matches, f, indent=2, ensure_ascii=False)

        # Progress indicator
        overall = done_count + i
        print(f"  [{overall:>4}/{total}] {match_id}  "
              f"({slim.get('champion', '?')}, "
              f"{'Win' if slim.get('win') else 'Loss'}, "
              f"{slim.get('tier', '?')} {slim.get('division', '?')}, "
              f"{slim.get('date_utc', '?')})")

    print(f"\n✅ Done! All {total} matches saved to '{output_file}'.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(game_name: str, tag_line: str, api_key: str) -> None:
    print("=" * 65)
    print("  Riot Games — Match Downloader (Ranked Solo/Duo)")
    print("=" * 65)
    print(f"  Player     : {game_name}#{tag_line}")
    print(f"  Output file: {OUTPUT_FILE.resolve()}")
    print("=" * 65 + "\n")

    puuid     = get_puuid(game_name, tag_line, api_key)
    match_ids = get_all_match_ids(puuid, api_key)

    # Match-V5 returns newest first; reverse so we process oldest → newest.
    # This means the output file is also sorted oldest → newest, which makes
    # chronological analysis in analyze_matches.py straightforward.
    match_ids.reverse()

    download_all_matches(match_ids, puuid, api_key, OUTPUT_FILE)


# ---------------------------------------------------------------------------
# Credentials are loaded from LEAGUE_SCRIPTS/.env (or the environment).
# See .env.example. For routine daily updates use update_data.py instead —
# this script does a full back-fill of the entire match history.
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    API_KEY, GAME_NAME, TAG_LINE = rc.get_credentials()

    main(
        game_name=GAME_NAME,
        tag_line=TAG_LINE,
        api_key=API_KEY,
    )
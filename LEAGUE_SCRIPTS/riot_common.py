"""
riot_common.py
==============
Shared helpers for all the League scripts:

  - Credential loading from a .env file (falls back to real environment
    variables, which is how GitHub Actions / Render inject secrets in CI).
  - A rate-limit-aware HTTP GET against the Riot API.
  - Riot ID -> PUUID resolution.
  - Match ID pagination (full history or just the recent page).
  - Canonical paths to the JSON data the website reads from (public/lol/).

Nothing here makes network calls at import time, so it's safe to import
from the offline analysis scripts too.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import requests

try:
    # Optional: load a local .env if python-dotenv is installed. In CI the
    # secrets come from the real environment, so dotenv is not required there.
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ModuleNotFoundError:
    pass


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REGIONAL_HOST = "https://europe.api.riotgames.com"
QUEUE_RANKED = 420
PAGE_SIZE = 100
DEFAULT_RETRY = 10  # Fallback sleep (s) if the Retry-After header is missing

# Repo paths. This file lives in <repo>/LEAGUE_SCRIPTS/, and the website reads
# its data from <repo>/public/lol/, which Vite serves at /lol/*.json.
SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
DATA_DIR = REPO_ROOT / "public" / "lol"
MATCHES_FILE = DATA_DIR / "matches.json"
TOP_GAMES_FILE = DATA_DIR / "top_games.json"


# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------

def get_credentials() -> tuple[str, str, str]:
    """
    Return (api_key, game_name, tag_line) from the environment / .env.

    Raises a clear error if the API key is missing so CI fails loudly.
    """
    api_key = os.environ.get("RIOT_API_KEY", "").strip()
    game_name = os.environ.get("RIOT_GAME_NAME", "NoAnimeNoLife").strip()
    tag_line = os.environ.get("RIOT_TAG_LINE", "ANIME").strip()

    if not api_key:
        raise SystemExit(
            "❌ RIOT_API_KEY is not set.\n"
            "   Copy LEAGUE_SCRIPTS/.env.example to LEAGUE_SCRIPTS/.env and fill it in,\n"
            "   or set the RIOT_API_KEY environment variable."
        )

    return api_key, game_name, tag_line


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def get(url: str, params: dict, api_key: str) -> dict | list:
    """GET with automatic rate-limit retry via the Retry-After header."""
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
            raise SystemExit("❌ Error 403 — Forbidden / expired key (rotate it).")
        if response.status_code == 404:
            raise SystemExit("❌ Error 404 — Player or resource not found.")

        raise SystemExit(f"❌ Unexpected {response.status_code}: {response.text}")


# ---------------------------------------------------------------------------
# Riot ID -> PUUID
# ---------------------------------------------------------------------------

def get_puuid(game_name: str, tag_line: str, api_key: str) -> str:
    url = f"{REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
    data = get(url, params={}, api_key=api_key)
    puuid = data["puuid"]
    print(f"✅ Resolved '{game_name}#{tag_line}' → PUUID: {puuid[:16]}…\n")
    return puuid


# ---------------------------------------------------------------------------
# Match ID pagination
# ---------------------------------------------------------------------------

def get_all_match_ids(puuid: str, api_key: str, max_count: int | None = None) -> list[str]:
    """
    Paginate Match-V5 to collect Ranked Solo/Duo match IDs (newest first).

    If max_count is given, stop after collecting roughly that many IDs — useful
    for a daily incremental update where you only need the most recent games.
    """
    url = f"{REGIONAL_HOST}/lol/match/v5/matches/by-puuid/{puuid}/ids"
    all_ids: list[str] = []
    start = 0

    while True:
        params = {"queue": QUEUE_RANKED, "start": start, "count": PAGE_SIZE}
        page: list[str] = get(url, params=params, api_key=api_key)

        if not page:
            break

        all_ids.extend(page)

        if max_count is not None and len(all_ids) >= max_count:
            break
        if len(page) < PAGE_SIZE:
            break

        start += PAGE_SIZE

    return all_ids

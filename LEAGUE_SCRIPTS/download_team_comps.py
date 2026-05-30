"""
download_team_comps.py
======================
For every Ranked Solo/Duo match in your history, fetch the full 10-player
roster and record which champions were on YOUR team (allies) and which were
on the enemy team — plus whether you won. This is the data that matches.json
does not store (it only keeps your own champion).

Output file: public/lol/match_teams.json

Per-match record:
  - match_id : e.g. "EUW1_7549625754"
  - timestamp: Unix ms (gameCreation), for sorting
  - win      : True / False (your result)
  - you      : your champion
  - allies   : list of your 4 teammates' champions (excludes you)
  - enemies  : list of the 5 enemy champions

Behaviour:
  - Resume support: re-running only fetches matches not already cached, so an
    interrupted run (or a later incremental update) is cheap.
  - Saves to disk after every match, so a crash never loses more than one game.
  - Reuses riot_common for credentials, rate-limited GET, PUUID + match IDs.

Rate limits (personal key): 20 req/s and 100 req / 2 min. The 100/2min cap is
the binding one, so a full back-fill of ~640 matches takes ~13 minutes.
"""

import json
from pathlib import Path

import riot_common as rc

MATCH_URL    = f"{rc.REGIONAL_HOST}/lol/match/v5/matches"
OUTPUT_FILE  = rc.DATA_DIR / "match_teams.json"


def extract_teams(raw: dict, puuid: str) -> dict | None:
    """Split a full match into (your champ, allies, enemies, win) using PUUID."""
    info = raw["info"]
    participants = info["participants"]

    me = next((p for p in participants if p["puuid"] == puuid), None)
    if me is None:
        return None  # malformed / you weren't in this game

    my_team = me["teamId"]

    allies  = [p["championName"] for p in participants
               if p["teamId"] == my_team and p["puuid"] != puuid]
    enemies = [p["championName"] for p in participants
               if p["teamId"] != my_team]

    return {
        "match_id" : raw["metadata"]["matchId"],
        "timestamp": info["gameCreation"],
        "win"      : me["win"],
        "you"      : me["championName"],
        "allies"   : allies,
        "enemies"  : enemies,
    }


def load_existing(output_file: Path) -> tuple[list[dict], set[str]]:
    if not output_file.exists():
        return [], set()
    with open(output_file, "r", encoding="utf-8") as f:
        existing = json.load(f)
    done = {m["match_id"] for m in existing}
    print(f"📂 Resuming — {len(done)} matches already cached.\n")
    return existing, done


def main() -> None:
    api_key, game_name, tag_line = rc.get_credentials()

    print("=" * 65)
    print("  Riot Games — Team Composition Downloader (Ranked Solo/Duo)")
    print("=" * 65)
    print(f"  Player     : {game_name}#{tag_line}")
    print(f"  Output file: {OUTPUT_FILE.resolve()}")
    print("=" * 65 + "\n")

    puuid     = rc.get_puuid(game_name, tag_line, api_key)
    match_ids = rc.get_all_match_ids(puuid, api_key)
    match_ids.reverse()  # oldest → newest, mirrors matches.json ordering

    saved, done = load_existing(OUTPUT_FILE)
    remaining   = [mid for mid in match_ids if mid not in done]

    if not remaining:
        print("✅ All matches already cached. Nothing to do.")
        return

    total = len(match_ids)
    print(f"📥 Fetching {len(remaining)} remaining of {total} matches…")
    print("   ~13 min for a full back-fill due to the 100 req / 2 min cap.\n")

    for i, match_id in enumerate(remaining, start=1):
        raw  = rc.get(f"{MATCH_URL}/{match_id}", params={}, api_key=api_key)
        rec  = extract_teams(raw, puuid)
        if rec:
            saved.append(rec)

        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(saved, f, indent=2, ensure_ascii=False)

        overall = len(done) + i
        if rec:
            print(f"  [{overall:>4}/{total}] {match_id}  "
                  f"({rec['you']}, {'Win' if rec['win'] else 'Loss'})")
        else:
            print(f"  [{overall:>4}/{total}] {match_id}  (skipped — no PUUID match)")

    print(f"\n✅ Done! {len(saved)} matches saved to '{OUTPUT_FILE}'.")
    print("   Now run:  python synergy_analysis.py")


if __name__ == "__main__":
    main()

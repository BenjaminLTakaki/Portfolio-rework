# League of Legends scripts

Tools that pull my Ranked Solo/Duo history from the Riot API and power the
`/lol` dashboard on the site. The website reads two JSON files that live in
[`../public/lol/`](../public/lol/):

- `matches.json` — slim per-game stats (champion, K/D/A, win, timestamp …)
- `top_games.json` — top-lane matchup data (you vs ranged/melee top laners)

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env        # then edit .env with your real key
```

`.env` is gitignored. It holds:

```
RIOT_API_KEY=RGAPI-...
RIOT_GAME_NAME=NoAnimeNoLife
RIOT_TAG_LINE=ANIME
```

Get a key at <https://developer.riotgames.com>. Personal keys are persistent
but rate-limited. **If a key is ever committed, rotate it.**

## Scripts

| Script | Network | What it does |
| --- | --- | --- |
| `update_data.py` | ✅ | **Daily incremental update.** Fetches only new matches and updates both JSON files. This is what CI runs. |
| `download_matches.py` | ✅ | Full back-fill of the entire match history into `matches.json`. |
| `top_lane_analysis.py` | ✅ | Full back-fill of `top_games.json` + prints a top-lane summary. |
| `analyze_matches.py` | ❌ | Offline: rank tier progression + overall stats. |
| `pattern_analysis.py` | ❌ | Offline: win/loss streaks and volatile periods. |
| `time_winrate_analysis.py` | ❌ | Offline: win rate by hour / part of day. |

All paths are resolved relative to the repo, so you can run them from anywhere:

```bash
python update_data.py
```

## Automated daily refresh

[`.github/workflows/update-lol.yml`](../.github/workflows/update-lol.yml) runs
`update_data.py` once a day, commits any new data to `public/lol/`, and pushes —
which triggers Render's auto-deploy.

**Required repo secret:** `RIOT_API_KEY` (Settings → Secrets and variables →
Actions). Optionally set repo **variables** `RIOT_GAME_NAME` / `RIOT_TAG_LINE`
to override the defaults.

To run it on a Render Cron Job instead, point the job's command at
`python LEAGUE_SCRIPTS/update_data.py` and give it the same env vars — but note
a Render job would still need to push to git (or write to a shared disk) for the
static site to pick up the change, which is why GitHub Actions is the simpler path.

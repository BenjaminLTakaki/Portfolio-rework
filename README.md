# Benjamin Takaki portfolio

React, Vite, and Tailwind portfolio for full-stack and AI/ML work. The homepage and forecaster can run without the database service.

## Local development

```sh
npm ci
npm run dev
```

## Verification

```sh
npm test
npm run build
npm run preview
```

`npm test` runs Node's own test runner over the forecaster and the server (the Certior counts and Reels, the page list). GitHub Actions runs the tests and the build on every push. The production build retains a separate large graphics chunk for Three.js; essential page content renders independently of it.

## Routes

- `/`: portfolio, filterable projects, About, and contact.
- `/project/:id`: project case studies with evidence and limitations.
- `/forecaster`: browser-based simulation using `public/forecaster/msi_2026.json`.
- `/certior/`: static Certior app in `public/certior`, copied from the certior-news repo's `docs/` (only the `FEED_URL` line in `shared.js` differs; `app.js` loads the screens as native modules, no build step). It reads its feed from that repo's GitHub Pages site, so new stories need no Render deploy.
- `/spotifycovergenerator`: external demo status and recovery links.
- `/privacy`: what the portfolio itself collects (nothing beyond the host's logs). Keep it true to the code.
- `/lol` and `/lol/:player`: player dashboard hub and database-backed analytics.

The optional Node service (`npm start`) serves `dist` and the Riot dashboard API. It requires `DATABASE_URL` and uses `RIOT_API_KEY` for refreshes. Starting it runs schema setup and schedules a daily refresh, so use an appropriate development database. Never commit `.env`.

## Content and design

Project content lives in `src/data/projects.js`. Add only completed work and verifiable results. The role positioning and design rules are recorded in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md).

No current CV has been supplied, so the site does not advertise a download that does not exist.

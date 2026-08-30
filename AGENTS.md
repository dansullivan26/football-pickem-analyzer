# Agent guide

Working notes for AI coding agents on `football-pickem-analyzer` (a.k.a.
"Pick'em Edge"). Read this before making changes. See `README.md` for the full
product/data-pipeline documentation; this file is the short operational guide.

## What this is

A client-only Vite + React 19 + TypeScript single-page app that compares locked
CBS Football Pick'em spreads with current DraftKings lines. There is no backend
server: the app reads static JSON from `src/data/` and `public/data/`, and data
refreshes happen through GitHub Actions, not a running service.

## Environment

- Node 22+, npm. Dependencies are declared in `package.json` /
  `package-lock.json`.
- Cloud Agent setup lives in `.cursor/environment.json`: it runs `npm install`
  on boot and starts the dev server as a `vite-dev` terminal on
  `127.0.0.1:5173`.
- Working locally, `npm install` then `npm run dev` is enough.

## Common commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server (default `http://localhost:5173/`). |
| `npm run build` | Type-check (`tsc -b`) then `vite build`; also copies `index.html` to `404.html` for GitHub Pages SPA routing. |
| `npm test` | Run the Node built-in test runner over `tests/*.test.ts`. |
| `npm run lint` | ESLint over the repo. |
| `npm run preview` | Serve the production build locally. |

Data-preparation scripts (`prepare-slate`, `prepare-players`,
`prepare-consensus`, `snapshot-recommendations`, `snapshot-predictions`,
`apply-covers`, ...) are documented in `README.md`. They ingest private CBS/
Covers dumps and are normally run by the **Ingest GrokBot dump** workflow, not
by hand.

## Routing

Routing is path-based and served as an SPA (see `src/routes.ts`). In the browser:

- `/` — Lines
- `/players` — Players
- `/teams` and `/teams/<slug>` (e.g. `/teams/alabama`) — Teams / team profile
- `/performance` — Performance
- `/bad-beats` — Bad beats

GitHub Pages serves these deep links via `404.html`. `vite.config.ts` sets a
`/football-pickem-analyzer/` base for production builds only.

## Testing expectations

- Run `npm test` for logic changes; the suite covers scoring, cover results,
  team/career/line history, predictions, card strategy, and route parsing.
- Run `npm run build` to confirm types still pass before opening a PR.
- For any UI change, run the dev server and verify the affected page(s) render.
- There is no backend to run; do not add server infrastructure to test.

## Known lint state

As of this file's creation, `npm run lint` reports pre-existing issues that are
unrelated to environment setup and should not be "fixed" incidentally:

- `src/teamPerformance.ts` — unused `FrozenRecommendation` import
  (`@typescript-eslint/no-unused-vars`).
- `src/BadBeatsView.tsx` — `setState` inside an effect
  (`react-hooks/set-state-in-effect`).
- `src/PlayersView.tsx` — `useMemo` missing-dependency warning
  (`react-hooks/exhaustive-deps`).

Only address these if the task explicitly touches that code or asks for lint
cleanup.

## Conventions

- TypeScript throughout (`.ts` / `.tsx`); ES modules (`"type": "module"`).
- View components are `*View.tsx`; pure logic lives in sibling `.ts` modules
  with matching tests under `tests/`.
- Static data is committed under `src/data/`; raw private dumps are gitignored
  and never belong in this repo.
- Secrets (`SHARP_API_KEY`, `DROPS_TOKEN`, `GH_DISPATCH_TOKEN`, GrokBot webhook
  values) are GitHub Actions/repo secrets — never commit them or print them.

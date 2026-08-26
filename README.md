# Pick'em Edge

A mobile-friendly Vite app that compares locked CBS Football Pick'em spreads
with current DraftKings and FanDuel lines from SharpAPI.

## Local development

```bash
npm install
npm run dev
```

The app loads its public slate from `src/data/current-slate.json`. Full CBS
exports are ignored by git so private pool URLs and settings are not published.

To prepare a newly captured slate:

```bash
npm run prepare-slate -- --input path/to/cbs-slate.json
```

Commit the generated `src/data/current-slate.json`. Normalized odds are loaded
from `public/data/odds.json`.

To prepare a GrokBot player-history export:

```bash
npm run prepare-players -- --input path/to/players.json
```

This validates the roster and weekly pick grids, strips the private pool URL,
and writes `src/data/player-history.json`. The Players view can render unpicked
weeks immediately; tendency metrics populate as scored Tuesday exports add
selections and results.

To freeze the current week's recommendations (open games update; kicked-off
games stay locked):

```bash
npm run snapshot-recommendations
```

That writes `src/data/recommendation-history.json` for the Performance page.
The odds refresh workflow runs the same snapshot so live recs keep updating
until kickoff.

## Refresh sportsbook lines

1. Create a free SharpAPI account.
2. Add the API key to the GitHub repository as an Actions secret named
   `SHARP_API_KEY`.
3. Run the **Refresh sportsbook lines** workflow manually, or wait for its
   two-hour schedule.

The browser's **Refresh lines** button reloads the latest generated odds file;
it does not spend an API request.

## Deploy

In the GitHub repository settings, set **Pages → Build and deployment → Source**
to **GitHub Actions**. Pushes to `main` then deploy automatically.

## Recommendation rules

- **Hammer:** 3 or more points of value
- **Lean:** 1.5–2.5 points
- **Slight:** 0.5–1 point
- **Neutral:** lines match (no edge)

The comparison uses the average available home-team spread across DraftKings
and FanDuel. The recommended side is the team receiving the better number in
the CBS pool. If that number is the good side of a field-goal (2.5 / 3.5) or
touchdown (6.5 / 7.5) hook versus the book, the card shows a favorable hook badge.

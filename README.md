# Pick'em Edge

A mobile-friendly Vite app that compares locked CBS Football Pick'em spreads
with current DraftKings lines from SharpAPI.

## Local development

```bash
npm install
npm run dev
```

Lines is `/`, Players is `/players`, and Performance is `/performance`. GitHub
Pages serves the same SPA for those paths via `404.html`.

The app loads its public slate from `src/data/current-slate.json`. Full CBS
exports are ignored by git so private pool URLs and settings are not published.
Each game may include a CBS `venue` (`stadium`, `city`, `state`, `indoor`);
team `location` is still the school, not where the game is played.

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

To prepare a GrokBot Covers consensus export:

```bash
npm run prepare-consensus -- --input path/to/consensus.json
```

This checks every row against the prepared slate, keeps the Covers matchup
details URL, drops the page list and internal matchup ids, and writes
`src/data/consensus.json`. Games Covers had not posted
yet stay in the file as unmatched rows and render as "No public consensus yet".
These are Covers contest-player tickets, not experts. Headline percentages
combine tickets made at multiple lines; `atsByLine` preserves each Picks Per
Line bucket. The app displays the headline without attaching it to Covers'
current Sides number, and public card picks use a meaningful ticket bucket
within one point of the locked pool line. Capture a fresh dump as close to the
day's first kickoff as practical.

## GrokBot ingest

Raw CBS and Covers dumps stay out of this public repo. GrokBot writes them to
the private drop repo, then dispatches **Ingest GrokBot dump**, which runs the
matching `prepare-*` script and commits only the sanitized `src/data` files.

| | |
| --- | --- |
| App repo | `dansullivan26/football-pickem-analyzer` |
| Drop repo | `dansullivan26/football-pickem-analyzer-drops` (private) |
| Drop paths | `incoming/slate.json`, `incoming/players.json`, `incoming/consensus.json` |
| Workflow | `Ingest GrokBot dump` (`ingest-grokbot.yml`) |

After a scrape finishes:

```bash
# overwrite the matching drop file, then:
gh workflow run "Ingest GrokBot dump" \
  --repo dansullivan26/football-pickem-analyzer \
  -f kind=slate   # or players, or consensus
```

This public repo needs a secret named `DROPS_TOKEN` with Contents: Read on the
drop repo. GrokBot's login needs Contents: Write on the drop repo and Actions:
Write on this repo so it can push the dump and dispatch the workflow. Use
`gh auth login` (or a hidden token field) — never paste the token into chat.

To freeze the current week's recommendations (open games update; kicked-off
games stay locked):

```bash
npm run snapshot-recommendations
```

That writes `src/data/recommendation-history.json` for the Performance page.
The odds refresh workflow runs the same snapshot so live recs keep updating
until kickoff. Open games also store the generated-card source and strength
(line value vs public, mild / solid / strong); those values freeze at kickoff
with the rest of the pick. Performance tracks hit rates for each source ×
strength bucket separately.

## Refresh sportsbook lines

1. Create a free SharpAPI account.
2. Add the API key to the GitHub repository as an Actions secret named
   `SHARP_API_KEY`.
3. Run the **Refresh sportsbook lines** workflow manually, or wait for its
   hourly schedule (`23 * * * *` UTC). GitHub can delay or skip cron jobs, so
   the Action history is the source of truth, not the clock.

The browser's **Refresh data** button starts two GitHub Actions: **Refresh
sportsbook lines** (DraftKings via SharpAPI) and **Ingest GrokBot dump**
(`kind=consensus`, the latest Covers file already in the private drop repo).
It does not scrape Covers itself. After the jobs finish and Pages deploys,
reload the site. The toast is only an acknowledgement — data will not appear
instantly.

To enable the button on GitHub Pages, create a fine-grained personal access
token with **Actions: Read and write** on this repository only. Add it as a
repository secret named `GH_DISPATCH_TOKEN`. That token is baked into the
public JS bundle, so anyone can dispatch those two workflows and burn Actions
minutes; they cannot read `SHARP_API_KEY` or `DROPS_TOKEN`. For local testing,
put the same token in `.env.local` as `VITE_GH_DISPATCH_TOKEN`.

## Deploy

In the GitHub repository settings, set **Pages → Build and deployment → Source**
to **GitHub Actions**. Pushes to `main` then deploy automatically.

## Recommendation rules

- **Hammer:** 3 or more points of value
- **Lean:** 1.5–2.5 points
- **Slight:** 0.5–1 point
- **Neutral:** lines match (no edge)

The comparison uses the current DraftKings home-team spread. The recommended
side is the team receiving the better number in the CBS pool. If that number is
the good side of a field-goal (2.5 / 3.5) or touchdown (6.5 / 7.5) hook versus
DraftKings, the card shows a favorable hook badge.

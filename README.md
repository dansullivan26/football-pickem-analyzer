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
The slate may also include one top-level `tiebreaker` (`gameId`,
`cbsEventId`, `order`, `type`, `question`, `questionId`) and
`games[].tiebreakerOrder` (1 on that matchup, null elsewhere).

To prepare a newly captured slate:

```bash
npm run prepare-slate -- --input path/to/cbs-slate.json
```

Commit the generated `src/data/current-slate.json`. Normalized odds are loaded
from `public/data/odds.json`. The odds refresh fetches DraftKings spreads for
the slate, then uses the matched SharpAPI event ID to request `total_points`
only for the weekly tiebreaker game.

To prepare a GrokBot player-history export:

```bash
npm run prepare-players -- --input path/to/players.json
```

This validates the roster and weekly pick grids, strips the private pool URL,
and writes `src/data/player-history.json`. Each weekly entry may include
`tiebreaker.answer` as an integer (or null). The Players view can render
unpicked weeks immediately; tendency metrics populate as scored Tuesday
exports add selections, results, and tiebreaker totals. Line-value agreement
and tiebreaker ±2 use the frozen recommendation snapshot, not live odds.

The Players view also builds a weekly prediction from that player's earlier
scored weeks. V1 looks for decisive home/road, favorite/dog, line-value, and
public-side habits; it withholds a call when the sample is thin or the signals
conflict. The selected week's **Prediction** view is a forecast while picks are
hidden, then becomes an automatic predicted-vs-actual report after Tuesday's
player dump. Open-week forecasts keep updating until the first kickoff; after
that, `src/data/prediction-forecasts.json` freezes the v1 calls (`v1-habits`)
so later rule changes cannot rewrite the report card. Tuesday's player ingest
grades those frozen sides and refreshes the residual split (league, favorite vs
dog, habit, confidence). Historical UI reports prefer the frozen file when it
exists.

Archetype labels (for example, `Home-favorite taker` or `Public fader`) are
assigned from the strongest sufficiently supported tendency and may change as
new scored weeks arrive.

```bash
npm run snapshot-predictions
```

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

Tuesday player dumps already include `weeks[].entries[].tiebreaker` with
`question` and `answer`. Populate `answer` with the integer CBS stored for
that entry (omit or null if they left it blank). `gameId` is optional. The
app freezes the DraftKings total itself at tiebreaker kickoff; GrokBot does
not need to send book totals on the player dump.

To freeze the current week's recommendations (open games update; kicked-off
games stay locked):

```bash
npm run snapshot-recommendations
```

That writes `src/data/recommendation-history.json` for the Performance page.
The odds refresh workflow runs the same snapshot so live recs keep updating
until kickoff, then `npm run snapshot-predictions` so player forecasts freeze
at the week's first kickoff. Open games also store the generated-card source
and strength
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

## Complete a card on CBS

The generated-card modal sends GrokBot this JSON:

```json
{
  "week": 1,
  "source": "football-pickem-analyzer",
  "picks": [
    {
      "gameId": "<slate games[].id>",
      "pickedTeamId": "<that game's away.id or home.id>",
      "pickedSide": "home",
      "deviate": false
    }
  ],
  "tiebreaker": {
    "questionId": "<slate tiebreaker.questionId>",
    "gameId": "<slate tiebreaker.gameId>",
    "answer": 47
  }
}
```

Unpicked games are omitted; GrokBot validates against the live Week N slate.
`pickedTeamId` / `pickedSide` are the team to save on CBS. If **Deviate** is
checked on a pick, those fields are already the flipped side and `deviate` is
`true`. GrokBot should save that team as-is and not flip it again.
The generated card shows the tiebreaker matchup and DraftKings O/U beside an
optional whole-number answer. If the answer is blank, `tiebreaker` is omitted
from the webhook so CBS remains blank.

The Complete card Action also writes `src/data/card-overrides.json` and
re-runs the recommendation snapshot so Performance can score deviations
against the opposite of the frozen card pick.

The browser cannot POST that webhook directly. GrokBot's server answers the
CORS preflight and will not allow the Pages origin, so the button dispatches
**Complete card on CBS** (`complete-card.yml`) and the Action forwards the body
server-side. Add the routine URL and sender key as repository secrets named
`GROKBOT_WEBHOOK_URL` and `GROKBOT_WEBHOOK_TOKEN`. Neither is exposed to the
browser; the button reuses `GH_DISPATCH_TOKEN`. The button opens a password
prompt first. The check is a string in `src/completeCard.ts` — change
`COMPLETE_CARD_PASSWORD` there. It is not real auth; it only stops a casual
click. Anyone who reads the built JS can still skip it and dispatch the Action.

A successful click only means the Action started. If GrokBot never posts the
card in chat, read that workflow run for the status it returned. Nothing is
saved on CBS until you confirm in chat.

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
DraftKings, the Lines card shows a favorable hook badge and the generated card
scores that pick as solid line value (not mild) with an FG/TD hook badge.

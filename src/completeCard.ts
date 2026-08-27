import { submittedPick, type SuggestedCard } from './cardStrategy'

const REPO = 'dansullivan26/football-pickem-analyzer'
const WORKFLOW = 'complete-card.yml'

// Checked only in the browser. Anyone who reads the JS can still skip this;
// it is just a speed bump against a funny click on a shared URL.
export const COMPLETE_CARD_PASSWORD = 'letsride'

export function completeCardPasswordMatches(value: string) {
  return value === COMPLETE_CARD_PASSWORD
}

// GrokBot's webhook rejects the browser's CORS preflight, so the card goes
// through a GitHub Action that forwards it server-side.
export async function sendCardToGrokBot(
  card: SuggestedCard,
  deviations: ReadonlySet<string> = new Set(),
  tiebreakerAnswer: number | null = null,
) {
  const token = import.meta.env.VITE_GH_DISPATCH_TOKEN
  if (!token) {
    throw new Error(
      'CBS completion is not configured on this deploy. Add a GH_DISPATCH_TOKEN secret and rebuild Pages.',
    )
  }

  const payload = JSON.stringify({
    week: card.week,
    source: 'football-pickem-analyzer',
    picks: card.picks.map((pick) => {
      const sent = submittedPick(pick, deviations.has(pick.gameId))
      return {
        gameId: pick.gameId,
        pickedTeamId: sent.pickedTeamId,
        pickedSide: sent.pickedSide,
        deviate: deviations.has(pick.gameId),
      }
    }),
    ...(card.tiebreaker && tiebreakerAnswer != null
      ? {
          tiebreaker: {
            questionId: card.tiebreaker.questionId,
            gameId: card.tiebreaker.gameId,
            answer: tiebreakerAnswer,
          },
        }
      : {}),
  })

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main', inputs: { payload } }),
    },
  )

  if (response.status === 204) return
  const detail = await response.text()
  throw new Error(
    `Could not hand the card to GrokBot (${response.status}${detail ? `: ${detail}` : ''}).`,
  )
}

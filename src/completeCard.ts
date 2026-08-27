import type { SuggestedCard } from './cardStrategy'

export async function sendCardToGrokBot(card: SuggestedCard) {
  const url = import.meta.env.VITE_GROKBOT_WEBHOOK_URL
  const token = import.meta.env.VITE_GROKBOT_WEBHOOK_TOKEN

  if (!url || !token) {
    throw new Error(
      'CBS completion is not configured on this deploy. Add the GrokBot webhook secrets and rebuild Pages.',
    )
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      week: card.week,
      source: 'football-pickem-analyzer',
      picks: card.picks.map((pick) => ({
        gameId: pick.gameId,
        pickedTeamId: pick.pickedTeamId,
        pickedSide: pick.pickedSide,
      })),
    }),
  })

  if (response.ok) return
  throw new Error(`GrokBot could not receive the card (${response.status}).`)
}

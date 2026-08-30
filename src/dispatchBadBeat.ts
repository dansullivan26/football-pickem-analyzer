import type { BadBeat } from './badBeats'

const REPO = 'dansullivan26/football-pickem-analyzer'
const WORKFLOW = 'save-bad-beat.yml'

export type BadBeatChange =
  | { action: 'add'; beat: BadBeat }
  | { action: 'remove'; key: string }

export async function dispatchBadBeatChange(change: BadBeatChange) {
  const token = import.meta.env.VITE_GH_DISPATCH_TOKEN
  if (!token) {
    throw new Error(
      'Publishing bad beats is not configured on this deploy. Add a GH_DISPATCH_TOKEN secret and rebuild Pages.',
    )
  }

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { payload: JSON.stringify(change) },
      }),
    },
  )

  if (response.status === 204) return
  const detail = await response.text()
  throw new Error(
    `Could not publish the bad beat (${response.status}${detail ? `: ${detail}` : ''}).`,
  )
}

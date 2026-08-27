const REPO = 'dansullivan26/football-pickem-analyzer'
const WORKFLOW = 'refresh-review-data.yml'

export async function dispatchReviewRefresh() {
  const token = import.meta.env.VITE_GH_DISPATCH_TOKEN
  if (!token) {
    throw new Error(
      'Refresh is not configured on this deploy. Add a GH_DISPATCH_TOKEN secret and rebuild Pages.',
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
      body: JSON.stringify({ ref: 'main' }),
    },
  )

  if (response.status === 204) return
  const detail = await response.text()
  throw new Error(
    `Could not start the refresh (${response.status}${detail ? `: ${detail}` : ''}).`,
  )
}

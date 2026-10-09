import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('leftover scout prompt tells the model to lean on thin samples', async () => {
  const prompt = await readFile(
    new URL('../src/data/leftover-scout-prompt.md', import.meta.url),
    'utf8',
  )
  assert.match(prompt, /go out on a limb/)
  assert.match(prompt, /Do not use no-call just because decided games are under 4/)
  assert.match(prompt, /Return JSON only/)
  assert.match(prompt, /"side":"home"\|"away"\|"no-call"/)
  assert.match(prompt, /on game day/)
  assert.match(prompt, /disagreement is a flag, not a vote/)
})

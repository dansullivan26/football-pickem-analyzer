import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SCOUT_MODELS,
  resolveScoutConfig,
  summarizeScoutError,
} from '../src/scoutProvider.ts'

test('resolves OpenAI, Anthropic, or Gemini from the matching key', () => {
  assert.deepEqual(
    resolveScoutConfig({ OPENAI_API_KEY: 'sk-test' }),
    {
      ok: true,
      config: {
        provider: 'openai',
        model: DEFAULT_SCOUT_MODELS.openai,
        apiKey: 'sk-test',
      },
    },
  )
  assert.deepEqual(
    resolveScoutConfig({ ANTHROPIC_API_KEY: 'sk-ant' }),
    {
      ok: true,
      config: {
        provider: 'anthropic',
        model: DEFAULT_SCOUT_MODELS.anthropic,
        apiKey: 'sk-ant',
      },
    },
  )
  assert.deepEqual(
    resolveScoutConfig({ GEMINI_API_KEY: 'gem' }),
    {
      ok: true,
      config: {
        provider: 'gemini',
        model: DEFAULT_SCOUT_MODELS.gemini,
        apiKey: 'gem',
      },
    },
  )
})

test('SCOUT_PROVIDER wins when more than one key is present', () => {
  const resolved = resolveScoutConfig({
    SCOUT_PROVIDER: 'anthropic',
    SCOUT_MODEL: 'claude-opus-4-1',
    OPENAI_API_KEY: 'sk-openai',
    ANTHROPIC_API_KEY: 'sk-ant',
    GEMINI_API_KEY: 'gem',
  })
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.config.provider, 'anthropic')
  assert.equal(resolved.config.model, 'claude-opus-4-1')
  assert.equal(resolved.config.apiKey, 'sk-ant')
})

test('prefers OpenAI over a leftover Gemini key when provider is unset', () => {
  const resolved = resolveScoutConfig({
    OPENAI_API_KEY: 'sk-openai',
    GEMINI_API_KEY: 'gem',
  })
  assert.equal(resolved.ok, true)
  if (!resolved.ok) return
  assert.equal(resolved.config.provider, 'openai')
})

test('rejects an unknown provider or a missing key', () => {
  assert.equal(resolveScoutConfig({}).ok, false)
  assert.equal(resolveScoutConfig({ SCOUT_PROVIDER: 'grok' }).ok, false)
  const missing = resolveScoutConfig({ SCOUT_PROVIDER: 'openai' })
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.match(missing.error, /OPENAI_API_KEY/)
})

test('scout errors keep the 429 / 503 retry labels', () => {
  assert.equal(summarizeScoutError('OpenAI 429: rate'), '429 rate limit')
  assert.equal(summarizeScoutError('Anthropic 529: overloaded'), '503 high demand')
  assert.equal(summarizeScoutError('Gemini 404: missing'), '404 model not found')
})

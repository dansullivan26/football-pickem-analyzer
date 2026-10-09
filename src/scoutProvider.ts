import {
  DEFAULT_GEMINI_MODEL,
  parseGeminiBrief,
  type NeutralPacket,
} from './neutralBrief.ts'

export type ScoutProvider = 'cursor' | 'openai' | 'anthropic' | 'gemini'

export type ScoutConfig = {
  provider: ScoutProvider
  model: string
  apiKey: string
}

export const DEFAULT_SCOUT_MODELS: Record<ScoutProvider, string> = {
  cursor: 'grok-4.7',
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-5',
  gemini: DEFAULT_GEMINI_MODEL,
}

const RETRY_STATUSES = new Set([429, 503, 529])
const ASK_ATTEMPTS = 4

export function resolveScoutConfig(
  env: Record<string, string | undefined>,
): { ok: true; config: ScoutConfig } | { ok: false; error: string } {
  const requested = normalizeProvider(env.SCOUT_PROVIDER)
  if (env.SCOUT_PROVIDER?.trim() && !requested) {
    return {
      ok: false,
      error:
        `Unknown SCOUT_PROVIDER "${env.SCOUT_PROVIDER.trim()}". Use cursor, openai, anthropic, or gemini.`,
    }
  }
  const provider =
    requested ??
    (env.CURSOR_API_KEY?.trim()
      ? 'cursor'
      : env.OPENAI_API_KEY?.trim()
        ? 'openai'
        : env.ANTHROPIC_API_KEY?.trim()
          ? 'anthropic'
          : env.GEMINI_API_KEY?.trim()
            ? 'gemini'
            : null)
  if (!provider) {
    return {
      ok: false,
      error:
        'Add CURSOR_API_KEY (Grok on your Cursor plan), or OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY.',
    }
  }
  const apiKey = keyFor(provider, env)
  if (!apiKey) {
    return {
      ok: false,
      error: `Missing ${keyName(provider)} for SCOUT_PROVIDER=${provider}.`,
    }
  }
  return {
    ok: true,
    config: {
      provider,
      apiKey,
      model:
        env.SCOUT_MODEL?.trim() ||
        (provider === 'gemini' ? env.GEMINI_MODEL?.trim() : '') ||
        DEFAULT_SCOUT_MODELS[provider],
    },
  }
}

export function summarizeScoutError(message: string) {
  const status = /(?:Gemini|OpenAI|Anthropic|Cursor|Scout) (\d+)/.exec(message)?.[1]
  if (status === '503' || status === '529') return '503 high demand'
  if (status === '429') return '429 rate limit'
  if (status === '404') return '404 model not found'
  const compact = message.replace(/\s+/g, ' ').trim()
  return compact.slice(0, 120) || 'Scout request failed'
}

export async function askScout(
  packet: NeutralPacket,
  config: ScoutConfig,
  prompt: string,
) {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= ASK_ATTEMPTS; attempt += 1) {
    try {
      return await askScoutOnce(packet, config, prompt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const status = Number(
        /(?:Gemini|OpenAI|Anthropic|Cursor|Scout) (\d+)/.exec(lastError.message)?.[1],
      )
      if (!RETRY_STATUSES.has(status) || attempt === ASK_ATTEMPTS) {
        throw lastError
      }
      const waitMs = 4000 * 2 ** (attempt - 1)
      console.log(
        `::warning title=Scout busy::retry ${attempt}/${ASK_ATTEMPTS} in ${waitMs / 1000}s — ${lastError.message.slice(0, 160)}`,
      )
      await sleep(waitMs)
    }
  }
  throw lastError ?? new Error('Scout failed')
}

async function askScoutOnce(
  packet: NeutralPacket,
  config: ScoutConfig,
  prompt: string,
) {
  if (config.provider === 'cursor') {
    throw new Error('Cursor scout notes go through the agent CLI')
  }
  if (config.provider === 'openai') return askOpenAI(packet, config, prompt)
  if (config.provider === 'anthropic') return askAnthropic(packet, config, prompt)
  return askGemini(packet, config, prompt)
}

async function askOpenAI(
  packet: NeutralPacket,
  config: ScoutConfig,
  prompt: string,
) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.35,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: packetPrompt(packet) },
      ],
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 400)}`)
  }
  const payload = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return readBrief(
    payload.choices?.[0]?.message?.content,
    body,
    'OpenAI',
  )
}

async function askAnthropic(
  packet: NeutralPacket,
  config: ScoutConfig,
  prompt: string,
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 700,
      temperature: 0.35,
      system: prompt,
      messages: [{ role: 'user', content: packetPrompt(packet) }],
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Anthropic ${response.status}: ${body.slice(0, 400)}`)
  }
  const payload = JSON.parse(body) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = payload.content
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim()
  return readBrief(text, body, 'Anthropic')
}

async function askGemini(
  packet: NeutralPacket,
  config: ScoutConfig,
  prompt: string,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: prompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: packetPrompt(packet) }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 700,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            side: { type: 'string', enum: ['home', 'away', 'no-call'] },
            confidence: { type: 'string', enum: ['light', 'medium', 'strong'] },
            why: { type: 'string' },
          },
          required: ['side', 'confidence', 'why'],
        },
      },
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${body.slice(0, 400)}`)
  }
  const payload = JSON.parse(body) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()
  return readBrief(text, body, 'Gemini')
}

function readBrief(text: string | undefined, body: string, label: string) {
  const parsed = parseGeminiBrief(text)
  if (!parsed) {
    throw new Error(
      `${label} returned an unreadable brief: ${text?.slice(0, 240) ?? body.slice(0, 240)}`,
    )
  }
  return parsed
}

function packetPrompt(packet: NeutralPacket) {
  return `Packet:\n${JSON.stringify(packet, null, 2)}`
}

function normalizeProvider(value: string | undefined): ScoutProvider | null {
  const provider = value?.trim().toLowerCase()
  if (provider === 'cursor' || provider === 'grok') return 'cursor'
  if (provider === 'openai' || provider === 'gpt') return 'openai'
  if (provider === 'anthropic' || provider === 'claude') return 'anthropic'
  if (provider === 'gemini' || provider === 'google') return 'gemini'
  return null
}

function keyFor(
  provider: ScoutProvider,
  env: Record<string, string | undefined>,
) {
  const shared = env.SCOUT_API_KEY?.trim()
  if (shared) return shared
  if (provider === 'cursor') return env.CURSOR_API_KEY?.trim() ?? ''
  if (provider === 'openai') return env.OPENAI_API_KEY?.trim() ?? ''
  if (provider === 'anthropic') return env.ANTHROPIC_API_KEY?.trim() ?? ''
  return env.GEMINI_API_KEY?.trim() ?? ''
}

function keyName(provider: ScoutProvider) {
  if (provider === 'cursor') return 'CURSOR_API_KEY'
  if (provider === 'openai') return 'OPENAI_API_KEY'
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY'
  return 'GEMINI_API_KEY'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

import { spawn } from 'node:child_process'
import { parseGeminiBrief, type NeutralPacket } from '../src/neutralBrief.ts'
import type { ScoutConfig } from '../src/scoutProvider.ts'

const CURSOR_TIMEOUT_MS = 180_000

export async function askCursor(
  packet: NeutralPacket,
  config: ScoutConfig,
  prompt: string,
) {
  const bin = process.env.CURSOR_AGENT_BIN?.trim() || 'agent'
  const input = `${prompt.trim()}\n\nPacket:\n${JSON.stringify(packet, null, 2)}`
  const { code, stdout, stderr } = await runAgent(bin, config, input)
  if (code !== 0) {
    const detail = (stderr || stdout).replace(/\s+/g, ' ').trim()
    throw new Error(
      `Cursor ${code}: ${detail.slice(0, 400) || 'agent CLI failed'}`,
    )
  }
  const text = cursorResultText(stdout)
  const parsed = parseGeminiBrief(text)
  if (!parsed) {
    throw new Error(
      `Cursor returned an unreadable brief: ${text.slice(0, 240) || stdout.slice(0, 240)}`,
    )
  }
  return parsed
}

function cursorResultText(stdout: string) {
  const trimmed = stdout.trim()
  try {
    const row = JSON.parse(trimmed) as { result?: unknown }
    if (typeof row.result === 'string' && row.result.trim()) return row.result
  } catch {
    // Print mode sometimes emits the assistant text without the wrapper.
  }
  return trimmed
}

function runAgent(bin: string, config: ScoutConfig, input: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        bin,
        [
          '-p',
          '--mode',
          'ask',
          '--trust',
          '--model',
          config.model,
          '--output-format',
          'json',
          input,
        ],
        {
          env: { ...process.env, CURSOR_API_KEY: config.apiKey },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`Cursor timed out after ${CURSOR_TIMEOUT_MS / 1000}s`))
      }, CURSOR_TIMEOUT_MS)
      child.on('error', (error) => {
        clearTimeout(timer)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              'Cursor: agent CLI not found. Install with curl https://cursor.com/install -fsS | bash',
            ),
          )
          return
        }
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code, stdout, stderr })
      })
    },
  )
}

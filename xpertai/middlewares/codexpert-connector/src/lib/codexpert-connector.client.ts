import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  type CodexpertConnectorEvent,
  type CodexpertConnectorConfig,
  type PrincipalContext,
} from './types.js'

type ConnectorHeadersInput = {
  serviceToken: string
  principal: PrincipalContext
}

export async function callCodexpertMcpTool<T = unknown>(
  config: Required<Pick<CodexpertConnectorConfig, 'codexpertMcpUrl' | 'serviceToken'>>,
  principal: PrincipalContext,
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const client = new Client({ name: 'xpert-codexpert-connector', version: '0.1.0' })
  const headers = buildConnectorHeaders({ serviceToken: config.serviceToken, principal })
  const transport = new StreamableHTTPClientTransport(new URL(config.codexpertMcpUrl), {
    requestInit: {
      headers,
    },
    fetch: createConnectorFetch(headers),
  })
  try {
    await client.connect(transport)
    const result = await client.callTool(
      {
        name,
        arguments: args,
      },
      undefined,
      { timeout: timeoutMs },
    )
    if (result.isError) {
      throw new Error(readMcpText(result.content) || `Codexpert MCP tool ${name} failed`)
    }
    return (result.structuredContent ?? readMcpPayload<T>(result.content)) as T
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function createCodexpertSession(
  config: Required<Pick<CodexpertConnectorConfig, 'codexpertConnectorBaseUrl' | 'serviceToken'>>,
  principal: PrincipalContext,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(
    `${trimRight(config.codexpertConnectorBaseUrl, '/')}/codexpert-connector/sessions`,
    {
      method: 'POST',
      headers: {
        ...buildConnectorHeaders({ serviceToken: config.serviceToken, principal }),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  )
  if (!response.ok) {
    throw new Error(`Codexpert connector session failed (${response.status}): ${await response.text()}`)
  }
  return response.json() as Promise<Record<string, unknown>>
}

export async function* streamCodexpertPrompt(
  config: Required<Pick<CodexpertConnectorConfig, 'codexpertConnectorBaseUrl' | 'serviceToken'>>,
  principal: PrincipalContext,
  sessionId: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): AsyncIterable<CodexpertConnectorEvent> {
  const response = await fetchWithTimeout(
    `${trimRight(config.codexpertConnectorBaseUrl, '/')}/codexpert-connector/sessions/${encodeURIComponent(sessionId)}/prompts/stream`,
    {
      method: 'POST',
      headers: {
        ...buildConnectorHeaders({ serviceToken: config.serviceToken, principal }),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  )
  if (!response.ok) {
    throw new Error(`Codexpert connector stream failed (${response.status}): ${await response.text()}`)
  }
  if (!response.body) {
    throw new Error('Codexpert connector stream returned an empty body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          yield JSON.parse(line) as CodexpertConnectorEvent
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }
    const tail = buffer.trim()
    if (tail) {
      yield JSON.parse(tail) as CodexpertConnectorEvent
    }
  } finally {
    reader.releaseLock()
  }
}

function createConnectorFetch(connectorHeaders: Record<string, string>): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers)
    for (const [key, value] of Object.entries(connectorHeaders)) {
      headers.set(key, value)
    }
    return fetch(input, {
      ...init,
      headers,
    })
  }
}

function buildConnectorHeaders(input: ConnectorHeadersInput): Record<string, string> {
  return {
    authorization: `Bearer ${input.serviceToken}`,
    'tenant-id': input.principal.tenantId,
    'organization-id': input.principal.organizationId,
    'x-principal-user-id': input.principal.userId,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function readMcpPayload<T>(content: unknown): T {
  const text = readMcpText(content)
  if (!text) {
    return content as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

function readMcpText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null
  }
  return content
    .map((item) => (item && typeof item === 'object' && 'text' in item ? String((item as { text?: unknown }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n')
    .trim() || null
}

function trimRight(value: string, char: string): string {
  let current = value
  while (current.endsWith(char)) {
    current = current.slice(0, -char.length)
  }
  return current
}

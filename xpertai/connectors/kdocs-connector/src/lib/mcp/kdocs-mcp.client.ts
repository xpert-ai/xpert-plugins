import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  KDOCS_MCP_MAX_SESSIONS,
  KDOCS_MCP_REQUEST_TIMEOUT_MS,
  KDOCS_MCP_SESSION_IDLE_TTL_MS,
  KDOCS_MCP_TOOL_NAMES,
  KDOCS_SKILLHUB_MCP_URL,
  KDOCS_SKILL_VERSION,
  type KdocsMcpToolName
} from '../constants.js'
import { errorMessage, KdocsConnectorError } from '../errors.js'
import {
  type KdocsPayload,
  providerFailureCode,
  providerFailureMessage,
  readRecord
} from './kdocs-mappers.js'

type KdocsMcpSession = {
  key: string
  tokenFingerprint: string
  client: Client
  tools: Set<string>
  lastUsedAt: number
}

type KdocsMcpCallResult = Awaited<ReturnType<Client['callTool']>>

export class KdocsMcpToolError extends Error {
  constructor(
    readonly payload: KdocsPayload,
    message: string
  ) {
    super(message)
    this.name = 'KdocsMcpToolError'
  }
}

@Injectable()
export class KdocsMcpClient {
  private readonly sessions = new Map<string, KdocsMcpSession>()
  private readonly creating = new Map<string, Promise<KdocsMcpSession>>()

  async callTool(input: {
    sessionKey: string
    accessToken: string
    name: KdocsMcpToolName
    arguments: Record<string, unknown>
    retrySessionLost?: boolean
  }): Promise<KdocsPayload> {
    let session = await this.getSession(input.sessionKey, input.accessToken)
    if (!session.tools.has(input.name)) {
      throw new KdocsConnectorError('MCP_TOOL_UNAVAILABLE', `WPS MCP tool '${input.name}' is not available for this account`)
    }
    try {
      return await this.call(session.client, input.name, input.arguments)
    } catch (error) {
      if (input.retrySessionLost && isSessionLost(error)) {
        await this.dropSession(input.sessionKey)
        session = await this.getSession(input.sessionKey, input.accessToken)
        if (!session.tools.has(input.name)) {
          throw new KdocsConnectorError('MCP_TOOL_UNAVAILABLE', `WPS MCP tool '${input.name}' is no longer available`)
        }
        return this.call(session.client, input.name, input.arguments)
      }
      throw normalizeMcpError(error)
    }
  }

  async closeAll() {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    this.creating.clear()
    await Promise.allSettled(sessions.map((session) => session.client.close()))
  }

  private async getSession(key: string, accessToken: string) {
    this.evictExpired()
    const tokenFingerprint = createHash('sha256').update(accessToken).digest('hex')
    const current = this.sessions.get(key)
    if (current?.tokenFingerprint === tokenFingerprint) {
      current.lastUsedAt = Date.now()
      this.sessions.delete(key)
      this.sessions.set(key, current)
      return current
    }
    if (current) await this.dropSession(key)
    const pending = this.creating.get(key)
    if (pending) return pending
    const creating = this.createSession(key, accessToken, tokenFingerprint)
    this.creating.set(key, creating)
    try {
      const session = await creating
      this.sessions.set(key, session)
      this.enforceLimit()
      return session
    } finally {
      this.creating.delete(key)
    }
  }

  private async createSession(key: string, accessToken: string, tokenFingerprint: string): Promise<KdocsMcpSession> {
    const client = new Client({ name: 'xpert-kdocs-connector', version: '0.1.0' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(new URL(KDOCS_SKILLHUB_MCP_URL), {
      requestInit: {
        headers: kdocsMcpHeaders(accessToken)
      },
      reconnectionOptions: {
        initialReconnectionDelay: 500,
        maxReconnectionDelay: 2_000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 1
      }
    })
    try {
      await client.connect(transport)
      const listed = await client.listTools(undefined, requestOptions())
      const tools = new Set(filterAllowedToolNames(listed.tools.map((tool) => tool.name)))
      return { key, tokenFingerprint, client, tools, lastUsedAt: Date.now() }
    } catch (error) {
      await client.close().catch(() => undefined)
      throw normalizeMcpError(error)
    }
  }

  private async call(client: Client, name: KdocsMcpToolName, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args }, undefined, requestOptions())
    const normalized = normalizeCallResult(result)
    if (normalized.isError) {
      throw new KdocsMcpToolError(normalized.payload, providerFailureMessage(normalized.payload) ?? `WPS MCP tool '${name}' failed`)
    }
    return normalized.payload
  }

  private evictExpired() {
    const cutoff = Date.now() - KDOCS_MCP_SESSION_IDLE_TTL_MS
    for (const [key, session] of this.sessions) {
      if (session.lastUsedAt < cutoff) void this.dropSession(key)
    }
  }

  private enforceLimit() {
    while (this.sessions.size > KDOCS_MCP_MAX_SESSIONS) {
      const oldest = this.sessions.keys().next()
      if (oldest.done) return
      void this.dropSession(oldest.value)
    }
  }

  private async dropSession(key: string) {
    const session = this.sessions.get(key)
    this.sessions.delete(key)
    if (session) await session.client.close().catch(() => undefined)
  }
}

export function kdocsMcpHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'Xpert-KDocs-Connector',
    'X-Skill-Version': KDOCS_SKILL_VERSION
  }
}

export function filterAllowedToolNames(names: string[]) {
  const allowed = new Set<string>(KDOCS_MCP_TOOL_NAMES)
  return names.filter((name) => allowed.has(name))
}

function normalizeCallResult(result: KdocsMcpCallResult): { payload: KdocsPayload; isError: boolean } {
  if ('toolResult' in result) {
    return { payload: readRecord(result.toolResult) ?? { value: boundedValue(result.toolResult) }, isError: false }
  }
  const structured = readRecord(result.structuredContent)
  if (structured) return { payload: structured, isError: result.isError === true }
  const text = result.content.find((content) => content.type === 'text')?.text
  if (!text?.trim()) return { payload: {}, isError: result.isError === true }
  try {
    const parsed: unknown = JSON.parse(text)
    return {
      payload: readRecord(parsed) ?? { value: boundedValue(parsed) },
      isError: result.isError === true
    }
  } catch {
    return { payload: { message: text.slice(0, 2_000) }, isError: result.isError === true }
  }
}

function normalizeMcpError(error: unknown): Error {
  if (error instanceof KdocsConnectorError) return error
  if (error instanceof KdocsMcpToolError) {
    const code = providerFailureCode(error.payload)
    if (code === '400006' || code === '401') {
      return new KdocsConnectorError('TOKEN_EXPIRED', 'WPS connector authorization has expired')
    }
    if (code === '429001' || code === '429') {
      return new KdocsConnectorError('RATE_LIMITED', error.message, true)
    }
    if (code === '429002') return new KdocsConnectorError('CIRCUIT_OPEN', error.message, true)
    return new KdocsConnectorError('MCP_TOOL_FAILED', error.message)
  }
  const status = error instanceof StreamableHTTPError ? error.code : undefined
  if (status === 401 || status === 403 || errorName(error) === 'UnauthorizedError') {
    return new KdocsConnectorError('TOKEN_EXPIRED', 'WPS connector access token was rejected')
  }
  if (status === 429) return new KdocsConnectorError('RATE_LIMITED', 'WPS request rate limit was reached', true)
  if (status === 404) return new KdocsConnectorError('MCP_SESSION_LOST', 'WPS MCP session was lost', true)
  return new KdocsConnectorError('MCP_TOOL_FAILED', `WPS MCP request failed: ${errorMessage(error)}`)
}

function isSessionLost(error: unknown) {
  return (error instanceof StreamableHTTPError && error.code === 404) ||
    (error instanceof KdocsConnectorError && error.code === 'MCP_SESSION_LOST')
}

function requestOptions() {
  return { timeout: KDOCS_MCP_REQUEST_TIMEOUT_MS, maxTotalTimeout: KDOCS_MCP_REQUEST_TIMEOUT_MS }
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : ''
}

function boundedValue(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 2_000)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return 'unsupported_result'
}

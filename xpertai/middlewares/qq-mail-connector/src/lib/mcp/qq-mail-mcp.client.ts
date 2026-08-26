import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  QQ_MAIL_MAX_SESSIONS,
  QQ_MAIL_MCP_REQUEST_TIMEOUT_MS,
  QQ_MAIL_MCP_URL,
  QQ_MAIL_SESSION_IDLE_TTL_MS
} from '../constants.js'
import { errorMessage, QqMailConnectorError } from '../errors.js'
import { extractToolFailure, mapAccount } from './qq-mail-mappers.js'
import type { QqMailAccount, QqMailMcpCallResult, QqMailMcpPayload, QqMailMcpToolFailure } from './types.js'

type QqMailSession = {
  key: string
  tokenFingerprint: string
  client: Client
  account: QqMailAccount
  lastUsedAt: number
}

export class QqMailMcpToolError extends Error {
  constructor(readonly failure: QqMailMcpToolFailure, readonly payload: QqMailMcpPayload) {
    super(failure.message)
    this.name = 'QqMailMcpToolError'
  }
}

@Injectable()
export class QqMailMcpClient {
  private readonly sessions = new Map<string, QqMailSession>()
  private readonly creating = new Map<string, Promise<QqMailSession>>()

  async getAccount(sessionKey: string, accessToken: string): Promise<QqMailAccount> {
    return (await this.getSession(sessionKey, accessToken)).account
  }

  async callTool(input: {
    sessionKey: string
    accessToken: string
    name: string
    arguments: Record<string, unknown>
    retrySessionLost?: boolean
  }): Promise<{ account: QqMailAccount; payload: QqMailMcpPayload }> {
    let session = await this.getSession(input.sessionKey, input.accessToken)
    try {
      return { account: session.account, payload: await this.call(session.client, input.name, input.arguments) }
    } catch (error) {
      if (input.retrySessionLost && isSessionLost(error)) {
        await this.dropSession(input.sessionKey)
        session = await this.getSession(input.sessionKey, input.accessToken)
        return { account: session.account, payload: await this.call(session.client, input.name, input.arguments) }
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

  private async createSession(key: string, accessToken: string, tokenFingerprint: string): Promise<QqMailSession> {
    const client = new Client({ name: 'xpert-qq-mail-connector', version: '0.1.0' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(new URL(QQ_MAIL_MCP_URL), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Xpert-QQ-Mail-Connector'
        }
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
      const account = mapAccount(await this.call(client, 'GetMe', {}))
      return { key, tokenFingerprint, client, account, lastUsedAt: Date.now() }
    } catch (error) {
      await client.close().catch(() => undefined)
      throw normalizeMcpError(error)
    }
  }

  private async call(client: Client, name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args }, CallToolResultSchema, {
      timeout: QQ_MAIL_MCP_REQUEST_TIMEOUT_MS,
      maxTotalTimeout: QQ_MAIL_MCP_REQUEST_TIMEOUT_MS
    })
    if (!isCallToolResult(result)) {
      throw new QqMailConnectorError('MCP_TOOL_FAILED', 'QQ Mail MCP returned an unsupported task result')
    }
    const normalized = normalizeCallResult(result)
    if (normalized.isError) throw new QqMailMcpToolError(extractToolFailure(normalized.payload), normalized.payload)
    return normalized.payload
  }

  private evictExpired() {
    const cutoff = Date.now() - QQ_MAIL_SESSION_IDLE_TTL_MS
    for (const [key, session] of this.sessions) {
      if (session.lastUsedAt < cutoff) void this.dropSession(key)
    }
  }

  private enforceLimit() {
    while (this.sessions.size > QQ_MAIL_MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value as string | undefined
      if (!oldestKey) return
      void this.dropSession(oldestKey)
    }
  }

  private async dropSession(key: string) {
    const session = this.sessions.get(key)
    this.sessions.delete(key)
    if (session) await session.client.close().catch(() => undefined)
  }
}

function normalizeCallResult(result: CallToolResult): QqMailMcpCallResult {
  const structured = isRecord(result.structuredContent) ? result.structuredContent : undefined
  if (structured) return { payload: structured, isError: result.isError === true }
  const text = result.content.find(
    (content): content is Extract<(typeof result.content)[number], { type: 'text' }> => content.type === 'text'
  )?.text
  if (!text?.trim()) return { payload: {}, isError: result.isError === true }
  try {
    const parsed: unknown = JSON.parse(text)
    return {
      payload: isRecord(parsed) ? parsed : { value: parsed },
      isError: result.isError === true
    }
  } catch {
    return { payload: { message: text.slice(0, 2_000) }, isError: result.isError === true }
  }
}

function normalizeMcpError(error: unknown): Error {
  if (error instanceof QqMailMcpToolError || error instanceof QqMailConnectorError) return error
  const status = error instanceof StreamableHTTPError ? error.code : undefined
  if (status === 401 || errorName(error) === 'UnauthorizedError') {
    return new QqMailConnectorError('MCP_UNAUTHORIZED', 'QQ Mail access token was rejected')
  }
  if (status === 429) return new QqMailConnectorError('RATE_LIMITED', 'QQ Mail request rate limit was reached', true)
  if (status === 404) return new QqMailConnectorError('MCP_SESSION_LOST', 'QQ Mail MCP session was lost', true)
  return new QqMailConnectorError('MCP_TOOL_FAILED', `QQ Mail MCP request failed: ${errorMessage(error)}`)
}

function isSessionLost(error: unknown) {
  return (
    (error instanceof StreamableHTTPError && error.code === 404) ||
    (error instanceof QqMailConnectorError && error.code === 'MCP_SESSION_LOST')
  )
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCallToolResult(value: unknown): value is CallToolResult {
  return isRecord(value) && Array.isArray(value.content)
}

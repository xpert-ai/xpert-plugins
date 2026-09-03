import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import {
  CANVA_MCP_CN_ENDPOINT,
  CANVA_MCP_GENERATE_TIMEOUT_MS,
  CANVA_MCP_MAX_SESSIONS,
  CANVA_MCP_REQUEST_TIMEOUT_MS,
  CANVA_MCP_SESSION_IDLE_TTL_MS,
  CANVA_MCP_TOOL_NAMES,
  type CanvaMcpToolName
} from '../constants.js'
import { CanvaConnectorError, errorMessage, readString } from '../errors.js'
import { readRecord, type CanvaPayload } from './canva-mappers.js'

type CanvaToolPropertySchema = { type?: string; enum?: readonly unknown[] }
export type CanvaToolInputSchema = {
  type: 'object'
  properties?: Record<string, object>
  required?: readonly string[]
  additionalProperties?: boolean
}
type CanvaToolDefinition = { name: string; inputSchema: CanvaToolInputSchema }
type CanvaSession = {
  key: string
  tokenFingerprint: string
  client: Client
  tools: Map<string, CanvaToolDefinition>
  lastUsedAt: number
}
type MpcCallResult = Awaited<ReturnType<Client['callTool']>>

@Injectable()
export class CanvaMcpClient {
  private readonly logger = new Logger(CanvaMcpClient.name)
  private readonly sessions = new Map<string, CanvaSession>()
  private readonly creating = new Map<string, Promise<CanvaSession>>()

  async callTool(input: {
    connectorId: string
    accessToken: string
    resource: string
    name: CanvaMcpToolName
    arguments: Record<string, unknown>
  }): Promise<CanvaPayload> {
    const session = await this.getSession(input.connectorId, input.accessToken, input.resource)
    const definition = session.tools.get(input.name)
    if (!definition)
      throw new CanvaConnectorError(
        'CANVA_TOOL_UNAVAILABLE',
        `Canva MCP tool '${input.name}' is not available for this account`
      )
    const argumentsToSend = normalizeToolArguments(input.name, input.arguments, definition.inputSchema)
    validateToolArguments(input.name, argumentsToSend, definition.inputSchema)
    try {
      return await this.call(session.client, input.name, argumentsToSend)
    } catch (error) {
      if (isSessionLost(error)) {
        await this.dropSession(session.key)
        const retry = await this.getSession(input.connectorId, input.accessToken, input.resource)
        const retryDefinition = retry.tools.get(input.name)
        if (!retryDefinition)
          throw new CanvaConnectorError(
            'CANVA_TOOL_UNAVAILABLE',
            `Canva MCP tool '${input.name}' is no longer available`
          )
        const retryArguments = normalizeToolArguments(input.name, input.arguments, retryDefinition.inputSchema)
        validateToolArguments(input.name, retryArguments, retryDefinition.inputSchema)
        return this.call(retry.client, input.name, retryArguments)
      }
      throw normalizeMcpError(error, input.name)
    }
  }

  async closeByConnector(connectorId: string) {
    const prefix = `${connectorId}:`
    const keys = [...this.sessions.keys()].filter((key) => key.startsWith(prefix))
    await Promise.all(keys.map((key) => this.dropSession(key)))
  }

  async closeAll() {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    this.creating.clear()
    await Promise.allSettled(sessions.map((session) => session.client.close()))
  }

  private async getSession(key: string, accessToken: string, resource: string) {
    this.evictExpired()
    const tokenFingerprint = createHash('sha256').update(accessToken).digest('hex')
    const sessionKey = `${key}:${resource}`
    const current = this.sessions.get(sessionKey)
    if (current?.tokenFingerprint === tokenFingerprint) {
      current.lastUsedAt = Date.now()
      return current
    }
    if (current) await this.dropSession(sessionKey)
    const pending = this.creating.get(sessionKey)
    if (pending) return pending
    const creating = this.createSession(sessionKey, accessToken, resource, tokenFingerprint)
    this.creating.set(sessionKey, creating)
    try {
      const session = await creating
      this.sessions.set(sessionKey, session)
      this.enforceLimit()
      return session
    } finally {
      this.creating.delete(sessionKey)
    }
  }

  private async createSession(
    key: string,
    accessToken: string,
    resource: string,
    tokenFingerprint: string
  ): Promise<CanvaSession> {
    const client = new Client({ name: 'xpert-canva-connector', version: '0.1.0' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(new URL(CANVA_MCP_CN_ENDPOINT), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Canva-Resource': resource,
          'User-Agent': 'Xpert-Canva-Connector'
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
      const listed = await client.listTools(undefined, requestOptions())
      const tools = new Map(
        listed.tools
          .filter((tool) => (CANVA_MCP_TOOL_NAMES as readonly string[]).includes(tool.name))
          .map((tool) => [tool.name, { name: tool.name, inputSchema: tool.inputSchema as CanvaToolInputSchema }])
      )
      return { key, tokenFingerprint, client, tools, lastUsedAt: Date.now() }
    } catch (error) {
      await client.close().catch(() => undefined)
      throw normalizeMcpError(error)
    }
  }

  private async call(client: Client, name: CanvaMcpToolName, args: Record<string, unknown>) {
    const startedAt = Date.now()
    const result = await client.callTool({ name, arguments: args }, undefined, requestOptions(name))
    const normalized = normalizeResult(result)
    if (normalized.isError) {
      const failure = describeMcpToolFailure(name, normalized.payload)
      this.logger.warn(
        `Canva MCP tool failed: tool=${name} durationMs=${Date.now() - startedAt} retryable=${failure.retryable}${
          failure.upstreamCode ? ` upstreamCode=${failure.upstreamCode}` : ''
        }`
      )
      throw new CanvaConnectorError(failure.code, failure.message, failure.retryable, failure.upstreamCode)
    }
    this.logger.debug(`Canva MCP tool completed: tool=${name} durationMs=${Date.now() - startedAt}`)
    return normalized.payload
  }

  private evictExpired() {
    const cutoff = Date.now() - CANVA_MCP_SESSION_IDLE_TTL_MS
    for (const [key, session] of this.sessions) if (session.lastUsedAt < cutoff) void this.dropSession(key)
  }
  private enforceLimit() {
    while (this.sessions.size > CANVA_MCP_MAX_SESSIONS) {
      const first = this.sessions.keys().next()
      if (first.done) return
      void this.dropSession(first.value)
    }
  }
  private async dropSession(key: string) {
    const session = this.sessions.get(key)
    this.sessions.delete(key)
    if (session) await session.client.close().catch(() => undefined)
  }
}

function normalizeResult(result: MpcCallResult): { payload: CanvaPayload; isError: boolean } {
  const structured = readRecord(result.structuredContent)
  const content = Array.isArray(result.content) ? result.content : []
  const text = content.find(
    (item): item is { type: 'text'; text: string } =>
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      item.type === 'text' &&
      'text' in item &&
      typeof item.text === 'string'
  )?.text
  const textPayload = text?.trim() ? parseTextPayload(text) : {}
  const payload = boundedPayload({ ...textPayload, ...(structured ? boundedPayload(structured) : {}) })
  return { payload, isError: result.isError === true || hasErrorEnvelope(payload) }
}

function parseTextPayload(text: string): CanvaPayload {
  try {
    const parsed: unknown = JSON.parse(text)
    return readRecord(parsed) ?? { message: text.slice(0, 2_000) }
  } catch {
    return { message: text.slice(0, 2_000) }
  }
}

function hasErrorEnvelope(payload: CanvaPayload) {
  if (
    payload.error != null ||
    payload.error_code != null ||
    payload.errorCode != null ||
    payload.failure_code != null ||
    payload.failureCode != null
  )
    return true
  const status = readString(payload.status)
  return Boolean(status && /^(error|failed|failure|rejected)$/i.test(status))
}

function boundedPayload(value: CanvaPayload): CanvaPayload {
  const output: CanvaPayload = {}
  for (const [key, item] of Object.entries(value).slice(0, 100)) output[key] = bounded(item, 0)
  return output
}
function bounded(value: unknown, depth: number): unknown {
  // Canva generation nests generated designs and previews under job.result.
  if (depth > 6) return '[truncated]'
  if (typeof value === 'string') return value.slice(0, 8_000)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => bounded(item, depth + 1))
  if (typeof value === 'object' && value)
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [key, bounded(item, depth + 1)])
    )
  return null
}
export function requestOptions(name?: CanvaMcpToolName) {
  const timeout = name === 'generate-design' ? CANVA_MCP_GENERATE_TIMEOUT_MS : CANVA_MCP_REQUEST_TIMEOUT_MS
  return { timeout, maxTotalTimeout: timeout }
}
function isSessionLost(error: unknown) {
  return error instanceof StreamableHTTPError && error.code === 404
}
export function normalizeMcpError(error: unknown, operation?: CanvaMcpToolName): CanvaConnectorError {
  if (error instanceof CanvaConnectorError) return error
  if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
    const generation = operation === 'generate-design'
    return new CanvaConnectorError(
      'CANVA_JOB_TIMEOUT',
      generation
        ? `Canva design generation exceeded ${
            CANVA_MCP_GENERATE_TIMEOUT_MS / 1_000
          } seconds. The outcome is unknown, so it was not retried automatically.`
        : 'Canva MCP request timed out.',
      false,
      String(error.code)
    )
  }
  const status = error instanceof StreamableHTTPError ? error.code : undefined
  if (status === 401 || status === 403)
    return new CanvaConnectorError('CANVA_TOKEN_EXPIRED', 'Canva access token was rejected')
  if (status === 404) return new CanvaConnectorError('CANVA_MCP_SESSION_LOST', 'Canva MCP session was lost', true)
  if (status === 429) return new CanvaConnectorError('CANVA_RATE_LIMITED', 'Canva request rate limit was reached', true)
  return new CanvaConnectorError('CANVA_MCP_TOOL_FAILED', `Canva MCP request failed: ${errorMessage(error)}`)
}

type McpToolFailure = {
  code:
    | 'CANVA_MCP_TOOL_FAILED'
    | 'CANVA_RATE_LIMITED'
    | 'CANVA_AI_QUOTA_EXHAUSTED'
    | 'CANVA_TOKEN_EXPIRED'
    | 'CANVA_SCOPE_MISSING'
    | 'CANVA_INPUT_INVALID'
    | 'CANVA_JOB_TIMEOUT'
  message: string
  upstreamCode?: string
  retryable: boolean
}

export function describeMcpToolFailure(name: string, payload: CanvaPayload): McpToolFailure {
  const nestedError = readRecord(payload.error) ?? readRecord(payload.failure) ?? readRecord(payload.details)
  const upstreamCode = normalizeUpstreamCode(
    readString(
      nestedError?.code ??
        nestedError?.error_code ??
        payload.error_code ??
        payload.errorCode ??
        payload.failure_code ??
        payload.failureCode ??
        payload.code
    )
  )
  const upstreamMessage = readString(
    nestedError?.message ??
      nestedError?.detail ??
      payload.error_message ??
      payload.errorMessage ??
      payload.message ??
      payload.detail ??
      payload.error
  )
  if (isAiQuotaExhausted(upstreamCode, upstreamMessage)) {
    return {
      code: 'CANVA_AI_QUOTA_EXHAUSTED',
      message:
        'Canva AI generation quota is exhausted for the current account. Wait for the monthly reset or review the Canva plan.',
      ...(upstreamCode ? { upstreamCode } : {}),
      retryable: false
    }
  }
  const message = sanitizeProviderMessage(upstreamMessage)
  const retryable = isRetryableMcpFailure(upstreamCode)
  return {
    code: mapUpstreamErrorCode(upstreamCode),
    message: `Canva MCP tool '${name}' failed${upstreamCode ? ` (${upstreamCode})` : ''}${
      message ? `: ${message}` : ': upstream service returned an error'
    }`,
    ...(upstreamCode ? { upstreamCode } : {}),
    retryable
  }
}

export function validateToolArguments(name: string, args: Record<string, unknown>, schema: CanvaToolInputSchema) {
  const properties = schema.properties ?? {}
  for (const required of schema.required ?? []) {
    if (!(required in args) || args[required] === undefined)
      throw new CanvaConnectorError('CANVA_INPUT_INVALID', `Canva MCP tool '${name}' requires argument '${required}'`)
  }
  if (schema.additionalProperties === false) {
    const unknown = Object.keys(args).find((key) => !(key in properties))
    if (unknown)
      throw new CanvaConnectorError(
        'CANVA_INPUT_INVALID',
        `Canva MCP tool '${name}' does not accept argument '${unknown}'`
      )
  }
  for (const [key, value] of Object.entries(args)) {
    const property = properties[key]
    if (!property) continue
    const details = readToolPropertySchema(property)
    if (details?.type && !matchesJsonType(value, details.type))
      throw new CanvaConnectorError(
        'CANVA_INPUT_INVALID',
        `Canva MCP tool '${name}' argument '${key}' must be ${details.type}`
      )
    if (details?.enum && !details.enum.some((candidate) => Object.is(candidate, value)))
      throw new CanvaConnectorError(
        'CANVA_INPUT_INVALID',
        `Canva MCP tool '${name}' argument '${key}' has an unsupported value`
      )
  }
}

/**
 * Canva MCP deployments can expose compatible tools with different field
 * names. Keep the connector's stable inputs while adapting to each live schema.
 */
export function normalizeToolArguments(name: string, args: Record<string, unknown>, schema: CanvaToolInputSchema) {
  const properties = schema.properties ?? {}
  const normalized = { ...args }

  if (name === 'search-designs') {
    for (const key of ['page', 'page_size', 'pageSize']) {
      if (key in normalized && !(key in properties)) delete normalized[key]
    }
    return normalized
  }

  if (name === 'generate-design') {
    // Some Canva MCP deployments renamed the required prompt field to query.
    if ('query' in properties && !('query' in normalized) && typeof normalized.prompt === 'string') {
      normalized.query = normalized.prompt
    }
    for (const key of ['prompt', 'query', 'design_type', 'designType', 'language', 'user_intent']) {
      if (key in normalized && !(key in properties)) delete normalized[key]
    }
  }

  return normalized
}

function readToolPropertySchema(value: object): CanvaToolPropertySchema | undefined {
  const entries = Object.entries(value)
  const type = entries.find(([key]) => key === 'type')?.[1]
  const enumValue = entries.find(([key]) => key === 'enum')?.[1]
  return {
    ...(typeof type === 'string' ? { type } : {}),
    ...(Array.isArray(enumValue) ? { enum: enumValue } : {})
  }
}

function matchesJsonType(value: unknown, type: string) {
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return true
}

function isRetryableMcpFailure(code: string | undefined) {
  if (code && /(?:quota.*(?:exhaust|used)|monthly.*quota|ai.*quota)/i.test(code)) return false
  return Boolean(code && /rate|limit|timeout|temporar|unavailable|busy|try_again/i.test(code))
}

function isAiQuotaExhausted(code: string | undefined, message: string | undefined) {
  if (code && /(?:ai.*quota|quota.*(?:exhaust|used)|monthly.*(?:quota|limit))/i.test(code)) return true
  if (!message) return false
  return (
    /本月.{0,30}AI.{0,20}额度已用完/i.test(message) ||
    /AI.{0,20}额度.{0,20}(?:用完|耗尽|不足)/i.test(message) ||
    /(?:AI\s*)?(?:quota|credits?|generation limit).{0,40}(?:exhausted|used up|reached)/i.test(message)
  )
}

function mapUpstreamErrorCode(code: string | undefined): McpToolFailure['code'] {
  if (!code) return 'CANVA_MCP_TOOL_FAILED'
  if (/rate|limit|quota/i.test(code)) return 'CANVA_RATE_LIMITED'
  if (/token|unauthori[sz]ed/i.test(code)) return 'CANVA_TOKEN_EXPIRED'
  if (/forbidden|permission|scope/i.test(code)) return 'CANVA_SCOPE_MISSING'
  if (/invalid[_-]?(argument|param|request)|schema|validation/i.test(code)) return 'CANVA_INPUT_INVALID'
  if (/timeout/i.test(code)) return 'CANVA_JOB_TIMEOUT'
  return 'CANVA_MCP_TOOL_FAILED'
}

function normalizeUpstreamCode(value: string | undefined) {
  if (!value) return undefined
  const normalized = value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120)
  return normalized || undefined
}

function sanitizeProviderMessage(value: string | undefined) {
  if (!value) return undefined
  const wrapped = value.match(/<verbatim>([\s\S]*?)<\/verbatim>/i)?.[1]
  return (
    (wrapped ?? value)
      .replace(/<\/?verbatim>/gi, '')
      .replace(/^display this message to the user[^:]{0,300}:\s*/i, '')
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
      .replace(/((?:access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 1_000) || undefined
  )
}

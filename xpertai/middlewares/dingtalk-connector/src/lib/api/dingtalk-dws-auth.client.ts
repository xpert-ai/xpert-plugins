import { timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { Injectable } from '@nestjs/common'

export const DINGTALK_DWS_MCP_BASE_URL = 'https://mcp.dingtalk.com'
export const DINGTALK_DWS_DEVICE_BASE_URL = 'https://login.dingtalk.com'
export const DINGTALK_DWS_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/challenge.htm'

const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 7_200
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60
const DEFAULT_DEVICE_EXPIRES_IN = 900
const DEFAULT_POLL_INTERVAL = 5
const MAX_POLL_INTERVAL = 30
const LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000

export type DingTalkDwsDeviceAuthorization = {
  clientId: string
  deviceCode: string
  userCode: string
  authorizationUrl: string
  expiresIn: number
  interval: number
  flowId?: string
}

export type DingTalkDwsDevicePollResult =
  | { status: 'pending'; interval?: number }
  | { status: 'approved'; authCode: string }
  | { status: 'error'; error: string }

export type DingTalkDwsLoopbackAuthorization = {
  clientId: string
  redirectUri: string
  authorizationUrl: string
  close(): Promise<void>
}

export type DingTalkDwsOAuthToken = {
  clientId: string
  accessToken: string
  refreshToken?: string
  persistentCode?: string
  expiresIn: number
  refreshExpiresIn: number
  corpId?: string
  corpName?: string
  userId?: string
  userName?: string
}

@Injectable()
export class DingTalkDwsAuthClient {
  async startLoopbackAuthorization(input: {
    state: string
    scopes: string[]
    forwardRedirectUri: string
  }): Promise<DingTalkDwsLoopbackAuthorization> {
    const clientId = await this.fetchOfficialClientId()
    const forwardRedirectUri = validateForwardRedirectUri(input.forwardRedirectUri)
    const server = createServer((request, response) => {
      void this.handleLoopbackCallback(server, request, response, {
        state: input.state,
        forwardRedirectUri
      })
    })

    try {
      const port = await listenLoopback(server)
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const authorizationUrl = new URL(DINGTALK_DWS_AUTHORIZE_URL)
      authorizationUrl.searchParams.set('client_id', clientId)
      authorizationUrl.searchParams.set('redirect_uri', redirectUri)
      authorizationUrl.searchParams.set('response_type', 'code')
      authorizationUrl.searchParams.set('scope', input.scopes.join(' '))
      authorizationUrl.searchParams.set('state', input.state)
      authorizationUrl.searchParams.set('prompt', 'consent')

      const timeout = setTimeout(() => {
        void closeServer(server)
      }, LOOPBACK_TIMEOUT_MS)
      timeout.unref?.()

      return {
        clientId,
        redirectUri,
        authorizationUrl: authorizationUrl.toString(),
        close: async () => {
          clearTimeout(timeout)
          await closeServer(server)
        }
      }
    } catch (error) {
      await closeServer(server)
      throw new Error(`Failed to start DingTalk DWS loopback authorization: ${errorMessage(error)}`)
    }
  }

  async startDeviceAuthorization(scopes: string[]): Promise<DingTalkDwsDeviceAuthorization> {
    const clientId = await this.fetchOfficialClientId()
    const form = new URLSearchParams({ client_id: clientId })
    if (scopes.length) form.set('scope', scopes.join(' '))

    const payload = await requestJson(`${DINGTALK_DWS_DEVICE_BASE_URL}/oauth2/device/code.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
    const result = requireServiceResult(payload, 'DingTalk DWS device authorization')
    const deviceCode = requireString(result, ['deviceCode'], 'DingTalk DWS device response is missing deviceCode')
    const userCode = requireString(result, ['userCode'], 'DingTalk DWS device response is missing userCode')
    const verificationUri = readString(result, ['verificationUri'])
    const verificationUriComplete = readString(result, ['verificationUriComplete'])
    const authorizationUrl = verificationUriComplete ?? appendUserCode(verificationUri, userCode)

    return {
      clientId,
      deviceCode,
      userCode,
      authorizationUrl: requireDingTalkLoginUrl(authorizationUrl),
      expiresIn: positiveNumber(result, ['expiresIn']) ?? DEFAULT_DEVICE_EXPIRES_IN,
      interval: boundedInterval(positiveNumber(result, ['interval']) ?? DEFAULT_POLL_INTERVAL),
      flowId: readString(result, ['flowId']) ?? undefined
    }
  }

  async pollDeviceAuthorization(input: {
    clientId: string
    deviceCode: string
    flowId?: string
    interval: number
  }): Promise<DingTalkDwsDevicePollResult> {
    if (input.flowId) {
      return this.pollDeviceFlow(input.flowId)
    }

    const form = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: input.deviceCode,
      client_id: input.clientId
    })
    const payload = await requestJson(`${DINGTALK_DWS_DEVICE_BASE_URL}/oauth2/device/token.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
    const result = requireServiceResult(payload, 'DingTalk DWS device polling')
    const authCode = readString(result, ['authCode'])
    if (authCode) return { status: 'approved', authCode }

    switch (readString(result, ['error'])) {
      case 'authorization_pending':
        return { status: 'pending' }
      case 'slow_down':
        return { status: 'pending', interval: boundedInterval(input.interval + 5) }
      case 'access_denied':
        return { status: 'error', error: 'DingTalk authorization was declined. Start the connection again.' }
      case 'expired_token':
        return { status: 'error', error: 'DingTalk authorization expired. Start the connection again.' }
      default:
        return { status: 'pending' }
    }
  }

  async exchangeAuthorizationCode(clientId: string, authCode: string): Promise<DingTalkDwsOAuthToken> {
    return this.requestToken({ clientId, authCode, grantType: 'authorization_code' })
  }

  async refreshToken(clientId: string, refreshToken: string): Promise<DingTalkDwsOAuthToken> {
    return this.requestToken({ clientId, refreshToken, grantType: 'refresh_token' })
  }

  async assertCliAccess(accessToken: string): Promise<void> {
    const payload = await requestJson(`${DINGTALK_DWS_MCP_BASE_URL}/cli/cliAuthEnabled`, {
      headers: { 'x-user-access-token': accessToken }
    })
    const errorCode = readString(payload, ['errorCode'])
    const errorMessage = readString(payload, ['errorMsg'])
    const result = readRecord(payload['result'])
    if (payload['success'] === true && result?.['cliAuthEnabled'] === true) return

    if (errorCode === 'ENTERPRISE_NOT_AUTHORIZED') {
      throw new Error(errorMessage ?? 'This DingTalk organization did not pass enterprise security verification.')
    }
    if (errorCode === 'NO_AUTH') {
      throw new Error('DingTalk authentication is no longer valid. Start the connection again.')
    }

    const userScope = readString(result, ['userScope'])
    if (userScope === 'forbidden') {
      throw new Error('This DingTalk organization has disabled DWS CLI access for all members.')
    }
    if (userScope === 'specified') {
      throw new Error("Your DingTalk account is not included in this organization's DWS CLI access list.")
    }
    const channelScope = readString(result, ['channelScope'])
    if (errorCode === 'CHANNEL_REQUIRED' || channelScope === 'specified') {
      throw new Error('This DingTalk organization requires an approved DWS channel for CLI access.')
    }
    throw new Error(errorMessage ?? 'This DingTalk organization has not enabled DWS CLI access.')
  }

  async getOfficialClientId(): Promise<string> {
    return this.fetchOfficialClientId()
  }

  private async fetchOfficialClientId(): Promise<string> {
    const payload = await requestJson(`${DINGTALK_DWS_MCP_BASE_URL}/cli/clientId`)
    if (payload['success'] !== true) {
      throw new Error(readString(payload, ['errorMsg']) ?? 'DingTalk DWS did not provide its official OAuth Client ID.')
    }
    return requireText(payload['result'], 'DingTalk DWS official OAuth Client ID is missing')
  }

  private async handleLoopbackCallback(
    server: Server,
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
    input: { state: string; forwardRedirectUri: string }
  ) {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method !== 'GET' || requestUrl.pathname !== '/callback') {
      response.writeHead(404, { 'cache-control': 'no-store' })
      response.end('Not found')
      return
    }

    const returnedState = requestUrl.searchParams.get('state') ?? ''
    if (!secureEqual(returnedState, input.state)) {
      response.writeHead(400, { 'cache-control': 'no-store' })
      response.end('Invalid OAuth state')
      return
    }

    const code = requestUrl.searchParams.get('code')
    const authCode = requestUrl.searchParams.get('authCode')
    const error = requestUrl.searchParams.get('error')
    const errorDescription = requestUrl.searchParams.get('error_description')
    if (!code && !authCode && !error) {
      response.writeHead(400, { 'cache-control': 'no-store' })
      response.end('DingTalk did not return an authorization result')
      return
    }

    const redirect = new URL(input.forwardRedirectUri)
    redirect.searchParams.set('state', input.state)
    if (code) redirect.searchParams.set('code', code)
    if (authCode) redirect.searchParams.set('authCode', authCode)
    if (error) redirect.searchParams.set('error', error)
    if (errorDescription) redirect.searchParams.set('error_description', errorDescription)

    response.writeHead(302, {
      location: redirect.toString(),
      'cache-control': 'no-store'
    })
    response.end()
    await closeServer(server)
  }

  private async pollDeviceFlow(flowId: string): Promise<DingTalkDwsDevicePollResult> {
    const url = new URL(`${DINGTALK_DWS_MCP_BASE_URL}/cli/oauth/device/poll`)
    url.searchParams.set('flowId', flowId)
    const payload = await requestJson(url.toString())
    const data = readDeviceFlowData(payload)

    switch (readString(data, ['status'])) {
      case 'APPROVED': {
        const authCode = readString(data, ['authCode'])
        return authCode
          ? { status: 'approved', authCode }
          : { status: 'error', error: 'DingTalk approved the request without returning an authorization code.' }
      }
      case 'REJECTED':
      case 'CANCELLED':
        return { status: 'error', error: 'DingTalk authorization was declined. Start the connection again.' }
      case 'EXPIRED':
        return { status: 'error', error: 'DingTalk authorization expired. Start the connection again.' }
      default:
        return { status: 'pending' }
    }
  }

  private async requestToken(input: {
    clientId: string
    authCode?: string
    refreshToken?: string
    grantType: 'authorization_code' | 'refresh_token'
  }): Promise<DingTalkDwsOAuthToken> {
    const endpoint = input.grantType === 'authorization_code' ? '/oauth2/getToken' : '/oauth2/refreshToken'
    const payload = await requestJson(`${DINGTALK_DWS_MCP_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: input.clientId,
        grantType: input.grantType,
        ...(input.authCode ? { authCode: input.authCode } : {}),
        ...(input.refreshToken ? { refreshToken: input.refreshToken } : {})
      })
    })
    const accessToken = readString(payload, ['accessToken'])
    if (!accessToken) {
      throw new Error(readString(payload, ['errorMsg']) ?? 'DingTalk DWS token response is missing accessToken')
    }

    return {
      clientId: input.clientId,
      accessToken,
      refreshToken: readString(payload, ['refreshToken']) ?? undefined,
      persistentCode: readString(payload, ['persistentCode']) ?? undefined,
      expiresIn: positiveNumber(payload, ['expiresIn']) ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
      refreshExpiresIn:
        positiveNumber(payload, ['refreshExpiresIn', 'refreshTokenExpiresIn']) ?? DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
      corpId: readString(payload, ['corpId']) ?? undefined,
      corpName: readString(payload, ['corpName', 'corp_name', 'orgName']) ?? undefined,
      userId: readString(payload, ['userId']) ?? undefined,
      userName: readString(payload, ['userName']) ?? undefined
    }
  }
}

async function requestJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  let response: Response
  try {
    const headers = new Headers(init.headers)
    if (!headers.has('accept')) headers.set('accept', 'application/json')
    response = await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw new Error(`DingTalk DWS request failed: ${errorMessage(error)}`)
  }

  let payload: unknown
  try {
    const text = await response.text()
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('DingTalk DWS returned an invalid JSON response')
  }
  const record = readRecord(payload) ?? {}
  if (!response.ok) {
    const message = readString(record, ['errorMsg', 'message', 'msg']) ?? `HTTP ${response.status}`
    throw new Error(`DingTalk DWS request failed: ${message}`)
  }
  return record
}

function requireServiceResult(payload: Record<string, unknown>, operation: string): Record<string, unknown> {
  if (payload['success'] !== true) {
    const code = readString(payload, ['errorCode'])
    const message = readString(payload, ['errorMsg']) ?? 'Unknown error'
    throw new Error(`${operation} failed${code ? ` (${code})` : ''}: ${message}`)
  }
  const result = readRecord(payload['result'])
  if (!result) throw new Error(`${operation} returned an invalid result`)
  return result
}

function readDeviceFlowData(payload: Record<string, unknown>) {
  const data = readRecord(payload['data'])
  if (readString(data, ['status'])) return data
  return readRecord(payload['result']) ?? data ?? {}
}

function appendUserCode(verificationUri: string | null, userCode: string) {
  if (!verificationUri) return null
  const url = new URL(verificationUri)
  url.searchParams.set('user_code', userCode)
  return url.toString()
}

function requireDingTalkLoginUrl(value: string | null) {
  if (!value) throw new Error('DingTalk DWS device response is missing verificationUri')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'login.dingtalk.com') {
    throw new Error('DingTalk DWS returned an unsupported authorization URL')
  }
  return url.toString()
}

function boundedInterval(value: number) {
  return Math.min(MAX_POLL_INTERVAL, Math.max(1, Math.floor(value)))
}

function positiveNumber(value: unknown, keys: string[]) {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return candidate
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return null
}

function readString(value: unknown, keys: string[]) {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function requireString(value: unknown, keys: string[], message: string) {
  const result = readString(value, keys)
  if (!result) throw new Error(message)
  return result
}

function requireText(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function validateForwardRedirectUri(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Xpert OAuth callback URL is invalid')
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !isLoopback)) {
    throw new Error('Xpert OAuth callback URL must use HTTPS outside local development')
  }
  if (url.pathname !== '/api/connector/oauth/callback') {
    throw new Error('Xpert OAuth callback URL is not the connector callback endpoint')
  }
  if (url.username || url.password || url.hash) {
    throw new Error('Xpert OAuth callback URL contains unsupported components')
  }
  return url.toString()
}

function listenLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('DingTalk loopback listener did not expose a TCP port'))
        return
      }
      resolve(address.port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

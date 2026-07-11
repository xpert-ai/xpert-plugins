import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'
import { Injectable, Logger } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorAuthorizationPollInput,
  type ConnectorAuthorizationPollResult,
  type ConnectorAuthorizationUrlInput,
  type ConnectorDefinition,
  type ConnectorOAuthCodeInput,
  type ConnectorOAuthCredential,
  type ConnectorRefreshInput,
  type ConnectorStrategy
} from '@xpert-ai/plugin-sdk'
import axios, { AxiosError } from 'axios'
import { LARK_CONNECTOR_PROVIDER } from './lark-cli.types.js'
import { LarkIcon } from './types.js'

// Plugin-owned defaults for the workspace connector path. This mirrors the
// user-facing domains bundled by lark-cli AI skills; the platform connector
// layer stays provider-neutral and only stores the resulting credential.
const LARK_CLI_CONNECTOR_DEFAULT_USER_SCOPES = [
  'base:app:copy',
  'base:app:create',
  'base:app:read',
  'base:app:update',
  'base:block:create',
  'base:block:delete',
  'base:block:read',
  'base:block:update',
  'base:dashboard:create',
  'base:dashboard:delete',
  'base:dashboard:read',
  'base:dashboard:update',
  'base:field:create',
  'base:field:delete',
  'base:field:read',
  'base:field:update',
  'base:form:create',
  'base:form:delete',
  'base:form:read',
  'base:form:update',
  'base:history:read',
  'base:record:create',
  'base:record:delete',
  'base:record:read',
  'base:record:update',
  'base:role:create',
  'base:role:delete',
  'base:role:read',
  'base:role:update',
  'base:table:create',
  'base:table:delete',
  'base:table:read',
  'base:table:update',
  'base:view:read',
  'base:view:write_only',
  'base:workflow:create',
  'base:workflow:read',
  'base:workflow:update',
  'board:whiteboard:node:create',
  'board:whiteboard:node:read',
  'calendar:calendar.event:create',
  'calendar:calendar.event:read',
  'calendar:calendar.event:reply',
  'calendar:calendar.event:update',
  'calendar:calendar.free_busy:read',
  'contact:user.base:readonly',
  'contact:user.basic_profile:readonly',
  'contact:user:search',
  'docs:document.comment:create',
  'docs:document.comment:write_only',
  'docs:document.content:read',
  'docs:document.media:download',
  'docs:document.media:upload',
  'docs:document:export',
  'docs:document:import',
  'docs:permission.member:apply',
  'docs:permission.member:create',
  'docx:document:create',
  'docx:document:readonly',
  'docx:document:write_only',
  'drive:drive.metadata:readonly',
  'drive:file:download',
  'drive:file:upload',
  'im:chat.members:read',
  'im:chat:create_by_user',
  'im:chat:read',
  'im:chat:update',
  'im:feed.flag:read',
  'im:feed.flag:write',
  'im:feed.shortcut:read',
  'im:feed.shortcut:write',
  'im:feed_group_v1:read',
  'im:message',
  'im:message.group_msg:get_as_user',
  'im:message.p2p_msg:get_as_user',
  'im:message.reactions:read',
  'im:message.send_as_user',
  'im:message:readonly',
  'mail:event',
  'mail:user_mailbox.event.mail_address:read',
  'mail:user_mailbox.message.address:read',
  'mail:user_mailbox.message.body:read',
  'mail:user_mailbox.message.subject:read',
  'mail:user_mailbox.message:modify',
  'mail:user_mailbox.message:readonly',
  'mail:user_mailbox.message:send',
  'mail:user_mailbox:readonly',
  'minutes:minutes.artifacts:read',
  'minutes:minutes.basic:read',
  'minutes:minutes.media:export',
  'minutes:minutes.search:read',
  'minutes:minutes.upload:write',
  'minutes:minutes:readonly',
  'minutes:minutes:update',
  'search:docs:read',
  'search:message',
  'sheets:spreadsheet.meta:read',
  'sheets:spreadsheet:create',
  'sheets:spreadsheet:read',
  'sheets:spreadsheet:write_only',
  'slides:presentation:create',
  'slides:presentation:read',
  'slides:presentation:update',
  'slides:presentation:write_only',
  'space:document:delete',
  'space:document:move',
  'space:document:shortcut',
  'space:folder:create',
  'task:attachment:write',
  'task:comment:write',
  'task:task:read',
  'task:task:write',
  'task:tasklist:read',
  'task:tasklist:write',
  'vc:meeting.bot.join:write',
  'vc:meeting.meetingevent:read',
  'vc:meeting.message:write',
  'vc:meeting.search:read',
  'vc:note:read',
  'vc:record:readonly',
  'wiki:member:create',
  'wiki:member:retrieve',
  'wiki:member:update',
  'wiki:node:copy',
  'wiki:node:create',
  'wiki:node:move',
  'wiki:node:read',
  'wiki:node:retrieve',
  'wiki:space:read',
  'wiki:space:retrieve',
  'wiki:space:write_only'
] as const

/**
 * Feishu workspace connector strategy.
 *
 * Implements ConnectorStrategy for workspace-level OAuth registration,
 * authorization polling, token refresh, and connector metadata.
 */
@Injectable()
@ConnectorStrategyKey(LARK_CONNECTOR_PROVIDER)
export class LarkConnectorStrategy implements ConnectorStrategy {
  private readonly logger = new Logger(LarkConnectorStrategy.name)

  readonly definition: ConnectorDefinition = {
    provider: LARK_CONNECTOR_PROVIDER,
    label: {
      en_US: 'Feishu',
      zh_Hans: '飞书'
    },
    icon: {
      type: 'image',
      value: LarkIcon
    },
    auth: {
      type: 'oauth2',
      authorizationUrl: '/open-apis/authen/v1/authorize',
      tokenUrl: '/open-apis/authen/v2/oauth/token',
      userInfoUrl: '/open-apis/authen/v1/user_info',
      scopes: [...LARK_CLI_CONNECTOR_DEFAULT_USER_SCOPES]
    },
    permissions: [
      {
        key: 'feishu.user_access_token',
        label: {
          en_US: 'Feishu user access token',
          zh_Hans: '飞书用户访问令牌'
        },
        description: {
          en_US: 'Used at runtime by Lark CLI commands that act as the connected user.',
          zh_Hans: '运行时供 Lark CLI 以已连接用户身份执行命令。'
        },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'feishu.refresh_token',
        label: {
          en_US: 'Feishu refresh token',
          zh_Hans: '飞书刷新令牌'
        },
        description: {
          en_US: 'Stored encrypted by Xpert and used only to refresh the workspace connector.',
          zh_Hans: '由 Xpert 加密保存，仅用于刷新工作区连接器。'
        },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault'
      },
      {
        key: 'feishu.app_credential',
        label: {
          en_US: 'Feishu app credential',
          zh_Hans: '飞书应用凭据'
        },
        description: {
          en_US: 'Created through Feishu app registration and stored encrypted for token refresh.',
          zh_Hans: '通过飞书应用注册流程创建并加密保存，用于刷新 token。'
        },
        identity: 'app',
        credential: 'app_credential',
        storage: 'platform_vault'
      }
    ]
  }

  async buildAuthorizationUrl(input: ConnectorAuthorizationUrlInput) {
    const scopes = resolveConnectorScopes(input.scopes)

    if (!input.app) {
      const registration = await requestAppRegistration(scopes)

      return {
        authorizationUrl: registration.verificationUrl,
        scopes,
        pollIntervalSeconds: registration.interval,
        metadata: {
          phase: 'app_registration',
          deviceCode: registration.deviceCode,
          interval: registration.interval,
          expiresAt: toExpiresAt(registration.expiresIn)
        }
      }
    }

    const app = requireConnectorApp(input.app)
    const baseUrl = resolveOpenApiBaseUrl(app)
    const authorizationUrl = new URL(`${baseUrl}/open-apis/authen/v1/authorize`)
    authorizationUrl.searchParams.set('app_id', app.appId)
    authorizationUrl.searchParams.set('redirect_uri', input.redirectUri)
    authorizationUrl.searchParams.set('state', input.state)
    if (scopes.length) {
      authorizationUrl.searchParams.set('scope', scopes.join(' '))
    }

    return {
      authorizationUrl: authorizationUrl.toString(),
      scopes
    }
  }

  async exchangeOAuthCode(input: ConnectorOAuthCodeInput): Promise<ConnectorOAuthCredential> {
    const app = requireConnectorApp(input.app)
    const baseUrl = resolveOpenApiBaseUrl(app)
    const token = await requestOAuthToken(baseUrl, {
      grant_type: 'authorization_code',
      client_id: app.appId,
      client_secret: app.appSecret,
      code: input.code,
      redirect_uri: input.redirectUri
    })
    const profile = await this.fetchUserProfile(baseUrl, token.accessToken)

    return toConnectorCredential(app, token, profile, input.scopes)
  }

  async refreshCredential(input: ConnectorRefreshInput): Promise<ConnectorOAuthCredential> {
    const app = requireConnectorApp(input.app)
    const baseUrl = resolveOpenApiBaseUrl(app)
    const token = await requestOAuthToken(baseUrl, {
      grant_type: 'refresh_token',
      client_id: app.appId,
      client_secret: app.appSecret,
      refresh_token: input.refreshToken
    })

    return toConnectorCredential(app, token)
  }

  async pollAuthorization(input: ConnectorAuthorizationPollInput): Promise<ConnectorAuthorizationPollResult> {
    const metadata = parseConnectorMetadata(input.metadata)
    const scopes = resolveConnectorScopes(input.scopes)

    if (metadata.phase === 'app_registration') {
      const appRegistration = await pollAppRegistration(metadata.deviceCode, metadata.interval)
      if (appRegistration.status === 'pending') {
        const interval = appRegistration.interval ?? metadata.interval
        return {
          status: 'pending',
          metadata: {
            ...metadata,
            interval
          },
          pollIntervalSeconds: interval,
          message: 'Waiting for Feishu app registration.'
        }
      }
      if (appRegistration.status === 'error') {
        return { status: 'error', error: appRegistration.error, metadata }
      }

      const userAuthorization = await requestDeviceAuthorization({
        appId: appRegistration.appId,
        appSecret: appRegistration.appSecret,
        scopes
      })

      return {
        status: 'pending',
        authorizationUrl: userAuthorization.verificationUrl,
        pollIntervalSeconds: userAuthorization.interval,
        metadata: {
          phase: 'user_authorization',
          appId: appRegistration.appId,
          appSecret: appRegistration.appSecret,
          deviceCode: userAuthorization.deviceCode,
          interval: userAuthorization.interval,
          expiresAt: toExpiresAt(userAuthorization.expiresIn)
        },
        message: 'Waiting for Feishu user authorization.'
      }
    }

    const token = await pollDeviceToken(metadata)
    if (token.status === 'pending') {
      const interval = token.interval ?? metadata.interval
      return {
        status: 'pending',
        metadata: {
          ...metadata,
          interval
        },
        pollIntervalSeconds: interval,
        message: 'Waiting for Feishu user authorization.'
      }
    }
    if (token.status === 'error') {
      return { status: 'error', error: token.error, metadata }
    }

    const app = { appId: metadata.appId, appSecret: metadata.appSecret, brand: 'feishu' }
    const profile = await this.fetchUserProfile('https://open.feishu.cn', token.accessToken)
    return {
      status: 'complete',
      credential: toConnectorCredential(app, token, profile, scopes)
    }
  }

  private async fetchUserProfile(baseUrl: string, accessToken: string) {
    try {
      const response = await axios.get(`${baseUrl}/open-apis/authen/v1/user_info`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 10000
      })

      return parseUserProfile(response.data)
    } catch (error) {
      this.logger.warn(`Failed to fetch Lark connector user profile: ${toConnectorErrorMessage(error)}`)
      return undefined
    }
  }
}

type LarkConnectorAppInput = ConnectorAuthorizationUrlInput['app']

type LarkConnectorApp = Record<string, unknown> & {
  appId: string
  appSecret: string
  brand?: string
}

type LarkConnectorMetadata =
  | {
      phase: 'app_registration'
      deviceCode: string
      interval: number
      expiresAt?: string
    }
  | {
      phase: 'user_authorization'
      appId: string
      appSecret: string
      deviceCode: string
      interval: number
      expiresAt?: string
    }

type LarkOAuthTokenPayload = {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  refreshExpiresIn?: number
  scopes?: string[]
}

type LarkAppRegistrationStart = {
  deviceCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

type LarkAppRegistrationPollResult =
  | { status: 'pending'; interval?: number }
  | { status: 'error'; error: string }
  | { status: 'complete'; appId: string; appSecret: string }

type LarkDeviceAuthorizationStart = {
  deviceCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

type LarkDeviceTokenPollResult =
  | { status: 'pending'; interval?: number }
  | { status: 'error'; error: string }
  | ({ status: 'complete' } & LarkOAuthTokenPayload)

type FormRequestConfig = {
  headers: Record<string, string>
  timeout: number
}

const FEISHU_OPEN_BASE_URL = 'https://open.feishu.cn'
const FEISHU_ACCOUNTS_BASE_URL = 'https://accounts.feishu.cn'
const FEISHU_APP_REGISTRATION_SOURCE = 'node-sdk/xpert'

function resolveOpenApiBaseUrl(_app: LarkConnectorApp) {
  return FEISHU_OPEN_BASE_URL
}

function resolveBrand(_app: LarkConnectorApp) {
  return 'feishu'
}

function resolveConnectorScopes(scopes?: string[]) {
  const normalized = [
    ...new Set(
      (scopes ?? [])
        .map((scope) => (typeof scope === 'string' ? scope.trim() : ''))
        .filter(Boolean)
    )
  ]
  return normalized.length ? normalized : [...LARK_CLI_CONNECTOR_DEFAULT_USER_SCOPES]
}

async function requestAppRegistration(scopes?: string[]): Promise<LarkAppRegistrationStart> {
  const data = parseFormResponse(
    await postForm(
      `${FEISHU_ACCOUNTS_BASE_URL}/oauth/v1/app/registration`,
      formBody({
        action: 'begin',
        archetype: 'PersonalAgent',
        auth_method: 'client_secret',
        request_user_info: 'open_id'
      }),
      formRequestConfig()
    ),
    'Feishu app registration'
  )
  const deviceCode = requireString(data, 'device_code', 'Feishu app registration response')
  const userCode = requireString(data, 'user_code', 'Feishu app registration response')
  const verificationUri = readString(data.verification_uri)
  const verificationUrl =
    readString(data.verification_uri_complete) ??
    `${FEISHU_OPEN_BASE_URL}/page/cli?user_code=${encodeURIComponent(userCode)}`

  return {
    deviceCode,
    verificationUrl: appendAppRegistrationParams(verificationUrl || verificationUri || '', scopes),
    expiresIn: readNumber(data.expires_in) ?? 300,
    interval: readNumber(data.interval) ?? 5
  }
}

async function pollAppRegistration(deviceCode: string, currentInterval: number): Promise<LarkAppRegistrationPollResult> {
  const data = parseOptionalFormResponse(
    await postForm(
      `${FEISHU_ACCOUNTS_BASE_URL}/oauth/v1/app/registration`,
      formBody({
        action: 'poll',
        device_code: deviceCode
      }),
      formRequestConfig()
    )
  )
  if (data.error === 'authorization_pending') {
    return { status: 'pending' }
  }
  if (data.error === 'slow_down') {
    return { status: 'pending', interval: readNumber(data.interval) ?? currentInterval + 5 }
  }
  if (data.error) {
    return {
      status: 'error',
      error: readString(data.error_description) ?? readString(data.error) ?? 'Feishu app registration failed'
    }
  }
  const userInfo = isRecord(data.user_info) ? data.user_info : undefined
  if (readString(userInfo?.tenant_brand) === 'lark') {
    return { status: 'error', error: 'Feishu connector only supports Feishu China tenants.' }
  }

  return {
    status: 'complete',
    appId: requireString(data, 'client_id', 'Feishu app registration poll response'),
    appSecret: requireString(data, 'client_secret', 'Feishu app registration poll response')
  }
}

async function requestDeviceAuthorization(input: {
  appId: string
  appSecret: string
  scopes?: string[]
}): Promise<LarkDeviceAuthorizationStart> {
  const scope = withOfflineAccess(input.scopes)
  const data = parseFormResponse(
    await postForm(
      `${FEISHU_ACCOUNTS_BASE_URL}/oauth/v1/device_authorization`,
      formBody({
        client_id: input.appId,
        scope
      }),
      {
        ...formRequestConfig(),
        headers: {
          ...formRequestConfig().headers,
          Authorization: `Basic ${Buffer.from(`${input.appId}:${input.appSecret}`).toString('base64')}`
        }
      }
    ),
    'Feishu user authorization'
  )
  const verificationUrl = readString(data.verification_uri_complete) ?? readString(data.verification_uri)

  return {
    deviceCode: requireString(data, 'device_code', 'Feishu user authorization response'),
    verificationUrl: requireString({ verificationUrl }, 'verificationUrl', 'Feishu user authorization response'),
    expiresIn: readNumber(data.expires_in) ?? 240,
    interval: readNumber(data.interval) ?? 5
  }
}

async function pollDeviceToken(metadata: Extract<LarkConnectorMetadata, { phase: 'user_authorization' }>): Promise<LarkDeviceTokenPollResult> {
  const data = parseOptionalFormResponse(
    await postForm(
      `${FEISHU_OPEN_BASE_URL}/open-apis/authen/v2/oauth/token`,
      formBody({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: metadata.deviceCode,
        client_id: metadata.appId,
        client_secret: metadata.appSecret
      }),
      formRequestConfig()
    )
  )
  if (data.error === 'authorization_pending') {
    return { status: 'pending' }
  }
  if (data.error === 'slow_down') {
    return { status: 'pending', interval: readNumber(data.interval) ?? metadata.interval + 5 }
  }
  if (data.error) {
    return {
      status: 'error',
      error: readString(data.error_description) ?? readString(data.error) ?? 'Feishu user authorization failed'
    }
  }

  return {
    status: 'complete',
    ...parseOAuthTokenResponse(data)
  }
}

function parseConnectorMetadata(value: ConnectorAuthorizationPollInput['metadata']): LarkConnectorMetadata {
  if (!isRecord(value)) {
    throw new Error('Feishu connector authorization metadata is missing')
  }
  if (value.phase === 'app_registration') {
    return {
      phase: 'app_registration',
      deviceCode: requireString(value, 'deviceCode', 'Feishu connector authorization metadata'),
      interval: readNumber(value.interval) ?? 5,
      expiresAt: readString(value.expiresAt)
    }
  }
  if (value.phase === 'user_authorization') {
    return {
      phase: 'user_authorization',
      appId: requireString(value, 'appId', 'Feishu connector authorization metadata'),
      appSecret: requireString(value, 'appSecret', 'Feishu connector authorization metadata'),
      deviceCode: requireString(value, 'deviceCode', 'Feishu connector authorization metadata'),
      interval: readNumber(value.interval) ?? 5,
      expiresAt: readString(value.expiresAt)
    }
  }
  throw new Error('Feishu connector authorization metadata phase is invalid')
}

function formBody(input: Record<string, string>) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    body.set(key, value)
  }
  return body.toString()
}

function formRequestConfig(): FormRequestConfig {
  return {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000
  }
}

async function postForm(url: string, body: string, config: FormRequestConfig) {
  try {
    const response = await axios.post(url, body, config)
    return response.data
  } catch (error) {
    const data = (error as AxiosError).response?.data
    if (data) {
      return data
    }
    throw error
  }
}

function parseFormResponse(value: unknown, label: string) {
  const data = parseOptionalFormResponse(value)
  if (data.error) {
    throw new Error(readString(data.error_description) ?? readString(data.error) ?? `${label} failed`)
  }
  return data
}

function parseOptionalFormResponse(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Invalid Feishu connector response')
  }
  return value
}

function requireString(value: Record<string, unknown>, key: string, label: string) {
  const result = readString(value[key])
  if (!result) {
    throw new Error(`${label} did not include ${key}`)
  }
  return result
}

function appendAppRegistrationParams(url: string, scopes?: string[]) {
  if (!url) {
    return url
  }

  const registrationUrl = new URL(url)
  registrationUrl.searchParams.set('from', 'sdk')
  registrationUrl.searchParams.set('source', FEISHU_APP_REGISTRATION_SOURCE)
  registrationUrl.searchParams.set('tp', 'sdk')
  registrationUrl.searchParams.set('addons', encodeAppRegistrationAddons(scopes))
  return registrationUrl.toString()
}

function encodeAppRegistrationAddons(scopes?: string[]) {
  const userScopes = withOfflineAccess(scopes).split(' ').filter(Boolean)
  const payload = {
    scopes: {
      tenant: [],
      user: userScopes
    }
  }
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function withOfflineAccess(scopes?: string[]) {
  const scopeSet = new Set((scopes ?? []).filter(Boolean))
  scopeSet.add('offline_access')
  return [...scopeSet].join(' ')
}

async function requestOAuthToken(baseUrl: string, payload: Record<string, string>) {
  const response = await axios.post(`${baseUrl}/open-apis/authen/v2/oauth/token`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  })

  return parseOAuthTokenResponse(response.data)
}

function parseOAuthTokenResponse(value: unknown): LarkOAuthTokenPayload {
  if (!isRecord(value)) {
    throw new Error('Invalid Lark OAuth token response')
  }

  const code = value.code
  if (typeof code === 'number' && code !== 0) {
    throw new Error(
      readString(value.msg) ?? readString(value.message) ?? `Lark OAuth token request failed with code ${code}`
    )
  }

  const data = isRecord(value.data) ? value.data : value
  const accessToken = readString(data.access_token) ?? readString(data.user_access_token)
  if (!accessToken) {
    throw new Error('Lark OAuth token response did not include user access token')
  }

  return {
    accessToken,
    refreshToken: readString(data.refresh_token),
    expiresIn: readNumber(data.expires_in),
    refreshExpiresIn: readNumber(data.refresh_expires_in) ?? readNumber(data.refresh_token_expires_in),
    scopes: readScopes(data.scope)
  }
}

function toConnectorCredential(
  app: LarkConnectorAppInput,
  token: LarkOAuthTokenPayload,
  profile?: ConnectorOAuthCredential['profile'],
  fallbackScopes?: string[]
): ConnectorOAuthCredential {
  const connectorApp = requireConnectorApp(app)

  return {
    appId: connectorApp.appId,
    brand: resolveBrand(connectorApp),
    app: connectorApp,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: toExpiresAt(token.expiresIn),
    refreshExpiresAt: toExpiresAt(token.refreshExpiresIn),
    scopes: token.scopes ?? fallbackScopes,
    profile
  }
}

function requireConnectorApp(app: LarkConnectorAppInput): LarkConnectorApp {
  if (!isRecord(app)) {
    throw new Error('Feishu connector app credentials are required')
  }
  const appId = readString(app.appId)
  const appSecret = readString(app.appSecret)
  if (!appId || !appSecret) {
    throw new Error('Feishu connector app credentials are required')
  }
  return {
    ...app,
    appId,
    appSecret,
    brand: readString(app.brand)
  }
}

function parseUserProfile(value: unknown): ConnectorOAuthCredential['profile'] | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const data = isRecord(value.data) ? value.data : value
  return {
    openId: readString(data.open_id),
    unionId: readString(data.union_id),
    userId: readString(data.user_id),
    name: readString(data.name),
    avatarUrl: readString(data.avatar_url),
    email: readString(data.email)
  }
}

function toExpiresAt(expiresIn?: number) {
  return typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined
}

function readScopes(value: unknown) {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  return value.split(/[,\s]+/).filter(Boolean)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function toConnectorErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ msg?: string; message?: string; error?: string }>
  const data = axiosError.response?.data
  if (typeof data === 'string') {
    return data
  }
  if (data && typeof data === 'object') {
    return data.msg ?? data.message ?? data.error ?? axiosError.message
  }
  return error instanceof Error ? error.message : String(error)
}

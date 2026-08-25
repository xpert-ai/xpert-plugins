import { randomBytes, createHash } from 'node:crypto'

export const WECOM_CONNECTOR_PROVIDER = 'wecom'
export const WECOM_AUTH_INTEGRATION_PROVIDER = 'wecom_auth'
export const WECOM_CONNECTOR_INSTALL_LEVEL = 'tenant' as const
export const WECOM_CONNECTOR_ARTIFACT_NAMESPACE = 'wecom_connector' as const
export const WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${WECOM_CONNECTOR_PROVIDER}`

export const WECOM_CONNECTOR_AUTHORIZE_URL = 'https://open.work.weixin.qq.com/wwopen/sso/qrConnect'
export const WECOM_CONNECTOR_ACCESS_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken'
export const WECOM_CONNECTOR_USER_INFO_URL = 'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo'
export const WECOM_CONNECTOR_USER_DETAIL_URL = 'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail'

export const WECOM_CONNECTOR_AUTH_INTEGRATION_URL = `/settings/integration/create?provider=${WECOM_AUTH_INTEGRATION_PROVIDER}`

export const WECOM_CONNECTOR_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <rect width="96" height="96" rx="24" fill="#07C160"/>
  <path fill="#fff" d="M23 32.5c0-4.1 3.4-7.5 7.5-7.5h35c4.1 0 7.5 3.4 7.5 7.5v20c0 4.1-3.4 7.5-7.5 7.5H40l-10.2 8.8c-1.3 1.1-3.3.1-3.3-1.6V60h-4c-4.1 0-7.5-3.4-7.5-7.5v-20Zm16 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm18 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-9 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
</svg>
`.trim()

export type WeComConnectorAppCredentials = {
  corpId: string
  agentId: string
  corpSecret: string
  lang?: 'zh' | 'en'
}

export type WeComAccessTokenResponse = {
  accessToken: string
  expiresIn?: number
}

export type WeComUserInfo = {
  userId?: string
  openUserId?: string
  userTicket?: string
}

export type WeComUserDetail = {
  userId?: string
  name?: string
  avatarUrl?: string
  email?: string
  mobile?: string
  openUserId?: string
  unionId?: string
}

export function createWeComSignature(params: { token: string; timestamp: string; nonce: string; encrypt: string }) {
  return createHash('sha1')
    .update([params.token, params.timestamp, params.nonce, params.encrypt].sort().join(''))
    .digest('hex')
}

export function randomStateSecret() {
  return randomBytes(16).toString('hex')
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function requireString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) {
    throw new Error(message)
  }
  return result
}

export function toExpiresAt(expiresIn?: number) {
  return expiresIn == null ? undefined : new Date(Date.now() + expiresIn * 1000).toISOString()
}

export function normalizeWeComAppCredentials(
  payload: Record<string, unknown> | undefined
): WeComConnectorAppCredentials {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('WeCom QR login requires app credentials.')
  }

  const corpId =
    readString(payload.corpId) ??
    readString(payload.clientId) ??
    readString(payload.appId) ??
    readString(payload.corp_id)
  const agentId = readString(payload.agentId) ?? readString(payload.agent_id)
  const corpSecret = readString(payload.corpSecret) ?? readString(payload.clientSecret) ?? readString(payload.secret)

  if (!corpId || !agentId || !corpSecret) {
    throw new Error('WeCom QR login requires CorpID, AgentID, and CorpSecret.')
  }

  return {
    corpId,
    agentId,
    corpSecret,
    lang: readString(payload.lang) === 'en' ? 'en' : readString(payload.lang) === 'zh' ? 'zh' : undefined
  }
}

export function toWeComProfile(input: { userInfo: WeComUserInfo; detail?: WeComUserDetail | null }) {
  const detail = input.detail ?? {}
  const userId = detail.userId ?? input.userInfo.userId
  const openUserId = detail.openUserId ?? input.userInfo.openUserId
  const name = detail.name ?? userId ?? openUserId

  return {
    userId,
    openId: openUserId,
    unionId: detail.unionId,
    name,
    avatarUrl: detail.avatarUrl,
    email: detail.email,
    mobile: detail.mobile
  }
}

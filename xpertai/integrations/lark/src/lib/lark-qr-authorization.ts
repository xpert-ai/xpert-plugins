// Follow the official Node SDK registration protocol; the host owns polling and Redis sessions.
import axios from 'axios'
import { gzipSync } from 'node:zlib'
import { z } from 'zod'
import { translate } from './i18n.js'

const registrationUrl = 'https://accounts.feishu.cn/oauth/v1/app/registration'
const beginSchema = z.object({
  device_code: z.string().trim().min(1),
  verification_uri_complete: z.string().url(),
  expires_in: z.number().int().positive().optional(),
  expire_in: z.number().int().positive().optional(),
  interval: z.number().int().positive().default(5)
})
const pollSchema = z.object({
  error: z.string().optional(),
  client_id: z.string().trim().min(1).optional(),
  client_secret: z.string().trim().min(1).optional(),
  user_info: z.object({ tenant_brand: z.enum(['feishu', 'lark']).optional() }).optional()
})

// Only app identity permissions for bot conversations, attachments and setup verification.
export const LARK_QR_SCOPES = [
  'im:message.p2p_msg:readonly',
  'im:message.group_at_msg:readonly',
  'im:message:send_as_bot',
  'im:resource',
  'application:application:self_manage'
]
const messageEvent = 'im.message.receive_v1'
const cardCallback = 'card.action.trigger'

async function requestRegistration(params: Record<string, string>): Promise<unknown> {
  try {
    const response = await axios.post<unknown>(registrationUrl, new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      maxRedirects: 0,
      // RFC 8628 pending/slow_down responses use HTTP 400.
      validateStatus: (status) => status === 200 || status === 400
    })
    return response.data
  } catch {
    throw new Error(translate('Qr.NetworkError', { defaultValue: 'Unable to reach Feishu. Please try again.' }))
  }
}

export async function beginLarkQrAuthorization() {
  const parsed = beginSchema.safeParse(await requestRegistration({
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id tenant_brand'
  }))
  if (!parsed.success) {
    throw new Error(translate('Qr.Unavailable', { defaultValue: 'Feishu QR authorization is unavailable. Please retry or use manual setup.' }))
  }
  const result = parsed.data
  const url = new URL(result.verification_uri_complete)
  if (url.protocol !== 'https:' || !['open.feishu.cn', 'accounts.feishu.cn'].includes(url.hostname) ||
    url.username || url.password || url.port) {
    throw new Error(translate('Qr.InvalidUrl', { defaultValue: 'Feishu returned an invalid authorization URL.' }))
  }
  url.searchParams.set('from', 'sdk')
  url.searchParams.set('source', 'node-sdk/xpert')
  url.searchParams.set('tp', 'sdk')
  // Keep Feishu's default landing page: after scanning, the user can select
  // any existing PersonalAgent or choose to create a new one. Passing either
  // clientID or createOnly would skip that choice and silently bind one app.
  url.searchParams.set('name', 'Xpert Assistant')
  url.searchParams.set('addons', gzipSync(JSON.stringify({
    preset: false,
    scopes: { tenant: LARK_QR_SCOPES, user: [] },
    events: { items: { tenant: [messageEvent], user: [] } },
    callbacks: { items: [cardCallback] }
  })).toString('base64url'))
  return {
    deviceCode: result.device_code,
    authorizationUrl: url.toString(),
    expiresInSeconds: result.expires_in ?? result.expire_in ?? 600,
    intervalSeconds: result.interval
  }
}

export async function pollLarkQrAuthorization(deviceCode: string) {
  const parsed = pollSchema.safeParse(await requestRegistration({ action: 'poll', device_code: deviceCode }))
  if (!parsed.success) return { status: 'failed' as const }
  const result = parsed.data
  // Domestic Feishu only. Never forward a device code or credentials to another domain.
  if (result.user_info?.tenant_brand === 'lark') return { status: 'failed' as const }
  if (result.error) {
    switch (result.error) {
      case 'authorization_pending': return { status: 'waiting' as const }
      case 'slow_down': return { status: 'waiting' as const, intervalIncrementSeconds: 5 }
      case 'access_denied': return { status: 'denied' as const }
      case 'expired_token': return { status: 'expired' as const }
      default: return { status: 'failed' as const }
    }
  }
  if (!result.client_id || !result.client_secret) return { status: 'failed' as const }
  return {
    status: 'authorized' as const,
    options: {
      appId: result.client_id,
      appSecret: result.client_secret,
      isLark: false,
      connectionMode: 'long_connection' as const,
      setupSource: 'qr' as const
    }
  }
}

const appSchema = z.object({
  code: z.literal(0),
  data: z.object({ app: z.object({
    app_id: z.string().min(1).optional(),
    online_version_id: z.string().min(1).optional(),
    scopes: z.array(z.object({ scope: z.string(), token_types: z.array(z.string()).optional() })).optional(),
    event: z.object({ subscription_type: z.string().optional(), subscribed_events: z.array(z.string()).optional() }).optional(),
    callback: z.object({ callback_type: z.string().optional(), subscribed_callbacks: z.array(z.string()).optional() }).optional(),
    callback_info: z.object({ callback_type: z.string().optional(), subscribed_callbacks: z.array(z.string()).optional() }).optional()
  }) })
})
const apiResultSchema = z.object({ code: z.number().int() })
const appVersionSchema = z.object({
  code: z.literal(0),
  data: z.object({ app_version: z.object({
    event_infos: z.array(z.object({ event_type: z.string().optional() })).optional()
  }) })
})

async function readAppResource(path: string, tenantAccessToken: string): Promise<unknown> {
  let response: { status: number; data: unknown }
  try {
    response = await axios.get<unknown>(`https://open.feishu.cn/open-apis/application/v6/applications/${path}`, {
      params: { lang: 'en_us' },
      headers: { Authorization: `Bearer ${tenantAccessToken}` },
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: () => true
    })
  } catch {
    throw new Error(translate('Qr.AppCheckNetworkError', {
      defaultValue: 'Unable to reach Feishu to verify the app. Please retry.'
    }))
  }
  const result = apiResultSchema.safeParse(response.data)
  if (response.status < 200 || response.status >= 300 || (result.success && result.data.code !== 0)) {
    // Provider messages can contain credentials; only expose numeric diagnostic codes.
    throw new Error(translate('Qr.AppCheckApiError', {
      defaultValue: 'Feishu app verification failed (HTTP {{status}}, code {{code}}). Please check the app self-management permission and retry.',
      status: response.status,
      code: result.success ? result.data.code : '-'
    }))
  }
  return response.data
}

/** Verify granted permissions and published subscriptions before the separate WebSocket probe. */
export async function validateLarkQrApp(tenantAccessToken: string): Promise<void> {
  const parsed = appSchema.safeParse(await readAppResource('me', tenantAccessToken))
  if (!parsed.success) {
    throw new Error(translate('Qr.AppCheckInvalidResponse', {
      defaultValue: 'Feishu returned incomplete or unsupported app information. Please retry.'
    }))
  }
  const app = parsed.data.data.app
  const scopes = new Set((app.scopes ?? []).filter((scope) => scope.token_types?.includes('tenant')).map((scope) => scope.scope))
  const missingScopes = LARK_QR_SCOPES.filter((scope) => !scopes.has(scope))
  if (missingScopes.length) {
    throw new Error(translate('Qr.AppCheckMissingScopes', {
      defaultValue: 'The Feishu app has not granted these app permissions: {{scopes}}. Confirm the permissions and publish the app, then retry.',
      scopes: missingScopes.join(', ')
    }))
  }
  // The app endpoint can omit event configuration. Published versions expose stable event_type IDs;
  // their `events` array contains localized display names and must not be used for validation.
  let hasMessageSubscription = false
  if (app.event) {
    hasMessageSubscription = app.event.subscription_type === 'websocket' &&
      !!app.event.subscribed_events?.includes(messageEvent)
  } else if (app.app_id && app.online_version_id) {
    const version = appVersionSchema.safeParse(await readAppResource(
      `${encodeURIComponent(app.app_id)}/app_versions/${encodeURIComponent(app.online_version_id)}`,
      tenantAccessToken
    ))
    if (!version.success) {
      throw new Error(translate('Qr.AppCheckInvalidResponse', {
        defaultValue: 'Feishu returned incomplete or unsupported app information. Please retry.'
      }))
    }
    hasMessageSubscription = !!version.data.data.app_version.event_infos?.some((event) => event.event_type === messageEvent)
  }
  if (!hasMessageSubscription) {
    throw new Error(translate('Qr.AppCheckMessageSubscription', {
      defaultValue: 'The Feishu app must subscribe to im.message.receive_v1 using a long connection. Configure event subscriptions and publish the app, then retry.'
    }))
  }
  const callback = app.callback_info ?? app.callback
  if (callback?.callback_type !== 'websocket' || !callback.subscribed_callbacks?.includes(cardCallback)) {
    throw new Error(translate('Qr.AppCheckCardSubscription', {
      defaultValue: 'The Feishu app must subscribe to card.action.trigger using a long connection. Configure callbacks and publish the app, then retry.'
    }))
  }
}

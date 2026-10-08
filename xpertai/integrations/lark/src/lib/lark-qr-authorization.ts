import axios from 'axios'
import { z } from 'zod'

// Structural equivalents of the host QR setup contract, pending its SDK npm release.
// Device codes and app credentials must stay on the server.
export interface LarkQrAuthorization {
  deviceCode: string
  authorizationUrl: string
  expiresInSeconds: number
  intervalSeconds: number
}
export type LarkQrAuthorizationResult =
  | { status: 'waiting'; intervalIncrementSeconds?: number }
  | { status: 'expired' | 'denied' | 'failed' }
  | { status: 'authorized'; options: Record<string, unknown> }

const endpoints = {
  feishu: 'https://accounts.feishu.cn/oauth/v1/app/registration',
  lark: 'https://accounts.larksuite.com/oauth/v1/app/registration'
} as const
const responseSchema = z.object({
  device_code: z.string().min(1).optional(),
  user_code: z.string().min(1).optional(),
  expire_in: z.number().positive().optional(),
  expires_in: z.number().positive().optional(),
  interval: z.number().positive().optional(),
  error: z.string().optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  user_info: z.object({ tenant_brand: z.string().optional() }).optional()
})

// Official registration protocol: larksuite/cli internal/auth/app_registration.go.
async function registration(brand: keyof typeof endpoints, fields: Record<string, string>) {
  try {
    const response = await axios.post<unknown>(endpoints[brand], new URLSearchParams(fields).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: 65536,
      validateStatus: (status) => status >= 200 && status < 500
    })
    return responseSchema.parse(response.data)
  } catch {
    // Axios errors may contain the request device code or response credentials.
    throw new Error('Feishu QR authorization is temporarily unavailable. Please retry.')
  }
}

export async function beginLarkQrAuthorization(): Promise<LarkQrAuthorization> {
  const data = await registration('feishu', {
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id tenant_brand'
  })
  if (data.error || !data.device_code || !data.user_code)
    throw new Error('Feishu could not create a QR authorization session. Please retry.')
  return {
    deviceCode: data.device_code,
    authorizationUrl: `https://open.feishu.cn/page/cli?user_code=${encodeURIComponent(data.user_code)}`,
    expiresInSeconds: data.expire_in ?? data.expires_in ?? 600,
    intervalSeconds: data.interval ?? 5
  }
}

export async function pollLarkQrAuthorization(deviceCode: string): Promise<LarkQrAuthorizationResult> {
  let data = await registration('feishu', { action: 'poll', device_code: deviceCode })
  const isLark = data.user_info?.tenant_brand === 'lark'
  if (isLark && !data.client_secret) data = await registration('lark', { action: 'poll', device_code: deviceCode })
  switch (data.error) {
    case 'authorization_pending':
      return { status: 'waiting' }
    case 'slow_down':
      return { status: 'waiting', intervalIncrementSeconds: 5 }
    case 'access_denied':
      return { status: 'denied' }
    case 'expired_token':
    case 'invalid_grant':
      return { status: 'expired' }
  }
  if (data.error) return { status: 'failed' }
  if (!data.client_id || !data.client_secret) return { status: 'waiting' }
  return {
    status: 'authorized',
    options: { appId: data.client_id, appSecret: data.client_secret, isLark, connectionMode: 'long_connection' }
  }
}

export function larkQrIdentity(options: unknown): string | null {
  const parsed = z.object({ appId: z.string().trim().min(1), isLark: z.boolean().optional() }).safeParse(options)
  return parsed.success ? `${parsed.data.isLark ? 'lark' : 'feishu'}:${parsed.data.appId}` : null
}

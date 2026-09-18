import axios from 'axios'
import { z } from 'zod'
import { translate } from './i18n.js'

const registrationUrl = 'https://oapi.dingtalk.com/app/registration'
// DingTalk's official connector source; this is a registration identifier, not a display name.
const registrationSource = 'DING_DWS_CLAW'
const envelope = z.object({ errcode: z.number(), errmsg: z.string().optional() })
const initSchema = envelope.extend({ nonce: z.string().min(1) })
const beginSchema = envelope.extend({
  device_code: z.string().min(1),
  verification_uri_complete: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().default(3)
})
const pollSchema = envelope.extend({
  status: z.enum(['WAITING', 'SCANNED', 'SUCCESS', 'FAIL', 'EXPIRED']),
  client_id: z.string().optional(),
  client_secret: z.string().optional()
})

async function post(action: 'init' | 'begin' | 'poll', body: { source: string } | { nonce: string } | { device_code: string }) {
  let data: unknown
  try {
    const response = await axios.post<unknown>(`${registrationUrl}/${action}`, body, { timeout: 15000 })
    data = response.data
  } catch {
    throw new Error(translate('Qr.NetworkError', { defaultValue: 'Unable to reach DingTalk. Please try again.' }))
  }
  const result = envelope.safeParse(data)
  if (!result.success || result.data.errcode !== 0) {
    throw new Error(translate('Qr.Unavailable', { defaultValue: 'DingTalk QR authorization is unavailable. Please retry or use manual setup.' }))
  }
  return data
}

export async function beginDingTalkQrAuthorization() {
  const init = initSchema.parse(await post('init', { source: registrationSource }))
  const result = beginSchema.parse(await post('begin', { nonce: init.nonce }))
  const url = new URL(result.verification_uri_complete)
  if (url.protocol !== 'https:' || url.hostname !== 'open-dev.dingtalk.com' || url.username || url.password) {
    throw new Error(translate('Qr.InvalidUrl', { defaultValue: 'DingTalk returned an invalid authorization URL.' }))
  }
  return {
    deviceCode: result.device_code,
    authorizationUrl: url.toString(),
    expiresInSeconds: result.expires_in,
    intervalSeconds: result.interval
  }
}

export async function pollDingTalkQrAuthorization(deviceCode: string) {
  const result = pollSchema.parse(await post('poll', { device_code: deviceCode }))
  switch (result.status) {
    case 'WAITING':
    case 'SCANNED': return { status: 'waiting' as const }
    case 'EXPIRED': return { status: 'expired' as const }
    case 'FAIL': return { status: 'failed' as const }
    case 'SUCCESS':
      if (!result.client_id?.trim() || !result.client_secret?.trim()) {
        throw new Error(translate('Qr.MissingCredentials', { defaultValue: 'Authorization completed without robot credentials. Please retry.' }))
      }
      return {
        status: 'authorized' as const,
        options: { clientId: result.client_id, clientSecret: result.client_secret, robotCode: result.client_id }
      }
  }
}

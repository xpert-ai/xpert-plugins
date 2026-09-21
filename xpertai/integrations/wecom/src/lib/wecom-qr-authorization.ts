import { z } from 'zod'

const WECOM_QR_GENERATE_URL = 'https://work.weixin.qq.com/ai/qc/generate'
const WECOM_QR_QUERY_URL = 'https://work.weixin.qq.com/ai/qc/query_result'
const WECOM_QR_SOURCE = 'wecom_cli_external'
const WECOM_QR_PLATFORM = '3'
const WECOM_QR_EXPIRES_IN_SECONDS = 5 * 60
const WECOM_QR_INTERVAL_SECONDS = 3

const generateResponseSchema = z.object({
  data: z.object({
    scode: z.string().trim().min(1),
    auth_url: z.string().trim().url()
  })
})

const queryResponseSchema = z.object({
  data: z.object({
    status: z.string().trim(),
    bot_info: z
      .object({
        botid: z.string().trim().min(1),
        secret: z.string().trim().min(1)
      })
      .optional()
  })
})

export async function beginWeComQrAuthorization() {
  const url = new URL(WECOM_QR_GENERATE_URL)
  url.searchParams.set('source', WECOM_QR_SOURCE)
  url.searchParams.set('plat', WECOM_QR_PLATFORM)

  const payload = generateResponseSchema.parse(await requestJson(url.toString()))
  return {
    // The host QR setup contract calls this value deviceCode. For WeCom it is
    // the short-lived scode returned by the official QR endpoint.
    deviceCode: payload.data.scode,
    authorizationUrl: payload.data.auth_url,
    expiresInSeconds: WECOM_QR_EXPIRES_IN_SECONDS,
    intervalSeconds: WECOM_QR_INTERVAL_SECONDS
  }
}

export async function pollWeComQrAuthorization(scode: string) {
  const normalizedScode = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,256}$/)
    .parse(scode)
  const url = new URL(WECOM_QR_QUERY_URL)
  url.searchParams.set('scode', normalizedScode)

  const payload = queryResponseSchema.parse(await requestJson(url.toString()))
  if (payload.data.status !== 'success') {
    return { status: 'waiting' as const }
  }

  const bot = payload.data.bot_info
  if (!bot) {
    throw new Error('WeCom QR authorization completed without robot credentials. Please retry.')
  }

  return {
    status: 'authorized' as const,
    options: {
      botId: bot.botid,
      secret: bot.secret
    }
  }
}

async function requestJson(url: string): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    })
  } catch {
    throw new Error('Unable to reach WeCom QR authorization service. Please retry.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(`WeCom QR authorization failed with HTTP ${response.status}.`)
  }

  return z.record(z.unknown()).parse(payload)
}

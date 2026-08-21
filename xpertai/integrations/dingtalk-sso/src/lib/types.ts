import type { IIntegration } from '@xpert-ai/contracts'
import { z } from 'zod'

const RequiredStringSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1)
)

const OptionalStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  },
  z.string().min(1).optional()
)

export const dingtalkSsoIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="#4aa4f8">
  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm227 385.3c-1 4.2-3.5 10.4-7 17.8h.1l-.4.7c-20.3 43.1-73.1 127.7-73.1 127.7s-.1-.2-.3-.5l-15.5 26.8h74.5L575.1 810l32.3-128h-58.6l20.4-84.7c-16.5 3.9-35.9 9.4-59 16.8 0 0-31.2 18.2-89.9-35 0 0-39.6-34.7-16.6-43.4 9.8-3.7 47.4-8.4 77-12.3 40-5.4 64.6-8.2 64.6-8.2S422 517 392.7 512.5c-29.3-4.6-66.4-53.1-74.3-95.8 0 0-12.2-23.4 26.3-12.3 38.5 11.1 197.9 43.2 197.9 43.2s-207.4-63.3-221.2-78.7c-13.8-15.4-40.6-84.2-37.1-126.5 0 0 1.5-10.5 12.4-7.7 0 0 153.3 69.7 258.1 107.9 104.8 37.9 195.9 57.3 184.2 106.7z"/>
</svg>
`.trim()

export const DINGTALK_SSO_ARTIFACT_NAMESPACE = 'dingtalk_sso'
// Keep SSO separate from the existing DingTalk bot/messaging integration.
export const DINGTALK_SSO_PROVIDER = 'dingtalk-sso'
export const DINGTALK_SSO_CALLBACK_PATH = '/api/dingtalk-identity/callback'
export const DINGTALK_SSO_LOGIN_START_PATH = '/api/dingtalk-identity/login/start'
export const DINGTALK_SSO_PROVIDER_ICON_PATH = '/assets/images/destinations/dingtalk.svg'
export const DINGTALK_AUTH_LOGIN_PATH = '/auth/login'
export const DINGTALK_AUTH_SSO_CONFIRM_PATH = '/auth/sso-confirm'
export const DINGTALK_SIGN_IN_SUCCESS_PATH = '/sign-in/success'

export type DingTalkSsoIntegrationOptions = {
  clientId?: string
  clientSecret?: string
}

export type DingTalkSsoIntegration = IIntegration<DingTalkSsoIntegrationOptions> & {
  id: string
  tenantId: string
  organizationId?: string | null
}

export type ResolvedDingTalkSsoIntegration = {
  id: string
  tenantId: string
  clientId: string
  clientSecret: string
}

export const DingTalkSsoBindStateSchema = z.object({
  mode: z.literal('bind'),
  tenantId: RequiredStringSchema,
  integrationId: RequiredStringSchema,
  organizationId: OptionalStringSchema,
  userId: RequiredStringSchema,
  returnTo: OptionalStringSchema,
  redirectUri: z.string().url(),
  nonce: RequiredStringSchema,
  iat: z.number().int(),
  exp: z.number().int()
})

export const DingTalkSsoLoginStateSchema = z.object({
  mode: z.literal('login'),
  tenantId: RequiredStringSchema,
  integrationId: RequiredStringSchema,
  organizationId: OptionalStringSchema,
  returnTo: OptionalStringSchema,
  redirectUri: z.string().url(),
  nonce: RequiredStringSchema,
  iat: z.number().int(),
  exp: z.number().int()
})

export const DingTalkSsoStateSchema = z.discriminatedUnion('mode', [
  DingTalkSsoBindStateSchema,
  DingTalkSsoLoginStateSchema
])

export type DingTalkSsoState = z.infer<typeof DingTalkSsoStateSchema>
export type DingTalkSsoBindState = z.infer<typeof DingTalkSsoBindStateSchema>
export type DingTalkSsoLoginState = z.infer<typeof DingTalkSsoLoginStateSchema>
export type DingTalkSsoStateInput =
  | Omit<DingTalkSsoBindState, 'iat' | 'exp'>
  | Omit<DingTalkSsoLoginState, 'iat' | 'exp'>

export type DingTalkOAuthProfile = {
  unionId: string | null
  openId: string | null
  name: string | null
  avatarUrl: string | null
}

export type DingTalkSsoBindingProfile = {
  unionId: string
  openId: string | null
  clientId: string
  name: string | null
  avatarUrl: string | null
}

export type DingTalkSsoCallbackResult = {
  type: 'redirect'
  status: 302
  location: string
}

export const DINGTALK_SSO_ERROR_STATUS = {
  callback_mismatch: 400,
  configuration_invalid: 503,
  integration_required: 503,
  integration_ambiguous: 503,
  integration_invalid: 503,
  current_user_required: 401,
  oauth_failed: 400,
  return_to_invalid: 400,
  state_expired: 400,
  state_invalid: 400,
  tenant_required: 400,
  union_id_missing: 400
} as const

export type DingTalkSsoErrorCode = keyof typeof DINGTALK_SSO_ERROR_STATUS

export class DingTalkSsoError extends Error {
  constructor(
    readonly code: DingTalkSsoErrorCode,
    message: string,
    readonly status = DINGTALK_SSO_ERROR_STATUS[code],
    override readonly cause?: unknown
  ) {
    super(message)
    this.name = 'DingTalkSsoError'
  }
}

export function isDingTalkSsoError(error: unknown): error is DingTalkSsoError {
  return error instanceof DingTalkSsoError
}

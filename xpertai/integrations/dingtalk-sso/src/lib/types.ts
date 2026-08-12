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
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <rect width="96" height="96" rx="24" fill="#1677FF"/>
  <path fill="#fff" d="M72.3 24.8c-10.2-4.4-20.5-7.5-31.1-9.3-1.7-.3-2.4.7-1.5 2.1l6.4 9.4c-8.8-1.7-17.4-2.1-25.8-1.3-1.8.2-2.2 1.4-.9 2.6l10.3 9.2-7.8 1.2c-1.8.3-2.1 1.6-.7 2.7l12.1 8.8-5.9 2c-1.7.6-1.8 1.9-.2 2.7l13.4 6.8-4.4 14.8c-.5 1.8.4 2.4 1.8 1.2l20.5-18.1h-9.8c7.7-9.6 14.3-19.9 19.8-30.9l4.6-1.2c1.8-.5 1.9-1.7.2-2.7Z"/>
</svg>
`.trim()

export const DINGTALK_SSO_ARTIFACT_NAMESPACE = 'dingtalk_sso'
// Keep SSO separate from the existing DingTalk bot/messaging integration.
export const DINGTALK_SSO_PROVIDER = 'dingtalk-sso'
export const DINGTALK_SSO_CALLBACK_PATH = '/api/dingtalk-identity/callback'
export const DINGTALK_SSO_LOGIN_START_PATH = '/api/dingtalk-identity/login/start'
export const DINGTALK_SSO_PROVIDER_ICON_PATH = '/assets/images/destinations/dingtalk.png'
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

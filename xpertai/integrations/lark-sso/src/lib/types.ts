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
    return trimmed.length > 0 ? trimmed : undefined
  },
  z.string().min(1).optional()
)

export const larkSsoIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <rect width="96" height="96" rx="24" fill="#0F766E"/>
  <path d="M25 26h30c9.941 0 18 8.059 18 18v5H48c-9.941 0-18-8.059-18-18v-5Z" fill="#5EEAD4"/>
  <path d="M71 70H41c-9.941 0-18-8.059-18-18v-5h25c9.941 0 18 8.059 18 18v5Z" fill="#CCFBF1"/>
  <circle cx="60" cy="36" r="7" fill="#F0FDFA"/>
</svg>
`.trim()

export const LARK_SSO_PROVIDER = 'lark'
export const LARK_SSO_CALLBACK_PATH = '/api/lark-identity/callback'
export const LARK_SSO_LOGIN_START_PATH = '/api/lark-identity/login/start'
export const LARK_SSO_PROVIDER_ICON_PATH = '/assets/images/destinations/feishu.png'
export const LARK_AUTH_LOGIN_PATH = '/auth/login'
export const LARK_AUTH_SSO_CONFIRM_PATH = '/auth/sso-confirm'
export const LARK_SIGN_IN_SUCCESS_PATH = '/sign-in/success'

export const LarkSsoBindStateSchema = z.object({
  mode: z.literal('bind'),
  tenantId: RequiredStringSchema,
  organizationId: OptionalStringSchema,
  userId: RequiredStringSchema,
  returnTo: OptionalStringSchema,
  nonce: RequiredStringSchema,
  iat: z.number().int(),
  exp: z.number().int()
})

export const LarkSsoLoginStateSchema = z.object({
  mode: z.literal('login'),
  tenantId: RequiredStringSchema,
  organizationId: OptionalStringSchema,
  returnTo: OptionalStringSchema,
  nonce: RequiredStringSchema,
  iat: z.number().int(),
  exp: z.number().int()
})

export const LarkSsoStateSchema = z.discriminatedUnion('mode', [
  LarkSsoBindStateSchema,
  LarkSsoLoginStateSchema
])

export type LarkSsoState = z.infer<typeof LarkSsoStateSchema>
export type LarkSsoBindState = z.infer<typeof LarkSsoBindStateSchema>
export type LarkSsoLoginState = z.infer<typeof LarkSsoLoginStateSchema>

export type LarkSsoStateInput =
  | Omit<z.infer<typeof LarkSsoBindStateSchema>, 'iat' | 'exp'>
  | Omit<z.infer<typeof LarkSsoLoginStateSchema>, 'iat' | 'exp'>

export type LarkOAuthProfile = {
  unionId: string | null
  openId: string | null
  name: string | null
  avatarUrl: string | null
}

export type LarkSsoBindingProfile = {
  unionId: string
  openId: string | null
  appId: string
  name: string | null
  avatarUrl: string | null
}

export type LarkSsoCallbackResult =
  | {
      type: 'redirect'
      status: 302
      location: string
    }
  | {
      type: 'json'
      status: number
      body: Record<string, unknown>
    }

export const LARK_SSO_ERROR_STATUS = {
  binding_conflict: 409,
  binding_not_found: 404,
  current_user_required: 401,
  oauth_failed: 400,
  return_to_invalid: 400,
  state_expired: 400,
  state_invalid: 400,
  tenant_required: 400,
  union_id_missing: 400
} as const

export type LarkSsoErrorCode = keyof typeof LARK_SSO_ERROR_STATUS

export class LarkSsoError extends Error {
  constructor(
    readonly code: LarkSsoErrorCode,
    message: string,
    readonly status = LARK_SSO_ERROR_STATUS[code],
    override readonly cause?: unknown
  ) {
    super(message)
    this.name = 'LarkSsoError'
  }
}

export function isLarkSsoError(error: unknown): error is LarkSsoError {
  return error instanceof LarkSsoError
}

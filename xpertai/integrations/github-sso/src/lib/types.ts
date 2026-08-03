import type { IIntegration } from '@xpert-ai/contracts'
import { z } from 'zod'

const RequiredStringSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1)
)

const OptionalStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().min(1).optional())

export type GitHubSsoIntegrationOptions = {
  clientId?: string
  clientSecret?: string
}

export type GitHubSsoIntegration = IIntegration<GitHubSsoIntegrationOptions> & {
  id: string
  tenantId: string
  organizationId?: string | null
}

export type ResolvedGitHubSsoIntegration = {
  id: string
  tenantId: string
  clientId: string
  clientSecret: string
}

const GitHubSsoStateObjectSchema = z.object({
  tenantId: RequiredStringSchema,
  integrationId: RequiredStringSchema,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/),
  redirectUri: z.string().url(),
  returnTo: OptionalStringSchema,
  iat: z.number().int(),
  exp: z.number().int()
})

export const GitHubSsoStateSchema = GitHubSsoStateObjectSchema.refine(
  (value) => value.exp > value.iat && value.exp - value.iat <= 10 * 60,
  'OAuth state lifetime is invalid.'
)

export const GitHubSsoStateSelectorSchema = GitHubSsoStateObjectSchema.pick({
  tenantId: true,
  integrationId: true,
  nonce: true
})

export type GitHubSsoState = z.infer<typeof GitHubSsoStateSchema>
export type GitHubSsoStateInput = Omit<GitHubSsoState, 'iat' | 'exp'>
export type GitHubSsoStateSelector = z.infer<typeof GitHubSsoStateSelectorSchema>

export type GitHubOAuthUser = {
  id: number
  login: string
  name: string | null
  avatarUrl: string | null
  profileUrl: string | null
}

export type GitHubOAuthEmail = {
  email: string
  primary: boolean
  verified: boolean
}

export type GitHubVerifiedProfile = GitHubOAuthUser & {
  email: string
}

export type GitHubSsoCallbackResult = {
  type: 'redirect'
  status: 302
  location: string
}

export type GitHubSsoPkceCookie = {
  name: string
  value: string
  secure: boolean
}

export type GitHubSsoStartResult = {
  authorizationUrl: string
  pkceCookie: GitHubSsoPkceCookie
}

export const GITHUB_SSO_ERROR_STATUS = {
  account_conflict: 409,
  callback_mismatch: 400,
  github_user_invalid: 400,
  integration_ambiguous: 409,
  integration_invalid: 400,
  integration_required: 400,
  oauth_failed: 400,
  pkce_missing: 400,
  return_to_invalid: 400,
  state_expired: 400,
  state_invalid: 400,
  tenant_context_invalid: 400,
  tenant_required: 400,
  verified_email_missing: 400
} as const

export type GitHubSsoErrorCode = keyof typeof GITHUB_SSO_ERROR_STATUS

export class GitHubSsoError extends Error {
  constructor(
    readonly code: GitHubSsoErrorCode,
    message: string,
    readonly status = GITHUB_SSO_ERROR_STATUS[code],
    override readonly cause?: unknown
  ) {
    super(message)
    this.name = 'GitHubSsoError'
  }
}

export function isGitHubSsoError(error: unknown): error is GitHubSsoError {
  return error instanceof GitHubSsoError
}

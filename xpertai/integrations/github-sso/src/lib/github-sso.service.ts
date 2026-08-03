import { randomBytes } from 'node:crypto'
import {
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN,
  type BoundIdentityLoginPermissionService,
  type IssuedAuthTokens,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  GITHUB_AUTH_LOGIN_PATH,
  GITHUB_AUTH_REGISTER_PATH,
  GITHUB_SIGN_IN_SUCCESS_PATH,
  GITHUB_SSO_CALLBACK_PATH,
  GITHUB_SSO_PKCE_COOKIE_PREFIX,
  GITHUB_SSO_PROVIDER
} from './constants.js'
import { GitHubOAuthClient } from './github-oauth.client.js'
import { GitHubStateService } from './github-state.service.js'
import { GitHubSsoError, isGitHubSsoError } from './github-sso.error.js'
import { GitHubSsoIntegrationResolver } from './github-sso-integration.resolver.js'
import { GITHUB_SSO_PLUGIN_CONTEXT } from './tokens.js'
import type { GitHubSsoCallbackResult, GitHubSsoStartResult, GitHubSsoState } from './types.js'

type StartLoginInput = {
  tenantId: string
  returnTo?: string
  requestBaseUrl: string
}

type CallbackInput = {
  code?: string
  state?: string
  oauthError?: string
  oauthErrorDescription?: string
  requestBaseUrl: string
  cookies?: Readonly<Record<string, string | undefined>>
}

const DEFAULT_LOGIN_ERROR_MESSAGE = 'GitHub sign-in could not be completed. Please try again.'

@Injectable()
export class GitHubSsoService {
  private readonly logger = new Logger(GitHubSsoService.name)
  private _boundIdentityLoginPermissionService?: BoundIdentityLoginPermissionService

  constructor(
    private readonly integrationResolver: GitHubSsoIntegrationResolver,
    private readonly oauthClient: GitHubOAuthClient,
    private readonly stateService: GitHubStateService,
    @Inject(GITHUB_SSO_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get boundIdentityLoginPermissionService(): BoundIdentityLoginPermissionService {
    this._boundIdentityLoginPermissionService ??= this.pluginContext.resolve(
      BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN
    )
    return this._boundIdentityLoginPermissionService
  }

  async startLogin(input: StartLoginInput): Promise<GitHubSsoStartResult> {
    const tenantId = input.tenantId?.trim()
    if (!tenantId) {
      throw new GitHubSsoError('tenant_required', 'tenantId is required for GitHub sign-in.')
    }

    const returnTo = validateReturnTo(input.returnTo)
    const requestBaseUrl = validateRequestBaseUrl(input.requestBaseUrl)
    const redirectUri = new URL(GITHUB_SSO_CALLBACK_PATH, requestBaseUrl).toString()
    const integration = await this.integrationResolver.resolveForTenant(tenantId)
    const nonce = randomBytes(24).toString('base64url')
    const pkce = this.oauthClient.createPkce()
    const state = this.stateService.createState(integration.clientSecret, {
      tenantId,
      integrationId: integration.id,
      nonce,
      redirectUri,
      returnTo
    })

    return {
      authorizationUrl: this.oauthClient.buildAuthorizeUrl({
        clientId: integration.clientId,
        redirectUri,
        state,
        codeChallenge: pkce.challenge
      }),
      pkceCookie: {
        name: buildPkceCookieName(nonce),
        value: pkce.verifier,
        secure: new URL(requestBaseUrl).protocol === 'https:'
      }
    }
  }

  async handleCallback(input: CallbackInput): Promise<GitHubSsoCallbackResult> {
    let verifiedState: GitHubSsoState | null = null
    try {
      const stateToken = input.state?.trim()
      if (!stateToken) {
        throw new GitHubSsoError('state_invalid', 'GitHub OAuth callback is missing state.')
      }

      const selector = this.stateService.readSelector(stateToken)
      const integration = await this.integrationResolver.resolveById(selector.tenantId, selector.integrationId)
      verifiedState = this.stateService.verifyState(integration.clientSecret, stateToken)

      const requestCallbackUrl = new URL(
        GITHUB_SSO_CALLBACK_PATH,
        validateRequestBaseUrl(input.requestBaseUrl)
      ).toString()
      if (verifiedState.redirectUri !== requestCallbackUrl) {
        throw new GitHubSsoError('callback_mismatch', 'GitHub OAuth callback URL does not match the login request.')
      }

      if (input.oauthError) {
        throw new GitHubSsoError(
          'oauth_failed',
          input.oauthErrorDescription?.trim() || `GitHub OAuth failed: ${input.oauthError}`
        )
      }

      const code = input.code?.trim()
      if (!code) {
        throw new GitHubSsoError('oauth_failed', 'GitHub OAuth callback is missing code.')
      }

      const pkceCookieName = buildPkceCookieName(verifiedState.nonce)
      const codeVerifier = input.cookies?.[pkceCookieName]?.trim()
      if (!codeVerifier) {
        throw new GitHubSsoError('pkce_missing', 'GitHub OAuth verifier is missing or expired.')
      }

      const accessToken = await this.oauthClient.exchangeCode(integration, {
        code,
        redirectUri: verifiedState.redirectUri,
        codeVerifier
      })
      const profile = await this.oauthClient.fetchVerifiedProfile(accessToken)

      const permissionService = this.boundIdentityLoginPermissionService
      if (typeof permissionService.loginOrPrepareVerifiedEmail !== 'function') {
        throw new GitHubSsoError('oauth_failed', 'The Xpert host does not support verified-email sign-in provisioning.')
      }
      const result = await permissionService.loginOrPrepareVerifiedEmail({
        provider: GITHUB_SSO_PROVIDER,
        subjectId: String(profile.id),
        tenantId: verifiedState.tenantId,
        verifiedEmail: profile.email,
        displayName: profile.name || profile.login,
        avatarUrl: profile.avatarUrl ?? undefined,
        profile: {
          id: String(profile.id),
          login: profile.login,
          name: profile.name,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          profileUrl: profile.profileUrl,
          integrationId: integration.id
        },
        returnTo: verifiedState.returnTo
      })

      return result.status === 'authenticated'
        ? {
            type: 'redirect',
            status: 302,
            location: buildSignInSuccessLocation(result.tokens, verifiedState.returnTo)
          }
        : {
            type: 'redirect',
            status: 302,
            location: buildRegistrationLocation(result.ticket)
          }
    } catch (error) {
      const normalized = this.normalizeLoginError(error)
      return {
        type: 'redirect',
        status: 302,
        location: buildLoginErrorLocation(normalized, verifiedState?.returnTo)
      }
    }
  }

  resolvePkceCookieName(stateToken?: string): string | null {
    if (!stateToken?.trim()) {
      return null
    }
    try {
      return buildPkceCookieName(this.stateService.readSelector(stateToken).nonce)
    } catch {
      return null
    }
  }

  private normalizeLoginError(error: unknown): {
    code: string
    message: string
  } {
    if (isGitHubSsoError(error)) {
      return { code: error.code, message: error.message }
    }
    if (readHttpStatus(error) === 409) {
      return {
        code: 'account_conflict',
        message: 'This GitHub identity or verified email cannot be linked automatically.'
      }
    }

    this.logger.error(`Unexpected GitHub SSO error: ${error instanceof Error ? error.message : String(error)}`)
    return {
      code: 'oauth_failed',
      message: DEFAULT_LOGIN_ERROR_MESSAGE
    }
  }
}

function validateReturnTo(returnTo?: string): string | undefined {
  const normalized = returnTo?.trim()
  if (!normalized) {
    return undefined
  }
  if (
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw new GitHubSsoError('return_to_invalid', 'returnTo must be a safe relative path.')
  }

  const parsed = new URL(normalized, 'https://xpert.invalid')
  if (parsed.origin !== 'https://xpert.invalid') {
    throw new GitHubSsoError('return_to_invalid', 'returnTo must be a safe relative path.')
  }
  return normalized
}

function validateRequestBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new GitHubSsoError('oauth_failed', 'Unable to resolve the Xpert public URL for GitHub OAuth.', 400, error)
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.host) {
    throw new GitHubSsoError('oauth_failed', 'Unable to resolve the Xpert public URL for GitHub OAuth.')
  }
  return url.origin
}

function buildPkceCookieName(nonce: string): string {
  return `${GITHUB_SSO_PKCE_COOKIE_PREFIX}${nonce}`
}

function buildSignInSuccessLocation(tokens: IssuedAuthTokens, returnTo?: string): string {
  const params = new URLSearchParams({
    jwt: tokens.jwt,
    refreshToken: tokens.refreshToken,
    userId: tokens.userId
  })
  if (returnTo) {
    params.set('returnTo', returnTo)
  }
  return `${GITHUB_SIGN_IN_SUCCESS_PATH}?${params.toString()}`
}

function buildRegistrationLocation(ticket: string): string {
  return `${GITHUB_AUTH_REGISTER_PATH}?${new URLSearchParams({
    ticket
  }).toString()}`
}

function buildLoginErrorLocation(error: { code: string; message: string }, returnTo?: string): string {
  const params = new URLSearchParams({
    ssoProvider: GITHUB_SSO_PROVIDER,
    ssoError: error.code,
    ssoMessage: error.message
  })
  if (returnTo) {
    params.set('returnUrl', returnTo)
  }
  return `${GITHUB_AUTH_LOGIN_PATH}?${params.toString()}`
}

function readHttpStatus(error: unknown): number | null {
  if (error === null || typeof error !== 'object' || !('getStatus' in error) || typeof error.getStatus !== 'function') {
    return null
  }
  const status = error.getStatus()
  return typeof status === 'number' ? status : null
}

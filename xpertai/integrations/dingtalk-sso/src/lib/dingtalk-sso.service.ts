import { randomUUID } from 'node:crypto'
import {
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN,
  SSO_BINDING_PERMISSION_SERVICE_TOKEN,
  type BoundIdentityLoginPermissionService,
  type IssuedAuthTokens,
  type PluginContext,
  type SsoBindingPermissionService
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { DingTalkOAuthService } from './dingtalk-oauth.service.js'
import { DingTalkSsoIntegrationResolver } from './dingtalk-sso-integration.resolver.js'
import { DingTalkStateService } from './dingtalk-state.service.js'
import { DINGTALK_SSO_PLUGIN_CONTEXT } from './tokens.js'
import {
  DINGTALK_AUTH_LOGIN_PATH,
  DINGTALK_AUTH_SSO_CONFIRM_PATH,
  DINGTALK_SIGN_IN_SUCCESS_PATH,
  DINGTALK_SSO_CALLBACK_PATH,
  DINGTALK_SSO_PROVIDER,
  type DingTalkSsoBindState,
  type DingTalkSsoBindingProfile,
  type DingTalkSsoCallbackResult,
  DingTalkSsoError,
  type DingTalkSsoLoginState,
  type DingTalkSsoState,
  isDingTalkSsoError
} from './types.js'

type StartBindInput = {
  userId: string
  tenantId: string
  organizationId?: string
  returnTo?: string
  requestBaseUrl: string
}

type StartLoginInput = {
  tenantId: string
  organizationId?: string
  returnTo?: string
  requestBaseUrl: string
}

type CallbackInput = {
  authorizationCode?: string
  state?: string
  oauthError?: string
  oauthErrorDescription?: string
  requestBaseUrl: string
}

const DEFAULT_LOGIN_ERROR_MESSAGE = 'DingTalk sign-in failed. Please try again.'

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

@Injectable()
export class DingTalkSsoService {
  private readonly logger = new Logger(DingTalkSsoService.name)
  private _boundIdentityLoginPermissionService?: BoundIdentityLoginPermissionService
  private _ssoBindingPermissionService?: SsoBindingPermissionService

  constructor(
    private readonly oauthService: DingTalkOAuthService,
    private readonly stateService: DingTalkStateService,
    private readonly integrationResolver: DingTalkSsoIntegrationResolver,
    @Inject(DINGTALK_SSO_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get boundIdentityLoginPermissionService(): BoundIdentityLoginPermissionService {
    this._boundIdentityLoginPermissionService ??= this.pluginContext.resolve(
      BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN
    )
    return this._boundIdentityLoginPermissionService
  }

  private get ssoBindingPermissionService(): SsoBindingPermissionService {
    this._ssoBindingPermissionService ??= this.pluginContext.resolve(
      SSO_BINDING_PERMISSION_SERVICE_TOKEN
    )
    return this._ssoBindingPermissionService
  }

  async startBind(input: StartBindInput): Promise<string> {
    if (!input.userId?.trim()) {
      throw new DingTalkSsoError('current_user_required', 'Current Xpert user is required for binding.')
    }
    if (!input.tenantId?.trim()) {
      throw new DingTalkSsoError('tenant_required', 'tenantId is required for binding.')
    }

    const integration = await this.resolveIntegration(input.tenantId)
    const redirectUri = this.resolveCallbackUrl(input.requestBaseUrl)
    const state = this.stateService.createState(integration.clientSecret, {
      integrationId: integration.id,
      mode: 'bind',
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      userId: input.userId,
      returnTo: this.validateReturnTo(input.returnTo, input.requestBaseUrl),
      redirectUri,
      nonce: this.createNonce()
    })

    return this.oauthService.buildAuthorizeUrl({ clientId: integration.clientId, redirectUri, state })
  }

  async startLogin(input: StartLoginInput): Promise<string> {
    if (!input.tenantId?.trim()) {
      throw new DingTalkSsoError('tenant_required', 'tenantId is required for login.')
    }

    const integration = await this.resolveIntegration(input.tenantId)
    const redirectUri = this.resolveCallbackUrl(input.requestBaseUrl)
    const state = this.stateService.createState(integration.clientSecret, {
      integrationId: integration.id,
      mode: 'login',
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      returnTo: this.validateReturnTo(input.returnTo, input.requestBaseUrl),
      redirectUri,
      nonce: this.createNonce()
    })

    return this.oauthService.buildAuthorizeUrl({ clientId: integration.clientId, redirectUri, state })
  }

  async handleCallback(input: CallbackInput): Promise<DingTalkSsoCallbackResult> {
    let verifiedState: DingTalkSsoState | null = null

    try {
      const selector = this.readStateSelector(input.state)
      const integration = await this.resolveIntegrationById(selector.tenantId, selector.integrationId)
      verifiedState = this.resolveState(input.state, integration.clientSecret)
      if (verifiedState.redirectUri !== this.resolveCallbackUrl(input.requestBaseUrl)) {
        throw new DingTalkSsoError(
          'callback_mismatch',
          'DingTalk OAuth callback URL does not match the login request.'
        )
      }

      if (input.oauthError) {
        const reason = input.oauthErrorDescription?.trim() || input.oauthError
        throw new DingTalkSsoError('oauth_failed', `DingTalk OAuth failed: ${reason}`)
      }

      const authorizationCode = input.authorizationCode?.trim()
      if (!authorizationCode) {
        throw new DingTalkSsoError('oauth_failed', 'DingTalk OAuth callback is missing authCode.')
      }

      const accessToken = await this.oauthService.exchangeCodeForAccessToken({
        clientId: integration.clientId,
        clientSecret: integration.clientSecret,
        code: authorizationCode
      })
      const oauthProfile = await this.oauthService.fetchUserProfile(accessToken)
      if (!oauthProfile.unionId) {
        throw new DingTalkSsoError('union_id_missing', 'DingTalk OAuth profile did not include unionId.')
      }

      const profile: DingTalkSsoBindingProfile = {
        unionId: oauthProfile.unionId,
        openId: oauthProfile.openId,
        clientId: integration.clientId,
        name: oauthProfile.name,
        avatarUrl: oauthProfile.avatarUrl
      }

      return verifiedState.mode === 'bind'
        ? await this.handleBindCallback(verifiedState, profile)
        : await this.handleLoginCallback(verifiedState, profile)
    } catch (error) {
      const location = this.buildLoginErrorRedirectLocation(error, verifiedState, input.state)
      if (location) {
        return { type: 'redirect', status: 302, location }
      }
      throw error
    }
  }

  private resolveState(stateToken: string | undefined, secret: string): DingTalkSsoState {
    try {
      return this.stateService.verifyState(secret, stateToken?.trim() ?? '')
    } catch (error) {
      if (isDingTalkSsoError(error)) {
        throw error
      }
      throw new DingTalkSsoError('state_invalid', 'Invalid OAuth state.', 400, error)
    }
  }

  private async resolveIntegration(tenantId: string): Promise<{ id: string; tenantId: string; clientId: string; clientSecret: string }> {
    return this.integrationResolver.resolveForTenant(tenantId)
  }

  private async resolveIntegrationById(tenantId: string, integrationId: string): Promise<{ id: string; tenantId: string; clientId: string; clientSecret: string }> {
    return this.integrationResolver.resolveById(tenantId, integrationId)
  }

  private readStateSelector(stateToken?: string): { tenantId: string; integrationId: string } {
    const encodedPayload = stateToken?.split('.')[1]
    if (!encodedPayload) throw new DingTalkSsoError('state_invalid', 'Invalid OAuth state.')
    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<string, unknown>
      if (typeof payload.tenantId !== 'string' || typeof payload.integrationId !== 'string') {
        throw new Error('missing selector')
      }
      return { tenantId: payload.tenantId, integrationId: payload.integrationId }
    } catch (error) {
      throw new DingTalkSsoError('state_invalid', 'OAuth state selector is invalid.', 400, error)
    }
  }

  private async handleBindCallback(
    state: DingTalkSsoBindState,
    profile: DingTalkSsoBindingProfile
  ): Promise<DingTalkSsoCallbackResult> {
    const pendingBinding = await this.ssoBindingPermissionService.createPendingBinding({
      provider: DINGTALK_SSO_PROVIDER,
      subjectId: profile.unionId,
      tenantId: state.tenantId,
      organizationId: state.organizationId ?? null,
      displayName: profile.name,
      avatarUrl: profile.avatarUrl,
      profile,
      returnTo: state.returnTo ?? null,
      flow: 'current_user_confirm'
    })

    return {
      type: 'redirect',
      status: 302,
      location: `${DINGTALK_AUTH_SSO_CONFIRM_PATH}?${new URLSearchParams({
        ticket: pendingBinding.ticket
      }).toString()}`
    }
  }

  private async handleLoginCallback(
    state: DingTalkSsoLoginState,
    profile: DingTalkSsoBindingProfile
  ): Promise<DingTalkSsoCallbackResult> {
    const tokens = await this.boundIdentityLoginPermissionService.loginWithBoundIdentity({
      provider: DINGTALK_SSO_PROVIDER,
      subjectId: profile.unionId,
      tenantId: state.tenantId,
      organizationId: state.organizationId ?? null
    })

    if (!tokens) {
      const pendingBinding = await this.ssoBindingPermissionService.createPendingBinding({
        provider: DINGTALK_SSO_PROVIDER,
        subjectId: profile.unionId,
        tenantId: state.tenantId,
        organizationId: state.organizationId ?? null,
        displayName: profile.name,
        avatarUrl: profile.avatarUrl,
        profile,
        returnTo: state.returnTo ?? null
      })

      return {
        type: 'redirect',
        status: 302,
        location: `/auth/sso-bind?${new URLSearchParams({ ticket: pendingBinding.ticket }).toString()}`
      }
    }

    return {
      type: 'redirect',
      status: 302,
      location: this.buildSignInSuccessLocation(tokens, state.returnTo)
    }
  }

  private buildSignInSuccessLocation(tokens: IssuedAuthTokens, returnTo?: string): string {
    const params = new URLSearchParams({
      jwt: tokens.jwt,
      refreshToken: tokens.refreshToken,
      userId: tokens.userId
    })
    if (returnTo) {
      params.set('returnTo', returnTo)
    }
    return `${DINGTALK_SIGN_IN_SUCCESS_PATH}?${params.toString()}`
  }

  private buildLoginErrorRedirectLocation(
    error: unknown,
    verifiedState: DingTalkSsoState | null,
    stateToken?: string
  ): string | null {
    const loginState =
      verifiedState?.mode === 'login'
        ? verifiedState
        : this.extractUnverifiedStateMode(stateToken) === 'login'
          ? null
          : undefined
    if (loginState === undefined) {
      return null
    }

    const normalizedError = this.normalizeLoginError(error)
    const params = new URLSearchParams({
      ssoProvider: DINGTALK_SSO_PROVIDER,
      ssoError: normalizedError.code,
      ssoMessage: normalizedError.message
    })
    if (loginState?.returnTo) {
      params.set('returnUrl', loginState.returnTo)
    }
    return `${DINGTALK_AUTH_LOGIN_PATH}?${params.toString()}`
  }

  private normalizeLoginError(error: unknown): { code: string; message: string } {
    if (isDingTalkSsoError(error)) {
      return { code: error.code, message: error.message }
    }
    this.logger.error(
      `Unexpected DingTalk SSO error: ${error instanceof Error ? error.message : String(error)}`
    )
    return { code: 'oauth_failed', message: DEFAULT_LOGIN_ERROR_MESSAGE }
  }

  private extractUnverifiedStateMode(stateToken?: string): DingTalkSsoState['mode'] | null {
    const encodedPayload = stateToken?.split('.')[1]
    if (!encodedPayload) {
      return null
    }
    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
        mode?: unknown
      }
      return payload.mode === 'bind' || payload.mode === 'login' ? payload.mode : null
    } catch {
      return null
    }
  }

  private validateReturnTo(returnTo: string | undefined, requestBaseUrl: string): string | undefined {
    const normalized = returnTo?.trim()
    if (!normalized) {
      return undefined
    }

    if (
      normalized.startsWith('/') &&
      !normalized.startsWith('//') &&
      !normalized.includes('\\') &&
      !containsControlCharacter(normalized)
    ) {
      return normalized
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(normalized)
    } catch (error) {
      throw new DingTalkSsoError('return_to_invalid', 'returnTo must be a safe relative or absolute URL.', 400, error)
    }

    const publicOrigin = this.validateRequestBaseUrl(requestBaseUrl)
    if (targetUrl.origin !== publicOrigin) throw new DingTalkSsoError('return_to_invalid', 'Absolute returnTo must share the same origin as the Xpert public URL.')
    return targetUrl.toString()
  }

  private resolveCallbackUrl(requestBaseUrl: string): string {
    const baseUrl = this.validateRequestBaseUrl(requestBaseUrl)
    return new URL(DINGTALK_SSO_CALLBACK_PATH, baseUrl).toString()
  }

  private validateRequestBaseUrl(value: string): string {
    let url: URL
    try {
      url = new URL(value)
    } catch (error) {
      throw new DingTalkSsoError('oauth_failed', 'Unable to resolve the Xpert public URL.', 400, error)
    }
    if (!['http:', 'https:'].includes(url.protocol) || !url.host) {
      throw new DingTalkSsoError('oauth_failed', 'Unable to resolve the Xpert public URL.')
    }
    return url.origin
  }

  private createNonce(): string {
    return randomUUID().replace(/-/g, '')
  }
}

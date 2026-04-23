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
import type { LarkSsoPluginConfig } from './plugin-config.js'
import { LarkOAuthService } from './lark-oauth.service.js'
import { LarkStateService } from './lark-state.service.js'
import {
  isLarkSsoError,
  LARK_AUTH_LOGIN_PATH,
  LARK_AUTH_SSO_CONFIRM_PATH,
  LARK_SSO_CALLBACK_PATH,
  LARK_SSO_PROVIDER,
  LARK_SIGN_IN_SUCCESS_PATH,
  type LarkSsoBindState,
  LarkSsoBindingProfile,
  LarkSsoCallbackResult,
  LarkSsoError,
  type LarkSsoLoginState,
  LarkSsoState
} from './types.js'
import {
  LARK_SSO_PLUGIN_CONFIG,
  LARK_SSO_PLUGIN_CONTEXT
} from './tokens.js'

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
  code?: string
  state?: string
  oauthError?: string
  oauthErrorDescription?: string
  requestBaseUrl: string
}

const DEFAULT_LOGIN_ERROR_MESSAGE = 'Feishu sign-in failed. Please try again.'

@Injectable()
export class LarkSsoService {
  private readonly logger = new Logger(LarkSsoService.name)
  private _boundIdentityLoginPermissionService?: BoundIdentityLoginPermissionService
  private _ssoBindingPermissionService?: SsoBindingPermissionService

  constructor(
    private readonly oauthService: LarkOAuthService,
    private readonly stateService: LarkStateService,
    @Inject(LARK_SSO_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    @Inject(LARK_SSO_PLUGIN_CONFIG)
    private readonly config: LarkSsoPluginConfig
  ) {}

  private get boundIdentityLoginPermissionService(): BoundIdentityLoginPermissionService {
    if (!this._boundIdentityLoginPermissionService) {
      this._boundIdentityLoginPermissionService = this.pluginContext.resolve(
        BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN
      )
    }
    return this._boundIdentityLoginPermissionService
  }

  private get ssoBindingPermissionService(): SsoBindingPermissionService {
    if (!this._ssoBindingPermissionService) {
      this._ssoBindingPermissionService = this.pluginContext.resolve(
        SSO_BINDING_PERMISSION_SERVICE_TOKEN
      )
    }
    return this._ssoBindingPermissionService
  }

  startBind(input: StartBindInput): string {
    if (!input.userId) {
      throw new LarkSsoError('current_user_required', 'Current Xpert user is required for binding.')
    }
    if (!input.tenantId) {
      throw new LarkSsoError('tenant_required', 'tenantId is required for binding.')
    }

    const returnTo = this.validateReturnTo(input.returnTo)
    const state = this.stateService.createState({
      mode: 'bind',
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      userId: input.userId,
      returnTo,
      nonce: this.createNonce()
    })

    return this.oauthService.buildAuthorizeUrl({
      redirectUri: this.resolveCallbackUrl(input.requestBaseUrl),
      state
    })
  }

  startLogin(input: StartLoginInput): string {
    if (!input.tenantId) {
      throw new LarkSsoError('tenant_required', 'tenantId is required for login.')
    }

    const returnTo = this.validateReturnTo(input.returnTo)
    const state = this.stateService.createState({
      mode: 'login',
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      returnTo,
      nonce: this.createNonce()
    })

    return this.oauthService.buildAuthorizeUrl({
      redirectUri: this.resolveCallbackUrl(input.requestBaseUrl),
      state
    })
  }

  async handleCallback(input: CallbackInput): Promise<LarkSsoCallbackResult> {
    let verifiedState: LarkSsoState | null = null

    try {
      verifiedState = this.resolveState(input.state)

      if (input.oauthError) {
        const reason = input.oauthErrorDescription?.trim() || input.oauthError
        throw new LarkSsoError('oauth_failed', `Feishu OAuth failed: ${reason}`)
      }

      const code = input.code?.trim()
      if (!code) {
        throw new LarkSsoError('oauth_failed', 'Feishu OAuth callback is missing code.')
      }

      const redirectUri = this.resolveCallbackUrl(input.requestBaseUrl)
      const accessToken = await this.oauthService.exchangeCodeForAccessToken({
        code,
        redirectUri
      })
      const oauthProfile = await this.oauthService.fetchUserProfile(accessToken)
      if (!oauthProfile.unionId) {
        throw new LarkSsoError('union_id_missing', 'Feishu OAuth profile did not include union_id.')
      }

      const bindingProfile: LarkSsoBindingProfile = {
        unionId: oauthProfile.unionId,
        openId: oauthProfile.openId,
        appId: this.config.appId,
        name: oauthProfile.name,
        avatarUrl: oauthProfile.avatarUrl
      }

      return verifiedState.mode === 'bind'
        ? await this.handleBindCallback(verifiedState as LarkSsoBindState, bindingProfile)
        : await this.handleLoginCallback(verifiedState as LarkSsoLoginState, bindingProfile)
    } catch (error) {
      const loginErrorLocation = this.buildLoginErrorRedirectLocation(
        error,
        verifiedState,
        input.state
      )

      if (loginErrorLocation) {
        return {
          type: 'redirect',
          status: 302,
          location: loginErrorLocation
        }
      }

      throw error
    }
  }

  private resolveState(stateToken?: string): LarkSsoState {
    try {
      return this.stateService.verifyState(stateToken?.trim() ?? '')
    } catch (error) {
      if (isLarkSsoError(error)) {
        throw error
      }
      throw new LarkSsoError('state_invalid', 'Invalid OAuth state.', 400, error)
    }
  }

  private async handleBindCallback(
    state: LarkSsoBindState,
    profile: LarkSsoBindingProfile
  ): Promise<LarkSsoCallbackResult> {
    const pendingBinding = await this.ssoBindingPermissionService.createPendingBinding({
      provider: LARK_SSO_PROVIDER,
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
      location: this.buildSsoConfirmLocation(pendingBinding.ticket)
    }
  }

  private async handleLoginCallback(
    state: LarkSsoLoginState,
    profile: LarkSsoBindingProfile
  ): Promise<LarkSsoCallbackResult> {
    const tokens = await this.boundIdentityLoginPermissionService.loginWithBoundIdentity({
      provider: LARK_SSO_PROVIDER,
      subjectId: profile.unionId,
      tenantId: state.tenantId,
      organizationId: state.organizationId ?? null
    })

    if (!tokens) {
      const pendingBinding = await this.ssoBindingPermissionService.createPendingBinding({
        provider: LARK_SSO_PROVIDER,
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
        location: this.buildSsoBindLocation(pendingBinding.ticket)
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

    return `${LARK_SIGN_IN_SUCCESS_PATH}?${params.toString()}`
  }

  private buildSsoBindLocation(ticket: string): string {
    const params = new URLSearchParams({
      ticket
    })
    return `/auth/sso-bind?${params.toString()}`
  }

  private buildSsoConfirmLocation(ticket: string): string {
    const params = new URLSearchParams({
      ticket
    })
    return `${LARK_AUTH_SSO_CONFIRM_PATH}?${params.toString()}`
  }

  private buildLoginErrorRedirectLocation(
    error: unknown,
    verifiedState: LarkSsoState | null,
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
      ssoProvider: LARK_SSO_PROVIDER,
      ssoError: normalizedError.code,
      ssoMessage: normalizedError.message
    })

    if (loginState?.returnTo) {
      params.set('returnUrl', loginState.returnTo)
    }

    return `${LARK_AUTH_LOGIN_PATH}?${params.toString()}`
  }

  private normalizeLoginError(error: unknown): {
    code: string
    message: string
  } {
    if (isLarkSsoError(error)) {
      return {
        code: error.code,
        message: error.message
      }
    }

    this.logger.error(
      `Unexpected lark sso login error: ${(error as { message?: string })?.message || String(error)}`
    )
    return {
      code: 'oauth_failed',
      message: DEFAULT_LOGIN_ERROR_MESSAGE
    }
  }

  private extractUnverifiedStateMode(stateToken?: string): LarkSsoState['mode'] | null {
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

  private validateReturnTo(returnTo?: string): string | undefined {
    const normalized = returnTo?.trim()
    if (!normalized) {
      return undefined
    }

    if (normalized.startsWith('/') && !normalized.startsWith('//')) {
      return normalized
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(normalized)
    } catch (error) {
      throw new LarkSsoError('return_to_invalid', 'returnTo must be a relative path or an absolute URL.', 400, error)
    }

    if (!this.config.publicBaseUrl) {
      throw new LarkSsoError(
        'return_to_invalid',
        'Absolute returnTo requires publicBaseUrl to be configured.'
      )
    }

    const publicOrigin = new URL(this.config.publicBaseUrl).origin
    if (targetUrl.origin !== publicOrigin) {
      throw new LarkSsoError(
        'return_to_invalid',
        'Absolute returnTo must share the same origin as publicBaseUrl.'
      )
    }

    return targetUrl.toString()
  }

  private resolveCallbackUrl(requestBaseUrl: string): string {
    const baseUrl = this.config.publicBaseUrl || requestBaseUrl
    return new URL(LARK_SSO_CALLBACK_PATH, this.ensureTrailingSlash(baseUrl)).toString()
  }

  private ensureTrailingSlash(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  }

  private createNonce(): string {
    return randomUUID().replace(/-/g, '')
  }
}

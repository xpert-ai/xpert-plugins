jest.mock('@xpert-ai/plugin-sdk', () => ({
  BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN: 'XPERT_PLUGIN_BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE'
}))

import type { BoundIdentityLoginPermissionService, PluginContext } from '@xpert-ai/plugin-sdk'
import { GITHUB_SSO_PKCE_COOKIE_PREFIX } from './constants.js'
import { GitHubOAuthClient } from './github-oauth.client.js'
import { GitHubStateService } from './github-state.service.js'
import { GitHubSsoIntegrationResolver } from './github-sso-integration.resolver.js'
import { GitHubSsoService } from './github-sso.service.js'
import type { ResolvedGitHubSsoIntegration } from './types.js'

describe('GitHubSsoService', () => {
  const integration: ResolvedGitHubSsoIntegration = {
    id: 'integration-1',
    tenantId: 'tenant-1',
    clientId: 'client-id',
    clientSecret: 'client-secret'
  }
  const profile = {
    id: 12345,
    login: 'octocat',
    name: 'The Octocat',
    email: 'octocat@example.com',
    avatarUrl: 'https://avatars.example/octocat',
    profileUrl: 'https://github.com/octocat'
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('starts OAuth with signed tenant state and a secure nonce-scoped PKCE cookie', async () => {
    const fixture = createFixture()
    const result = await fixture.service.startLogin({
      tenantId: 'tenant-1',
      returnTo: '/workspace?tab=agents',
      requestBaseUrl: 'https://tenant-login.example.com'
    })

    expect(fixture.resolveForTenant).toHaveBeenCalledWith('tenant-1')
    expect(fixture.buildAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-id',
        redirectUri: 'https://tenant-login.example.com/api/github-identity/callback',
        codeChallenge: 'code-challenge',
        state: expect.any(String)
      })
    )
    expect(result.pkceCookie).toEqual({
      name: expect.stringMatching(new RegExp(`^${GITHUB_SSO_PKCE_COOKIE_PREFIX}[A-Za-z0-9_-]+$`)),
      value: 'code-verifier',
      secure: true
    })

    const state = fixture.stateService.verifyState('client-secret', fixture.buildAuthorizeUrl.mock.calls[0]?.[0].state)
    expect(state).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        integrationId: 'integration-1',
        redirectUri: 'https://tenant-login.example.com/api/github-identity/callback',
        returnTo: '/workspace?tab=agents'
      })
    )
  })

  it('rejects external returnTo before resolving an integration', async () => {
    const fixture = createFixture()

    await expect(
      fixture.service.startLogin({
        tenantId: 'tenant-1',
        returnTo: 'https://evil.example/capture',
        requestBaseUrl: 'https://xpert.example.com'
      })
    ).rejects.toMatchObject({ code: 'return_to_invalid' })
    expect(fixture.resolveForTenant).not.toHaveBeenCalled()
  })

  it('uses the current tenant login origin and keeps local HTTP cookies non-secure', async () => {
    const publicFixture = createFixture()
    await publicFixture.service.startLogin({
      tenantId: 'tenant-1',
      requestBaseUrl: 'https://tenant-login.example.com'
    })
    expect(publicFixture.buildAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://tenant-login.example.com/api/github-identity/callback'
      })
    )

    const localFixture = createFixture()
    await expect(
      localFixture.service.startLogin({
        tenantId: 'tenant-1',
        requestBaseUrl: 'http://localhost:3000'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        pkceCookie: expect.objectContaining({ secure: false })
      })
    )
  })

  it('revalidates the integration and redirects an existing account through sign-in success', async () => {
    const fixture = createFixture({
      provisionResult: {
        status: 'authenticated',
        tokens: {
          jwt: 'xpert-jwt',
          refreshToken: 'xpert-refresh',
          userId: 'user-1'
        }
      }
    })
    const callback = createCallback(fixture.stateService)

    const result = await fixture.service.handleCallback(callback)

    expect(fixture.resolveById).toHaveBeenCalledWith('tenant-1', 'integration-1')
    expect(fixture.exchangeCode).toHaveBeenCalledWith(integration, {
      code: 'oauth-code',
      redirectUri: 'https://xpert.example.com/api/github-identity/callback',
      codeVerifier: 'code-verifier'
    })
    expect(fixture.loginOrPrepareVerifiedEmail).toHaveBeenCalledWith({
      provider: 'github-sso',
      subjectId: '12345',
      tenantId: 'tenant-1',
      verifiedEmail: 'octocat@example.com',
      displayName: 'The Octocat',
      avatarUrl: 'https://avatars.example/octocat',
      profile: {
        id: '12345',
        login: 'octocat',
        name: 'The Octocat',
        email: 'octocat@example.com',
        avatarUrl: 'https://avatars.example/octocat',
        profileUrl: 'https://github.com/octocat',
        integrationId: 'integration-1'
      },
      returnTo: '/workspace'
    })
    expect(JSON.stringify(fixture.loginOrPrepareVerifiedEmail.mock.calls)).not.toContain('ephemeral-token')
    expect(result.location).toContain('/sign-in/success?')
    expect(result.location).toContain('jwt=xpert-jwt')
    expect(result.location).toContain('returnTo=%2Fworkspace')
  })

  it('redirects a new verified email to registration with only the host ticket', async () => {
    const fixture = createFixture({
      provisionResult: {
        status: 'registration_required',
        ticket: 'one-time-ticket'
      }
    })

    const result = await fixture.service.handleCallback(createCallback(fixture.stateService))

    expect(result).toEqual({
      type: 'redirect',
      status: 302,
      location: '/auth/register?ticket=one-time-ticket'
    })
    expect(result.location).not.toContain('octocat@example.com')
    expect(result.location).not.toContain('ephemeral-token')
  })

  it('maps a host conflict to a safe account_conflict login error', async () => {
    const conflict = {
      getStatus: () => 409,
      message: 'duplicate index and internal table details'
    }
    const fixture = createFixture({ provisionError: conflict })

    const result = await fixture.service.handleCallback(createCallback(fixture.stateService))

    const url = new URL(result.location, 'https://xpert.example.com')
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('ssoError')).toBe('account_conflict')
    expect(url.searchParams.get('ssoMessage')).not.toContain('internal table')
  })

  it('does not call GitHub when the PKCE cookie is missing', async () => {
    const fixture = createFixture()
    const callback = createCallback(fixture.stateService)
    callback.cookies = {}

    const result = await fixture.service.handleCallback(callback)

    expect(fixture.exchangeCode).not.toHaveBeenCalled()
    expect(new URL(result.location, 'https://xpert.example.com').searchParams.get('ssoError')).toBe('pkce_missing')
  })

  function createFixture(options?: {
    provisionResult?:
      | {
          status: 'authenticated'
          tokens: {
            jwt: string
            refreshToken: string
            userId: string
          }
        }
      | {
          status: 'registration_required'
          ticket: string
        }
    provisionError?: unknown
  }) {
    const resolveForTenant = jest.fn().mockResolvedValue(integration)
    const resolveById = jest.fn().mockResolvedValue(integration)
    const resolver = {
      resolveForTenant,
      resolveById
    } as Pick<GitHubSsoIntegrationResolver, 'resolveForTenant' | 'resolveById'>
    const createPkce = jest.fn().mockReturnValue({
      verifier: 'code-verifier',
      challenge: 'code-challenge'
    })
    const buildAuthorizeUrl = jest
      .fn()
      .mockImplementation(
        (input: { state: string }) =>
          `https://github.com/login/oauth/authorize?state=${encodeURIComponent(input.state)}`
      )
    const exchangeCode = jest.fn().mockResolvedValue('ephemeral-token')
    const fetchVerifiedProfile = jest.fn().mockResolvedValue(profile)
    const oauthClient = {
      createPkce,
      buildAuthorizeUrl,
      exchangeCode,
      fetchVerifiedProfile
    } as Pick<GitHubOAuthClient, 'createPkce' | 'buildAuthorizeUrl' | 'exchangeCode' | 'fetchVerifiedProfile'>
    const loginOrPrepareVerifiedEmail = options?.provisionError
      ? jest.fn().mockRejectedValue(options.provisionError)
      : jest.fn().mockResolvedValue(
          options?.provisionResult ?? {
            status: 'registration_required',
            ticket: 'one-time-ticket'
          }
        )
    const permissionService = {
      loginWithBoundIdentity: jest.fn(),
      loginOrPrepareVerifiedEmail
    } as BoundIdentityLoginPermissionService
    const pluginContext = {
      resolve: jest.fn(() => permissionService)
    } as Pick<PluginContext, 'resolve'>
    const stateService = new GitHubStateService()

    return {
      service: new GitHubSsoService(
        resolver as GitHubSsoIntegrationResolver,
        oauthClient as GitHubOAuthClient,
        stateService,
        pluginContext as PluginContext
      ),
      stateService,
      resolveForTenant,
      resolveById,
      buildAuthorizeUrl,
      exchangeCode,
      loginOrPrepareVerifiedEmail
    }
  }

  function createCallback(stateService: GitHubStateService) {
    const nonce = 'abcdefghijklmnopqrstuvwx'
    const state = stateService.createState('client-secret', {
      tenantId: 'tenant-1',
      integrationId: 'integration-1',
      nonce,
      redirectUri: 'https://xpert.example.com/api/github-identity/callback',
      returnTo: '/workspace'
    })
    return {
      code: 'oauth-code',
      state,
      requestBaseUrl: 'https://xpert.example.com',
      cookies: {
        [`${GITHUB_SSO_PKCE_COOKIE_PREFIX}${nonce}`]: 'code-verifier'
      }
    }
  }
})

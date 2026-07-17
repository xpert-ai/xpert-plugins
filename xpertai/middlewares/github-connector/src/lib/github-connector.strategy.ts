import { createHash, randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import {
  ConnectorStrategyKey,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type IntegrationPermissionService,
  type PluginContext,
  type ConnectorAuthorizationCodeInput,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorCredential,
  type ConnectorCredentialRefreshInput,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorProfile,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { GITHUB_CONNECTOR_PLUGIN_CONTEXT } from './tokens.js'

export const GITHUB_CONNECTOR_PROVIDER = 'github'
export const GITHUB_CONNECTOR_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${GITHUB_CONNECTOR_PROVIDER}`

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_INTEGRATION_REQUIRED_MESSAGE =
  'Configure a GitHub system integration at tenant or organization scope before connecting.'

@Injectable()
@ConnectorStrategyKey(GITHUB_CONNECTOR_PROVIDER)
export class GitHubConnectorStrategy implements ConnectorMultiAuthStrategy {
  private _integrationPermissionService?: IntegrationPermissionService

  constructor(
    @Inject(GITHUB_CONNECTOR_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    this._integrationPermissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    return this._integrationPermissionService
  }

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: GITHUB_CONNECTOR_PROVIDER,
    label: {
      en_US: 'GitHub',
      zh_Hans: 'GitHub'
    },
    description: {
      en_US: 'Connect GitHub with a tenant or organization system integration, or a personal access token.',
      zh_Hans: '使用租户或组织的 GitHub 系统集成，或个人访问令牌连接 GitHub。'
    },
    icon: {
      type: 'font',
      value: 'ri-github-fill'
    },
    authMethods: [
      {
        id: 'github-app-oauth',
        type: 'oauth2',
        label: {
          en_US: 'GitHub App OAuth',
          zh_Hans: 'GitHub 应用 OAuth'
        },
        appCredentials: {
          help: {
            label: {
              en_US: 'Configure GitHub system integration',
              zh_Hans: '配置 GitHub 系统集成'
            },
            url: '/settings/integration'
          }
        }
      },
      {
        id: 'pat',
        type: 'api_key',
        label: {
          en_US: 'Personal access token',
          zh_Hans: '个人访问令牌'
        },
        credentials: {
          fields: [
            {
              name: 'token',
              label: { en_US: 'Personal access token', zh_Hans: '个人访问令牌' },
              type: 'password',
              required: true,
              secret: true,
              placeholder: { en_US: 'github_pat_...', zh_Hans: 'github_pat_...' },
              description: {
                en_US: 'The token is validated with GitHub GET /user and is never shown again.',
                zh_Hans: '令牌会通过 GitHub GET /user 校验，保存后不再回显。'
              }
            }
          ],
          help: {
            label: { en_US: 'Create a personal access token', zh_Hans: '创建个人访问令牌' },
            url: 'https://github.com/settings/personal-access-tokens'
          }
        }
      }
    ],
    permissions: [
      {
        key: 'github.user_access_token',
        label: { en_US: 'GitHub user access token', zh_Hans: 'GitHub 用户访问令牌' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'github.refresh_token',
        label: { en_US: 'GitHub refresh token', zh_Hans: 'GitHub 刷新令牌' },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault'
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    if (input.authMethodId === 'pat') {
      const token = requireString(input.values?.token, 'GitHub personal access token is required')
      const user = await requestGitHubUser(token)
      return {
        status: 'active',
        credential: {
          data: {
            accessToken: token,
            tokenType: 'bearer'
          },
          profile: toGitHubProfile(user)
        }
      }
    }

    requireGitHubOAuthMethod(input.authMethodId)
    const app = await this.resolveGitHubApp()
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
    const authorizationUrl = new URL(GITHUB_AUTHORIZE_URL)
    authorizationUrl.searchParams.set('client_id', app.clientId)
    authorizationUrl.searchParams.set('redirect_uri', input.redirectUri)
    authorizationUrl.searchParams.set('state', input.state)
    authorizationUrl.searchParams.set('code_challenge', codeChallenge)
    authorizationUrl.searchParams.set('code_challenge_method', 'S256')

    return {
      status: 'pending',
      authorizationUrl: authorizationUrl.toString(),
      metadata: { codeVerifier, integrationId: app.integrationId }
    }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    requireGitHubOAuthMethod(input.authMethodId)
    const integrationId = readString(input.metadata?.integrationId)
    const app = await this.resolveGitHubApp(integrationId)
    const codeVerifier = requireString(input.metadata?.codeVerifier, 'GitHub OAuth PKCE verifier is missing')
    const token = await requestGitHubToken({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: codeVerifier
    })
    const user = await requestGitHubUser(token.accessToken)
    return toOAuthCredential(app, token, toGitHubProfile(user))
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    requireGitHubOAuthMethod(input.authMethodId)
    const integrationId = readString(input.credential.data.integrationId)
    const app = await this.resolveGitHubApp(integrationId)
    const refreshToken = requireString(input.credential.data.refreshToken, 'GitHub refresh token is missing')
    const token = await requestGitHubToken({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
    return toOAuthCredential(
      app,
      {
        ...token,
        refreshToken: token.refreshToken ?? refreshToken
      },
      input.credential.profile ?? undefined
    )
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    if (input.authMethodId !== 'github-app-oauth' && input.authMethodId !== 'pat') {
      throw new Error(`Unsupported GitHub connector authentication method '${input.authMethodId}'`)
    }
    return {
      accessToken: requireString(input.credential.data.accessToken, 'GitHub connector access token is missing'),
      tokenType: requireString(input.credential.data.tokenType, 'GitHub connector token type is missing')
    }
  }

  private async resolveGitHubApp(integrationId?: string): Promise<ResolvedGitHubApp> {
    const findAllWithInheritance = this.integrationPermissionService.findAllWithInheritance
    if (!findAllWithInheritance) {
      throw new Error('The host does not support inherited system integration lookup')
    }

    const result = await this.integrationPermissionService.findAllWithInheritance<GitHubIntegration>({
      where: {
        provider: GITHUB_CONNECTOR_PROVIDER,
        ...(integrationId ? { id: integrationId } : {})
      },
      order: { createdAt: 'ASC' }
    })
    const integrations = (result.items as GitHubIntegration[]).filter(
      (integration) => integration.provider === GITHUB_CONNECTOR_PROVIDER
    )
    const candidates = integrationId
      ? integrations
      : [...integrations].sort((left, right) => Number(!!left.organizationId) - Number(!!right.organizationId))

    for (const integration of candidates) {
      const clientId = readString(integration.options?.clientId)
      const clientSecret = readString(integration.options?.clientSecret)
      const resolvedIntegrationId = readString(integration.id)
      if (clientId && clientSecret && resolvedIntegrationId) {
        return { integrationId: resolvedIntegrationId, clientId, clientSecret }
      }
    }

    if (integrationId && integrations.length) {
      throw new Error('The selected GitHub system integration is missing its client ID or client secret.')
    }
    throw new Error(GITHUB_INTEGRATION_REQUIRED_MESSAGE)
  }
}

type GitHubAppCredentials = {
  clientId: string
  clientSecret: string
}

type ResolvedGitHubApp = GitHubAppCredentials & {
  integrationId: string
}

type GitHubIntegration = IIntegration<{
  clientId?: string
  clientSecret?: string
}>

type GitHubToken = {
  accessToken: string
  tokenType: string
  expiresIn?: number
  refreshToken?: string
  refreshTokenExpiresIn?: number
}

export type GitHubUser = {
  id: number
  login: string
  name?: string | null
  email?: string | null
  avatar_url?: string | null
  html_url?: string | null
}

export class GitHubRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function requestGitHubUser(accessToken: string): Promise<GitHubUser> {
  let response: Response
  try {
    response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: githubHeaders(accessToken)
    })
  } catch (error) {
    throw new Error(`GitHub user request failed: ${networkErrorMessage(error)}`)
  }
  const body = await readJson(response)
  if (!response.ok) {
    throw new GitHubRequestError(response.status, githubErrorMessage(body, response.status))
  }
  if (!isGitHubUser(body)) {
    throw new Error('GitHub user response is invalid')
  }
  return body
}

async function requestGitHubToken(values: Record<string, string>): Promise<GitHubToken> {
  let response: Response
  try {
    response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Xpert-GitHub-Connector'
      },
      body: new URLSearchParams(values)
    })
  } catch (error) {
    throw new Error(`GitHub token request failed: ${networkErrorMessage(error)}`)
  }
  const body = await readJson(response)
  if (!response.ok || typeof body?.error === 'string') {
    throw new GitHubRequestError(response.status, githubErrorMessage(body, response.status))
  }
  const accessToken = requireString(body?.access_token, 'GitHub token response did not include access_token')
  return {
    accessToken,
    tokenType: requireString(body?.token_type, 'GitHub token response did not include token_type').toLowerCase(),
    expiresIn: readNumber(body?.expires_in),
    refreshToken: readString(body?.refresh_token),
    refreshTokenExpiresIn: readNumber(body?.refresh_token_expires_in)
  }
}

function networkErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const cause = error.cause
  if (!(cause instanceof Error)) {
    return error.message
  }
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null
  const causeMessage = cause.message === error.message ? null : cause.message
  const detail = [code, causeMessage].filter(Boolean).join(': ')
  return detail ? `${error.message} (${detail})` : error.message
}

function toOAuthCredential(
  app: ResolvedGitHubApp,
  token: GitHubToken,
  profile?: ConnectorProfile
): ConnectorCredential {
  return {
    data: {
      integrationId: app.integrationId,
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {})
    },
    expiresAt: toExpiresAt(token.expiresIn),
    refreshExpiresAt: toExpiresAt(token.refreshTokenExpiresIn),
    profile
  }
}

function requireGitHubOAuthMethod(authMethodId: string) {
  if (authMethodId !== 'github-app-oauth') {
    throw new Error(`Unsupported GitHub connector authentication method '${authMethodId}'`)
  }
}

function toGitHubProfile(user: GitHubUser): ConnectorProfile {
  return {
    userId: String(user.id),
    name: user.name || user.login,
    email: user.email ?? undefined,
    avatarUrl: user.avatar_url ?? undefined,
    login: user.login,
    profileUrl: user.html_url ?? undefined
  }
}

function githubHeaders(accessToken: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Xpert-GitHub-Connector'
  }
}

async function readJson(response: Response) {
  try {
    const value: unknown = await response.json()
    return isObject(value) ? value : undefined
  } catch {
    return undefined
  }
}

function githubErrorMessage(value: Record<string, unknown> | undefined, status: number) {
  return (
    readString(value?.error_description) ??
    readString(value?.message) ??
    readString(value?.error) ??
    `GitHub request failed with status ${status}`
  )
}

function isGitHubUser(value: Record<string, unknown> | undefined): value is GitHubUser & Record<string, unknown> {
  return typeof value?.id === 'number' && typeof value.login === 'string' && !!value.login
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) {
    throw new Error(message)
  }
  return result
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toExpiresAt(expiresIn?: number) {
  return expiresIn == null ? undefined : new Date(Date.now() + expiresIn * 1000).toISOString()
}

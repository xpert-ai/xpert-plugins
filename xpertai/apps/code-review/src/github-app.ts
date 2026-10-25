import { Inject, Injectable } from '@nestjs/common'
import { createSign } from 'node:crypto'
import { z } from 'zod/v3'
import { ConnectorRuntimeCapability, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, type AgentMiddlewareRuntimeServiceApi, type PluginContext } from '@xpert-ai/plugin-sdk'
import { configSchema, CONTEXT } from './automation-domain.js'
import { GitHub } from './github.js'
import { ReviewError, type Scope } from './domain.js'
import { reviewRuntimeScope } from './runtime-scope.js'
import type { GitHubConnection } from './github-connection.js'
import { assertGitHubConnectorApplication, assertGitHubRepositoryApplication, resolveGitHubApplication,
  type GitHubApplication, type GitHubRepositoryBinding } from './github-integration.js'

const repositorySchema = z.object({ id: z.number().int().positive(), name: z.string(), owner: z.object({ login: z.string() }),
  permissions: z.object({ admin: z.boolean().optional(), push: z.boolean().optional() }).optional() })

@Injectable()
export class GitHubApp {
  constructor(@Inject(CONTEXT) private readonly context: PluginContext) {}
  async config(scope?: Scope) {
    const config = await resolveGitHubApplication(this.context)
    // Preserve review execution isolation after the host authorizes the configuration reference.
    if (scope && config?.tenantId && scope.tenantId !== config.tenantId) throw new ReviewError('github_integration_unavailable')
    return config
  }
  async status(scope?: Scope) {
    try {
      const config = await this.config(scope)
      return { configured: !!config, integrationId: config?.integrationId ?? null, integrationName: config?.integrationName ?? null,
        installUrl: config ? `https://github.com/apps/${config.slug}/installations/new` : null,
        webhookUrl: config?.publicBaseUrl ? new URL('/api/code_review/github/webhook', config.publicBaseUrl).href : null, errorCode: null }
    } catch (error) {
      return { configured: false, integrationId: configSchema.parse(this.context.config ?? {}).githubIntegrationId ?? null,
        integrationName: null, installUrl: null, webhookUrl: null,
        errorCode: error instanceof ReviewError ? error.code : 'github_integration_unavailable' }
    }
  }
  async connected(s: Scope, application?: GitHubApplication) {
    const runtime = this.context.resolve<AgentMiddlewareRuntimeServiceApi>(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
      .createScopedApi(reviewRuntimeScope(s))
    const api = runtime.capabilities?.get(ConnectorRuntimeCapability)
    if (!api?.getConnectorCredential) throw new ReviewError('github_auth_required')
    try {
      const credential = await api.getConnectorCredential({ provider: 'github' })
      assertGitHubConnectorApplication(credential.authMethodId, credential.credentials, application)
      const token = z.string().min(1).parse(credential.credentials.accessToken)
      return new GitHub(token)
    } catch (error) {
      if (error instanceof ReviewError && error.code === 'github_integration_mismatch') throw error
      throw new ReviewError('github_auth_required')
    }
  }
  async connection(s: Scope): Promise<GitHubConnection> {
    try {
      const config = await this.config(s)
      const github = await this.connected(s, config)
      const account = z.object({ login: z.string().trim().min(1) }).parse(await github.request('/user'))
      return { status: 'connected', login: account.login, ...(config?.integrationId ? { integrationId: config.integrationId } : {}) }
    } catch (error) {
      if (error instanceof ReviewError && error.code === 'github_integration_mismatch') return { status: 'integration_mismatch' }
      return { status: error instanceof ReviewError && error.code === 'github_auth_required' ? 'disconnected' : 'unavailable' }
    }
  }
  private jwt(config: GitHubApplication | undefined) {
    if (!config) throw new ReviewError('github_app_not_configured')
    const now = Math.floor(Date.now() / 1000)
    const unsigned = [JSON.stringify({ alg: 'RS256', typ: 'JWT' }), JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.appId })]
      .map(v => Buffer.from(v).toString('base64url')).join('.')
    const signer = createSign('RSA-SHA256'); signer.update(unsigned)
    // Password inputs may strip PEM line breaks; restore the armor before signing.
    const key = config.privateKey.replace(/\\n/g, '\n').replace(/(-----BEGIN (?:RSA )?PRIVATE KEY-----)\s*([\s\S]*?)\s*(-----END (?:RSA )?PRIVATE KEY-----)/, (_match, begin: string, body: string, end: string) => `${begin}\n${body.replace(/\s/g, '')}\n${end}`)
    try { return `${unsigned}.${signer.sign(key).toString('base64url')}` }
    catch { throw new ReviewError('github_app_invalid_key') }
  }
  async inspect(s: Scope, owner: string, repository: string) {
    const config = await this.config(s)
    if (!config) throw new ReviewError('github_app_not_configured')
    const github = await this.connected(s, config)
    const repo = repositorySchema.parse(await github.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`))
    if (!repo.permissions?.admin && !repo.permissions?.push) throw new ReviewError('repository_management_required')
    const installation = z.object({ id: z.number().int().positive(), suspended_at: z.string().nullable().optional(),
      permissions: z.object({ contents: z.string().optional(), pull_requests: z.string().optional() }) })
      .parse(await new GitHub(this.jwt(config)).request(`/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/installation`))
    if (installation.suspended_at || installation.permissions.contents !== 'read' && installation.permissions.contents !== 'write' || installation.permissions.pull_requests !== 'write')
      throw new ReviewError('installation_permissions_required')
    return { installationId: String(installation.id), repositoryId: String(repo.id), owner: repo.owner.login, repository: repo.name,
      githubIntegrationId: config.integrationId ?? null, githubAppId: config.appId }
  }
  async installation(installationId: string, repositoryId: string, scope: Scope, binding: GitHubRepositoryBinding) {
    if (!/^\d+$/.test(installationId) || !/^\d+$/.test(repositoryId)) throw new ReviewError('invalid_installation')
    const config = await this.config(scope)
    if (!config) throw new ReviewError('github_app_not_configured')
    assertGitHubRepositoryApplication(config, binding)
    const response = z.object({ token: z.string().min(1) }).parse(await new GitHub(this.jwt(config))
      .request(`/app/installations/${installationId}/access_tokens`, { repository_ids: [Number(repositoryId)], permissions: { contents: 'read', pull_requests: 'write' } }))
    return new GitHub(response.token, fetch, `${config.slug}[bot]`)
  }
}

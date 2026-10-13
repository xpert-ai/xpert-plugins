import { Inject, Injectable } from '@nestjs/common'
import { createSign } from 'node:crypto'
import { z } from 'zod/v3'
import { ConnectorRuntimeCapability, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, type AgentMiddlewareRuntimeServiceApi, type PluginContext } from '@xpert-ai/plugin-sdk'
import { configSchema, CONTEXT } from './automation-domain.js'
import { GitHub } from './github.js'
import { ReviewError, type Scope } from './domain.js'

const repositorySchema = z.object({ id: z.number().int().positive(), name: z.string(), owner: z.object({ login: z.string() }),
  permissions: z.object({ admin: z.boolean().optional(), push: z.boolean().optional() }).optional() })

@Injectable()
export class GitHubApp {
  constructor(@Inject(CONTEXT) private readonly context: PluginContext) {}
  config() { return configSchema.parse(this.context.config ?? {}).githubApp }
  status() {
    const config = this.config()
    return { configured: !!config, installUrl: config ? `https://github.com/apps/${config.slug}/installations/new` : null,
      webhookUrl: config ? new URL('/api/code_review/github/webhook', config.publicBaseUrl).href : null }
  }
  async connected(s: Scope) {
    const runtime = this.context.resolve<AgentMiddlewareRuntimeServiceApi>(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
      .createScopedApi({ ...s, xpertId: s.assistantId, connectorProviders: ['github'] })
    const api = runtime.capabilities?.get(ConnectorRuntimeCapability)
    if (!api?.getConnectorCredential) throw new ReviewError('github_auth_required')
    try {
      const credential = await api.getConnectorCredential({ provider: 'github' })
      const token = z.string().min(1).parse(credential.credentials.accessToken)
      return new GitHub(token)
    } catch { throw new ReviewError('github_auth_required') }
  }
  private jwt() {
    const config = this.config()
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
    const github = await this.connected(s)
    const repo = repositorySchema.parse(await github.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`))
    if (!repo.permissions?.admin && !repo.permissions?.push) throw new ReviewError('repository_management_required')
    const installation = z.object({ id: z.number().int().positive(), suspended_at: z.string().nullable().optional(),
      permissions: z.object({ contents: z.string().optional(), pull_requests: z.string().optional() }) })
      .parse(await new GitHub(this.jwt()).request(`/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/installation`))
    if (installation.suspended_at || installation.permissions.contents !== 'read' && installation.permissions.contents !== 'write' || installation.permissions.pull_requests !== 'write')
      throw new ReviewError('installation_permissions_required')
    return { installationId: String(installation.id), repositoryId: String(repo.id), owner: repo.owner.login, repository: repo.name }
  }
  async installation(installationId: string, repositoryId: string) {
    if (!/^\d+$/.test(installationId) || !/^\d+$/.test(repositoryId)) throw new ReviewError('invalid_installation')
    const response = z.object({ token: z.string().min(1) }).parse(await new GitHub(this.jwt())
      .request(`/app/installations/${installationId}/access_tokens`, { repository_ids: [Number(repositoryId)], permissions: { contents: 'read', pull_requests: 'write' } }))
    return new GitHub(response.token)
  }
}

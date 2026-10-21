import type { IIntegration } from '@xpert-ai/contracts'
import { INTEGRATION_PERMISSION_SERVICE_TOKEN, type IntegrationPermissionService, type PluginContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { configSchema } from './automation-domain.js'
import { ReviewError } from './domain.js'

const optionsSchema = z.object({ appId: z.string().regex(/^\d+$/), appSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  clientId: z.string().min(1), clientSecret: z.string().min(1), privateKey: z.string().min(1),
  webhookSecret: z.string().nullish().transform(value => value?.trim() ? value : undefined).pipe(z.string().min(32).optional()) })
export type GitHubApplication = {
  appId: string; slug: string; privateKey: string; webhookSecret?: string; publicBaseUrl?: string
  integrationId?: string; integrationName?: string; tenantId?: string; clientId?: string
}
export type GitHubRepositoryBinding = { githubIntegrationId: string | null; githubAppId: string | null }

export function assertGitHubRepositoryApplication(config: GitHubApplication, binding: GitHubRepositoryBinding) {
  if ((binding.githubIntegrationId ?? null) !== (config.integrationId ?? null) ||
    (binding.githubAppId ? binding.githubAppId !== config.appId : !!config.integrationId))
    throw new ReviewError('github_repository_revalidation_required')
}

// Compatibility with the published SDK until the optional host capability is released.
type ConfigurationReader = IntegrationPermissionService & { readConfiguration?: (id: string) => Promise<IIntegration | null> }
export async function resolveGitHubApplication(context: PluginContext): Promise<GitHubApplication | undefined> {
  const config = configSchema.parse(context.config ?? {})
  if (!config.githubIntegrationId) return config.githubApp
  const reader = context.resolve<ConfigurationReader>(INTEGRATION_PERMISSION_SERVICE_TOKEN)
  if (!reader.readConfiguration) throw new ReviewError('github_integration_unavailable')
  const integration = await reader.readConfiguration(config.githubIntegrationId)
  if (!integration || integration.id !== config.githubIntegrationId || integration.provider !== 'github')
    throw new ReviewError('github_integration_unavailable')
  const parsed = optionsSchema.safeParse(integration.options)
  if (!parsed.success) throw new ReviewError('github_integration_incomplete')
  return { appId: parsed.data.appId, slug: parsed.data.appSlug, privateKey: parsed.data.privateKey,
    webhookSecret: parsed.data.webhookSecret, integrationId: integration.id, integrationName: integration.name,
    tenantId: integration.tenantId, clientId: parsed.data.clientId, publicBaseUrl: process.env.API_BASE_URL }
}

export function assertGitHubConnectorApplication(authMethodId: string, credentials: unknown, expected?: GitHubApplication) {
  if (!expected?.integrationId) return
  const application = z.object({ integrationId: z.literal(expected.integrationId), oauthClientId: z.literal(expected.clientId) }).safeParse(credentials)
  if (authMethodId !== 'github-app-oauth' || !application.success) throw new ReviewError('github_integration_mismatch')
}

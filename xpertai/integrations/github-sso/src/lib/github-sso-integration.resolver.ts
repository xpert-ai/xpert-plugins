import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import { GITHUB_SSO_PROVIDER } from './constants.js'
import { GitHubSsoError } from './github-sso.error.js'
import { GitHubSsoSecretService } from './github-sso-secret.service.js'
import { GITHUB_SSO_PLUGIN_CONTEXT } from './tokens.js'
import type { GitHubSsoIntegration, ResolvedGitHubSsoIntegration } from './types.js'

@Injectable()
export class GitHubSsoIntegrationResolver {
  private _integrationPermissionService?: IntegrationPermissionService

  constructor(
    @Inject(GITHUB_SSO_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    private readonly secretService: GitHubSsoSecretService
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    this._integrationPermissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    return this._integrationPermissionService
  }

  async findAvailable(tenantId: string): Promise<ResolvedGitHubSsoIntegration | null> {
    try {
      return await this.resolveForTenant(tenantId)
    } catch {
      return null
    }
  }

  async resolveForTenant(tenantId: string): Promise<ResolvedGitHubSsoIntegration> {
    const normalizedTenantId = requireTenantId(tenantId)
    const result = await this.integrationPermissionService.findAll<GitHubSsoIntegration>({
      where: {
        provider: GITHUB_SSO_PROVIDER,
        tenantId: normalizedTenantId,
        organizationId: null
      },
      order: {
        createdAt: 'ASC'
      }
    })

    const candidates = (result.items ?? []).filter((integration) =>
      isExactTenantIntegration(integration, normalizedTenantId)
    )

    if (candidates.length === 0) {
      throw new GitHubSsoError(
        'integration_required',
        'Configure one tenant-level GitHub OAuth login integration first.'
      )
    }
    if (candidates.length !== 1) {
      throw new GitHubSsoError(
        'integration_ambiguous',
        'Exactly one tenant-level GitHub OAuth login integration is required.'
      )
    }

    return resolveCredentials(candidates[0], this.secretService)
  }

  async resolveById(tenantId: string, integrationId: string): Promise<ResolvedGitHubSsoIntegration> {
    const normalizedTenantId = requireTenantId(tenantId)
    const normalizedIntegrationId = requireText(integrationId)
    if (!normalizedIntegrationId) {
      throw new GitHubSsoError('integration_required', 'GitHub OAuth integration id is missing.')
    }

    const result = await this.integrationPermissionService.findAll<GitHubSsoIntegration>({
      where: {
        id: normalizedIntegrationId,
        provider: GITHUB_SSO_PROVIDER,
        tenantId: normalizedTenantId,
        organizationId: null
      }
    })

    const candidates = (result.items ?? []).filter(
      (integration) =>
        integration.id === normalizedIntegrationId && isExactTenantIntegration(integration, normalizedTenantId)
    )
    if (candidates.length !== 1) {
      throw new GitHubSsoError(
        'integration_required',
        'The GitHub OAuth login integration is unavailable for this tenant.'
      )
    }

    return resolveCredentials(candidates[0], this.secretService)
  }
}

function isExactTenantIntegration(integration: GitHubSsoIntegration, tenantId: string): boolean {
  return (
    integration.provider === GITHUB_SSO_PROVIDER &&
    integration.tenantId === tenantId &&
    (integration.organizationId === null || integration.organizationId === undefined)
  )
}

function resolveCredentials(
  integration: GitHubSsoIntegration,
  secretService: GitHubSsoSecretService
): ResolvedGitHubSsoIntegration {
  const id = requireText(integration.id)
  const clientId = requireText(integration.options?.clientId)
  const encryptedClientSecret = requireText(integration.options?.clientSecret)

  if (!id || !clientId || !encryptedClientSecret) {
    throw new GitHubSsoError(
      'integration_invalid',
      'The GitHub OAuth login integration is missing its client ID or client secret.'
    )
  }

  let clientSecret: string
  try {
    clientSecret = secretService.decrypt(encryptedClientSecret)
  } catch {
    throw new GitHubSsoError(
      'integration_invalid',
      'The GitHub OAuth login integration client secret cannot be decrypted.'
    )
  }

  return {
    id,
    tenantId: integration.tenantId,
    clientId,
    clientSecret
  }
}

function requireTenantId(value: string): string {
  const tenantId = requireText(value)
  if (!tenantId) {
    throw new GitHubSsoError('tenant_required', 'tenantId is required for GitHub sign-in.')
  }
  return tenantId
}

function requireText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

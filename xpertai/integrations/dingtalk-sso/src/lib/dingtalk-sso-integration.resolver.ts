import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable } from '@nestjs/common'
import { DINGTALK_SSO_PROVIDER } from './types.js'
import { DingTalkSsoError } from './types.js'
import { DingTalkSsoSecretService } from './dingtalk-sso-secret.service.js'
import { DINGTALK_SSO_PLUGIN_CONTEXT } from './tokens.js'
import type {
  DingTalkSsoIntegration,
  ResolvedDingTalkSsoIntegration
} from './types.js'

@Injectable()
export class DingTalkSsoIntegrationResolver {
  private _service?: IntegrationPermissionService

  constructor(
    @Inject(DINGTALK_SSO_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext,
    private readonly secretService: DingTalkSsoSecretService
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    this._service ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    return this._service
  }

  async findAvailable(tenantId: string): Promise<ResolvedDingTalkSsoIntegration | null> {
    try {
      return await this.resolveForTenant(tenantId)
    } catch {
      return null
    }
  }

  async resolveForTenant(tenantId: string): Promise<ResolvedDingTalkSsoIntegration> {
    const normalizedTenantId = requireText(tenantId)
    if (!normalizedTenantId) throw new DingTalkSsoError('tenant_required', 'tenantId is required for DingTalk sign-in.')
    const result = await this.integrationPermissionService.findAll<DingTalkSsoIntegration>({
      where: { provider: DINGTALK_SSO_PROVIDER, tenantId: normalizedTenantId, organizationId: null },
      order: { createdAt: 'ASC' }
    })
    const candidates = (result.items ?? []).filter((item) => isTenant(item, normalizedTenantId))
    if (!candidates.length) throw new DingTalkSsoError('integration_required', 'Configure one tenant-level DingTalk OAuth login integration first.')
    if (candidates.length !== 1) throw new DingTalkSsoError('integration_ambiguous', 'Exactly one tenant-level DingTalk OAuth login integration is required.')
    return resolveCredentials(candidates[0], this.secretService)
  }

  async resolveById(tenantId: string, integrationId: string): Promise<ResolvedDingTalkSsoIntegration> {
    const tenant = requireText(tenantId)
    const id = requireText(integrationId)
    if (!tenant || !id) throw new DingTalkSsoError('integration_required', 'DingTalk OAuth integration is missing.')
    const result = await this.integrationPermissionService.findAll<DingTalkSsoIntegration>({
      where: { id, provider: DINGTALK_SSO_PROVIDER, tenantId: tenant, organizationId: null }
    })
    const matches = (result.items ?? []).filter((item) => item.id === id && isTenant(item, tenant))
    if (matches.length !== 1) throw new DingTalkSsoError('integration_required', 'The DingTalk OAuth login integration is unavailable for this tenant.')
    return resolveCredentials(matches[0], this.secretService)
  }
}

function isTenant(item: DingTalkSsoIntegration, tenantId: string): boolean {
  return item.provider === DINGTALK_SSO_PROVIDER && item.tenantId === tenantId && (item.organizationId == null)
}

function resolveCredentials(item: DingTalkSsoIntegration, secretService: DingTalkSsoSecretService): ResolvedDingTalkSsoIntegration {
  const id = requireText(item.id)
  const clientId = requireText(item.options?.clientId)
  const encryptedSecret = requireText(item.options?.clientSecret)
  if (!id || !clientId || !encryptedSecret) throw new DingTalkSsoError('integration_invalid', 'The DingTalk OAuth login integration is missing its client ID or client secret.')
  try {
    return { id, tenantId: item.tenantId, clientId, clientSecret: secretService.decrypt(encryptedSecret) }
  } catch (error) {
    throw new DingTalkSsoError('integration_invalid', 'The DingTalk OAuth login integration client secret cannot be decrypted.', 503, error)
  }
}

function requireText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

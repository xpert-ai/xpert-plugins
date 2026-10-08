import { Inject, Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { BAIDU_NETDISK_PLUGIN_CONTEXT, BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER } from '../constants.js'
import { BaiduNetdiskConnectorError } from '../errors.js'
import {
  BaiduNetdiskConfigService,
  type BaiduNetdiskOAuthConfig,
  type BaiduNetdiskOAuthIntegrationOptions
} from '../plugin-config.js'

type BaiduNetdiskIntegration = IIntegration<BaiduNetdiskOAuthIntegrationOptions>

export type ResolvedBaiduNetdiskOAuthConfig = {
  integrationId: string
  config: BaiduNetdiskOAuthConfig
}

@Injectable()
export class BaiduNetdiskOAuthConfigService {
  private integrationPermissionService?: IntegrationPermissionService

  constructor(
    private readonly pluginConfig: BaiduNetdiskConfigService,
    @Inject(BAIDU_NETDISK_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext
  ) {}

  async resolve(integrationId?: string): Promise<ResolvedBaiduNetdiskOAuthConfig> {
    const integration = await this.resolveTenantIntegration(integrationId)
    try {
      return {
        integrationId: integration.id,
        config: this.pluginConfig.buildOAuthConfig(integration.options ?? ({} as BaiduNetdiskOAuthIntegrationOptions))
      }
    } catch (error) {
      if (error instanceof BaiduNetdiskConnectorError) throw error
      throw new BaiduNetdiskConnectorError(
        'CONFIGURATION_INVALID',
        'The Baidu Netdisk tenant System Integration has invalid OAuth application credentials.'
      )
    }
  }

  private get permissionService(): IntegrationPermissionService {
    return (this.integrationPermissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN))
  }

  private async resolveTenantIntegration(id?: string): Promise<BaiduNetdiskIntegration & { id: string }> {
    const permissionService = this.permissionService
    if (typeof permissionService.findAllWithInheritance !== 'function') {
      throw new BaiduNetdiskConnectorError(
        'CONNECTOR_UNAVAILABLE',
        'The host does not support inherited tenant System Integration lookup.'
      )
    }

    const result = await permissionService.findAllWithInheritance<BaiduNetdiskIntegration>({
      where: { provider: BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER, ...(id ? { id } : {}) },
      order: { createdAt: 'ASC' }
    })
    const integrations = (result.items ?? []).filter(
      (integration) => integration.provider === BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER
    )
    const tenantIntegrations = integrations.filter((integration) => !integration.organizationId && !!integration.id)
    const selected = id ? tenantIntegrations.find((integration) => integration.id === id) : tenantIntegrations[0]
    if (selected) return selected as BaiduNetdiskIntegration & { id: string }

    if (id && integrations.some((integration) => integration.id === id && !!integration.organizationId)) {
      throw new BaiduNetdiskConnectorError(
        'CONNECTOR_UNAVAILABLE',
        `System Integration '${id}' must be configured at tenant scope.`
      )
    }
    if (id) {
      throw new BaiduNetdiskConnectorError(
        'CONNECTOR_UNAVAILABLE',
        `System Integration '${id}' was not found in the current tenant.`
      )
    }
    throw new BaiduNetdiskConnectorError(
      'CONNECTOR_UNAVAILABLE',
      'Configure a tenant-level Baidu Netdisk OAuth System Integration before connecting.'
    )
  }
}

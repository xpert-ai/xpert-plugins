import { Inject, Injectable } from '@nestjs/common'
import { XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { DataSourceRuntimeCapability } from '@xpert-ai/plugin-sdk/data-workbench'
import type { StudioScope } from './types.js'

/**
 * Platform-owned data-source access.
 *
 * DB Studio is an Xpert platform plugin and must also work when DataX is not
 * installed or running. The host runtime capability performs the tenant,
 * organization and permission checks and keeps credentials inside Xpert.
 */
@Injectable()
export class StudioAccess {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  async resolve(scope: StudioScope): Promise<StudioScope> {
    if (!scope.tenantId || !scope.organizationId || !scope.userId)
      throw new Error('platform_scope_required')
    return scope
  }
  async list(scope: StudioScope): Promise<Set<string>> {
    const sources = await this.capabilities.require(DataSourceRuntimeCapability).list(scope)
    return new Set(sources.map((source) => source.id))
  }
  async assert(scope: StudioScope, id: string, write = false) {
    if (!scope.tenantId || !scope.organizationId || !scope.userId) throw new Error('platform_scope_required')
    if (write) {
      // The host runtime's open/query methods enforce DATA_SOURCE_EDIT for
      // mutations. Keep this preflight scoped to the same source list.
      const sources = await this.capabilities.require(DataSourceRuntimeCapability).list(scope)
      if (!sources.some((source) => source.id === id)) throw new Error('platform_connection_denied')
      return
    }
    const sources = await this.capabilities.require(DataSourceRuntimeCapability).list(scope)
    if (!sources.some((source) => source.id === id)) throw new Error('platform_connection_denied')
  }
}

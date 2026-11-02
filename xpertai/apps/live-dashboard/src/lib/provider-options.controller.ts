import { Controller, Get, Inject, UnauthorizedException } from '@nestjs/common'
import {
  AnalyticsRuntimeCapability, RequestContext, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'

@Controller('live-dashboard/provider-options')
export class DashboardProviderOptionsController {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}

  @Get()
  async list() {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    const userId = RequestContext.currentUserId()
    if (!tenantId || !organizationId || !userId) throw new UnauthorizedException()
    // The host revalidates the actor and filters source access; never accept scope from query parameters.
    const sources = await this.runtime.require(AnalyticsRuntimeCapability).list({ tenantId, organizationId, userId })
    const options = new Map<string, { value: string; label: string; description: string }>()
    for (const source of sources) for (const provider of source.providers) {
      options.set(provider.id, { value: provider.id, label: provider.name, description: provider.id })
    }
    return [...options.values()].sort((left, right) => left.value.localeCompare(right.value))
  }
}

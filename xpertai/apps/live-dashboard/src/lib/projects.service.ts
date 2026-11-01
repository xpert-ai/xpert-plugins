import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { projectId } from './dashboard.service'

import { projectSearchSchema, dashboardProjectSchema } from './projects.schema'
export { projectSearchSchema } from './projects.schema'

/** Selection uses the host's membership and Assistant binding policy, never a client-supplied data scope. */
@Injectable()
export class DashboardProjectsService {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private actor(context: XpertResolvedViewHostContext) {
    if (context.hostType !== 'agent' || !context.tenantId || !context.organizationId || !context.userId)
      throw new ForbiddenException('DASHBOARD_ACCESS_DENIED')
    return { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
  }
  async current(context: XpertResolvedViewHostContext) {
    const id = projectId(context)
    if (!id) return null
    const access = await this.runtime.require(ProjectAccessRuntimeCapability).assertAssistant({ actor: this.actor(context), projectId: id, assistantId: context.hostId })
    return { id, name: access.name ?? id }
  }
  async list(context: XpertResolvedViewHostContext, input: z.infer<typeof projectSearchSchema>) {
    const actor = this.actor(context), access = this.runtime.require(ProjectAccessRuntimeCapability)
    const projects = await access.listReadable({ actor })
    const items: z.infer<typeof dashboardProjectSchema>[] = []
    for (const project of projects) {
      if (project.archived || !(project.name ?? project.projectId).toLocaleLowerCase().includes(input.search.toLocaleLowerCase())) continue
      try { await access.assertAssistant({ actor, projectId: project.projectId, assistantId: context.hostId }) }
      catch (error) { if (error instanceof ForbiddenException) continue; throw error }
      items.push({ id: project.projectId, name: project.name ?? project.projectId })
    }
    items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    const start = (input.page - 1) * 20
    return { items: items.slice(start, start + 20), page: input.page, hasMore: start + 20 < items.length }
  }
}

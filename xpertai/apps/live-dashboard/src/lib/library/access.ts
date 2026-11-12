import { ForbiddenException } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { DashboardService } from '../dashboard.service'

export type LibraryActor = { tenantId: string; organizationId: string; ownerId: string }
export async function libraryActor(dashboards: DashboardService, context: XpertResolvedViewHostContext, write = false): Promise<LibraryActor> {
  await dashboards.authorizeProject(context, write ? 'write' : 'read')
  if (!context.tenantId || !context.organizationId || !context.userId || write && !(await dashboards.access(context)).canEdit) {
    throw new ForbiddenException('LIBRARY_ACCESS_DENIED')
  }
  return { tenantId: context.tenantId, organizationId: context.organizationId, ownerId: context.userId }
}
export const ownedBy = (record: LibraryActor, actor: LibraryActor) => record.tenantId === actor.tenantId && record.organizationId === actor.organizationId && record.ownerId === actor.ownerId

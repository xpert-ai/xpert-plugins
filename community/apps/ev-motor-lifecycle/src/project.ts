import { Injectable, ForbiddenException } from '@nestjs/common'
import { ProjectTypeProvider, type IProjectTypeProvider, type ProjectTypeContext } from '@xpert-ai/plugin-sdk'
import { MotorStore } from './store.js'
import { MotorOrder } from './entity.js'
import { provider, views } from './process.js'
@Injectable()
@ProjectTypeProvider('ev_motor_project')
export class MotorProject implements IProjectTypeProvider {
  constructor(private store: MotorStore) {}
  async resolve(c: ProjectTypeContext, projectId: string) {
    if (!c.organizationId) throw new ForbiddenException('organization_required')
    const e = await this.store.db
      .getRepository(MotorOrder)
      .findOneByOrFail({ tenantId: c.tenantId, organizationId: c.organizationId, projectId })
    if (e.ownerId !== c.userId) throw new ForbiddenException('order_owner_required')
    return {
      name: e.data.code + ' · EM-160',
      status: 'active' as const,
      xpertId: e.coordinatorId,
      viewKey: provider + '__' + views.workspace,
      selectionId: e.id,
    }
  }
  async createEntry() {
    return { viewKey: provider + '__' + views.dashboard }
  }
}

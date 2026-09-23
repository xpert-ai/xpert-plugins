import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ProjectTypeProvider, type IProjectTypeProvider, type ProjectTypeContext } from '@xpert-ai/plugin-sdk'
import { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { FACTORY_CASE_PROJECT_PROVIDER } from './factory-project-type.js'
import { FACTORY_VIEW_PROVIDER_KEY, FACTORY_VIEW_KEY, FACTORY_CASE_WORKSPACE_VIEW_KEY } from './constants.js'

@Injectable()
@ProjectTypeProvider(FACTORY_CASE_PROJECT_PROVIDER)
export class FactoryProjectTypeProvider implements IProjectTypeProvider {
  constructor(@InjectRepository(FactoryCaseEntity) private readonly cases: Repository<FactoryCaseEntity>) {}
  async resolve(context: ProjectTypeContext, projectId: string) {
    const entity = await this.cases.findOneBy({
      tenantId: context.tenantId,
      organizationId: context.organizationId ?? IsNull(),
      workspaceProjectId: projectId
    })
    if (!entity) throw new NotFoundException('Factory Case was not found for this Project.')
    if (context.purpose === 'provision' && entity.createdById !== context.userId) {
      throw new ForbiddenException('Only the Factory Case creator can synchronize its Project.')
    }
    return {
      name: `${entity.caseKey} · ${entity.snapshot.event.title}`.slice(0, 240),
      status: 'active' as const,
      viewKey: `${FACTORY_VIEW_PROVIDER_KEY}__${FACTORY_CASE_WORKSPACE_VIEW_KEY}`,
      selectionId: entity.id,
      ...(entity.coordinatorXpertId ? { xpertId: entity.coordinatorXpertId } : {})
    }
  }
  async createEntry(_context: ProjectTypeContext) {
    return { viewKey: `${FACTORY_VIEW_PROVIDER_KEY}__${FACTORY_VIEW_KEY}` }
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectTypeProvider, type IProjectTypeProvider, type ProjectTypeContext } from '@xpert-ai/plugin-sdk'
import { MaterialCaseEntity } from './entities.js'
import { VIEW_KEYS, artifactKey } from '../artifact-namespace.js'

export const MATERIAL_PROJECT_PROVIDER = artifactKey('case_project')
export { MATERIAL_PROJECT_TYPE } from './project-type.js'

@Injectable()
@ProjectTypeProvider(MATERIAL_PROJECT_PROVIDER)
export class MaterialProjectTypeProvider implements IProjectTypeProvider {
  constructor(@InjectRepository(MaterialCaseEntity) private readonly cases: Repository<MaterialCaseEntity>) {}
  private async requireCase(context: ProjectTypeContext, projectId: string) {
    if (!context.organizationId) throw new ForbiddenException('organization_required')
    const entity = await this.cases.findOneBy({ tenantId: context.tenantId, organizationId: context.organizationId, projectId })
    if (!entity) throw new NotFoundException('case_not_found')
    if (context.purpose === 'provision' && entity.createdById !== context.userId)
      throw new ForbiddenException('case_creator_required')
    return entity
  }
  async resolve(context: ProjectTypeContext, projectId: string) {
    const entity = await this.requireCase(context, projectId)
    return {
      name: `${entity.caseKey} · ${entity.title}`, status: 'active' as const,
      viewKey: `${artifactKey('views')}__${VIEW_KEYS.workspace}`, selectionId: entity.id,
      xpertId: entity.coordinatorId, parameters: { surface: 'workspace' }
    }
  }
  async createEntry(_context: ProjectTypeContext) {
    return { viewKey: `${artifactKey('views')}__${VIEW_KEYS.dashboard}` }
  }
}

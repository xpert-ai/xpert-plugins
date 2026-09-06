import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { FactoryExecutionRecordEntity } from './entities/factory-execution-record.entity.js'

@Injectable()
export class FactoryProfileAccessService {
  constructor(
    @InjectRepository(FactoryCaseEntity) private readonly cases: Repository<FactoryCaseEntity>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
  ) {}

  async readable(context: XpertResolvedViewHostContext) {
    const access = await this.capabilities.require(ProjectAccessRuntimeCapability).listReadable({
      actor: { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
    })
    // This is the plugin's assignment policy. Same-role and same-template instances confer no access.
    const ids = context.assistant?.versionIds ?? []
    const assignedProjectIds = access.filter((item) => item.assistantIds?.some((id) => ids.includes(id))).map((item) => item.projectId)
    const projectIds = access.map((item) => item.projectId)
    const query = this.cases.createQueryBuilder('factoryCase')
      .where('factoryCase.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere(context.organizationId ? 'factoryCase.organizationId = :organizationId' : 'factoryCase.organizationId IS NULL', { organizationId: context.organizationId })
    if (!ids.length || !projectIds.length) query.andWhere('1 = 0')
    else {
      query.andWhere('factoryCase.workspaceProjectId IN (:...projectIds)', { projectIds })
      const participant = query.subQuery().select('1').from(FactoryExecutionRecordEntity, 'participation')
        .where('participation.caseId = factoryCase.id')
        .andWhere('participation.tenantId = factoryCase.tenantId')
        .andWhere('participation.organizationId IS NOT DISTINCT FROM factoryCase.organizationId')
        .andWhere('(participation.requesterXpertId IN (:...assistantIds) OR participation.executorXpertId IN (:...assistantIds))')
        .getQuery()
      const binding = assignedProjectIds.length ? 'factoryCase.workspaceProjectId IN (:...assignedProjectIds) OR ' : ''
      query.andWhere(`(${binding}factoryCase.assignedAssistantIds ?| ARRAY[:...assistantIds]::text[] OR EXISTS ${participant})`, { assistantIds: ids, assignedProjectIds })
    }
    return { query, access }
  }

  async requireCase(context: XpertResolvedViewHostContext, caseId: string) {
    const { query, access } = await this.readable(context)
    const entity = await query.andWhere('factoryCase.id = :caseId', { caseId }).getOne()
    if (!entity) throw new ForbiddenException({ errorCode: 'factory_profile_case_forbidden', message: 'This Case is not available in this Assistant profile.' })
    return { entity, access: access.find((item) => item.projectId === entity.workspaceProjectId)! }
  }
}

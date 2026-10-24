import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import { In, Repository } from 'typeorm'
import { z } from 'zod'
import { projectFactoryCase } from './domain/flow.js'
import type { FactoryCaseSummary, FactoryScope } from './domain/types.js'
import { FactoryExecutionRecordEntity } from './entities/index.js'
import { projectFactoryWorkspace } from './factory-case-workspace.js'
import { FactoryPipelineService } from './pipeline/service.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryProfileAccessService } from './factory-profile-access.service.js'
import { FACTORY_PROFILE_ATTENTION } from './factory-profile.views.js'
import { approveRecoveryPlanSchema, rejectRecoveryPlanSchema } from './tool-schemas.js'

export interface FactoryProfileCase extends FactoryCaseSummary {
  updatedAt: string
  pipelineInstanceId: string | null
  bindingNeedsRepair: boolean
}
export interface FactoryProfileData {
  items: FactoryProfileCase[]
  total: number
  page: number
  pageSize: number
  item: FactoryProfileCase | null
  simulation: boolean
}

@Injectable()
export class FactoryProfileService {
  constructor(
    private readonly access: FactoryProfileAccessService,
    private readonly operations: FactoryOperationsService,
    private readonly pipelines: FactoryPipelineService
  ) {}

  async getData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<FactoryProfileData> {
    const page = Math.max(1, Math.min(100_000, Number(query.page) || 1))
    const pageSize = 10
    const { query: builder, access } = await this.access.readable(context)
    if (viewKey === FACTORY_PROFILE_ATTENTION) {
      // This tab lists business decisions. Technical failures/retries are owned by Project pipelines.
      builder.andWhere("factoryCase.status = 'awaiting_approval'")
    }
    const [entities, total] = await builder.orderBy('factoryCase.updatedAt', 'DESC').addOrderBy('factoryCase.id', 'ASC')
      .skip((page - 1) * pageSize).take(pageSize).getManyAndCount()
    const selected = query.selectionId ? (await this.access.requireCase(context, z.string().uuid().parse(query.selectionId))).entity : null
    const all = selected && !entities.some((entity) => entity.id === selected.id) ? [...entities, selected] : entities
    const projected = all.map((entity): FactoryProfileCase => {
      const canManage = access.find((item) => item.projectId === entity.workspaceProjectId)?.canManage === true
      const summary = projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
      return { ...summary, updatedAt: entity.updatedAt.toISOString(),
        pipelineInstanceId: entity.pipelineInstanceId,
        bindingNeedsRepair: !entity.coordinatorXpertId,
        allowedActions: canManage ? entity.status === 'awaiting_approval' ? ['approve_recovery_plan', 'reject_recovery_plan']
          : [] : [] }
    })
    return { items: projected.slice(0, entities.length), total, page, pageSize,
      item: selected ? projected.find((item) => item.id === selected.id) ?? null : null,
      simulation: this.operations.runtimeMode === 'simulation' }
  }

  async execute(context: XpertResolvedViewHostContext, action: string, request: XpertViewActionRequest) {
    const scope: FactoryScope = { tenantId: context.tenantId, organizationId: context.organizationId,
      userId: context.userId, assistantId: context.assistant?.instanceId, actorType: 'user' }
    if (action === 'approve_recovery_plan' || action === 'reject_recovery_plan') {
      const input = (action === 'approve_recovery_plan' ? approveRecoveryPlanSchema : rejectRecoveryPlanSchema).parse(request.input)
      await this.access.requireCase(context, input.caseId)
      const data = action === 'approve_recovery_plan' ? await this.pipelines.decide(scope, input, 'approved')
        : await this.pipelines.decide(scope, input, 'rejected')
      return { success: true, data, refresh: true }
    }
    return { success: false, message: { en_US: 'Unsupported profile action.', zh_Hans: '不支持此资料卡操作。' } }
  }
}

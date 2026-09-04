import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import { In, Repository } from 'typeorm'
import { z } from 'zod'
import { projectFactoryCase } from './domain/flow.js'
import type { FactoryCaseSummary, FactoryScope } from './domain/types.js'
import { FactoryContinuationEntity, FactoryExecutionRecordEntity } from './entities/index.js'
import { projectFactoryWorkspace } from './factory-case-workspace.js'
import { FactoryContinuationService, publicContinuation } from './factory-continuation.service.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryProfileAccessService } from './factory-profile-access.service.js'
import { FACTORY_PROFILE_ATTENTION } from './factory-profile.views.js'
import { approveRecoveryPlanSchema, rejectRecoveryPlanSchema } from './tool-schemas.js'

export interface FactoryProfileCase extends FactoryCaseSummary {
  updatedAt: string
  continuation: ReturnType<typeof publicContinuation> | null
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
const retrySchema = z.object({ caseId: z.string().uuid(), continuationId: z.string().uuid(), baseRevision: z.number().int().positive() }).strict()

@Injectable()
export class FactoryProfileService {
  constructor(
    private readonly access: FactoryProfileAccessService,
    private readonly operations: FactoryOperationsService,
    private readonly continuations: FactoryContinuationService,
    @InjectRepository(FactoryContinuationEntity) private readonly records: Repository<FactoryContinuationEntity>
  ) {}

  async getData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<FactoryProfileData> {
    const page = Math.max(1, Math.min(100_000, Number(query.page) || 1))
    const pageSize = 10
    const { query: builder, access } = await this.access.readable(context)
    if (viewKey === FACTORY_PROFILE_ATTENTION) {
      const continuation = builder.subQuery().select('1').from(FactoryContinuationEntity, 'continuation')
        .where('continuation.caseId = factoryCase.id').andWhere("continuation.status IN ('blocked', 'failed')").getQuery()
      const failures = builder.subQuery().select('1').from(FactoryExecutionRecordEntity, 'attempt')
        .where('attempt.caseId = factoryCase.id')
        .andWhere("attempt.status IN ('failed', 'interrupted')")
        .andWhere('attempt.supersededByRecordId IS NULL')
        .getQuery()
      builder.andWhere(`(factoryCase.status = 'awaiting_approval' OR (factoryCase.status NOT IN ('recovered', 'rejected') AND (EXISTS ${continuation} OR EXISTS ${failures} OR factoryCase.failureCode IS NOT NULL)))`)
    }
    const [entities, total] = await builder.orderBy('factoryCase.updatedAt', 'DESC').addOrderBy('factoryCase.id', 'ASC')
      .skip((page - 1) * pageSize).take(pageSize).getManyAndCount()
    const selected = query.selectionId ? (await this.access.requireCase(context, z.string().uuid().parse(query.selectionId))).entity : null
    const all = selected && !entities.some((entity) => entity.id === selected.id) ? [...entities, selected] : entities
    const records = all.length ? await this.records.find({ where: { caseId: In(all.map((entity) => entity.id)), scopeKey: `${context.tenantId}:${context.organizationId ?? 'tenant'}` }, order: { createdAt: 'DESC' } }) : []
    const projected = all.map((entity): FactoryProfileCase => {
      const continuation = records.find((record) => record.caseId === entity.id)
      const canManage = access.find((item) => item.projectId === entity.workspaceProjectId)?.canManage === true
      const summary = projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
      return { ...summary, updatedAt: entity.updatedAt.toISOString(),
        continuation: continuation ? publicContinuation(continuation) : null,
        bindingNeedsRepair: !entity.coordinatorXpertId,
        allowedActions: canManage ? entity.status === 'awaiting_approval' ? ['approve_and_continue', 'reject_recovery_plan']
          : continuation && ['blocked', 'failed'].includes(continuation.status) ? ['retry_continuation'] : [] : [] }
    })
    return { items: projected.slice(0, entities.length), total, page, pageSize,
      item: selected ? projected.find((item) => item.id === selected.id) ?? null : null,
      simulation: this.operations.runtimeMode === 'simulation' }
  }

  async execute(context: XpertResolvedViewHostContext, action: string, request: XpertViewActionRequest) {
    const scope: FactoryScope = { tenantId: context.tenantId, organizationId: context.organizationId,
      userId: context.userId, assistantId: context.assistant?.instanceId, actorType: 'user' }
    if (action === 'approve_and_continue' || action === 'reject_recovery_plan') {
      const input = (action === 'approve_and_continue' ? approveRecoveryPlanSchema : rejectRecoveryPlanSchema).parse(request.input)
      await this.access.requireCase(context, input.caseId)
      const data = action === 'approve_and_continue' ? await this.continuations.approveAndContinue(scope, input)
        : await this.operations.rejectRecoveryPlan(scope, input)
      return { success: true, data, refresh: true }
    }
    if (action === 'retry_continuation') {
      const input = retrySchema.parse(request.input)
      await this.access.requireCase(context, input.caseId)
      const record = await this.records.findOneByOrFail({ id: input.continuationId, caseId: input.caseId, scopeKey: `${scope.tenantId}:${scope.organizationId ?? 'tenant'}` })
      return { success: true, data: await this.continuations.retry(scope, record.id, input.baseRevision), refresh: true }
    }
    return { success: false, message: { en_US: 'Unsupported profile action.', zh_Hans: '不支持此资料卡操作。' } }
  }
}

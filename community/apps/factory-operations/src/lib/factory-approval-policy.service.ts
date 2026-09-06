import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ProjectAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { FactoryScope } from './domain/types.js'
import type { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { EntityManager } from 'typeorm'
import { FactoryContinuationEntity, FactoryExecutionRecordEntity } from './entities/index.js'

/** Shared by Workbench, Profile and continuation workers. Never exposed as an Agent tool. */
@Injectable()
export class FactoryApprovalPolicy {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}

  async assertHumanApprover(scope: FactoryScope, entity: FactoryCaseEntity) {
    if (scope.actorType !== 'user' || !scope.userId || !scope.tenantId) {
      throw new ForbiddenException({ errorCode: 'factory_human_approver_required', message: 'A human Project owner or manager must approve this plan.' })
    }
    return this.capabilities.require(ProjectAccessRuntimeCapability).assertManage({
      actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId },
      projectId: entity.workspaceProjectId
    })
  }

  async assertContinuationStep(manager: EntityManager, scope: FactoryScope, entity: FactoryCaseEntity, operationId: string, step: 'execute' | 'verify') {
    const continuation = await manager.getRepository(FactoryContinuationEntity).findOne({
      where: { caseId: entity.id, scopeKey: `${scope.tenantId}:${scope.organizationId ?? 'tenant'}` }, order: { createdAt: 'DESC' }
    })
    if (!continuation) {
      if (step === 'execute') await this.assertHumanApprover(scope, entity)
      return
    }
    await this.assertHumanApprover({ ...scope, userId: continuation.actorId, actorType: 'user' }, entity)
    if (entity.snapshot.plan?.approval.caseRevision !== continuation.approvedRevision
      || entity.snapshot.plan.artifactRevision !== continuation.planRevision
      || entity.snapshot.plan.approval.status !== 'approved'
      || entity.coordinatorXpertId !== continuation.coordinatorXpertId) {
      throw new ConflictException('factory_continuation_approval_changed')
    }
    if (step === 'execute') {
      if (operationId !== continuation.executionOperationId || scope.actorType !== 'user' || scope.userId !== continuation.actorId) {
        throw new ForbiddenException('factory_continuation_execution_required')
      }
    } else {
      const execution = await manager.getRepository(FactoryExecutionRecordEntity).findOneBy({ caseId: entity.id, scopeKey: continuation.scopeKey, operationId })
      if (operationId !== continuation.verificationOperationId || scope.actorType !== 'agent'
        || !execution || execution.agentKey !== scope.agentKey
        || (execution.executorXpertId && execution.executorXpertId !== scope.assistantId)
        || execution.requesterXpertId !== continuation.coordinatorXpertId) {
        throw new ForbiddenException('factory_continuation_verification_task_required')
      }
    }
  }
}

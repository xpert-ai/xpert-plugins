import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ProjectAccessRuntimeCapability, ProjectPipelinesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { FactoryScope } from './domain/types.js'
import type { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { EntityManager } from 'typeorm'
import { FactoryExecutionRecordEntity } from './entities/index.js'

/** Shared by Workbench, Profile and platform adapters. Never exposed as an Agent tool. */
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

  async assertManagedOperation(manager: EntityManager, scope: FactoryScope, entity: FactoryCaseEntity, operationId: string) {
    if (!scope.tenantId || !scope.userId) throw new ForbiddenException('factory_actor_required')
    const execution = scope.actorType === 'agent' ? await manager.getRepository(FactoryExecutionRecordEntity).findOneBy({
      caseId: entity.id, scopeKey: `${scope.tenantId}:${scope.organizationId ?? 'tenant'}`, operationId
    }) : null
    const work = scope.actorType === 'agent' ? execution?.pipelineWork : scope.pipelineWork
    if (!work || work.operationId !== operationId) throw new ForbiddenException('factory_platform_operation_required')
    if (scope.actorType === 'agent' && (!execution || execution.status !== 'running' || execution.executorXpertId !== scope.assistantId ||
      execution.agentKey !== scope.agentKey || execution.executionId !== scope.executionId || execution.conversationId !== scope.conversationId))
      throw new ForbiddenException('factory_execution_identity_mismatch')
    const graph = await this.capabilities.require(ProjectPipelinesRuntimeCapability).graph({ actor: {
      tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }, projectId: entity.workspaceProjectId }, work.instanceId)
    if (graph.roundId !== work.roundId || graph.runId !== work.runId || graph.round.generation !== work.generation ||
      graph.round.inputDigest !== work.inputDigest || graph.round.state !== 'active' || !['active', 'waiting'].includes(graph.runState))
      throw new ConflictException('factory_platform_operation_superseded')
  }
}

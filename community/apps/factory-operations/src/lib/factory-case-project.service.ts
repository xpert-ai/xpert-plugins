import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { IsNull, type Repository } from 'typeorm'
import {
  AGENT_KEYS,
  FACTORY_PLUGIN_NAME
} from './constants.js'
import type { FactoryScope } from './domain/types.js'
import { FactoryCaseEntity } from './entities/factory-case.entity.js'
import { FACTORY_ROLE_ASSISTANTS } from './factory-assistant-definitions.js'
import { projectFactoryWorkspace } from './factory-case-workspace.js'
import { requireFactoryProjectProvisioning } from './factory-runtime-capabilities.js'

@Injectable()
export class FactoryCaseProjectService {
  constructor(
    @InjectRepository(FactoryCaseEntity)
    private readonly cases: Repository<FactoryCaseEntity>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities: RuntimeCapabilityRegistry
  ) {}

  async synchronize(scope: FactoryScope, entity: FactoryCaseEntity) {
    assertCreator(scope, entity)
    const requesterXpertId = requiredText(
      scope.assistantId,
      'factory_requester_assistant_required'
    )
    await this.cases.update(entity.id, {
      workspaceProjectSyncStatus: 'provisioning',
      workspaceProjectSyncedAt: new Date(),
      workspaceProjectErrorCode: null,
      workspaceProjectErrorSummary: null
    })
    try {
      await requireFactoryProjectProvisioning(this.capabilities).ensure({
        projectId: entity.workspaceProjectId,
        xpertId: requesterXpertId,
        requesterAgentKey: AGENT_KEYS.coordinator,
        externalAssistantExpectations: FACTORY_ROLE_ASSISTANTS.map((role) => ({
          pluginName: FACTORY_PLUGIN_NAME,
          templateKey: role.key,
          agentKey: role.agentKey
        })),
        name: `${entity.caseKey} · ${entity.snapshot.event.title}`.slice(0, 240),
        status: 'active'
      })
      await this.cases.update(entity.id, {
        workspaceProjectSyncStatus: 'ready',
        workspaceProjectSyncedAt: new Date(),
        workspaceProjectErrorCode: null,
        workspaceProjectErrorSummary: null
      })
    } catch (error) {
      const failure = safeProjectFailure(error)
      await this.cases.update(entity.id, {
        workspaceProjectSyncStatus: 'failed',
        workspaceProjectSyncedAt: new Date(),
        workspaceProjectErrorCode: failure.code,
        workspaceProjectErrorSummary: failure.summary
      })
    }
    return this.requireCase(scope, entity.id)
  }

  async retry(scope: FactoryScope, caseId: string) {
    const entity = await this.requireCase(scope, caseId)
    assertCreator(scope, entity)
    return this.synchronize(scope, entity)
  }

  workspace(entity: FactoryCaseEntity) {
    return projectFactoryWorkspace(entity)
  }

  private async requireCase(scope: FactoryScope, caseId: string) {
    const entity = await this.cases.findOne({
      where: {
        id: caseId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId ?? IsNull()
      }
    })
    if (!entity) {
      throw new BadRequestException({
        errorCode: 'factory_case_not_found',
        message: 'Factory Case was not found.'
      })
    }
    return entity
  }
}

function assertCreator(scope: FactoryScope, entity: FactoryCaseEntity) {
  if (!scope.userId || entity.createdById !== scope.userId) {
    throw new ForbiddenException({
      errorCode: 'factory_case_project_creator_required',
      message: 'Only the Factory Case creator can synchronize its Project.'
    })
  }
}

function requiredText(value: string | null | undefined, errorCode: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new BadRequestException({ errorCode, message: 'Required runtime identity is missing.' })
  }
  return normalized
}

function safeProjectFailure(error: unknown) {
  const hostCode = structuredErrorCode(error)
  const message = error instanceof Error ? error.message : 'Project provisioning failed.'
  const normalized = `${hostCode ?? ''} ${message}`.toLowerCase()
  const code = normalized.includes('ambiguous')
    ? 'assistant_binding_ambiguous'
    : normalized.includes('unpublished')
      ? 'assistant_unpublished'
      : normalized.includes('organization')
        ? 'assistant_cross_organization'
        : normalized.includes('missing')
          ? 'assistant_binding_missing'
          : 'project_provisioning_failed'
  return { code, summary: `Project synchronization failed: ${code}`.slice(0, 500) }
}

function structuredErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const direct = Reflect.get(error, 'errorCode')
  if (typeof direct === 'string') return direct
  const response = Reflect.get(error, 'response')
  if (!response || typeof response !== 'object') return null
  const nested = Reflect.get(response, 'errorCode')
  return typeof nested === 'string' ? nested : null
}

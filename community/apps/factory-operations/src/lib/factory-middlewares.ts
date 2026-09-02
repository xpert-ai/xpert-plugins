import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import {
  FACTORY_FEATURE,
  FACTORY_ICON,
  FACTORY_MIDDLEWARE,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  FACTORY_TOOL,
  FACTORY_WORKBENCH_FEATURE
} from './constants.js'
import type { FactoryScope } from './domain/types.js'
import { FactoryOperationsService } from './factory-operations.service.js'
import { FactoryToolEventService } from './factory-tool-events.js'
import {
  generateRecoveryPlanSchema,
  getFactoryCaseSchema,
  recordEquipmentFindingSchema,
  recordProductionFindingSchema,
  recordQualityFindingSchema,
  recordResourceFindingSchema,
  recordTriageSchema,
  verifyRecoverySchema,
  type GenerateRecoveryPlanInput,
  type GetFactoryCaseInput,
  type RecordEquipmentFindingInput,
  type RecordProductionFindingInput,
  type RecordQualityFindingInput,
  type RecordResourceFindingInput,
  type RecordTriageInput,
  type VerifyRecoveryInput
} from './tool-schemas.js'

const localizedToolName = (en_US: string, zh_Hans: string) => ({
  toolName: { en_US, zh_Hans }
})
const dashboardSchema = z.object({}).strict()

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.coordination)
export class FactoryCaseCoordinationMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.coordination,
    'Factory case coordination',
    '工厂事件协调',
    [FACTORY_FEATURE.coordination, FACTORY_WORKBENCH_FEATURE]
  )

  constructor(private readonly service: FactoryOperationsService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: FACTORY_MIDDLEWARE.coordination,
      tools: [
        tool(
          async (input: GetFactoryCaseInput) =>
            JSON.stringify(await this.service.getCaseSummary(scope, input)),
          {
            name: FACTORY_TOOL.caseSummary,
            description:
              'Read one exact Factory Case, its current revision, bounded evidence-backed artifacts, plan, execution, and next action. Call before delegation or mutation.',
            schema: getFactoryCaseSchema,
            verboseParsingErrors: true,
            metadata: localizedToolName('Read factory case', '读取工厂事件')
          }
        ),
        tool(
          async (input: GetFactoryCaseInput) => {
            const summary = await this.service.getCaseSummary(scope, input)
            return JSON.stringify({
              caseId: summary.id,
              revision: summary.revision,
              status: summary.status,
              currentStage: summary.currentStage,
              progress: summary.progress,
              nextAction: summary.nextAction
            })
          },
          {
            name: FACTORY_TOOL.caseProgress,
            description:
              'Read compact progress for one exact Factory Case without returning all evidence and action detail.',
            schema: getFactoryCaseSchema,
            verboseParsingErrors: true,
            metadata: localizedToolName('Read recovery progress', '读取恢复进度')
          }
        )
      ]
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.monitoring)
export class FactoryOperationsMonitoringMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.monitoring,
    'Factory operations monitoring',
    '工厂运营监控',
    [FACTORY_FEATURE.monitoring, FACTORY_MANAGEMENT_DASHBOARD_FEATURE]
  )

  constructor(private readonly service: FactoryOperationsService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: FACTORY_MIDDLEWARE.monitoring,
      tools: [
        tool(
          async () => {
            const dashboard = await this.service.getManagementDashboard(scope)
            return JSON.stringify({
              summary: dashboard.summary,
              pipelineHealth: dashboard.pipelineHealth,
              simulation: dashboard.simulation,
              refreshedAt: dashboard.refreshedAt
            })
          },
          {
            name: FACTORY_TOOL.dashboard,
            description:
              'Read the organization-scoped Factory Operations management summary and lane health. This is read-only and does not approve or execute recovery work.',
            schema: dashboardSchema,
            verboseParsingErrors: true,
            metadata: localizedToolName('Read factory operations dashboard', '读取工厂运营监控')
          }
        )
      ]
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.triage)
export class FactoryEventTriageMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.triage,
    'Factory event triage',
    '工厂异常研判',
    [FACTORY_FEATURE.triage]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.triage,
      FACTORY_TOOL.triage,
      tool(
        async (input: RecordTriageInput) =>
          JSON.stringify((await this.service.recordTriage(scope, input)).receipt),
        {
          name: FACTORY_TOOL.triage,
          description:
            'Record one evidence-backed anomaly triage. Call once after reading the exact Case revision and before specialist analysis.',
          schema: recordTriageSchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Record anomaly triage', '记录异常研判')
        }
      ),
      this.events
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.equipment)
export class FactoryEquipmentDiagnosticsMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.equipment,
    'Equipment diagnostics',
    '设备诊断',
    [FACTORY_FEATURE.equipment]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.equipment,
      FACTORY_TOOL.equipment,
      tool(
        async (input: RecordEquipmentFindingInput) =>
          JSON.stringify((await this.service.recordEquipmentFinding(scope, input)).receipt),
        {
          name: FACTORY_TOOL.equipment,
          description:
            'Record one bounded equipment diagnosis with failure mode, safe-running estimate, recommendation, confidence, and source evidence.',
          schema: recordEquipmentFindingSchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Record equipment diagnosis', '记录设备诊断')
        }
      ),
      this.events
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.quality)
export class FactoryQualityRiskMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.quality,
    'Quality impact',
    '质量影响',
    [FACTORY_FEATURE.quality]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.quality,
      FACTORY_TOOL.quality,
      tool(
        async (input: RecordQualityFindingInput) =>
          JSON.stringify((await this.service.recordQualityFinding(scope, input)).receipt),
        {
          name: FACTORY_TOOL.quality,
          description:
            'Record one bounded quality impact assessment with affected quantity, isolation window, recommendation, confidence, and QMS/SPC evidence.',
          schema: recordQualityFindingSchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Record quality impact', '记录质量影响')
        }
      ),
      this.events
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.production)
export class FactoryProductionImpactMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.production,
    'Production impact',
    '生产与订单影响',
    [FACTORY_FEATURE.production]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.production,
      FACTORY_TOOL.production,
      tool(
        async (input: RecordProductionFindingInput) =>
          JSON.stringify((await this.service.recordProductionFinding(scope, input)).receipt),
        {
          name: FACTORY_TOOL.production,
          description:
            'Record one production and delivery impact assessment. Scheduling values must come from bounded MES/APS evidence, not prose optimization.',
          schema: recordProductionFindingSchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Record production impact', '记录生产影响')
        }
      ),
      this.events
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.resources)
export class FactoryResourceReadinessMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.resources,
    'Resource readiness',
    '备件与维修资源',
    [FACTORY_FEATURE.resources]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.resources,
      FACTORY_TOOL.resources,
      tool(
        async (input: RecordResourceFindingInput) =>
          JSON.stringify((await this.service.recordResourceFinding(scope, input)).receipt),
        {
          name: FACTORY_TOOL.resources,
          description:
            'Record one spare-part and maintenance-resource readiness assessment with WMS/CMMS evidence.',
          schema: recordResourceFindingSchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Record resource readiness', '记录资源就绪情况')
        }
      ),
      this.events
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.planning)
export class FactoryRecoveryPlanningMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.planning,
    'Recovery planning',
    '恢复方案规划',
    [FACTORY_FEATURE.planning]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.planning,
      FACTORY_TOOL.plan,
      tool(
        async (input: GenerateRecoveryPlanInput) =>
          JSON.stringify((await this.service.generateRecoveryPlan(scope, input)).receipt),
        {
          name: FACTORY_TOOL.plan,
          description:
            'Generate deterministic recovery options from the four persisted specialist findings. This proposes plan B but never approves or executes it.',
          schema: generateRecoveryPlanSchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Generate recovery options', '生成恢复方案')
        }
      ),
      this.events
    )
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.execution)
export class FactoryRecoveryExecutionMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.execution,
    'Recovery execution status',
    '恢复执行状态',
    [FACTORY_FEATURE.execution]
  )
  constructor(private readonly service: FactoryOperationsService) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return {
      name: FACTORY_MIDDLEWARE.execution,
      tools: [
        tool(
          async (input: GetFactoryCaseInput) =>
            JSON.stringify(await this.service.getExecutionStatus(scope, input)),
          {
            name: FACTORY_TOOL.execution,
            description:
              'Read compact confirmation status for recovery actions. This tool never approves, executes, retries, or fabricates external confirmation.',
            schema: getFactoryCaseSchema,
            verboseParsingErrors: true,
            metadata: localizedToolName('Read execution status', '读取执行状态')
          }
        )
      ]
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(FACTORY_MIDDLEWARE.verification)
export class FactoryRecoveryVerificationMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta = middlewareMeta(
    FACTORY_MIDDLEWARE.verification,
    'Recovery verification',
    '恢复验证',
    [FACTORY_FEATURE.verification]
  )
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope = scopeFromContext(context)
    return mutationMiddleware(
      FACTORY_MIDDLEWARE.verification,
      FACTORY_TOOL.verification,
      tool(
        async (input: VerifyRecoveryInput) =>
          JSON.stringify((await this.service.verifyRecovery(scope, input)).receipt),
        {
          name: FACTORY_TOOL.verification,
          description:
            'Record recovery verification only after all execution actions are confirmed. Verification requires equipment, first-article quality, and production evidence.',
          schema: verifyRecoverySchema,
          verboseParsingErrors: true,
          metadata: localizedToolName('Verify production recovery', '验证生产恢复')
        }
      ),
      this.events
    )
  }
}

export const FACTORY_MIDDLEWARE_PROVIDERS = [
  FactoryCaseCoordinationMiddleware,
  FactoryOperationsMonitoringMiddleware,
  FactoryEventTriageMiddleware,
  FactoryEquipmentDiagnosticsMiddleware,
  FactoryQualityRiskMiddleware,
  FactoryProductionImpactMiddleware,
  FactoryResourceReadinessMiddleware,
  FactoryRecoveryPlanningMiddleware,
  FactoryRecoveryExecutionMiddleware,
  FactoryRecoveryVerificationMiddleware
]

function mutationMiddleware(
  middlewareName: string,
  toolName: string,
  structuredTool: NonNullable<AgentMiddleware['tools']>[number],
  events: FactoryToolEventService
): AgentMiddleware {
  return {
    name: middlewareName,
    tools: [structuredTool],
    wrapToolCall: events.wrap([toolName], middlewareName)
  }
}

function middlewareMeta(
  name: string,
  en_US: string,
  zh_Hans: string,
  features: string[]
): TAgentMiddlewareMeta {
  return {
    name,
    label: { en_US, zh_Hans },
    description: {
      en_US: `${en_US} for governed factory anomaly recovery.`,
      zh_Hans: `${zh_Hans}，用于受控的工厂异常恢复。`
    },
    icon: FACTORY_ICON,
    features,
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): FactoryScope {
  return {
    tenantId: context.tenantId,
    organizationId:
      context.organizationId === undefined
        ? RequestContext.getOrganizationId()
        : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: readRuntimeString(context, 'projectId'),
    userId: context.userId ?? null,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null,
    threadId: readRuntimeThreadId(context),
    executionId: readRuntimeString(context, 'executionId'),
    agentKey: context.agentKey ?? null,
    actorType: 'agent'
  }
}

/**
 * @deprecated Remove when the published plugin SDK context exposes the host's
 * canonical `threadId` field used by Xpert 3.16 source builds.
 */
function readRuntimeThreadId(context: IAgentMiddlewareContext) {
  return readRuntimeString(context, 'threadId')
}

/** @deprecated Remove when these runtime identifiers are published on the SDK context. */
function readRuntimeString(context: IAgentMiddlewareContext, key: string) {
  const value = Reflect.get(context, key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

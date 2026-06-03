import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_FEATURE,
  SALES_ONTOLOGY_ICON,
  SALES_ONTOLOGY_MIDDLEWARE_NAME,
  SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME
} from './constants.js'
import { SalesOntologyService } from './sales-ontology.service.js'
import type { SalesOntologyPublishInput, SalesOntologyScope } from './types.js'

const evidenceSchema = z.object({
  source: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  page: z.union([z.string(), z.number()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional()
})

const entityRefSchema = z.object({
  entityTypeCode: z.string().min(1),
  externalKey: z.string().min(1)
})

const ontologyEntitySchema = entityRefSchema.extend({
  label: z.string().optional(),
  currentStateCode: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
  provenance: z.array(evidenceSchema).optional()
})

const ontologyRelationSchema = z.object({
  relationTypeCode: z.string().min(1),
  source: entityRefSchema,
  target: entityRefSchema,
  attributes: z.record(z.unknown()).optional(),
  provenance: z.array(evidenceSchema).optional()
})

const ontologyActionSchema = z.object({
  actionTypeCode: z.string().min(1),
  target: entityRefSchema.optional(),
  status: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  result: z.record(z.unknown()).optional(),
  provenance: z.array(evidenceSchema).optional()
})

const publishSnapshotSchema = z.object({
  resourceId: z.string().optional().describe('data-xpert business ontology resource id. Defaults to plugin config.'),
  manifest: z.any().optional().describe('Optional dynamic ontology manifest. Omit to use the Sales Ontology default manifest.'),
  entities: z
    .array(ontologyEntitySchema)
    .default([])
    .describe('Business ontology entities such as doctors, hospitals, targets, events, insights, or proposals.'),
  relations: z.array(ontologyRelationSchema).default([]).describe('Business ontology relations between entities.'),
  actions: z.array(ontologyActionSchema).default([]).describe('Action states or action execution facts to publish.'),
  syncMode: z.enum(['replace_snapshot', 'merge']).optional().describe('Use merge for incremental updates.')
})

const queryContextSchema = z.object({
  resourceId: z.string().optional(),
  keyword: z.string().optional(),
  objectType: z.string().optional(),
  limit: z.number().int().positive().max(500).optional()
})

const reasoningSchema = queryContextSchema.extend({
  reasoningType: z
    .enum([
      'causal',
      'temporal',
      'attribution',
      'consistency',
      'validate',
      'implicit_relations',
      'implicit-relations',
      'abductive',
      'attribution_dimensions',
      'attribution_validate',
      'attribution_report',
      'analogy',
      'counterfactual',
      'hierarchical',
      'multi_step',
      'constraint_check',
      'coordination'
    ])
    .optional(),
  targetExternalKey: z.string().optional(),
  entityExternalKey: z.string().optional(),
  observation: z.string().optional(),
  intervention: z.record(z.unknown()).optional()
})

const proposeActionSchema = z.object({
  resourceId: z.string().optional(),
  title: z.string().min(1).describe('Human readable action proposal title.'),
  description: z.string().optional(),
  actionType: z.string().optional().describe('Sales Ontology action type such as sales_ontology.schedule_visit.'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  target: z
    .object({
      entityTypeCode: z.string().optional(),
      externalKey: z.string().optional(),
      label: z.string().optional(),
      objectType: z.string().optional()
    })
    .optional(),
  entityTypeCode: z.string().optional(),
  entityExternalKey: z.string().optional(),
  entityName: z.string().optional(),
  entityObjectType: z.string().optional(),
  actionDefinition: z.record(z.unknown()).optional(),
  reasoningChain: z.array(z.record(z.unknown())).optional(),
  evidence: z.array(evidenceSchema).optional()
})

const recordActionResultSchema = z.object({
  proposalId: z.string().optional(),
  actionName: z.string().optional(),
  toolName: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  result: z.record(z.unknown()).optional(),
  errorMessage: z.string().optional()
})

const executeObjectActionSchema = z.object({
  resourceId: z.string().optional(),
  actionName: z.string().optional().describe('Sales Ontology action, e.g. scheduleVisit or sales_ontology.schedule_visit.'),
  actionType: z.string().optional(),
  targetExternalKey: z.string().optional(),
  entityExternalKey: z.string().optional(),
  targetLabel: z.string().optional(),
  entityName: z.string().optional(),
  targetObjectType: z.string().optional(),
  targetDomain: z.string().optional(),
  targetState: z.string().optional(),
  targetProperties: z.record(z.unknown()).optional(),
  targetAttributes: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
  approved: z.boolean().optional(),
  forceExecute: z.boolean().optional(),
  preconditions: z.union([z.array(z.string()), z.string()]).optional(),
  sideEffects: z.union([z.array(z.string()), z.string()]).optional(),
  writeBackTargets: z.union([z.array(z.string()), z.string()]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(evidenceSchema).optional()
})

const notificationSchema = z.object({
  userId: z.string().optional(),
  type: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  entityExternalKey: z.string().optional(),
  entityTypeCode: z.string().optional(),
  payload: z.record(z.unknown()).optional()
})

const reminderSchema = z.object({
  userId: z.string().optional(),
  reminderType: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.string().optional(),
  entityExternalKey: z.string().optional(),
  entityTypeCode: z.string().optional(),
  payload: z.record(z.unknown()).optional()
})

const decisionEffectSchema = z.object({
  decisionId: z.string().optional(),
  proposalId: z.string().optional(),
  entityExternalKey: z.string().optional(),
  decisionType: z.string().optional(),
  actionType: z.string().optional(),
  metricName: z.string().optional(),
  expectedValue: z.number().optional(),
  actualValue: z.number().optional(),
  unit: z.string().optional(),
  status: z.string().optional(),
  evidence: z.record(z.unknown()).optional()
})

const effectQuerySchema = z.object({
  decisionId: z.string().optional(),
  proposalId: z.string().optional(),
  limit: z.number().int().positive().max(500).optional()
})

const scenarioSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  scenarioType: z.string().optional(),
  category: z.string().optional(),
  targetValue: z.number().optional(),
  baselineForecastValue: z.number().optional(),
  forecastValue: z.number().optional(),
  delta: z.number().optional(),
  params: z.record(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional()
})

const memorySchema = z.object({
  memoryType: z.string().optional(),
  contentText: z.string().optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceRunId: z.string().optional()
})

type SalesOntologyTool = NonNullable<AgentMiddleware['tools']>[number]

const CORE_TOOL_NAMES = [
  'sales_ontology_publish_business_snapshot',
  'sales_ontology_get_customer_context',
  'sales_ontology_run_perception',
  'sales_ontology_run_reasoning',
  'sales_ontology_generate_suggestions',
  'sales_ontology_propose_action',
  'sales_ontology_simulate_scenario',
  'sales_ontology_record_decision_effect'
]

const CONTEXT_TOOL_NAMES = [
  'sales_ontology_publish_business_snapshot',
  'sales_ontology_get_domain_ontology',
  'sales_ontology_get_customer_context',
  'sales_ontology_get_compliance_risks',
  'sales_ontology_get_sales_target_status'
]

const DECISION_TOOL_NAMES = [
  'sales_ontology_run_perception',
  'sales_ontology_run_reasoning',
  'sales_ontology_generate_insights',
  'sales_ontology_generate_suggestions'
]

const ACTION_GOVERNANCE_TOOL_NAMES = [
  'sales_ontology_propose_action',
  'sales_ontology_execute_object_action',
  'sales_ontology_create_visit_record',
  'sales_ontology_update_doctor_sentiment',
  'sales_ontology_flag_compliance_risk',
  'sales_ontology_send_notification',
  'sales_ontology_create_reminder',
  'sales_ontology_record_action_result'
]

const SCENARIO_LEARNING_TOOL_NAMES = [
  'sales_ontology_record_decision_effect',
  'sales_ontology_get_decision_effects',
  'sales_ontology_simulate_scenario',
  'sales_ontology_record_memory',
  'sales_ontology_get_learning_summary'
]

function middlewareMeta(
  name: string,
  en_US: string,
  zh_Hans: string,
  description_en_US: string,
  description_zh_Hans: string
): TAgentMiddlewareMeta {
  return {
    name,
    label: {
      en_US,
      zh_Hans
    },
    description: {
      en_US: description_en_US,
      zh_Hans: description_zh_Hans
    },
    icon: {
      type: 'svg',
      value: SALES_ONTOLOGY_ICON,
      color: '#0f766e'
    },
    features: [SALES_ONTOLOGY_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
}

function selectTools(tools: SalesOntologyTool[], names: readonly string[]): SalesOntologyTool[] {
  const byName = new Map(tools.map((item) => [item.name, item]))
  return names.map((name) => byName.get(name)).filter(Boolean) as SalesOntologyTool[]
}

@Injectable()
@AgentMiddlewareStrategy(SALES_ONTOLOGY_MIDDLEWARE_NAME)
export class SalesOntologyMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: SalesOntologyService) {}

  meta: TAgentMiddlewareMeta = middlewareMeta(
    SALES_ONTOLOGY_MIDDLEWARE_NAME,
    'Sales Ontology Core Decision Tools',
    'Sales Ontology 核心决策工具',
    'Compact default Sales Ontology toolset for context reading, perception, reasoning, suggestions, governed proposals, scenario simulation, and outcome recording.',
    '默认精简 Sales Ontology 工具集：读取上下文、运行感知和推理、生成建议、创建受控草案、场景推演并记录结果。'
  )

  protected createAllTools(context: IAgentMiddlewareContext): SalesOntologyTool[] {
    const scope = scopeFromContext(context)

    const publishSnapshotTool = tool(
      async (input: z.infer<typeof publishSnapshotSchema>) => {
        const result = await this.service.publishSnapshot(scope, input as SalesOntologyPublishInput)
        return JSON.stringify({
          message: 'Sales Ontology business ontology snapshot was published to data-xpert.',
          result
        })
      },
      {
        name: 'sales_ontology_publish_business_snapshot',
        description:
          'Publish a Sales Ontology business ontology snapshot to data-xpert. Use this after extracting or receiving business objects, relations, events, actions, insights, or proposals.',
        schema: publishSnapshotSchema
      }
    )

    const customerContextTool = tool(
      async (input: z.infer<typeof queryContextSchema>) => stringifyResult(await this.service.getCustomerContext(scope, input)),
      {
        name: 'sales_ontology_get_customer_context',
        description:
          'Read Sales Ontology customer or business-object context from the data-xpert ontology for downstream analysis.',
        schema: queryContextSchema
      }
    )

    const complianceRisksTool = tool(
      async (input: z.infer<typeof queryContextSchema>) => stringifyResult(await this.service.getComplianceRisks(scope, input)),
      {
        name: 'sales_ontology_get_compliance_risks',
        description: 'Find high or critical compliance risk objects from the Sales Ontology business ontology.',
        schema: queryContextSchema
      }
    )

    const salesTargetStatusTool = tool(
      async (input: z.infer<typeof queryContextSchema>) => stringifyResult(await this.service.getSalesTargetStatus(scope, input)),
      {
        name: 'sales_ontology_get_sales_target_status',
        description: 'Summarize Sales Ontology sales target achievement and underperforming target objects.',
        schema: queryContextSchema
      }
    )

    const perceptionTool = tool(
      async (input: z.infer<typeof queryContextSchema>) => stringifyResult(await this.service.runPerception(scope, input)),
      {
        name: 'sales_ontology_run_perception',
        description:
          'Run Sales Ontology perception over ontology objects to detect risk, anomalies, patterns, churn probability, and alerts.',
        schema: queryContextSchema
      }
    )

    const reasoningTool = tool(
      async (input: z.infer<typeof reasoningSchema>) => stringifyResult(await this.service.runReasoning(scope, input)),
      {
        name: 'sales_ontology_run_reasoning',
        description:
          'Run Sales Ontology reasoning over current business context. Supports causal, temporal, attribution, consistency, abductive, analogy, counterfactual, hierarchical, multi-step, constraint, and coordination reasoning.',
        schema: reasoningSchema
      }
    )

    const insightsTool = tool(
      async (input: z.infer<typeof queryContextSchema>) => stringifyResult(await this.service.generateInsights(scope, input)),
      {
        name: 'sales_ontology_generate_insights',
        description: 'Generate Sales Ontology business insights and publish insight nodes back into data-xpert ontology.',
        schema: queryContextSchema
      }
    )

    const suggestionsTool = tool(
      async (input: z.infer<typeof queryContextSchema>) =>
        stringifyResult(await this.service.generateSuggestions(scope, input)),
      {
        name: 'sales_ontology_generate_suggestions',
        description:
          'Generate Sales Ontology next-best-action suggestions, persist them for Workbench review, and publish suggestion nodes to data-xpert.',
        schema: queryContextSchema
      }
    )

    const proposeActionTool = tool(
      async (input: z.infer<typeof proposeActionSchema>) => stringifyResult(await this.service.proposeAction(scope, input)),
      {
        name: 'sales_ontology_propose_action',
        description:
          'Create a governed Sales Ontology action proposal for human review. Use this before any business write-back or high-risk action.',
        schema: proposeActionSchema
      }
    )

    const recordActionResultTool = tool(
      async (input: z.infer<typeof recordActionResultSchema>) =>
        stringifyResult(await this.service.recordActionResult(scope, input)),
      {
        name: 'sales_ontology_record_action_result',
        description:
          'Record the result of an executed Sales Ontology action proposal or related Assistant tool execution.',
        schema: recordActionResultSchema
      }
    )

    const domainOntologyTool = tool(
      async () => stringifyResult(this.service.getDomainOntology()),
      {
        name: 'sales_ontology_get_domain_ontology',
        description:
          'Return the implemented Sales Ontology domain ontology, lifecycle transitions, reasoning types, and executable actions.',
        schema: z.object({})
      }
    )

    const executeObjectActionTool = tool(
      async (input: z.infer<typeof executeObjectActionSchema>) =>
        stringifyResult(await this.service.executeObjectAction(scope, input)),
      {
        name: 'sales_ontology_execute_object_action',
        description:
          'Execute or stage a Sales Ontology object action. High-risk actions automatically create an approval proposal unless approved or forceExecute is true.',
        schema: executeObjectActionSchema
      }
    )

    const createVisitRecordTool = tool(
      async (input: z.infer<typeof executeObjectActionSchema>) =>
        stringifyResult(await this.service.createVisitRecord(scope, input)),
      {
        name: 'sales_ontology_create_visit_record',
        description: 'Create a Sales Ontology visit record/action event for a doctor or customer object.',
        schema: executeObjectActionSchema
      }
    )

    const updateDoctorSentimentTool = tool(
      async (input: z.infer<typeof executeObjectActionSchema>) =>
        stringifyResult(await this.service.updateDoctorSentiment(scope, input)),
      {
        name: 'sales_ontology_update_doctor_sentiment',
        description: 'Log or publish a governed Sales Ontology doctor sentiment update.',
        schema: executeObjectActionSchema
      }
    )

    const flagComplianceRiskTool = tool(
      async (input: z.infer<typeof executeObjectActionSchema>) =>
        stringifyResult(await this.service.flagComplianceRisk(scope, input)),
      {
        name: 'sales_ontology_flag_compliance_risk',
        description:
          'Flag a compliance risk, create a compliance alert side effect, and notify compliance reviewers when configured.',
        schema: executeObjectActionSchema
      }
    )

    const sendNotificationTool = tool(
      async (input: z.infer<typeof notificationSchema>) =>
        stringifyResult(await this.service.sendNotification(scope, input)),
      {
        name: 'sales_ontology_send_notification',
        description: 'Persist a Sales Ontology notification for a user or business object.',
        schema: notificationSchema
      }
    )

    const createReminderTool = tool(
      async (input: z.infer<typeof reminderSchema>) => stringifyResult(await this.service.createReminder(scope, input)),
      {
        name: 'sales_ontology_create_reminder',
        description: 'Create a Sales Ontology follow-up reminder attached to a user or ontology object.',
        schema: reminderSchema
      }
    )

    const recordDecisionEffectTool = tool(
      async (input: z.infer<typeof decisionEffectSchema>) =>
        stringifyResult(await this.service.recordDecisionEffect(scope, input)),
      {
        name: 'sales_ontology_record_decision_effect',
        description:
          'Record expected vs actual Sales Ontology decision effects such as sales growth, satisfaction, execution efficiency, or resource utilization.',
        schema: decisionEffectSchema
      }
    )

    const getDecisionEffectsTool = tool(
      async (input: z.infer<typeof effectQuerySchema>) =>
        stringifyResult(await this.service.getDecisionEffects(scope, input)),
      {
        name: 'sales_ontology_get_decision_effects',
        description: 'Read Sales Ontology decision effect metrics and rollups.',
        schema: effectQuerySchema
      }
    )

    const simulateScenarioTool = tool(
      async (input: z.infer<typeof scenarioSchema>) => stringifyResult(await this.service.simulateScenario(scope, input)),
      {
        name: 'sales_ontology_simulate_scenario',
        description: 'Run and persist a Sales Ontology scenario forecast with target, baseline, delta, and adjustment parameters.',
        schema: scenarioSchema
      }
    )

    const recordMemoryTool = tool(
      async (input: z.infer<typeof memorySchema>) => stringifyResult(await this.service.recordMemory(scope, input)),
      {
        name: 'sales_ontology_record_memory',
        description: 'Persist Sales Ontology episodic or semantic memory for later learning.',
        schema: memorySchema
      }
    )

    const getLearningSummaryTool = tool(
      async (input: z.infer<typeof effectQuerySchema>) =>
        stringifyResult(await this.service.getLearningSummary(scope, input)),
      {
        name: 'sales_ontology_get_learning_summary',
        description: 'Summarize recent Sales Ontology runs, memories, decision effects, and learning recommendations.',
        schema: effectQuerySchema
      }
    )

    return [
      publishSnapshotTool,
      domainOntologyTool,
      customerContextTool,
      complianceRisksTool,
      salesTargetStatusTool,
      perceptionTool,
      reasoningTool,
      insightsTool,
      suggestionsTool,
      proposeActionTool,
      executeObjectActionTool,
      createVisitRecordTool,
      updateDoctorSentimentTool,
      flagComplianceRiskTool,
      sendNotificationTool,
      createReminderTool,
      recordActionResultTool,
      recordDecisionEffectTool,
      getDecisionEffectsTool,
      simulateScenarioTool,
      recordMemoryTool,
      getLearningSummaryTool
    ]
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    return {
      name: SALES_ONTOLOGY_MIDDLEWARE_NAME,
      tools: selectTools(this.createAllTools(context), CORE_TOOL_NAMES)
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME)
export class SalesOntologyContextMiddleware extends SalesOntologyMiddleware {
  override meta: TAgentMiddlewareMeta = middlewareMeta(
    SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
    'Sales Ontology Context Tools',
    'Sales Ontology 上下文工具',
    'Sales Ontology ontology publishing and context reading tools.',
    'Sales Ontology 本体发布与业务上下文读取工具。'
  )

  override createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    return {
      name: SALES_ONTOLOGY_CONTEXT_MIDDLEWARE_NAME,
      tools: selectTools(this.createAllTools(context), CONTEXT_TOOL_NAMES)
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME)
export class SalesOntologyDecisionMiddleware extends SalesOntologyMiddleware {
  override meta: TAgentMiddlewareMeta = middlewareMeta(
    SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
    'Sales Ontology Decision Intelligence',
    'Sales Ontology 决策智能',
    'Sales Ontology perception, reasoning, insight, and suggestion generation tools.',
    'Sales Ontology 感知、推理、洞察与建议生成工具。'
  )

  override createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    return {
      name: SALES_ONTOLOGY_DECISION_MIDDLEWARE_NAME,
      tools: selectTools(this.createAllTools(context), DECISION_TOOL_NAMES)
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME)
export class SalesOntologyActionGovernanceMiddleware extends SalesOntologyMiddleware {
  override meta: TAgentMiddlewareMeta = middlewareMeta(
    SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
    'Sales Ontology Action Governance',
    'Sales Ontology 动作治理',
    'Sales Ontology governed action proposal, execution, notification, reminder, and result recording tools.',
    'Sales Ontology 受控动作草案、执行、通知、提醒和结果记录工具。'
  )

  override createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    return {
      name: SALES_ONTOLOGY_ACTION_GOVERNANCE_MIDDLEWARE_NAME,
      tools: selectTools(this.createAllTools(context), ACTION_GOVERNANCE_TOOL_NAMES)
    }
  }
}

@Injectable()
@AgentMiddlewareStrategy(SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME)
export class SalesOntologyScenarioLearningMiddleware extends SalesOntologyMiddleware {
  override meta: TAgentMiddlewareMeta = middlewareMeta(
    SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME,
    'Sales Ontology Scenario & Learning',
    'Sales Ontology 场景与学习',
    'Sales Ontology scenario simulation, decision effect, memory, and learning summary tools.',
    'Sales Ontology 场景推演、决策效果、记忆和学习总结工具。'
  )

  override createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    return {
      name: SALES_ONTOLOGY_SCENARIO_LEARNING_MIDDLEWARE_NAME,
      tools: selectTools(this.createAllTools(context), SCENARIO_LEARNING_TOOL_NAMES)
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): SalesOntologyScope {
  return {
    tenantId: context.tenantId ?? RequestContext.currentTenantId(),
    userId: context.userId ?? RequestContext.currentUserId(),
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function stringifyResult(result: unknown) {
  return JSON.stringify(result)
}

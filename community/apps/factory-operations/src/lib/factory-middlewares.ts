import { FACTORY_PROFILE_FEATURE } from './factory-profile.views.js'
import { z } from "zod/v3";
import type { TAgentMiddlewareMeta } from "@xpert-ai/contracts";
import {
  XpertTool,
  XpertToolProvider,
  type IAgentMiddlewareContext,
  type XpertBusinessToolContext,
  type XpertToolProviderInstance,
} from "@xpert-ai/plugin-sdk";
import {
  FACTORY_FEATURE,
  FACTORY_ICON,
  FACTORY_INSIGHTS_TOOLSET_COMPONENT_KEY,
  FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  FACTORY_MIDDLEWARE,
  FACTORY_MUTATION_TOOL_NAMES,
  FACTORY_TOOL,
  FACTORY_TOOLSET_COMPONENT_KEY,
  FACTORY_TOOLSET_PROVIDER_KEY,
  FACTORY_WORKBENCH_FEATURE,
} from "./constants.js";
import type { FactoryScope } from "./domain/types.js";
import { FactoryOperationsService } from "./factory-operations.service.js";
import { FactoryToolEventService } from "./factory-tool-events.js";
import {
  FACTORY_CASE_SUMMARY_MCP_APP_KEY,
  FACTORY_DASHBOARD_MCP_APP_KEY,
  FACTORY_INSIGHTS_MCP_APPS,
} from "./factory-mcp-apps.js";
import {
  factoryCaseProgressResultSchema,
  factoryCaseSummaryResultSchema,
  factoryExecutionStatusResultSchema,
  factoryMutationReceiptSchema,
  factoryOperationsDashboardResultSchema,
  generateRecoveryPlanSchema,
  getFactoryCaseSchema,
  recordEquipmentFindingSchema,
  recordProductionFindingSchema,
  recordQualityFindingSchema,
  recordResourceFindingSchema,
  recordTriageSchema,
  searchFactoryCasesResultSchema,
  searchFactoryCasesSchema,
  verifyRecoverySchema,
  type GenerateRecoveryPlanInput,
  type GetFactoryCaseInput,
  type RecordEquipmentFindingInput,
  type RecordProductionFindingInput,
  type RecordQualityFindingInput,
  type RecordResourceFindingInput,
  type RecordTriageInput,
  type SearchFactoryCasesInput,
  type VerifyRecoveryInput,
} from "./tool-schemas.js";

const dashboardSchema = z.object({}).strict();
const REQUIRED_CONTEXT = [
  "tenant",
  "organization",
  "principal",
  "execution",
] as const;
const READ_BEHAVIOR = {
  risk: "read",
  sideEffect: "none",
  idempotency: "safe",
} as const;
const WRITE_BEHAVIOR = {
  risk: "write",
  sideEffect: "irreversible",
  idempotency: "idempotent",
} as const;

const localizedToolName = (en_US: string, zh_Hans: string) => ({
  toolName: { en_US, zh_Hans },
});

/** @deprecated Prefer the SDK's XpertBusinessToolContext in new integrations. */
export type FactoryToolExecutionContext = XpertBusinessToolContext;

@XpertToolProvider({
  provider: FACTORY_INSIGHTS_TOOLSET_PROVIDER_KEY,
  componentKey: FACTORY_INSIGHTS_TOOLSET_COMPONENT_KEY,
  name: "Factory Operations Insights",
  description:
    "Organization-scoped, read-only Factory Case search, progress, dashboard, and execution insights.",
  instructions:
    "Use these read-only tools to discover Factory Cases and inspect current recovery state. They never approve, reject, or execute recovery work.",
  slug: "factory-operations-insights-mcp",
  author: "XpertAI",
  tags: ["factory", "operations", "insights", "mcp"],
  icon: FACTORY_ICON,
  apps: FACTORY_INSIGHTS_MCP_APPS,
  defaultMiddleware: FACTORY_MIDDLEWARE.coordination,
  middlewares: [
    {
      provider: FACTORY_MIDDLEWARE.coordination,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.coordination,
        "Factory case coordination",
        "工厂事件协调",
        [FACTORY_FEATURE.coordination, FACTORY_WORKBENCH_FEATURE]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.monitoring,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.monitoring,
        "Factory operations monitoring",
        "工厂运营监控",
        [FACTORY_FEATURE.monitoring, FACTORY_MANAGEMENT_DASHBOARD_FEATURE]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.execution,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.execution,
        "Recovery execution status",
        "恢复执行状态",
        [FACTORY_FEATURE.execution]
      ),
    },
  ],
})
export class FactoryOperationsInsightsTools {
  constructor(private readonly service: FactoryOperationsService) {}

  @XpertTool({
    name: FACTORY_TOOL.casesSearch,
    title: "Search factory cases",
    description:
      "Search organization-scoped Factory Cases by case key or device ID with bounded pagination. Returns compact summaries; use factory_case_get_summary with a returned caseId before mutation.",
    inputSchema: searchFactoryCasesSchema,
    outputSchema: searchFactoryCasesResultSchema,
    middleware: FACTORY_MIDDLEWARE.coordination,
    mcp: {
      behavior: READ_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Search factory cases", "搜索工厂事件"),
  })
  async searchCases(
    input: SearchFactoryCasesInput,
    context: XpertBusinessToolContext
  ) {
    const result = await this.service.listCases(
      scopeFromContext(context),
      input
    );
    return {
      items: result.items.map((summary) => ({
        caseId: summary.id,
        caseKey: summary.caseKey,
        title: summary.title,
        revision: summary.revision,
        status: summary.status,
        currentStage: summary.currentStage,
        device: {
          id: summary.event.deviceId,
          name: summary.event.deviceName,
          lineId: summary.event.lineId,
        },
        severity: summary.event.severity,
        occurredAt: summary.event.occurredAt,
        progress: summary.progress,
        nextAction: summary.nextAction,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.page * result.pageSize < result.total,
    };
  }

  @XpertTool({
    name: FACTORY_TOOL.caseSummary,
    title: "Read factory case",
    description:
      "Read one exact Factory Case, its current revision, bounded evidence-backed artifacts, plan, execution, and next action. Call before delegation or mutation.",
    inputSchema: getFactoryCaseSchema,
    outputSchema: factoryCaseSummaryResultSchema,
    middleware: true,
    mcp: {
      behavior: READ_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model", "app"],
      app: { resourceKey: FACTORY_CASE_SUMMARY_MCP_APP_KEY },
    },
    metadata: localizedToolName("Read factory case", "读取工厂事件"),
  })
  getCaseSummary(
    input: GetFactoryCaseInput,
    context: XpertBusinessToolContext
  ) {
    return this.service.getCaseSummary(scopeFromContext(context), input);
  }

  @XpertTool({
    name: FACTORY_TOOL.caseProgress,
    title: "Read recovery progress",
    description:
      "Read compact progress for one exact Factory Case without returning all evidence and action detail.",
    inputSchema: getFactoryCaseSchema,
    outputSchema: factoryCaseProgressResultSchema,
    middleware: true,
    mcp: {
      behavior: READ_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Read recovery progress", "读取恢复进度"),
  })
  async getCaseProgress(
    input: GetFactoryCaseInput,
    context: XpertBusinessToolContext
  ) {
    const summary = await this.service.getCaseSummary(
      scopeFromContext(context),
      input
    );
    return {
      caseId: summary.id,
      revision: summary.revision,
      status: summary.status,
      currentStage: summary.currentStage,
      progress: summary.progress,
      nextAction: summary.nextAction,
    };
  }

  @XpertTool({
    name: FACTORY_TOOL.dashboard,
    title: "Read factory operations dashboard",
    description:
      "Read the organization-scoped Factory Operations management summary and lane health. This is read-only and does not approve or execute recovery work.",
    inputSchema: dashboardSchema,
    outputSchema: factoryOperationsDashboardResultSchema,
    middleware: FACTORY_MIDDLEWARE.monitoring,
    mcp: {
      behavior: READ_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model", "app"],
      app: { resourceKey: FACTORY_DASHBOARD_MCP_APP_KEY },
    },
    metadata: localizedToolName(
      "Read factory operations dashboard",
      "读取工厂运营监控"
    ),
  })
  async getDashboard(
    _input: Record<string, never>,
    context: XpertBusinessToolContext
  ) {
    const dashboard = await this.service.getManagementDashboard(
      scopeFromContext(context)
    );
    return {
      summary: dashboard.summary,
      pipelineHealth: dashboard.pipelineHealth,
      simulation: dashboard.simulation,
      refreshedAt: dashboard.refreshedAt,
    };
  }

  @XpertTool({
    name: FACTORY_TOOL.execution,
    title: "Read execution status",
    description:
      "Read compact confirmation status for recovery actions. This tool never approves, executes, retries, or fabricates external confirmation.",
    inputSchema: getFactoryCaseSchema,
    outputSchema: factoryExecutionStatusResultSchema,
    middleware: FACTORY_MIDDLEWARE.execution,
    mcp: {
      behavior: READ_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Read execution status", "读取执行状态"),
  })
  getExecutionStatus(
    input: GetFactoryCaseInput,
    context: XpertBusinessToolContext
  ) {
    return this.service.getExecutionStatus(scopeFromContext(context), input);
  }
}

@XpertToolProvider({
  provider: FACTORY_TOOLSET_PROVIDER_KEY,
  componentKey: FACTORY_TOOLSET_COMPONENT_KEY,
  name: "Factory Recovery Operations",
  description:
    "Organization-scoped, governed Factory Case recovery mutation capabilities.",
  instructions:
    "Read the exact Factory Case revision through the companion insights Provider before mutation. Mutation tools are idempotent by operationId and never approve, reject, or execute a recovery plan.",
  slug: "factory-operations-mcp",
  author: "XpertAI",
  tags: ["factory", "operations", "recovery", "mcp"],
  icon: FACTORY_ICON,
  defaultMiddleware: FACTORY_MIDDLEWARE.triage,
  middlewares: [
    {
      provider: FACTORY_MIDDLEWARE.triage,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.triage,
        "Factory event triage",
        "工厂异常研判",
        [FACTORY_FEATURE.triage]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.equipment,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.equipment,
        "Equipment diagnostics",
        "设备诊断",
        [FACTORY_FEATURE.equipment]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.quality,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.quality,
        "Quality impact",
        "质量影响",
        [FACTORY_FEATURE.quality]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.production,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.production,
        "Production impact",
        "生产与订单影响",
        [FACTORY_FEATURE.production]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.resources,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.resources,
        "Resource readiness",
        "备件与维修资源",
        [FACTORY_FEATURE.resources]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.planning,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.planning,
        "Recovery planning",
        "恢复方案规划",
        [FACTORY_FEATURE.planning]
      ),
    },
    {
      provider: FACTORY_MIDDLEWARE.verification,
      meta: middlewareMeta(
        FACTORY_MIDDLEWARE.verification,
        "Recovery verification",
        "恢复验证",
        [FACTORY_FEATURE.verification]
      ),
    },
  ],
})
export class FactoryOperationsTools implements XpertToolProviderInstance {
  constructor(
    private readonly service: FactoryOperationsService,
    private readonly events: FactoryToolEventService
  ) {}

  @XpertTool({
    name: FACTORY_TOOL.triage,
    title: "Record anomaly triage",
    description:
      "Record one evidence-backed anomaly triage. Call once after reading the exact Case revision and before specialist analysis.",
    inputSchema: recordTriageSchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.triage,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Record anomaly triage", "记录异常研判"),
  })
  async recordTriage(
    input: RecordTriageInput,
    context: XpertBusinessToolContext
  ) {
    return (await this.service.recordTriage(scopeFromContext(context), input))
      .receipt;
  }

  @XpertTool({
    name: FACTORY_TOOL.equipment,
    title: "Record equipment diagnosis",
    description:
      "Record one bounded equipment diagnosis with failure mode, safe-running estimate, recommendation, confidence, and source evidence.",
    inputSchema: recordEquipmentFindingSchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.equipment,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Record equipment diagnosis", "记录设备诊断"),
  })
  async recordEquipment(
    input: RecordEquipmentFindingInput,
    context: XpertBusinessToolContext
  ) {
    return (
      await this.service.recordEquipmentFinding(
        scopeFromContext(context),
        input
      )
    ).receipt;
  }

  @XpertTool({
    name: FACTORY_TOOL.quality,
    title: "Record quality impact",
    description:
      "Record one bounded quality impact assessment with affected quantity, isolation window, recommendation, confidence, and QMS/SPC evidence.",
    inputSchema: recordQualityFindingSchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.quality,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Record quality impact", "记录质量影响"),
  })
  async recordQuality(
    input: RecordQualityFindingInput,
    context: XpertBusinessToolContext
  ) {
    return (
      await this.service.recordQualityFinding(scopeFromContext(context), input)
    ).receipt;
  }

  @XpertTool({
    name: FACTORY_TOOL.production,
    title: "Record production impact",
    description:
      "Record one production and delivery impact assessment. Scheduling values must come from bounded MES/APS evidence, not prose optimization.",
    inputSchema: recordProductionFindingSchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.production,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Record production impact", "记录生产影响"),
  })
  async recordProduction(
    input: RecordProductionFindingInput,
    context: XpertBusinessToolContext
  ) {
    return (
      await this.service.recordProductionFinding(
        scopeFromContext(context),
        input
      )
    ).receipt;
  }

  @XpertTool({
    name: FACTORY_TOOL.resources,
    title: "Record resource readiness",
    description:
      "Record one spare-part and maintenance-resource readiness assessment with WMS/CMMS evidence.",
    inputSchema: recordResourceFindingSchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.resources,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName(
      "Record resource readiness",
      "记录资源就绪情况"
    ),
  })
  async recordResources(
    input: RecordResourceFindingInput,
    context: XpertBusinessToolContext
  ) {
    return (
      await this.service.recordResourceFinding(scopeFromContext(context), input)
    ).receipt;
  }

  @XpertTool({
    name: FACTORY_TOOL.plan,
    title: "Generate recovery options",
    description:
      "Generate deterministic recovery options from the four persisted specialist findings. This proposes plan B but never approves or executes it.",
    inputSchema: generateRecoveryPlanSchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.planning,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Generate recovery options", "生成恢复方案"),
  })
  async generatePlan(
    input: GenerateRecoveryPlanInput,
    context: XpertBusinessToolContext
  ) {
    return (
      await this.service.generateRecoveryPlan(scopeFromContext(context), input)
    ).receipt;
  }

  @XpertTool({
    name: FACTORY_TOOL.verification,
    title: "Verify production recovery",
    description:
      "Record recovery verification only after all execution actions are confirmed. Verification requires equipment, first-article quality, and production evidence.",
    inputSchema: verifyRecoverySchema,
    outputSchema: factoryMutationReceiptSchema,
    middleware: FACTORY_MIDDLEWARE.verification,
    mcp: {
      behavior: WRITE_BEHAVIOR,
      requiredContext: REQUIRED_CONTEXT,
      visibility: ["model"],
    },
    metadata: localizedToolName("Verify production recovery", "验证生产恢复"),
  })
  async verifyRecovery(
    input: VerifyRecoveryInput,
    context: XpertBusinessToolContext
  ) {
    return (await this.service.verifyRecovery(scopeFromContext(context), input))
      .receipt;
  }

  getMiddlewareExtensions(
    provider: string,
    _options: unknown,
    _context: IAgentMiddlewareContext
  ) {
    const toolName = MUTATION_TOOL_BY_MIDDLEWARE.get(provider);
    return toolName
      ? { wrapToolCall: this.events.wrap([toolName], provider) }
      : {};
  }
}

const MUTATION_TOOL_BY_MIDDLEWARE = new Map<string, string>([
  [FACTORY_MIDDLEWARE.triage, FACTORY_TOOL.triage],
  [FACTORY_MIDDLEWARE.equipment, FACTORY_TOOL.equipment],
  [FACTORY_MIDDLEWARE.quality, FACTORY_TOOL.quality],
  [FACTORY_MIDDLEWARE.production, FACTORY_TOOL.production],
  [FACTORY_MIDDLEWARE.resources, FACTORY_TOOL.resources],
  [FACTORY_MIDDLEWARE.planning, FACTORY_TOOL.plan],
  [FACTORY_MIDDLEWARE.verification, FACTORY_TOOL.verification],
]);

if (MUTATION_TOOL_BY_MIDDLEWARE.size !== FACTORY_MUTATION_TOOL_NAMES.length) {
  throw new Error("Factory mutation Middleware mapping is incomplete.");
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
      zh_Hans: `${zh_Hans}，用于受控的工厂异常恢复。`,
    },
    icon: FACTORY_ICON,
    features: [...new Set([...features, FACTORY_PROFILE_FEATURE])],
    configSchema: { type: "object", properties: {}, required: [] },
  };
}

function scopeFromContext(context: XpertBusinessToolContext): FactoryScope {
  if (!context.organizationId) {
    throw new Error(
      "Factory Operations tools require an organization-scoped invocation context."
    );
  }
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.principal.userId ?? context.principal.id,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null,
    threadId: context.threadId ?? null,
    executionId: context.executionId ?? null,
    agentKey: context.agentKey ?? null,
    actorType: "agent",
  };
}

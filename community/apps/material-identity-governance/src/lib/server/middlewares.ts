import {
  XpertTool,
  XpertToolProvider,
  type XpertBusinessToolContext,
  type XpertToolProviderInstance,
} from '@xpert-ai/plugin-sdk'
import { APP_ICON, artifactKey } from '../artifact-namespace.js'
import { ROLES, WORKBENCH_FEATURE, toolName } from '../roles.js'
import { MaterialCaseService } from './case.service.js'
import { MaterialTaskService } from './task.service.js'
import { toolScope } from './scope.js'
import { PROFILE_FEATURE } from './profile.views.js'
import { toolEvents } from './tool-events.js'
import {
  readSchema,
  finalizeSchema,
  dispatchSchema,
  receiptSchema,
  type ReadInput,
  type FinalizeInput,
  type DispatchInput,
} from './schemas.js'
import { readResultSchema } from './read-result.schema.js'
const mutationNames = ROLES.flatMap((r) => r.nodeKeys.map(toolName)).concat(
  'material_identity_dispatch_next',
)
@XpertToolProvider({
  provider: artifactKey('tools'),
  componentKey: artifactKey('tools').replaceAll('_', '-'),
  name: 'Material identity governance',
  description:
    'Evidence-bound role tools for material identity governance. Approval is a human-only Workbench action.',
  defaultMiddleware: artifactKey('coordinator'),
  icon: APP_ICON,
  middlewares: ROLES.map((r) => ({
    provider: r.middleware,
    meta: {
      name: r.middleware,
      label: { en_US: r.key, zh_Hans: r.title },
      description: {
        en_US: 'Governed material identity role',
        zh_Hans: `${r.title}的独立业务能力`,
      },
      icon: APP_ICON,
      features: [r.feature, WORKBENCH_FEATURE, PROFILE_FEATURE],
      configSchema: { type: 'object', properties: {}, required: [] },
    },
  })),
})
export class MaterialGovernanceTools implements XpertToolProviderInstance {
  constructor(
    private readonly cases: MaterialCaseService,
    private readonly tasks: MaterialTaskService,
  ) {}
  @XpertTool({
    name: 'material_identity_coordinator_read',
    title: '治理协调者：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_coordinator',
    metadata: {
      toolName: {
        en_US: 'Read coordinator case',
        zh_Hans: '治理协调者读取案例',
      },
    },
  })
  read_coordinator(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'coordinator', input)
  }

  @XpertTool({
    name: 'material_identity_intake_read',
    title: '数据采集专员：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_intake',
    metadata: {
      toolName: { en_US: 'Read intake case', zh_Hans: '数据采集专员读取案例' },
    },
  })
  read_intake(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'intake', input)
  }

  @XpertTool({
    name: 'material_identity_collect_evidence',
    title: '采集跨系统证据',
    description:
      'Finalize collect-evidence for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_intake',
    metadata: {
      toolName: { en_US: 'collect-evidence', zh_Hans: '采集跨系统证据' },
    },
  })
  async collect_evidence(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'intake',
      'collect-evidence',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_engineering_read',
    title: '研发图纸工程师：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_engineering',
    metadata: {
      toolName: {
        en_US: 'Read engineering case',
        zh_Hans: '研发图纸工程师读取案例',
      },
    },
  })
  read_engineering(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'engineering', input)
  }

  @XpertTool({
    name: 'material_identity_extract_drawing',
    title: '识别图纸与关键属性',
    description:
      'Finalize extract-drawing for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_engineering',
    metadata: {
      toolName: { en_US: 'extract-drawing', zh_Hans: '识别图纸与关键属性' },
    },
  })
  async extract_drawing(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'engineering',
      'extract-drawing',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_standardization_read',
    title: '物料标准化工程师：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_standardization',
    metadata: {
      toolName: {
        en_US: 'Read standardization case',
        zh_Hans: '物料标准化工程师读取案例',
      },
    },
  })
  read_standardization(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'standardization', input)
  }

  @XpertTool({
    name: 'material_identity_normalize_material',
    title: '统一术语与计量单位',
    description:
      'Finalize normalize-material for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_standardization',
    metadata: {
      toolName: { en_US: 'normalize-material', zh_Hans: '统一术语与计量单位' },
    },
  })
  async normalize_material(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'standardization',
      'normalize-material',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_match_identity',
    title: '召回候选与身份判定',
    description:
      'Finalize match-identity for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_standardization',
    metadata: {
      toolName: { en_US: 'match-identity', zh_Hans: '召回候选与身份判定' },
    },
  })
  async match_identity(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'standardization',
      'match-identity',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_quality_read',
    title: '质量冲突审计员：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_quality',
    metadata: {
      toolName: {
        en_US: 'Read quality case',
        zh_Hans: '质量冲突审计员读取案例',
      },
    },
  })
  read_quality(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'quality', input)
  }

  @XpertTool({
    name: 'material_identity_audit_conflicts',
    title: '审计同码规格冲突',
    description:
      'Finalize audit-conflicts for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_quality',
    metadata: {
      toolName: { en_US: 'audit-conflicts', zh_Hans: '审计同码规格冲突' },
    },
  })
  async audit_conflicts(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'quality',
      'audit-conflicts',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_impact_read',
    title: '供应链影响分析师：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_impact',
    metadata: {
      toolName: {
        en_US: 'Read impact case',
        zh_Hans: '供应链影响分析师读取案例',
      },
    },
  })
  read_impact(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'impact', input)
  }

  @XpertTool({
    name: 'material_identity_assess_impact',
    title: '分析 BOM、库存与采购影响',
    description:
      'Finalize assess-impact for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_impact',
    metadata: {
      toolName: { en_US: 'assess-impact', zh_Hans: '分析 BOM、库存与采购影响' },
    },
  })
  async assess_impact(input: FinalizeInput, context: XpertBusinessToolContext) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'impact',
      'assess-impact',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_governance_read',
    title: '主数据治理专员：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_governance',
    metadata: {
      toolName: {
        en_US: 'Read governance case',
        zh_Hans: '主数据治理专员读取案例',
      },
    },
  })
  read_governance(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'governance', input)
  }

  @XpertTool({
    name: 'material_identity_propose_governance',
    title: '形成可解释治理建议',
    description:
      'Finalize propose-governance for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_governance',
    metadata: {
      toolName: { en_US: 'propose-governance', zh_Hans: '形成可解释治理建议' },
    },
  })
  async propose_governance(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'governance',
      'propose-governance',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_publisher_read',
    title: '系统发布与监控专员：读取案例',
    description:
      'Read permitted cases when caseId is absent, or exact current evidence and revision when caseId is present. Always read before mutation.',
    inputSchema: readSchema,
    outputSchema: readResultSchema,
    middleware: 'material_identity_publisher',
    metadata: {
      toolName: {
        en_US: 'Read publisher case',
        zh_Hans: '系统发布与监控专员读取案例',
      },
    },
  })
  read_publisher(input: ReadInput, context: XpertBusinessToolContext) {
    return this.cases.readForRole(toolScope(context), 'publisher', input)
  }

  @XpertTool({
    name: 'material_identity_publish_records',
    title: '发布黄金记录与编码映射',
    description:
      'Finalize publish-records for the current case. Requires current revision, real evidence IDs and an independent assessment. Hard constraints, scope, predecessor artifacts and approval are enforced by the server.',
    inputSchema: finalizeSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_publisher',
    metadata: {
      toolName: { en_US: 'publish-records', zh_Hans: '发布黄金记录与编码映射' },
    },
  })
  async publish_records(
    input: FinalizeInput,
    context: XpertBusinessToolContext,
  ) {
    const scope = toolScope(context)
    const result = await this.cases.finalize(
      scope,
      'publisher',
      'publish-records',
      input,
    )
    if (result.recordId)
      await this.tasks.superviseStandalone(scope, input.caseId, result.recordId)
    return result
  }

  @XpertTool({
    name: 'material_identity_dispatch_next',
    title: '协调下一阶段',
    description:
      'Coordinator only: authorize the deterministic DAG to dispatch independent required role Assistants. Stops at human approval. Call once then end the response.',
    inputSchema: dispatchSchema,
    outputSchema: receiptSchema,
    middleware: 'material_identity_coordinator',
    metadata: {
      toolName: { en_US: 'Coordinate pipeline', zh_Hans: '协调治理流水线' },
    },
  })
  dispatch_next(input: DispatchInput, context: XpertBusinessToolContext) {
    return this.tasks.dispatchNext(toolScope(context), input)
  }
  getMiddlewareExtensions(provider: string) {
    return { wrapToolCall: toolEvents(mutationNames, provider) }
  }
}

import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  XpertTool,
  XpertToolProvider,
  type XpertBusinessToolContext
} from '@xpert-ai/plugin-sdk'
import { ComplaintCaseService } from './complaint-case.service.js'
import {
  submitComplaintAnalysisSchema,
  type SubmitComplaintAnalysisInput
} from './domain/complaint.schemas.js'
import type { ComplaintScope } from './domain/complaint.types.js'
import {
  COMPLAINT_TRIAGE_FEATURE,
  COMPLAINT_TRIAGE_MIDDLEWARE,
  COMPLAINT_TRIAGE_TOOL_NAME,
  COMPLAINT_TRIAGE_TOOL_PROVIDER_KEY
} from './constants.js'

@XpertToolProvider({
  provider: COMPLAINT_TRIAGE_TOOL_PROVIDER_KEY,
  componentKey: COMPLAINT_TRIAGE_FEATURE,
  name: 'Complaint Triage',
  description: 'Submit structured AI complaint triage results for human review.',
  instructions:
    'Use the submission tool exactly once after analyzing the complaint. Never confirm a complaint on behalf of a human.',
  author: 'XpertAI Community',
  tags: ['complaint', 'triage', 'business-app'],
  defaultMiddleware: COMPLAINT_TRIAGE_MIDDLEWARE,
  middlewares: [
    {
      provider: COMPLAINT_TRIAGE_MIDDLEWARE,
      meta: middlewareMeta()
    }
  ]
})
export class ComplaintTriageTools {
  constructor(private readonly cases: ComplaintCaseService) {}

  @XpertTool({
    name: COMPLAINT_TRIAGE_TOOL_NAME,
    title: 'Submit complaint triage result',
    description:
      'Validate and save the structured AI triage result for the current ComplaintCase analysis attempt.',
    inputSchema: submitComplaintAnalysisSchema,
    middleware: true,
    mcp: false,
    metadata: {
      toolName: {
        en_US: 'Submit complaint triage result',
        zh_Hans: '提交客诉分诊结果'
      }
    }
  })
  async submitAnalysis(
    input: SubmitComplaintAnalysisInput,
    context: XpertBusinessToolContext
  ) {
    const entity = await this.cases.completeAnalysis(
      scopeFromContext(context),
      input.caseId,
      input.attemptId,
      input.result
    )
    return {
      caseId: entity.id,
      status: entity.status,
      attemptId: entity.attemptId
    }
  }
}

function middlewareMeta(): TAgentMiddlewareMeta {
  return {
    name: COMPLAINT_TRIAGE_MIDDLEWARE,
    label: { en_US: 'Complaint triage', zh_Hans: '客诉分诊' },
    description: {
      en_US: 'Analyze a persisted complaint and submit structured recommendations for human review.',
      zh_Hans: '分析已保存的客诉，并提交结构化建议供人工审核。'
    },
    features: [COMPLAINT_TRIAGE_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }
}

function scopeFromContext(context: XpertBusinessToolContext): ComplaintScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    userId: context.principal.userId ?? context.principal.id ?? null
  }
}

import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { CANDIDATE_INTAKE_FEATURE, CANDIDATE_INTAKE_ICON, CANDIDATE_INTAKE_MIDDLEWARE } from './constants.js'
import { CandidateIntakeService } from './candidate-intake.service.js'
import type { CandidateScope } from './types.js'

const findingSchema = z.object({
  criterion: z.string().min(1).describe('The exact criterion being evaluated.'),
  status: z.enum(['met', 'partially_met', 'not_evidenced']),
  evidence: z.string().optional().describe('Concise evidence quoted or paraphrased from candidate-provided data.'),
  explanation: z.string().min(1).describe('Why the evidence supports this status without inventing facts.')
})

const saveScreeningSchema = z.object({
  applicationId: z.string().uuid(),
  summary: z.string().min(1),
  requiredFindings: z.array(findingSchema),
  preferredFindings: z.array(findingSchema),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([])
})

const getScreeningContextSchema = z.object({ applicationId: z.string().uuid() })
const reportScreeningFailureSchema = z.object({
  applicationId: z.string().uuid(),
  errorMessage: z.string().min(1)
})

@Injectable()
@AgentMiddlewareStrategy(CANDIDATE_INTAKE_MIDDLEWARE)
export class CandidateIntakeMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: CANDIDATE_INTAKE_MIDDLEWARE,
    label: { en_US: 'Candidate Screening', zh_Hans: '候选人初筛' },
    description: {
      en_US: 'Read submitted candidate evidence and save criterion-by-criterion screening results for HR review.',
      zh_Hans: '读取候选人提交的材料，按条件保存初筛结论，供 HR 人工确认。'
    },
    icon: { type: 'svg', value: CANDIDATE_INTAKE_ICON },
    features: [CANDIDATE_INTAKE_FEATURE],
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly service: CandidateIntakeService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    // LangChain's recursive Zod/tool generic exceeds TypeScript's instantiation limit; the schema still validates at runtime.
    // @ts-expect-error TS2589
    const getScreeningContextTool = tool(
      async (input: z.infer<typeof getScreeningContextSchema>) =>
        JSON.stringify(await this.service.getAgentScreeningContext(scope, input.applicationId), null, 2),
      {
        name: 'candidate_intake_get_screening_context',
        description:
          'Read a submitted candidate profile, resume text, job description, required criteria, and preferred criteria. Never infer protected traits or use the candidate photo.',
        schema: getScreeningContextSchema
      }
    )
    // @ts-expect-error TS2589 -- same bounded LangChain generic as above.
    const saveScreeningTool = tool(
      async (input: z.infer<typeof saveScreeningSchema>) => {
        const { applicationId, ...result } = input
        const saved = await this.service.saveScreening(scope, applicationId, result)
        return JSON.stringify({ id: saved.id, status: saved.status, screeningResult: saved.screeningResult }, null, 2)
      },
      {
        name: 'candidate_intake_save_screening',
        description:
          'Save evidence-based screening findings. Use not_evidenced when submitted material does not support a criterion.',
        schema: saveScreeningSchema
      }
    )
    // @ts-expect-error TS2589 -- same bounded LangChain generic as above.
    const reportScreeningFailureTool = tool(
      async (input: z.infer<typeof reportScreeningFailureSchema>) =>
        JSON.stringify(
          await this.service.reportScreeningFailure(scope, input.applicationId, input.errorMessage),
          null,
          2
        ),
      {
        name: 'candidate_intake_report_screening_failure',
        description: 'Record a screening failure so HR can retry.',
        schema: reportScreeningFailureSchema
      }
    )
    // @ts-expect-error TS2589 -- assigning the already-created tools re-enters the upstream recursive generic.
    return {
      name: CANDIDATE_INTAKE_MIDDLEWARE,
      tools: [getScreeningContextTool, saveScreeningTool, reportScreeningFailureTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): CandidateScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    userId: context.userId,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null
  }
}

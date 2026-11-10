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
import { RESUME_SCREENING_ICON, RESUME_SCREENING_FEATURE, RESUME_SCREENING_MIDDLEWARE_NAME } from './constants.js'
import { ResumeScreeningService } from './resume-screening.service.js'
import { SCORE_RUBRIC } from './types.js'
import type { ResumeScope, ScoreDimensionKey } from './types.js'

const uuid = z.string().uuid().describe('Business UUID copied from an earlier tool result or the Workbench.')

/** Scoring rubric, rendered from the single source of truth in types.ts. */
const RUBRIC_TEXT = (Object.keys(SCORE_RUBRIC) as ScoreDimensionKey[])
  .map(
    (key) =>
      `${key}: ${SCORE_RUBRIC[key].map((band) => `${band.min}-${band.max} ${band.anchor}`).join(' | ')}`
  )
  .join('\n')

const prescreenSchema = z
  .object({
    screeningId: uuid.describe('Screening id. Supplied once for the whole call; never repeat it inside items.'),
    candidateId: uuid.describe('Candidate id inside this screening.')
  })
  .strict()

const dimensionSchema = z
  .object({
    dimension: z
      .enum(['experience', 'skills', 'project_relevance', 'stability', 'bonus'])
      .describe('One of the five scoring dimensions. Each dimension appears exactly once.'),
    score: z
      .number().int().min(0).max(20)
      .describe(
        'Integer score for this dimension, 0-20. Score inside the rubric band that matches the resume evidence (16-20 strong, 11-15 solid, 6-10 partial, 0-5 weak); do not inflate above the evidence.'
      ),
    reason: z.string().trim().min(1).max(300).describe('One-sentence reason for this dimension score, with evidence from the resume.')
  })
  .strict()

const scoreSchema = z
  .object({
    screeningId: uuid.describe('Screening id. Supplied once for the whole call; never repeat it inside dimensions.'),
    candidateId: uuid.describe('Candidate id inside this screening.'),
    operationId: z
      .string().trim().min(1).max(160).optional()
      .describe('Idempotency key for this score. Reusing it returns the stored receipt instead of saving again.'),
    dimensions: z
      .array(dimensionSchema)
      .length(5)
      .describe('Exactly the five dimensions, each once. The service validates ranges and computes the total.')
  })
  .strict()

const confirmSchema = z
  .object({
    screeningId: uuid.describe('Screening id.'),
    candidateId: uuid.describe('Candidate id inside this screening.'),
    decision: z.enum(['interview', 'pending', 'rejected']).describe('Human-confirmed outcome for this candidate.'),
    adjustedTotal: z
      .number().int().min(0).max(100).optional()
      .describe('Optional human-adjusted total score. Omit to keep the stored AI total.'),
    note: z.string().trim().max(500).optional().describe('Optional human review note, at most 500 characters.'),
    baseRevision: z
      .number().int().positive().optional()
      .describe('Revision from the last read. A mismatch returns a revision conflict instead of overwriting.')
  })
  .strict()

@Injectable()
@AgentMiddlewareStrategy(RESUME_SCREENING_MIDDLEWARE_NAME)
export class ResumeScreeningMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: RESUME_SCREENING_MIDDLEWARE_NAME,
    label: {
      en_US: 'Resume Screening',
      zh_Hans: '简历初筛'
    },
    icon: {
      type: 'svg',
      value: RESUME_SCREENING_ICON
    },
    description: {
      en_US: 'Prescreen resumes against the JD, save AI scores, and record human confirmations for the workbench.',
      zh_Hans: '按 JD 预筛简历、保存 AI 打分、记录人工确认，供工作台复核。'
    },
    features: [RESUME_SCREENING_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: ResumeScreeningService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: RESUME_SCREENING_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => {
            const findings = await this.service.prescreenResume(scope, input.screeningId, input.candidateId)
            return JSON.stringify({
              screeningId: input.screeningId,
              candidateId: input.candidateId,
              findings,
              message: `Prescreen finished with ${findings.length} finding(s).`
            })
          },
          {
            name: 'resume_prescreen',
            description:
              'Run the deterministic JD prescreen for one candidate. Call this before scoring. Returns rule findings with evidence; the model does not invent rules.',
            schema: prescreenSchema,
            verboseParsingErrors: true,
            metadata: {
              toolName: { en_US: 'Prescreen resume', zh_Hans: '预筛简历' }
            }
          }
        ),
        tool(
          async (input) => {
            const receipt = await this.service.saveScore(scope, {
              screeningId: input.screeningId,
              candidateId: input.candidateId,
              operationId: input.operationId,
              dimensions: input.dimensions
            })
            return JSON.stringify(receipt)
          },
          {
            name: 'resume_score',
            description:
              'Save the AI score for one candidate. The model supplies only its judgment: five dimension scores with one-sentence reasons. The service validates ranges, computes the total, and makes retries idempotent. Call resume_prescreen first. ' +
              'Score each dimension inside the rubric band that matches the resume evidence; do not inflate.\n' +
              RUBRIC_TEXT,
            schema: scoreSchema,
            verboseParsingErrors: true,
            metadata: {
              toolName: { en_US: 'Save resume score', zh_Hans: '保存简历打分' }
            }
          }
        ),
        tool(
          async (input) => {
            const receipt = await this.service.confirmScreening(scope, input)
            return JSON.stringify(receipt)
          },
          {
            name: 'resume_confirm',
            description:
              'Record a human confirmation for one scored candidate: interview, pending, or rejected, with an optional adjusted total and note. Call resume_score first.',
            schema: confirmSchema,
            verboseParsingErrors: true,
            metadata: {
              toolName: { en_US: 'Confirm screening', zh_Hans: '确认筛查结论' }
            }
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ResumeScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    assistantId: context.xpertId ?? null
  }
}

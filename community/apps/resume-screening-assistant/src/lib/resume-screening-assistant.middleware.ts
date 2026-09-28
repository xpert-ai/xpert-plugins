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
  RESUME_SCREENING_ASSISTANT_FEATURE,
  RESUME_SCREENING_ASSISTANT_ICON,
  RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME
} from './constants.js'
import { ResumeScreeningAssistantService } from './resume-screening-assistant.service.js'
import type { ResumeScreeningScope } from './types.js'

const extractedResumeSchema = z.object({
  candidateName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  yearsExperience: z.number().optional(),
  education: z.string().optional(),
  skills: z.array(z.string()).default([]),
  workExperiences: z.array(z.string()).default([]),
  projectHighlights: z.array(z.string()).default([]),
  summary: z.string().optional(),
  warnings: z.array(z.string()).optional()
})

const saveExtractionSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  extracted: extractedResumeSchema
})

const saveMatchResultSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  matchResult: z.object({
    score: z.number().min(0).max(100),
    recommendation: z.enum(['interview', 'hold', 'reject']),
    matchedPoints: z.array(z.string()).default([]),
    missingRequirements: z.array(z.string()).default([]),
    riskFlags: z.array(z.string()).default([]),
    interviewQuestions: z.array(z.string()).default([]),
    reason: z.string().optional()
  })
})

const reportFailureSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  errorMessage: z.string().min(1)
})

@Injectable()
@AgentMiddlewareStrategy(RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME)
export class ResumeScreeningAssistantMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME,
    label: {
      en_US: 'Resume Screening Assistant',
      zh_Hans: '简历初筛助手'
    },
    icon: {
      type: 'svg',
      value: RESUME_SCREENING_ASSISTANT_ICON
    },
    description: {
      en_US: 'Save structured resume extraction, JD match scores, and parsing failures for the screening workbench.',
      zh_Hans: '为简历初筛工作台保存结构化简历、JD 匹配评分和解析失败状态。'
    },
    features: [RESUME_SCREENING_ASSISTANT_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: ResumeScreeningAssistantService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: RESUME_SCREENING_ASSISTANT_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => JSON.stringify(await this.service.saveResumeExtraction(scope, input), null, 2),
          {
            name: 'resume_screening_save_extraction',
            description: 'Save structured extraction fields for one candidate resume.',
            schema: saveExtractionSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveMatchResult(scope, input), null, 2),
          {
            name: 'resume_screening_save_match_result',
            description: 'Save JD matching score, recommendation, reasons, missing requirements, risks, and interview questions.',
            schema: saveMatchResultSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportAnalysisFailure(scope, input), null, 2),
          {
            name: 'resume_screening_report_failure',
            description: 'Report that one candidate resume could not be parsed or scored.',
            schema: reportFailureSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ResumeScreeningScope {
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

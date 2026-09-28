/**
 * 简历筛选助手中间件
 *
 * 为助手（Agent）运行时提供简历初筛三件套工具：保存 AI 抽取的候选人、
 * 查询候选人列表与详情。解析收敛权威是服务端队列 sweep（processor，含超限标失败），
 * 本中间件不再挂 afterAgent 轮结束兜底：链路 B 下 parsing 行唯一来源是上传入队/重试，
 * 对话旁路 save 直写 pending_review 不产生 parsing 行，钩子只剩与在途解析互踩的风险
 * （误标 failed + 双计 attempt，S7 审核 F4 裁决）。
 */
import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  RESUME_SCREEN_DETAIL_TOOL_NAME,
  RESUME_SCREEN_FEATURE,
  RESUME_SCREEN_ICON,
  RESUME_SCREEN_LIST_TOOL_NAME,
  RESUME_SCREEN_MIDDLEWARE_NAME,
  RESUME_SCREEN_SAVE_TOOL_NAME
} from './constants'
import { ResumeScreenService } from './resume-screen.service'
import type { ResumeScreenCandidateInput, ResumeScreenScope } from './types'

// 候选人档案抽取入参：sourceText 必填且要求原文原样传入，作为幂等对齐与追溯依据
const candidateSchema = z.object({
  sourceText: z.string().min(1).describe('Original resume text exactly as provided. Required.'),
  name: z.string().optional().describe('Candidate name extracted from the resume.'),
  yearsOfExperience: z.string().optional().describe('Years of experience, such as 5.'),
  education: z.string().optional().describe('Highest education, such as 本科 / 硕士.'),
  currentCompany: z.string().optional().describe('Most recent company.'),
  skills: z.array(z.string()).optional().describe('Extracted skill list.'),
  summary: z.string().optional().describe('One-sentence summary of the candidate.'),
  matchScore: z.number().int().min(0).max(100).optional().describe('Job match score between 0 and 100.'),
  matchReason: z.string().optional().describe('Why this score, citing the job description.'),
  hitPoints: z.array(z.string()).optional().describe('Matched requirements.'),
  riskPoints: z.array(z.string()).optional().describe('Missing or risky points.')
})

// 保存工具入参：一次调用携带本轮抽取的全部候选人，jobId 来自工作台上下文
const saveCandidatesSchema = z.object({
  jobId: z.string().min(1).describe('Current job id from the workbench context.'),
  candidates: z.array(candidateSchema).min(1).describe('One item per resume. Use exactly one call per resume batch.')
})

// 列表查询入参：全部可选，pageSize 收敛上限防止撑爆模型上下文
const listCandidatesSchema = z.object({
  jobId: z.string().optional().describe('Job scope. Defaults to the current job.'),
  status: z.enum(['parsing', 'pending_review', 'accepted', 'hold', 'rejected', 'failed']).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  search: z.string().optional().describe('Keyword for name/education/company.'),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
})

// 详情查询入参：候选人 id 必须精确匹配
const candidateDetailSchema = z.object({
  candidateId: z.string().min(1).describe('Exact candidate id.')
})

@Injectable()
@AgentMiddlewareStrategy(RESUME_SCREEN_MIDDLEWARE_NAME)
export class ResumeScreenMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: RESUME_SCREEN_MIDDLEWARE_NAME,
    label: {
      en_US: 'Resume Screening',
      zh_Hans: '简历初筛'
    },
    description: {
      en_US: 'Save AI-extracted resume candidates and query candidate lists and details.',
      zh_Hans: '保存 AI 抽取的简历候选人，并查询候选人列表与详情。'
    },
    icon: {
      type: 'svg',
      value: RESUME_SCREEN_ICON,
      color: '#1d4ed8'
    },
    features: [RESUME_SCREEN_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: ResumeScreenService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const saveCandidatesTool = tool(
      async (input: z.infer<typeof saveCandidatesSchema>) => {
        try {
          // tool() 的 interop 类型推导会把入参字段弱化为可选；运行时 zod 已校验 sourceText 必填，
          // 这里显式收敛为服务入参类型以通过编译，运行时语义不变
          const candidates = input.candidates as ResumeScreenCandidateInput[]
          const saved = await this.service.saveCandidatesFromAgent(scope, input.jobId, candidates)
          return JSON.stringify({
            success: true,
            message: 'Candidates were saved for human review.',
            data: saved.map((candidate) => ({
              id: candidate.id,
              status: candidate.status,
              name: candidate.name,
              matchScore: candidate.matchScore
            }))
          })
        } catch (error) {
          // 失败以结构化 JSON 返回，让模型自行决策重试或告知用户，而不是抛错中断对话
          return JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : '保存候选人失败'
          })
        }
      },
      {
        name: RESUME_SCREEN_SAVE_TOOL_NAME,
        description:
          'Save extracted candidates for the current job. Call exactly once per resume with the original sourceText. Never invent fields; put missing info in riskPoints.',
        schema: saveCandidatesSchema
      }
    )

    const listCandidatesTool = tool(
      async (input: z.infer<typeof listCandidatesSchema>) => {
        try {
          let candidates = await this.service.listCandidatesForAgent(scope, {
            jobId: input.jobId,
            status: input.status,
            search: input.search,
            page: input.page,
            pageSize: input.pageSize ?? 10
          })
          if (input.minScore !== undefined) {
            // minScore 由中间件侧过滤：未评分（-1）稳定排在过滤结果之外
            candidates = candidates.filter((candidate) => (candidate.matchScore ?? -1) >= (input.minScore ?? 0))
          }
          return JSON.stringify({
            success: true,
            message: 'Candidate list returned.',
            data: candidates
          })
        } catch (error) {
          return JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : '查询候选人失败'
          })
        }
      },
      {
        name: RESUME_SCREEN_LIST_TOOL_NAME,
        description: 'Query candidates by status, score or keyword. Returns compact results.',
        schema: listCandidatesSchema
      }
    )

    const candidateDetailTool = tool(
      async (input: z.infer<typeof candidateDetailSchema>) => {
        try {
          const detail = await this.service.getCandidateDetailForAgent(scope, input.candidateId)
          return JSON.stringify({
            success: true,
            message: 'Candidate detail returned.',
            data: detail
          })
        } catch (error) {
          return JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : '查询候选人详情失败'
          })
        }
      },
      {
        name: RESUME_SCREEN_DETAIL_TOOL_NAME,
        description: 'Get one candidate detail including AI extraction, scoring and review status.',
        schema: candidateDetailSchema
      }
    )

    return {
      name: RESUME_SCREEN_MIDDLEWARE_NAME,
      tools: [saveCandidatesTool, listCandidatesTool, candidateDetailTool]
    }
  }
}

// 会话上下文 → 多租户隔离范围：xpertId 映射为助手维度，保证工具读写不跨助手串数据
function scopeFromContext(context: IAgentMiddlewareContext): ResumeScreenScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

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
  CONTRACT_GET_CASE_TOOL_NAME,
  CONTRACT_LIST_CASES_TOOL_NAME,
  CONTRACT_MARK_EXTRACTION_TOOL_NAME,
  CONTRACT_RECORD_CLAUSE_TOOL_NAME,
  CONTRACT_REVIEW_FEATURE,
  CONTRACT_REVIEW_ICON,
  CONTRACT_REVIEW_MIDDLEWARE_NAME,
  CONTRACT_REVIEW_TOOL_NAMES
} from './constants'
import { ContractReviewService } from './contract-review.service'
import { CONTRACT_CLAUSE_TYPES, CONTRACT_RISK_LEVELS, ContractReviewScope } from './types'

const listCasesSchema = z.object({
  search: z.string().optional().describe('Optional keyword matched against contract title or counterparty.'),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
})

const getCaseSchema = z.object({
  caseId: z.string().min(1).describe('Contract review case id. Use contract_review_list_cases when unsure.')
})

const recordClauseSchema = z.object({
  caseId: z.string().min(1).describe('Contract review case id.'),
  clauseType: z
    .enum(CONTRACT_CLAUSE_TYPES as [string, ...string[]])
    .describe('One of payment, delivery, warranty, liability. Record each type at most once.'),
  excerpt: z
    .string()
    .min(1)
    .describe('VERBATIM quote copied from the contract text. Never paraphrase and never invent wording.'),
  conclusion: z.string().min(1).describe('What this clause means for our side, in one or two sentences.'),
  riskLevel: z.enum(CONTRACT_RISK_LEVELS as [string, ...string[]]).describe('high, medium or low.'),
  reason: z.string().min(1).describe('Why this risk level, referencing the concrete numbers or wording found.')
})

const markExtractionSchema = z.object({
  caseId: z.string().min(1).describe('Contract review case id.'),
  outcome: z.enum(['success', 'failed']).describe('Use failed when the contract text was unusable or no clause could be found.'),
  error: z.string().optional().describe('Short human-readable reason when outcome is failed.')
})

@Injectable()
@AgentMiddlewareStrategy(CONTRACT_REVIEW_MIDDLEWARE_NAME)
export class ContractReviewMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: ContractReviewService) {}

  meta: TAgentMiddlewareMeta = {
    name: CONTRACT_REVIEW_MIDDLEWARE_NAME,
    label: {
      en_US: 'Contract review',
      zh_Hans: '合同条款审查'
    },
    description: {
      en_US:
        'Extract payment, delivery, warranty and liability clauses from a contract and record each one as an AI suggestion for a human to confirm.',
      zh_Hans: '从合同正文中抽取付款、交付、质保、违约四类关键条款，逐条登记为待人工确认的 AI 建议。'
    },
    icon: {
      type: 'svg',
      value: CONTRACT_REVIEW_ICON,
      color: '#1d4ed8'
    },
    features: [CONTRACT_REVIEW_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  getToolNames(): readonly string[] {
    return CONTRACT_REVIEW_TOOL_NAMES
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const listCasesTool = tool(
      async (input: z.infer<typeof listCasesSchema>) => {
        const result = await this.service.listCases(scope, input)
        return stringify({
          success: true,
          message: 'Contract review cases were listed.',
          data: result
        })
      },
      {
        name: CONTRACT_LIST_CASES_TOOL_NAME,
        description:
          'List contract review cases with their status. Call this first to find the case the user wants reviewed, then pass its id to contract_review_get_case.',
        schema: listCasesSchema
      }
    )

    const getCaseTool = tool(
      async (input: z.infer<typeof getCaseSchema>) => {
        const detail = await this.service.getCase(scope, input.caseId)
        return stringify({
          success: true,
          message: 'Contract review case detail was returned. Read contractText carefully before recording clauses.',
          data: detail
        })
      },
      {
        name: CONTRACT_GET_CASE_TOOL_NAME,
        description:
          'Get one contract review case including the full contract text and any clauses already recorded. Always call this before recording clauses so you quote the real wording.',
        schema: getCaseSchema
      }
    )

    const recordClauseTool = tool(
      async (input: z.infer<typeof recordClauseSchema>) => {
        const result = await this.service.recordClause(scope, input.caseId, {
          clauseType: input.clauseType as never,
          excerpt: input.excerpt,
          conclusion: input.conclusion,
          riskLevel: input.riskLevel as never,
          reason: input.reason
        })
        return stringify({
          success: true,
          message: `Clause "${input.clauseType}" recorded as an AI suggestion. A human still has to confirm it.`,
          data: result
        })
      },
      {
        name: CONTRACT_RECORD_CLAUSE_TOOL_NAME,
        description:
          'Record ONE extracted clause as an AI suggestion. Call it once per clause type (payment, delivery, warranty, liability). If a clause type genuinely does not exist in the contract, do not call it for that type — never invent a clause. Your output is a suggestion: a human reviews and confirms it in the Contract Review Workbench.',
        schema: recordClauseSchema
      }
    )

    const markExtractionTool = tool(
      async (input: z.infer<typeof markExtractionSchema>) => {
        const detail = await this.service.markExtraction(scope, input.caseId, input.outcome, {
          error: input.error
        })
        return stringify({
          success: true,
          message: `Extraction marked as ${input.outcome}.`,
          data: detail
        })
      },
      {
        name: CONTRACT_MARK_EXTRACTION_TOOL_NAME,
        description:
          'Declare the extraction finished. Call this once after recording every clause, with outcome=success. Use outcome=failed only when the contract text is unusable and no clause could be recorded.',
        schema: markExtractionSchema
      }
    )

    return {
      name: CONTRACT_REVIEW_MIDDLEWARE_NAME,
      tools: [listCasesTool, getCaseTool, recordClauseTool, markExtractionTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ContractReviewScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId
  }
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}

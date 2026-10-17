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
  CONTRACT_HEALTH_CHECK_FEATURE,
  CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME,
  CONTRACT_ICON
} from './constants.js'
import { ContractHealthCheckService } from './contract-health-check.service.js'
import type { ContractScope } from './types.js'

const stageEnum = z.enum(['extract', 'review', 'draft', 'summary'])

const elementsSchema = z.object({
  parties: z.array(z.string()).optional().describe('合同主体，例如甲方、乙方名称。'),
  amount: z.string().optional().describe('合同金额或计价方式。'),
  paymentTerms: z.string().optional().describe('付款条款原文摘要。'),
  deliveryTerms: z.string().optional().describe('交付、验收条款摘要。'),
  liabilityClause: z.string().optional().describe('违约责任条款摘要。'),
  jurisdiction: z.string().optional().describe('争议解决与管辖约定。'),
  confidentiality: z.string().optional().describe('保密条款摘要。'),
  ipClause: z.string().optional().describe('知识产权归属条款摘要。'),
  termination: z.string().optional().describe('解除与终止条款摘要。'),
  notes: z.array(z.string()).optional().describe('其他需要关注的信息。')
})

const saveExtractionSchema = z.object({
  reviewId: z.string().min(1).describe('合同体检记录 id。'),
  elements: elementsSchema.describe('抽取出的合同关键要素。')
})

const saveRiskItemsSchema = z.object({
  reviewId: z.string().min(1).describe('合同体检记录 id。'),
  risks: z
    .array(
      z.object({
        level: z.enum(['high', 'medium', 'low']).describe('风险等级。'),
        clauseRef: z.string().optional().describe('条款位置，例如 第4.2条。'),
        title: z.string().min(1).describe('风险标题。'),
        issue: z.string().min(1).describe('问题描述。'),
        basis: z.string().optional().describe('判断依据。')
      })
    )
    .min(1)
    .describe('风险清单。')
})

const saveSuggestionsSchema = z.object({
  reviewId: z.string().min(1).describe('合同体检记录 id。'),
  suggestions: z
    .array(
      z.object({
        clauseRef: z.string().optional().describe('条款位置。'),
        riskTitle: z.string().min(1).describe('关联的风险标题。'),
        originalText: z.string().optional().describe('原条款文本。'),
        suggestedText: z.string().min(1).describe('建议替换表述。'),
        rationale: z.string().optional().describe('改写理由。')
      })
    )
    .default([])
    .describe('改写建议清单。')
})

const saveSummarySchema = z.object({
  reviewId: z.string().min(1).describe('合同体检记录 id。'),
  score: z.number().min(0).max(100).describe('总体风险评分，分数越低风险越高。'),
  summary: z.string().min(1).describe('一页式摘要。'),
  highlights: z.array(z.string()).optional().describe('关键要点。'),
  pendingQuestions: z.array(z.string()).optional().describe('需要人工确认的问题。')
})

const reportFailureSchema = z.object({
  reviewId: z.string().min(1).describe('合同体检记录 id。'),
  stage: stageEnum.describe('失败环节。'),
  errorMessage: z.string().min(1).describe('失败原因。')
})

@Injectable()
@AgentMiddlewareStrategy(CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME)
export class ContractHealthCheckMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME,
    label: {
      en_US: 'Contract Health Check',
      zh_Hans: '合同智能体检'
    },
    icon: {
      type: 'svg',
      value: CONTRACT_ICON
    },
    description: {
      en_US: 'Save contract extraction, risk findings, rewrite suggestions, and summary for the workbench.',
      zh_Hans: '为合同体检工作台保存要素抽取、风险清单、改写建议与摘要。'
    },
    features: [CONTRACT_HEALTH_CHECK_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: ContractHealthCheckService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: CONTRACT_HEALTH_CHECK_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => JSON.stringify(await this.service.saveExtraction(scope, input), null, 2),
          {
            name: 'contract_save_extraction',
            description: '保存合同要素抽取结果。',
            schema: saveExtractionSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveRiskItems(scope, input), null, 2),
          {
            name: 'contract_save_risk_items',
            description: '保存合同风险清单。',
            schema: saveRiskItemsSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveSuggestions(scope, input), null, 2),
          {
            name: 'contract_save_suggestions',
            description: '保存条款改写建议。',
            schema: saveSuggestionsSchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.saveSummary(scope, input), null, 2),
          {
            name: 'contract_save_summary',
            description: '保存总体风险评分与摘要。',
            schema: saveSummarySchema
          }
        ),
        tool(
          async (input) => JSON.stringify(await this.service.reportProcessingFailure(scope, input), null, 2),
          {
            name: 'contract_report_failure',
            description: '上报合同体检失败环节与原因。',
            schema: reportFailureSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ContractScope {
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

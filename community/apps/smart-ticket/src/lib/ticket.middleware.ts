import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  ANALYZE_TICKET_TOOL,
  CONFIRM_TICKET_TOOL,
  FEATURE,
  LIST_TICKETS_TOOL,
  MIDDLEWARE_NAME
} from './constants.js'
import {
  analyzeTicketInputSchema,
  confirmTicketInputSchema,
  SmartTicketError
} from './domain/contracts.js'
import { scopeFromAgent } from './scope.js'
import { TicketService } from './ticket.service.js'

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class SmartTicketMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: {
      en_US: 'Smart Ticket Workbench',
      zh_Hans: '智能客诉工单工作台'
    },
    description: {
      en_US:
        'AI-assisted customer feedback classification, sentiment detection, reply drafting and workbench persistence.',
      zh_Hans:
        'AI 辅助客诉分析、情绪判定、回复拟定与工单确认落库，支持与工作台双向联动。'
    },
    icon: { type: 'font', value: 'ri-customer-service-2-line' },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  constructor(private readonly service: TicketService) {}

  getToolNames() {
    return [ANALYZE_TICKET_TOOL, CONFIRM_TICKET_TOOL, LIST_TICKETS_TOOL]
  }

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): AgentMiddleware {
    const scope = scopeFromAgent(context)

    const analyzeTool = tool(
      async (input: z.infer<typeof analyzeTicketInputSchema>) => {
        try {
          const ticket = await this.service.analyzeAndDraft(scope, input)
          return JSON.stringify({
            success: true,
            ticket,
            message:
              '客诉分析完成并已生成草稿工单。请引导用户在工单工作台核对分类与回复建议，并执行人工确认保存。'
          })
        } catch (error) {
          if (error instanceof SmartTicketError) {
            return JSON.stringify({
              success: false,
              code: error.code,
              message: error.message
            })
          }
          return JSON.stringify({
            success: false,
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      },
      {
        name: ANALYZE_TICKET_TOOL,
        description:
          '分析用户客诉或反馈文本，智能提取问题分类(billing/technical_issue/product_suggestion/account_security/other)、紧急度(P0-P3)、情绪倾向、摘要以及拟定专业回复草稿，并生成待确认工单。',
        schema: analyzeTicketInputSchema
      }
    )

    const confirmTool = tool(
      async (input: z.infer<typeof confirmTicketInputSchema>) => {
        try {
          const ticket = await this.service.confirmAndSave(scope, input)
          return JSON.stringify({
            success: true,
            ticket,
            message: `工单 ${ticket.id} 已完成人工核验并成功持久化归档。`
          })
        } catch (error) {
          if (error instanceof SmartTicketError) {
            return JSON.stringify({
              success: false,
              code: error.code,
              message: error.message
            })
          }
          return JSON.stringify({
            success: false,
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      },
      {
        name: CONFIRM_TICKET_TOOL,
        description:
          '人工核对后确认并持久化保存工单。可根据用户指示对标题、分类、优先级、回复草稿等进行最终微调修正。',
        schema: confirmTicketInputSchema
      }
    )

    const listTool = tool(
      async (input: { limit?: number }) => {
        try {
          const tickets = await this.service.listTickets(scope)
          const limit = input.limit ?? 10
          return JSON.stringify({
            success: true,
            total: tickets.length,
            tickets: tickets.slice(0, limit)
          })
        } catch (error) {
          return JSON.stringify({
            success: false,
            code: 'QUERY_FAILED',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      },
      {
        name: LIST_TICKETS_TOOL,
        description:
          '查询当前工作空间/会话下的客诉工单列表与处理状态（待审核/已确认）。',
        schema: z.object({
          limit: z.number().optional().describe('最多返回条数，默认10条')
        })
      }
    )

    return {
      name: MIDDLEWARE_NAME,
      tools: [analyzeTool, confirmTool, listTool]
    }
  }
}

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
  FEATURE,
  ICON,
  LIST_ACTIVITIES_TOOL_NAME,
  LIST_SAVED_QUERIES_TOOL_NAME,
  MIDDLEWARE_NAME,
  QUERY_REGISTRATIONS_TOOL_NAME,
  SAVE_QUERY_TOOL_NAME
} from './constants'
import { RegistrationService } from './registration.service'
import type { RegistrationScope } from './types'

const filterSchema = z.object({
  field: z.string().describe('报名记录字段名：name, activityName, city, channel, status, registerTime, fee。'),
  op: z.enum(['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte']).describe('比较运算符。'),
  value: z.union([z.string(), z.number()]).describe('筛选值。')
})

const aggregateSchema = z.object({
  field: z.string().describe('参与聚合的字段名，如 fee、registerTime、id。'),
  op: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('聚合方式。')
})

const listActivitiesSchema = z.object({})

const querySchema = z.object({
  question: z.string().optional().describe('用户原始的提问内容，用于记录和生成结论。'),
  condition: z
    .object({
      activityId: z.string().optional().describe('按活动 ID 精确筛选。'),
      filters: z.array(filterSchema).optional().describe('组合筛选条件。'),
      groupBy: z.array(z.string()).optional().describe('分组字段，如 city、channel、status、activityName。'),
      aggregates: z.array(aggregateSchema).optional().describe('聚合统计，如按渠道 count。'),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional()
    })
    .describe('结构化查询条件。根据用户自然语言填充。')
})

const saveQuerySchema = z.object({
  name: z.string().describe('常用查询的名称。'),
  question: z.string().describe('用户原始的提问内容。'),
  condition: z
    .object({
      activityId: z.string().optional(),
      filters: z.array(filterSchema).optional(),
      groupBy: z.array(z.string()).optional(),
      aggregates: z.array(aggregateSchema).optional()
    })
    .describe('本次查询的结构化条件。')
})

const listSavedQueriesSchema = z.object({})

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class RegistrationMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: RegistrationService) {}

  meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: {
      en_US: 'Registration Analytics',
      zh_Hans: '报名智能问数'
    },
    description: {
      en_US: 'Query and analyze registration records with natural-language-driven structured queries.',
      zh_Hans: '通过自然语言驱动的结构化查询，对报名记录进行查询和统计分析。'
    },
    icon: {
      type: 'svg',
      value: ICON,
      color: '#0e7490'
    },
    features: [FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const listActivitiesTool = tool(
      async () => {
        const activities = await this.service.listActivities(scope)
        return stringify({
          success: true,
          message: '报名活动列表已返回。',
          data: { activities }
        })
      },
      {
        name: LIST_ACTIVITIES_TOOL_NAME,
        description:
          '列出所有报名活动及其报名人数。用户不确定有哪些活动或想了解整体概览时调用。',
        schema: listActivitiesSchema
      }
    )

    const queryTool = tool(
      async (input: z.infer<typeof querySchema>) => {
        try {
          const result = await this.service.queryRegistrations(scope, {
            question: input.question,
            condition: toCondition(input.condition)
          })
          return stringify({
            success: true,
            message: '报名数据查询完成。',
            data: result
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '查询失败'
          return stringify({
            success: false,
            message: `报名数据查询失败：${message}。请检查筛选字段名或重新组织查询条件。`,
            data: null
          })
        }
      },
      {
        name: QUERY_REGISTRATIONS_TOOL_NAME,
        description:
          '根据结构化条件查询报名记录或进行聚合统计。当用户用自然语言提问报名数据（如"本周报名多少人"、"按城市统计"、"各渠道分布"）时，把问题转成结构化 condition 后调用。',
        schema: querySchema
      }
    )

    const saveQueryTool = tool(
      async (input: z.infer<typeof saveQuerySchema>) => {
        try {
          const saved = await this.service.saveQuery(scope, {
            name: input.name,
            question: input.question,
            condition: toCondition(input.condition)
          })
          return stringify({
            success: true,
            message: '常用查询已保存。',
            data: saved
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '保存失败'
          return stringify({
            success: false,
            message: `常用查询保存失败：${message}`,
            data: null
          })
        }
      },
      {
        name: SAVE_QUERY_TOOL_NAME,
        description:
          '把用户当前的查询保存为常用查询。仅当用户明确要求保存/收藏某个查询时调用。',
        schema: saveQuerySchema
      }
    )

    const listSavedQueriesTool = tool(
      async () => {
        const savedQueries = await this.service.listSavedQueries(scope)
        return stringify({
          success: true,
          message: '常用查询列表已返回。',
          data: { savedQueries }
        })
      },
      {
        name: LIST_SAVED_QUERIES_TOOL_NAME,
        description:
          '列出用户保存过的常用查询。用户想查看或重放历史查询时调用。',
        schema: listSavedQueriesSchema
      }
    )

    return {
      name: MIDDLEWARE_NAME,
      tools: [listActivitiesTool, queryTool, saveQueryTool, listSavedQueriesTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): RegistrationScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}

function toCondition(input?: z.infer<typeof querySchema>['condition']): import('./types').RegistrationQueryCondition {
  return {
    activityId: input?.activityId ?? undefined,
    filters: (input?.filters ?? []) as import('./types').RegistrationFilterCondition[],
    groupBy: input?.groupBy ?? undefined,
    aggregates: (input?.aggregates ?? []) as import('./types').RegistrationQueryCondition['aggregates'],
    page: input?.page,
    pageSize: input?.pageSize
  }
}

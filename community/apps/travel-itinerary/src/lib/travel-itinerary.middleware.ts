import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  TRAVEL_CONFIRM_PLAN_TOOL_NAME,
  TRAVEL_CREATE_PLAN_TOOL_NAME,
  TRAVEL_FEATURE,
  TRAVEL_GENERATE_PLAN_TOOL_NAME,
  TRAVEL_ICON,
  TRAVEL_MIDDLEWARE_NAME,
  TRAVEL_VALIDATE_PLAN_TOOL_NAME
} from './constants'
import { TravelItineraryService } from './travel-itinerary.service'
import type { TravelItinerary, TravelRequirements, TravelScope } from './types'
import { validateTravelItinerary } from './types'

const requirementsSchema = z.object({
  destination: z.string().min(1).describe('目的地，例如：京都'),
  startDate: z.string().describe('开始日期，格式 YYYY-MM-DD'),
  endDate: z.string().describe('结束日期，格式 YYYY-MM-DD'),
  travelers: z.number().int().min(1).describe('出行人数'),
  budget: z.number().nonnegative().nullable().optional().describe('总预算，未知时可省略'),
  interests: z.array(z.string()).default([]).describe('兴趣偏好，例如历史、美食、亲子'),
  specialRequests: z.string().nullable().optional().describe('特殊要求')
})

const itinerarySchema = z.object({
  days: z.array(z.object({
    date: z.string(),
    activities: z.array(z.object({
      startTime: z.string(),
      endTime: z.string(),
      title: z.string(),
      location: z.string(),
      reason: z.string().optional(),
      estimatedCost: z.number().nonnegative().optional()
    }))
  })),
  totalEstimatedCost: z.number().nonnegative(),
  warnings: z.array(z.string()).default([])
})

@Injectable()
@AgentMiddlewareStrategy(TRAVEL_MIDDLEWARE_NAME)
export class TravelItineraryMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: TravelItineraryService) {}

  meta: TAgentMiddlewareMeta = {
    name: TRAVEL_MIDDLEWARE_NAME,
    label: { en_US: 'Travel Itinerary', zh_Hans: '旅行方案' },
    description: {
      en_US: 'Create, generate, validate, and confirm persisted travel itineraries.',
      zh_Hans: '创建、生成、校验并确认可恢复的旅行行程方案。'
    },
    icon: { type: 'svg', value: TRAVEL_ICON, color: '#0f766e' },
    features: [TRAVEL_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    const createPlan = tool(
      async (requirements: z.infer<typeof requirementsSchema>) => {
        const parsedRequirements = requirementsSchema.parse(requirements) as TravelRequirements
        const plan = await this.service.createPlan(scope, parsedRequirements)
        return stringify({ success: true, message: '旅行需求已保存，请继续生成行程。', data: plan })
      },
      {
        name: TRAVEL_CREATE_PLAN_TOOL_NAME,
        description: '保存一条旅行需求。用户提供目的地、日期和人数后调用。不要在未得到用户确认时创建多个重复需求。',
        schema: requirementsSchema
      }
    )

    const generatePlan = tool(
      async (input: { planId: string; itinerary: TravelItinerary }) => {
        const plan = await this.service.saveGeneratedItinerary(scope, input.planId, input.itinerary)
        return stringify({ success: true, message: '旅行行程已生成，等待用户审核。', data: plan })
      },
      {
        name: TRAVEL_GENERATE_PLAN_TOOL_NAME,
        description: '将你根据旅行需求生成的结构化行程保存到已有方案。必须使用已有 planId，不要编造实时价格或预订结果。',
        schema: z.object({ planId: z.string().min(1), itinerary: itinerarySchema })
      }
    )

    const validatePlan = tool(
      async (input: { planId: string; itinerary: TravelItinerary }) => {
        const plan = await this.service.getPlan(scope, input.planId)
        const result = validateTravelItinerary(input.itinerary, plan.requirements)
        return stringify({ success: result.valid, message: result.valid ? '行程校验通过。' : '行程校验未通过。', data: result })
      },
      {
        name: TRAVEL_VALIDATE_PLAN_TOOL_NAME,
        description: '在保存或确认前校验日期、时间冲突和预算。发现问题时先修改行程，不要直接确认。',
        schema: z.object({ planId: z.string().min(1), itinerary: itinerarySchema })
      }
    )

    const confirmPlan = tool(
      async (input: { planId: string }) => {
        const plan = await this.service.confirmPlan(scope, input.planId)
        return stringify({ success: true, message: '旅行方案已确认并保存。', data: plan })
      },
      {
        name: TRAVEL_CONFIRM_PLAN_TOOL_NAME,
        description: '仅在用户明确确认方案后调用，不能替用户确认。',
        schema: z.object({ planId: z.string().min(1) })
      }
    )

    return { name: TRAVEL_MIDDLEWARE_NAME, tools: [createPlan, generatePlan, validatePlan, confirmPlan] }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): TravelScope {
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

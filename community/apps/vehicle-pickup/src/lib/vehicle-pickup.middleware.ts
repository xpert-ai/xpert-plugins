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
  VEHICLE_PICKUP_CREATE_TOOL_NAME,
  VEHICLE_PICKUP_FEATURE,
  VEHICLE_PICKUP_ICON,
  VEHICLE_PICKUP_MIDDLEWARE_NAME,
  VEHICLE_PICKUP_QUERY_TOOL_NAME,
  VEHICLE_PICKUP_VALIDATE_TOOL_NAME
} from './constants'
import { VehiclePickupDomainError, VehiclePickupService } from './vehicle-pickup.service'

const validateSchema = z.object({
  vehicleNos: z.array(z.string()).min(1).describe('Vehicle numbers explicitly provided by the user. Do not guess.')
})

const createSchema = z.object({
  vehicleNos: z.array(z.string()).min(1).describe('All vehicle numbers for this pickup request.'),
  sourceText: z.string().optional().describe('Original user message used to create the request.')
})

const querySchema = z.object({
  status: z
    .enum(['applied', 'approved', 'rejected', 'cancelled', 'executed'])
    .optional()
    .describe('Optional pickup request status.'),
  keyword: z.string().optional().describe('Optional request number or vehicle number keyword.'),
  requestId: z.string().optional().describe('Optional pickup request id.'),
  requestNo: z.string().optional().describe('Optional pickup request number.')
})

@Injectable()
@AgentMiddlewareStrategy(VEHICLE_PICKUP_MIDDLEWARE_NAME)
export class VehiclePickupMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: VEHICLE_PICKUP_MIDDLEWARE_NAME,
    label: {
      en_US: 'Vehicle Pickup',
      zh_Hans: '车辆自提'
    },
    description: {
      en_US: 'Validate vehicle pickup eligibility, create requests and query accessible requests.',
      zh_Hans: '校验车辆是否可自提、创建自提申请并查询有权限查看的申请。'
    },
    icon: {
      type: 'svg',
      value: VEHICLE_PICKUP_ICON,
      color: '#1f6f5f'
    },
    features: [VEHICLE_PICKUP_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: VehiclePickupService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const actor = this.service.resolveActor(
      context.userId,
      context.tenantId,
      context.organizationId
    )

    const validateTool = tool(
      async (input: z.infer<typeof validateSchema>) => {
        const result = await this.service.validateVehicles(actor, input.vehicleNos, { purpose: 'general' })
        return JSON.stringify({
          success: true,
          message: result.canPickup ? '这些车辆当前可以自提。' : '部分车辆当前不可自提。',
          data: result
        })
      },
      {
        name: VEHICLE_PICKUP_VALIDATE_TOOL_NAME,
        description:
          'Validate whether explicitly provided vehicle numbers can be picked up. This is read-only and never creates a request.',
        schema: validateSchema,
        verboseParsingErrors: true
      }
    )

    const createTool = tool(
      async (input: z.infer<typeof createSchema>) => {
        try {
          const request = await this.service.createRequest(actor, {
            vehicleNos: input.vehicleNos ?? [],
            sourceText: input.sourceText
          })
          return JSON.stringify({
            success: true,
            message: `已创建自提申请 ${request.requestNo}，当前状态为“已申请”。`,
            data: request
          })
        } catch (error) {
          if (error instanceof VehiclePickupDomainError) {
            return JSON.stringify({
              success: false,
              created: false,
              code: error.code,
              message: error.message,
              errors: error.details
            })
          }
          throw error
        }
      },
      {
        name: VEHICLE_PICKUP_CREATE_TOOL_NAME,
        description:
          'Create one vehicle pickup request after the user explicitly asks to create it. The server validates all vehicles and creates nothing if any vehicle is invalid.',
        schema: createSchema,
        verboseParsingErrors: true
      }
    )

    const queryTool = tool(
      async (input: z.infer<typeof querySchema>) => {
        const requests = await this.service.queryRequests(actor, input)
        return JSON.stringify({
          success: true,
          message: `查询到 ${requests.length} 条可访问的自提申请。`,
          data: {
            requests,
            total: requests.length
          }
        })
      },
      {
        name: VEHICLE_PICKUP_QUERY_TOOL_NAME,
        description:
          'Query all pickup requests visible to the current user. The result includes request status, vehicles, approval result, execution state and log summaries.',
        schema: querySchema,
        verboseParsingErrors: true
      }
    )

    return {
      name: VEHICLE_PICKUP_MIDDLEWARE_NAME,
      tools: [validateTool, createTool, queryTool]
    }
  }
}

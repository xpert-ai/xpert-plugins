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
  LEAD_PARSER_FEATURE,
  LEAD_PARSER_MIDDLEWARE_NAME,
  PARSE_LEAD_TOOL_NAME
} from './constants'
import { LeadParserScope, LeadParserService } from './lead-parser.service'

const parseLeadSchema = z.object({
  text: z.string().min(1).describe('销售线索原文，例如"XX汽车零部件公司的李总想做新能源产线方案，预算大概80万"。')
})

@Injectable()
@AgentMiddlewareStrategy(LEAD_PARSER_MIDDLEWARE_NAME)
export class LeadParserMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly leadParserService: LeadParserService) {}

  meta: TAgentMiddlewareMeta = {
    name: LEAD_PARSER_MIDDLEWARE_NAME,
    label: {
      en_US: 'Lead Parser',
      zh_Hans: '线索解析'
    },
    description: {
      en_US: 'Adds a tool that extracts structured fields (name, company, intent, budget) from raw sales lead text.',
      zh_Hans: '提供从销售线索原文中提取姓名、公司、意向和预算等结构化字段的工具。'
    },
    features: [LEAD_PARSER_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const parseLeadTool = tool(
      async (input: z.infer<typeof parseLeadSchema>) => {
        try {
          const data = await this.leadParserService.parseText(scope, input.text)
          return stringify({
            success: true,
            message: 'Lead text parsed. Confirm the extracted fields with the user before saving.',
            data
          })
        } catch (error) {
          return stringify({
            success: false,
            message: error instanceof Error && error.message ? error.message : 'Failed to parse lead text.'
          })
        }
      },
      {
        name: PARSE_LEAD_TOOL_NAME,
        description:
          '当用户提供一段销售线索文本时，调用此工具提取姓名、公司、意向和预算等结构化字段。仅处理线索原文，不负责保存记录。',
        schema: parseLeadSchema
      }
    )

    return {
      name: LEAD_PARSER_MIDDLEWARE_NAME,
      tools: [parseLeadTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): LeadParserScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId
  }
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}

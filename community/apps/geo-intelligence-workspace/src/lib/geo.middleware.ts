import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy, type AgentMiddleware, type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy, type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { GEO_FEATURE, GEO_ICON, GEO_LIST_TOOL, GEO_MIDDLEWARE, GEO_MONITOR_TOOL } from './constants'
import { GeoEngineClient } from './geo.service'

@Injectable()
@AgentMiddlewareStrategy(GEO_MIDDLEWARE)
export class GeoMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: GEO_MIDDLEWARE,
    label: { en_US: 'GEO Intelligence', zh_Hans: 'GEO 智能监测' },
    description: { en_US: 'Monitor a raw DeepSeek answer and read saved results.', zh_Hans: '监测 DeepSeek 原始回答并读取保存的结果。' },
    icon: { type: 'svg', value: GEO_ICON, color: '#2563eb' },
    features: [GEO_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  constructor(private readonly engine: GeoEngineClient) {}

  createMiddleware(_options: Record<string, never>, _context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const monitor = tool(async (input) => {
      this.engine.assertScope(_context)
      const run = await this.engine.monitor({
        query: input.query,
        brand: { name: input.brand, aliases: input.aliases, competitors: input.competitors },
        run_id: input.runId
      })
      return JSON.stringify({ run_id: run.run_id, status: run.status, metrics: run.metrics, suggestion: run.suggestion, error_code: run.error_code })
    }, {
      name: GEO_MONITOR_TOOL,
      description: 'Run exactly one raw DeepSeek GEO monitoring question. This is a measurement probe; do not insert unapproved knowledge or call it a verified search citation.',
      schema: z.object({
        query: z.string().min(1).max(1000),
        brand: z.string().min(1).max(100),
        aliases: z.array(z.string()).max(20).optional(),
        competitors: z.array(z.string()).max(20).optional(),
        runId: z.string().uuid().optional()
      })
    })
    const list = tool(async () => {
      this.engine.assertScope(_context)
      return JSON.stringify((await this.engine.listRuns()).slice(0, 20).map((run) => ({
      run_id: run.run_id, query: run.query, status: run.status, metrics: run.metrics
    })))
    }, {
      name: GEO_LIST_TOOL,
      description: 'List up to 20 saved GEO monitoring runs without repeating the DeepSeek probe.',
      schema: z.object({})
    })
    return { name: GEO_MIDDLEWARE, tools: [monitor, list] }
  }
}

import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import type { RunnableConfig } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import { ChatMessageEventTypeEnum, WORKBENCH_VIEW_OPEN_EVENT, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy, defineMcpApp,
  type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { MAPS_APP, MAPS_ICON, MAPS_MIDDLEWARE, MAPS_VIEW_KEY } from './constants.js'
import {
  mapSearchInputSchema, mapDetailInputSchema, mapRouteInputSchema,
  mapViewportInputSchema, mapResultSchema, type MapResult
} from './contracts.js'
import { createMapsSession } from './maps-session.js'
import { type MapsOptions } from './options.js'
export { mapsOptionsSchema, type MapsOptions } from './options.js'

export const mapsApp = defineMcpApp({
  key: MAPS_APP,
  entry: 'dist/mcp-apps/map/index.html',
  title: { en_US: 'Maps', zh_Hans: '地图' },
  description: 'Explore places and routes on an interactive map.',
  csp: { connectDomains: [], resourceDomains: [] }
})

@Injectable()
@AgentMiddlewareStrategy(MAPS_MIDDLEWARE)
export class MapsMiddleware implements IAgentMiddlewareStrategy<MapsOptions> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MAPS_MIDDLEWARE,
    features: [MAPS_MIDDLEWARE],
    label: { en_US: 'Maps', zh_Hans: '地图' },
    description: {
      en_US: 'Search places and explore routes with AMap or Tencent. Connect the matching workspace Connector for live data.',
      zh_Hans: '搜索地点、查看地图与路线。真实数据需启用对应的高德或腾讯地图连接器。'
    },
    icon: MAPS_ICON,
    configSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        provider: { type: 'string', enum: ['amap', 'tencent'], default: 'amap', title: { en_US: 'Map provider', zh_Hans: '地图供应商' } },
        mode: { type: 'string', enum: ['live', 'demo'], default: 'live', title: { en_US: 'Data mode (demo is synthetic)', zh_Hans: '数据模式（demo 为模拟数据）' } },
        connectorId: { type: 'string', title: { en_US: 'Connector binding ID (optional)', zh_Hans: '连接器绑定 ID（可选）' } }
      }
    }
  }

  getToolNames(): readonly string[] { return ['maps_search', 'maps_detail', 'maps_route'] }

  createMiddleware(options: MapsOptions, context: IAgentMiddlewareContext): AgentMiddleware {
    const session = createMapsSession(options ?? {}, context)
    const entries = [
      ...makeEntryTools('maps_search', 'Search real places in a named city or around explicit GCJ02 coordinates and show an interactive map. Ask for city/location if missing; never guess the user location. Demo mode is explicitly synthetic.', mapSearchInputSchema,
        async (input, signal) => session.search(mapSearchInputSchema.parse(input), signal), context),
      ...makeEntryTools('maps_detail', 'Read details for an exact place ID from maps_search and show it on the map.', mapDetailInputSchema,
        async (input, signal) => session.detail(mapDetailInputSchema.parse(input), signal), context),
      ...makeEntryTools('maps_route', 'Plan a driving or walking route between explicit GCJ02 origin and destination. Returns provider route geometry, distance and duration.', mapRouteInputSchema,
        async (input, signal) => session.route(mapRouteInputSchema.parse(input), signal), context)
    ]
    const tools = [...entries,
      makeTool('maps_render', 'Render a bounded map viewport. Used only by the map App.', mapViewportInputSchema,
        async (input, signal) => session.render(mapViewportInputSchema.parse(input), signal))
    ]
    return {
      name: MAPS_MIDDLEWARE,
      tools,
      apps: {
        definitions: [mapsApp],
        tools: {
          maps_search: { resourceKey: MAPS_APP, visibility: ['model', 'app'], approval: 'none' },
          maps_detail: { resourceKey: MAPS_APP, visibility: ['model', 'app'], approval: 'none' },
          maps_route: { resourceKey: MAPS_APP, visibility: ['model', 'app'], approval: 'none' },
          maps_search_view: { visibility: ['app'], approval: 'none' },
          maps_detail_view: { visibility: ['app'], approval: 'none' },
          maps_route_view: { visibility: ['app'], approval: 'none' },
          maps_render: { visibility: ['app'], approval: 'none' }
        }
      }
    }
  }
}

type Execute = (input: unknown, signal?: AbortSignal) => Promise<MapResult>
function makeEntryTools(name: string, description: string, schema: z.ZodTypeAny, execute: Execute, context: IAgentMiddlewareContext) {
  const entry = new DynamicStructuredTool({
    name, description, schema, verboseParsingErrors: true, responseFormat: 'content_and_artifact',
    metadata: { toolName: toolLabels[name] },
    func: async (input: unknown, _manager, config) => {
      const result = mapResultSchema.parse(await execute(input, config?.signal))
      await openWorkbench(context, name, input, config)
      return [summarize(result), { structuredContent: result }]
    }
  })
  return [entry, makeTool(`${name}_view`, description, schema, execute)]
}

function makeTool(name: string, description: string, schema: z.ZodTypeAny, execute: Execute) {
  // MCP App callbacks use invoke(args), so return the full MCP object as content.
  // content_and_artifact would drop structuredContent on that invocation path.
  return new DynamicStructuredTool({
    name, description, schema, verboseParsingErrors: true,
    func: async (input: unknown, _manager, config) => {
      const result = mapResultSchema.parse(await execute(input, config?.signal))
      return { content: [{ type: 'text' as const, text: summarize(result) }], structuredContent: result }
    }
  })
}

function summarize(result: MapResult): string {
  const label = result.mode === 'demo' ? '[DEMO / 模拟数据] ' : ''
  switch (result.kind) {
    case 'places': return `${label}${result.title}\n${result.places.map(p => `[${p.id}] ${p.name}: ${p.address} (${p.location.lng}, ${p.location.lat})`).join('\n')}\n${result.attribution}`
    case 'place': return `${label}${result.place.name}: ${result.place.address}\n${result.attribution}`
    case 'route': return `${label}${result.title}: ${result.distanceMeters} m, ${result.durationSeconds} s\n${result.attribution}`
    case 'viewport': return `${label}Map viewport (${result.center.lng}, ${result.center.lat}), zoom ${result.zoom}. ${result.attribution}`
  }
}

const toolLabels: Record<string, { en_US: string; zh_Hans: string }> = {
  maps_search: { en_US: 'Search places', zh_Hans: '搜索地点' },
  maps_detail: { en_US: 'Place details', zh_Hans: '地点详情' },
  maps_route: { en_US: 'Plan route', zh_Hans: '规划路线' }
}

async function openWorkbench(context: IAgentMiddlewareContext, toolName: string, input: unknown, config?: RunnableConfig) {
  // Project navigation needs genuine host scope. Ordinary Assistants use the auto-open tab + host events.
  if (!context.projectId || !context.conversationId) return
  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, {
      type: WORKBENCH_VIEW_OPEN_EVENT,
      viewKey: MAPS_VIEW_KEY,
      projectId: context.projectId,
      conversationId: context.conversationId,
      parameters: { operation: toolName.slice('maps_'.length), inputJson: JSON.stringify(input) }
    }, config)
  } catch {
    // Map data remains usable if a client does not support live navigation.
    console.warn('[maps] Workbench navigation event unavailable')
  }
}

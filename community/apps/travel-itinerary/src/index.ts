import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { TRAVEL_ARTIFACT_NAMESPACE, TRAVEL_FEATURE, TRAVEL_ICON, TRAVEL_MIDDLEWARE_NAME, TRAVEL_PLUGIN_NAME, TRAVEL_PROVIDER_KEY, TRAVEL_TEMPLATE_PROVIDER_KEY, TRAVEL_WORKBENCH_VIEW_KEY } from './lib/constants'
import { TravelItineraryPlugin } from './lib/travel-itinerary.plugin'
import { travelTemplates } from './lib/travel-itinerary.templates'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { name: string; version: string }
const ConfigSchema = z.object({ enabled: z.boolean().default(true) })

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || TRAVEL_PLUGIN_NAME,
    version: packageJson.version,
    level: 'tenant',
    artifactNamespace: TRAVEL_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [TRAVEL_FEATURE, 'travel-workbench', 'travel-agent-tools', 'travel-assistant-template'],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'travel-itinerary',
              displayName: '旅行方案工作台',
              description: '将旅行需求交给 AI 生成结构化行程，人工确认后保存并可恢复。',
              icon: { type: 'svg', value: TRAVEL_ICON, color: '#0f766e' },
              operations: [
                { name: 'manage-travel-plans', displayName: 'Manage travel plans', description: 'Create and review saved travel plans.', access: 'write' },
                { name: 'review-travel-plans', displayName: 'Review travel plans', description: 'View itinerary results and status.', access: 'read' }
              ]
            },
            { type: 'view', name: TRAVEL_WORKBENCH_VIEW_KEY, displayName: 'Travel Planner Workbench', description: 'Saved travel plans, itinerary review, retry, and confirmation.' },
            { type: 'tool', name: TRAVEL_MIDDLEWARE_NAME, displayName: 'Travel itinerary tools', description: 'Tools for creating, generating, validating, and confirming travel plans.' },
            { type: 'assistant-template', name: 'travel-planner-assistant', displayName: 'Travel Planner Assistant', description: 'Prebuilt travel planning Assistant template.' }
          ]
        },
        runtime: { middlewareProviders: [TRAVEL_MIDDLEWARE_NAME], viewProviders: [TRAVEL_PROVIDER_KEY], templateProviders: [TRAVEL_TEMPLATE_PROVIDER_KEY] }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: TRAVEL_ICON, color: '#0f766e' },
    displayName: '旅行方案工作台',
    description: 'AI 辅助旅行行程规划、校验、人工确认和恢复。',
    keywords: ['travel', 'itinerary', 'workbench', 'assistant', 'business-app'],
    author: 'XpertAI'
  },
  config: { schema: ConfigSchema, defaults: { enabled: true } },
  templates: travelTemplates,
  register(ctx) {
    ctx.logger.log('register travel itinerary plugin')
    return { module: TravelItineraryPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('travel itinerary plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('travel itinerary plugin stopped')
  }
}

export default plugin

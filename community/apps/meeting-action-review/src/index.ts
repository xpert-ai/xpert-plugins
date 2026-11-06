import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { MeetingActionReviewPlugin } from './lib/meeting-action-review.plugin.js'
import { CONFIG, INSTALLATION, FEATURE, MIDDLEWARE, VIEW_PROVIDER, VIEW_KEY, PLUGIN_NAME } from './lib/constants.js'
import { configSchema, type PluginConfig } from './lib/schemas.js'

const packageJson = z.object({ name: z.string(), version: z.string(), xpert: z.object({ plugin: z.object({ level: z.literal('tenant'), artifactNamespace: z.string() }) }) })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
const plugin: XpertPlugin<z.input<typeof configSchema>> = {
  meta: { name: packageJson.name, version: packageJson.version, level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace, category: 'middleware', author: 'Yuki',
    displayName: '会后行动项核对与确认工作台', description: '从会议文本提取行动项，人工核对并确认保存。',
    targetApps: ['data-xpert'], targetAppMeta: { 'data-xpert': { types: ['business-app','workbench-view','assistant-tool'],
      capabilities: [FEATURE], runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [VIEW_PROVIDER] } } }
  },
  config: { schema: configSchema, defaults: { timeoutSeconds: 120, debug: false } },
  templates: [{ key: 'meeting-action-review-assistant', name: 'Meeting action review', title: '会后行动项核对助手',
    type: XpertTypeEnum.Agent, description: '提取会议行动项供人工核对，不能代替用户确认。',
    dslContent: readFileSync(new URL('../blueprints/assistant.yaml', import.meta.url), 'utf8'),
    targetApps: ['data-xpert'], targetAppMeta: { 'data-xpert': { requiredPlugins: [PLUGIN_NAME], capabilities: [FEATURE], defaultConfig: { viewProvider: VIEW_PROVIDER, viewKey: VIEW_KEY } } },
    startPrompts: ['如何在右侧工作台核对会议行动项？'], order: 50, default: false
  }],
  register(context) {
    // register also runs during schema preflight: never resolve services or start timers here.
    return { module: MeetingActionReviewPlugin, global: false, providers: [
      { provide: CONFIG, useValue: configSchema.parse(context.config) },
      { provide: INSTALLATION, useValue: { tenantId: context.tenantId ?? null, scopeKey: context.scopeKey ?? null } }
    ] }
  }
}
export default plugin

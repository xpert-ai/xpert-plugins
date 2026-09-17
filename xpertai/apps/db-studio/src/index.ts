import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod/v3'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertPlugin, XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { appConfig } from './lib/app-config.js'
import { DbStudioPlugin } from './lib/plugin.js'
import { STUDIO_CONFIG, FEATURES, ICON, MIDDLEWARE, PLUGIN, PROVIDER, TEMPLATE, VIEW, text } from './lib/constants.js'
const root = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8')) as { version: string }
export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE,
    name: 'DB Studio Assistant',
    title: 'DB Studio 数据库助手',
    description: text('Explore and operate databases through governed plans.', '通过受控计划探索和管理数据库。'),
    category: 'Data & Analytics',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    dependencies: { plugins: [PLUGIN] },
    dslContent: readFileSync(join(root, 'db-studio-assistant.yaml'), 'utf8'),
    default: true,
    order: 45,
    providerKey: PROVIDER,
    xpertName: 'DB Studio Assistant',
    startPrompts: [
      '请只读浏览当前数据源的数据库和表',
      '分析当前 SQL 的估算执行计划并提出优化建议',
      '根据已选对象生成数据库文档',
    ],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: Object.values(FEATURES),
        requiredPlugins: [PLUGIN],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'db-studio',
          managedBy: 'data-xpert',
          viewProvider: PROVIDER,
        },
      },
    },
  },
]
const ConfigSchema=z.object({readOnlyTest:z.boolean().default(false)}).strict()
const plugin: XpertPlugin<z.input<typeof ConfigSchema>> = {
  meta: {
    name: PLUGIN,
    version: packageJson.version,
    artifactNamespace: 'db_studio',
    level: 'system',
    category: 'middleware',
    displayName: 'DB Studio',
    description: 'Database workbench with governed Xpert Agent operations.',
    author: 'XpertAI',
    icon: { type: 'svg', value: ICON, color: '#146B5C' },
    keywords: ['database', 'doris', 'mysql', 'postgresql', 'agentic-app'],
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      xpert: { marketplace: { contents: [{ type: 'app', name: 'db-studio', displayName: 'DB Studio', appConfig }] } },
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: Object.values(FEATURES),
        runtime: {
          middlewareProviders: Object.values(MIDDLEWARE),
          viewProviders: [PROVIDER],
          templateProviders: [PROVIDER],
        },
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'db-studio',
              displayName: 'DB Studio',
              appConfig,
              description: text(
                'SQL, schema and data workflows with a native Agent.',
                'SQL、结构与数据工作台，原生 Agent 协同。'
              ),
            },
            { type: 'view', name: VIEW, displayName: 'DB Studio Workbench' },
            { type: 'assistant-template', name: TEMPLATE, displayName: 'DB Studio Assistant' },
          ],
        },
      },
    },
  },
  config: { schema: ConfigSchema },
  templates,
  register(ctx) {
    return { module: DbStudioPlugin, global: true, providers:[{provide:STUDIO_CONFIG,useValue:ctx.config}] }
  },
}
export default plugin
export * from './lib/plugin.js'
export * from './lib/entities.js'

/**
 * 插件入口：平台 import 本包时拿到的 default 导出就是这个插件对象。
 *
 * meta 描述“我是谁、属于哪一级、给哪个应用用、提供哪些能力”；
 * templates 是助手模板；register() 返回服务端模块，平台据此加载中间件、视图、数据表。
 * Python 类比：在 __init__.py 里定义 PLUGIN = Plugin(meta=..., register=...)，宿主 import 后读取。
 */
import 'reflect-metadata'
import { z } from 'zod/v3'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PACKAGE_METADATA } from './package-metadata.js'
import {
  EXPEDITE_FEATURE,
  MIDDLEWARE_NAME,
  PLUGIN_ICON,
  TEMPLATE_PROVIDER_KEY,
  VIEW_KEY,
  VIEW_PROVIDER_KEY
} from './lib/constants.js'
import { ExpediteShortagePlugin } from './lib/expedite.plugin.js'
import { TEMPLATE_KEY, templates } from './lib/templates.js'

/** 插件配置：本版没有管理员可调的配置项，用严格的空对象 */
const configSchema = z.object({}).strict()

/** 同时声明给 xpert 与 data-xpert 两个宿主应用（与 material-identity-governance 一致） */
const TARGET_APPS = ['xpert', 'data-xpert'] as const

/**
 * 市场展示用的内容卡片：助手模板 + 工作台视图。
 * 不声明 type: 'app' + appConfig（那是 Explore 一键初始化，本插件走“装插件 → 从模板建助手”的普通流程）。
 */
const marketplaceContents = [
  {
    type: 'assistant-template',
    name: TEMPLATE_KEY,
    displayName: { en_US: 'Expedite Shortage Assistant', zh_Hans: '提前交货缺料分析助手' },
    description: { en_US: 'Analyse expedite requests and propose shortage actions.', zh_Hans: '分析提前交货请求的缺料情况并给出建议。' }
  },
  { type: 'view', name: VIEW_KEY, displayName: { en_US: 'Expedite shortage workbench', zh_Hans: '缺料分析工作台' } }
] satisfies PluginMarketplaceContribution[]

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PACKAGE_METADATA.name,
    version: PACKAGE_METADATA.version,
    level: PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    category: 'middleware',
    displayName: '提前交货缺料分析',
    description:
      'Analyse material shortages for expedite requests: the server computes BOM shortages, the Assistant proposes actions, planners confirm them in the workbench.',
    author: 'Ze-loong',
    icon: PLUGIN_ICON,
    keywords: ['manufacturing', 'expedite', 'shortage', 'bom'],
    targetApps: [...TARGET_APPS],
    targetAppMeta: Object.fromEntries(
      TARGET_APPS.map((app) => [
        app,
        {
          types: ['business-app', 'assistant-template', 'workbench-view'],
          capabilities: [EXPEDITE_FEATURE],
          marketplace: { contents: marketplaceContents },
          runtime: {
            middlewareProviders: [MIDDLEWARE_NAME],
            viewProviders: [VIEW_PROVIDER_KEY],
            templateProviders: [TEMPLATE_PROVIDER_KEY]
          }
        }
      ])
    )
  },
  config: { schema: configSchema },
  templates,
  register() {
    // global: true 让本模块导出的服务在整个平台进程可见
    return { module: ExpediteShortagePlugin, global: true }
  }
}

export default plugin
export { plugin, templates }

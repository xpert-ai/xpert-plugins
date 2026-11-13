/**
 * 插件入口：平台 import 本包时拿到的 default 导出就是这个插件对象。
 *
 * meta 描述“我是谁、属于哪一级、给哪个应用用、提供哪些能力”；
 * register() 返回服务端模块，平台据此加载中间件、视图、数据表。
 * Python 类比：在 __init__.py 里定义 PLUGIN = Plugin(meta=..., register=...)，宿主 import 后读取。
 */
import 'reflect-metadata'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PACKAGE_METADATA } from './package-metadata.js'
import { EXPEDITE_FEATURE, MIDDLEWARE_NAME, PLUGIN_ICON } from './lib/constants.js'
import { ExpediteShortagePlugin } from './lib/expedite.plugin.js'

/** 插件配置：本版没有管理员可调的配置项，用严格的空对象 */
const configSchema = z.object({}).strict()

/** 同时声明给 xpert 与 data-xpert 两个宿主应用（与 material-identity-governance 一致） */
const TARGET_APPS = ['xpert', 'data-xpert'] as const

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
          // 只声明已经实现的运行时组件；视图和模板在后续阶段加入
          runtime: {
            middlewareProviders: [MIDDLEWARE_NAME]
          }
        }
      ])
    )
  },
  config: { schema: configSchema },
  register() {
    // global: true 让本模块导出的服务在整个平台进程可见
    return { module: ExpediteShortagePlugin, global: true }
  }
}

export default plugin
export { plugin }

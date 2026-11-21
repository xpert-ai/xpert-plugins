/**
 * 助手模板登记：读取同包里的 yaml（助手画布 DSL），以模板形式提供给平台，
 * 用户在平台里“从模板创建助手”时就得到 Agent + 3 个中间件的完整画布，不用手工拼装。
 * Python 类比：把一份 yaml 配置文件读成字符串，放进插件声明的 templates 列表。
 */
import { readFileSync } from 'node:fs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { EXPEDITE_FEATURE, PLUGIN_ICON, PLUGIN_NAME, TEMPLATE_PROVIDER_KEY, VIEW_PROVIDER_KEY } from './constants.js'

export const TEMPLATE_KEY = 'expedite-shortage-assistant'

/** 编译后本文件在 dist/lib/，yaml 由 copy-assets 复制到 dist/；源码运行（单测）时则在 src/ */
export const TEMPLATE_DSL = readFileSync(new URL('../expedite-shortage-assistant.yaml', import.meta.url), 'utf8')

export const START_PROMPTS = [
  '载入演示请求后，帮我分析 SO-1024 能否提前到 11 月 25 日交货。',
  '缺料分析的结论是怎么算出来的？'
]

export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE_KEY,
    name: TEMPLATE_KEY,
    title: '提前交货缺料分析助手',
    description: '展开 BOM、查库存与在途、找替代料，给出每个缺料物料的建议；计划员在工作台逐条确认。',
    icon: PLUGIN_ICON,
    category: 'Manufacturing',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert', 'data-xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-assistant'],
        capabilities: [EXPEDITE_FEATURE],
        requiredPlugins: [PLUGIN_NAME],
        defaultConfig: { viewProvider: VIEW_PROVIDER_KEY }
      },
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [EXPEDITE_FEATURE],
        requiredPlugins: [PLUGIN_NAME]
      }
    },
    dslContent: TEMPLATE_DSL,
    startPrompts: START_PROMPTS,
    dependencies: { plugins: [PLUGIN_NAME] },
    releaseNotes: '0.1.0：首个版本。模型不写在模板里，从模板安装时选择组织已配置的模型。',
    providerKey: TEMPLATE_PROVIDER_KEY,
    order: 40,
    default: false
  }
]

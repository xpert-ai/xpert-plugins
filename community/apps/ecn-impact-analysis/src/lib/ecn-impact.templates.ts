import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  ECN_IMPACT_FEATURE,
  ECN_IMPACT_PLUGIN_NAME,
  ECN_IMPACT_PROVIDER_KEY,
  ECN_IMPACT_TEMPLATE_FILE,
  ECN_IMPACT_TEMPLATE_KEY,
  ECN_IMPACT_TEMPLATE_PROVIDER_KEY
} from './constants'

function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', ECN_IMPACT_TEMPLATE_FILE),
    join(runtimeDir, ECN_IMPACT_TEMPLATE_FILE),
    join(process.cwd(), 'apps/ecn-impact-analysis/src', ECN_IMPACT_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/ecn-impact-analysis/src', ECN_IMPACT_TEMPLATE_FILE)
  ]
}

function readTemplateDsl(): string {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`ECN impact assistant DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const ecnImpactTemplates: XpertTemplateContribution[] = [
  {
    key: ECN_IMPACT_TEMPLATE_KEY,
    name: 'ECN Impact Analysis Assistant',
    title: '工程变更影响分析助手',
    description:
      '面向工程变更（ECN）影响分析的业务助手模板：跨 PLM/ERP/MES 模拟数据收集证据、生成带证据链的影响清单，供工程师在评估台人工确认。',
    category: 'ECN Impact Analysis',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [ECN_IMPACT_FEATURE, 'ecn-impact-review-desk'],
        requiredPlugins: [ECN_IMPACT_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'ecn-impact-analysis',
          managedBy: 'data-xpert',
          viewProvider: ECN_IMPACT_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '工程变更 ECN-2026-015：轴承座 P-1003 材料由 HT200 改为 HT250（常温强度不足），请创建影响评估并完成 AI 影响分析。',
      '请查询评估 ECN-2026-015 的当前状态和影响项审核进度。',
      '什么是工程变更影响分析助手？它能帮我做什么？'
    ],
    releaseNotes: '创建工程变更影响分析业务助手。',
    xpertName: '工程变更影响分析助手',
    providerKey: ECN_IMPACT_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]

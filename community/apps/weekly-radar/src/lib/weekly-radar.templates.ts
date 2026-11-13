import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  WEEKLY_RADAR_FEATURE,
  WEEKLY_RADAR_PLUGIN_NAME,
  WEEKLY_RADAR_PROVIDER_KEY,
  WEEKLY_RADAR_TEMPLATE_KEY,
  WEEKLY_RADAR_TEMPLATE_PROVIDER_KEY
} from './constants'

const WEEKLY_RADAR_TEMPLATE_FILE = 'xpert-weekly-radar-assistant.yaml'

function getWeeklyRadarTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', WEEKLY_RADAR_TEMPLATE_FILE),
    join(runtimeDir, WEEKLY_RADAR_TEMPLATE_FILE),
    join(process.cwd(), 'apps/weekly-radar/src', WEEKLY_RADAR_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/weekly-radar/src', WEEKLY_RADAR_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/weekly-radar', WEEKLY_RADAR_TEMPLATE_FILE)
  ]
}

function readWeeklyRadarDsl() {
  const candidates = getWeeklyRadarTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Weekly Radar xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const weeklyRadarTemplates: XpertTemplateContribution[] = [
  {
    key: WEEKLY_RADAR_TEMPLATE_KEY,
    name: 'Weekly Radar Assistant',
    title: '周报风险雷达助手',
    description: '把本周工作痕迹沉淀为条目，用可复算规则扫描未闭环风险，并生成带依据的周报。',
    category: 'Productivity',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [WEEKLY_RADAR_FEATURE, 'weekly-radar-workbench', 'weekly-radar-agent-tools'],
        requiredPlugins: [WEEKLY_RADAR_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'weekly-radar',
          managedBy: 'data-xpert',
          viewProvider: WEEKLY_RADAR_PROVIDER_KEY
        }
      },
      xpert: {
        types: ['business-assistant'],
        capabilities: [WEEKLY_RADAR_FEATURE, 'weekly-radar-workbench', 'weekly-radar-agent-tools'],
        requiredPlugins: [WEEKLY_RADAR_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'weekly-radar',
          managedBy: 'xpert',
          viewProvider: WEEKLY_RADAR_PROVIDER_KEY
        }
      }
    },
    dslContent: readWeeklyRadarDsl(),
    order: 62,
    default: false,
    startPrompts: [
      '这是我这周做的事，帮我记成条目并扫一遍风险：本周完成客户回访 12 家，报价系统对接卡在对方接口文档没给，已经三天了。',
      '帮我生成本周周报，先扫描有没有没闭环的事项。',
      '上周遗留的三件事现在什么状态？把跨周未闭环的列出来。'
    ],
    releaseNotes: '创建 Xpert 原生周报风险雷达业务助手。',
    xpertName: '周报风险雷达助手',
    providerKey: WEEKLY_RADAR_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]

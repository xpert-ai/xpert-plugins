import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  MEETING_FEATURE,
  MEETING_PLUGIN_NAME,
  MEETING_PROVIDER_KEY,
  MEETING_TEMPLATE_KEY,
  MEETING_TEMPLATE_PROVIDER_KEY
} from './constants'

const TEMPLATE_FILE = 'xpert-meeting-action-workbench-assistant.yaml'
const startPrompts = [
  '请把下面的会议内容提取为会议决议和行动项，并保存到工作台等待我确认。',
  '请打开最近一条失败的会议提取记录，说明失败原因并安全重试。',
  '请根据会议记录检查哪些行动项缺少负责人或截止日期。',
  '请总结指定会议的已确认决议和未完成行动项。',
  '请巡检所有已确认行动项的执行风险，并生成下一次会议跟进简报。'
]

function readTemplateDsl() {
  const candidates = [
    join(__dirname, '..', TEMPLATE_FILE),
    join(__dirname, TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/meeting-action-workbench/src', TEMPLATE_FILE),
    join(process.cwd(), 'apps/meeting-action-workbench/src', TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/meeting-action-workbench', TEMPLATE_FILE)
  ]
  const templatePath = candidates.find(existsSync)
  if (!templatePath) throw new Error(`Meeting Assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(templatePath, 'utf8')
}

export const meetingTemplates: XpertTemplateContribution[] = [{
  key: MEETING_TEMPLATE_KEY,
  name: 'Meeting Action Workbench Assistant',
  title: '会议决议与行动项助手',
  description: '从会议内容中提取可追溯结果，持续跟踪行动项并生成 Agent 风险巡检与跟进简报。',
  category: 'Productivity',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-assistant'],
      capabilities: [MEETING_FEATURE, 'meeting-ai-extraction', 'meeting-human-review', 'meeting-execution-tracking', 'meeting-agent-risk-review'],
      requiredPlugins: [MEETING_PLUGIN_NAME],
      defaultConfig: {
        assistantKind: 'business-assistant',
        businessDomain: 'meeting-operations',
        managedBy: 'data-xpert',
        viewProvider: MEETING_PROVIDER_KEY
      }
    }
  },
  dependencies: { plugins: [MEETING_PLUGIN_NAME] },
  dslContent: readTemplateDsl(),
  order: 45,
  default: false,
  startPrompts,
  releaseNotes: '新增确认后行动项跟踪、规则与 Agent 风险巡检，以及下一次会议跟进简报。',
  xpertName: '会议决议与行动项助手',
  providerKey: MEETING_TEMPLATE_PROVIDER_KEY
} as XpertTemplateContribution]

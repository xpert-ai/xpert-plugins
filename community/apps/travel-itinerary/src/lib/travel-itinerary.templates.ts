import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { TRAVEL_FEATURE, TRAVEL_MIDDLEWARE_NAME, TRAVEL_PLUGIN_NAME, TRAVEL_PROVIDER_KEY, TRAVEL_TEMPLATE_PROVIDER_KEY } from './constants'

function readTemplate() {
  const candidates = [join(__dirname, '..', 'travel-planner-assistant.yaml'), join(__dirname, 'travel-planner-assistant.yaml'), join(process.cwd(), 'community/apps/travel-itinerary/src/travel-planner-assistant.yaml')]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`Travel assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

export const travelTemplates: XpertTemplateContribution[] = [
  {
    key: 'travel-planner-assistant',
    name: 'Travel Planner Assistant',
    title: '旅行方案助手',
    description: '根据用户需求生成、校验并保存可人工确认的旅行行程。',
    category: 'Travel',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [TRAVEL_FEATURE, 'travel-workbench', 'travel-agent-tools'],
        requiredPlugins: [TRAVEL_PLUGIN_NAME],
        defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'travel', managedBy: 'data-xpert', viewProvider: TRAVEL_PROVIDER_KEY }
      }
    },
    dslContent: readTemplate(),
    order: 70,
    default: false,
    startPrompts: [
      '帮我规划一个京都 4 天游，预算 6000 元，偏好历史和美食。',
      '根据我的旅行需求生成行程，并列出可能的时间冲突。',
      '请打开我上次保存的旅行方案，我想修改第二天安排。',
      '我确认这个旅行方案，请保存为已确认状态。'
    ],
    releaseNotes: '创建旅行方案工作台和 AI 行程规划助手。',
    xpertName: '旅行方案助手',
    providerKey: TRAVEL_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]

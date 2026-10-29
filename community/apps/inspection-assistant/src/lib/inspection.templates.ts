import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  INSPECTION_FEATURE,
  INSPECTION_PLUGIN_NAME,
  INSPECTION_PROVIDER_KEY,
  INSPECTION_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const INSPECTION_TEMPLATE_KEY = 'inspection-assistant'
const INSPECTION_TEMPLATE_FILE = 'xpert-inspection-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getInspectionTemplateCandidates() {
  const runtimeDir = __dirname

  return [
    join(runtimeDir, '..', INSPECTION_TEMPLATE_FILE),
    join(runtimeDir, INSPECTION_TEMPLATE_FILE),
    join(process.cwd(), 'apps/inspection-assistant/src', INSPECTION_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/inspection-assistant/src', INSPECTION_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/inspection-assistant', INSPECTION_TEMPLATE_FILE)
  ]
}

function readInspectionDsl() {
  const candidates = getInspectionTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Inspection Assistant xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const inspectionTemplates: XpertTemplateContribution[] = [
  {
    key: INSPECTION_TEMPLATE_KEY,
    name: 'Inspection & Fault Handling Assistant',
    title: '机房/基站巡检与故障处理助手',
    description:
      '面向通信机房/基站巡检场景：解析故障描述、评估紧急程度、检索历史处理方案并给出处理建议的 data-xpert 业务助手模板。',
    category: 'Telecom O&M',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [INSPECTION_FEATURE, 'inspection-assistant-workbench'],
        requiredPlugins: [INSPECTION_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'inspection-assistant',
          managedBy: 'data-xpert',
          viewProvider: INSPECTION_PROVIDER_KEY
        }
      }
    },
    dslContent: readInspectionDsl(),
    order: 40,
    default: false,
    startPrompts: [
      '请创建一条巡检工单：XX 基站 BBU 反复掉电，请分析故障并给出处理建议。',
      '请检索与当前工单类似的故障历史处理方案。',
      '请为工单 INSP-xxxx 生成处理建议并说明紧急程度。'
    ],
    releaseNotes: '创建机房/基站巡检与故障处理业务助手。',
    xpertName: '巡检与故障处理助手',
    providerKey: INSPECTION_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]

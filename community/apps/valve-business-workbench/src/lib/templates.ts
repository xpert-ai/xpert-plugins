import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  VALVE_FEATURE,
  VALVE_PLUGIN_NAME,
  VALVE_PROVIDER_KEY,
  VALVE_TEMPLATE_KEY,
  VALVE_TEMPLATE_PROVIDER_KEY
} from './constants'

const TEMPLATE_FILE = 'xpert-valve-business-workbench-assistant.yaml'

function readTemplateDsl() {
  const candidates = [
    join(__dirname, '..', TEMPLATE_FILE),
    join(__dirname, TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/valve-business-workbench/src', TEMPLATE_FILE),
    join(process.cwd(), 'apps/valve-business-workbench/src', TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/valve-business-workbench', TEMPLATE_FILE)
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Valve Assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

export const valveTemplates: XpertTemplateContribution[] = [
  {
    key: VALVE_TEMPLATE_KEY,
    name: 'Valve Engineering Business Assistant',
    title: '阀门工程业务助手',
    description: '基于已发布阀门本体快照，提供对象 360、证据、约束分析和受控动作草案。',
    category: 'Engineering',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [VALVE_FEATURE, 'valve-object-360', 'valve-governed-proposals'],
        requiredPlugins: [VALVE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'valve-engineering',
          managedBy: 'data-xpert',
          viewProvider: VALVE_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(),
    order: 48,
    default: false,
    startPrompts: [
      '分析当前阀门对象，并区分本体事实、风险和你的判断。',
      '发现当前阀门可用的业务 Actions，并说明前置条件和预期影响。',
      '为当前阀门创建一张维护工单 Demo 草案，先完成预检。'
    ],
    releaseNotes: '新增 Action 发现、预检、客户 Demo 草案、人工审批、模拟执行回执和完整审计时间线。',
    xpertName: '阀门工程业务助手',
    providerKey: VALVE_TEMPLATE_PROVIDER_KEY
  }
]

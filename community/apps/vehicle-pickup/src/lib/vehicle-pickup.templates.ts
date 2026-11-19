import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  VEHICLE_PICKUP_FEATURE,
  VEHICLE_PICKUP_PLUGIN_NAME,
  VEHICLE_PICKUP_PROVIDER_KEY,
  VEHICLE_PICKUP_TEMPLATE_KEY,
  VEHICLE_PICKUP_TEMPLATE_PROVIDER_KEY
} from './constants'

const TEMPLATE_FILE = 'xpert-vehicle-pickup-assistant.yaml'

function readTemplate() {
  const candidates = [
    join(__dirname, '..', TEMPLATE_FILE),
    join(__dirname, TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/vehicle-pickup/src', TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/vehicle-pickup', TEMPLATE_FILE)
  ]
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) throw new Error(`Vehicle pickup assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(templatePath, 'utf8')
}

export const vehiclePickupTemplates: XpertTemplateContribution[] = [
  {
    key: VEHICLE_PICKUP_TEMPLATE_KEY,
    name: 'Vehicle Pickup Assistant',
    title: '车辆自提助手',
    description: '通过对话校验车辆并创建自提申请，在统一工作台完成审批、取消和模拟运输执行。',
    category: 'Vehicle Pickup',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [VEHICLE_PICKUP_FEATURE, 'vehicle-pickup-workbench'],
        requiredPlugins: [VEHICLE_PICKUP_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'vehicle-pickup',
          managedBy: 'data-xpert',
          viewProvider: VEHICLE_PICKUP_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplate(),
    order: 60,
    default: false,
    startPrompts: [
      '123334 和 124728 这两台车可以自提吗？',
      '帮我创建 123334 和 124728 的自提申请。',
      '查询我最近的自提申请。'
    ],
    releaseNotes: '创建车辆自提业务助手。',
    xpertName: '车辆自提助手',
    providerKey: VEHICLE_PICKUP_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]

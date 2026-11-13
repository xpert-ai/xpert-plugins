import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  VEHICLE_PICKUP_FEATURE,
  VEHICLE_PICKUP_ICON,
  VEHICLE_PICKUP_MIDDLEWARE_NAME,
  VEHICLE_PICKUP_PROVIDER_KEY,
  VEHICLE_PICKUP_TEMPLATE_KEY,
  VEHICLE_PICKUP_TEMPLATE_PROVIDER_KEY,
  VEHICLE_PICKUP_VIEW_KEY
} from './lib/constants'
import {
  VehiclePickupConfigSchema,
  readVehiclePickupEnvDefaults
} from './lib/vehicle-pickup.config'
import { VehiclePickupPlugin } from './lib/vehicle-pickup.plugin'
import { vehiclePickupTemplates } from './lib/vehicle-pickup.templates'

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as {
  name: string
  version: string
  xpert: {
    plugin: {
      level: 'tenant'
      artifactNamespace: string
    }
  }
}

const plugin: XpertPlugin<z.infer<typeof VehiclePickupConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          VEHICLE_PICKUP_FEATURE,
          'vehicle-pickup-conversation',
          'vehicle-pickup-workbench',
          'vehicle-pickup-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'vehicle-pickup',
              displayName: '车辆自提',
              description: '通过对话校验车辆、创建自提申请，并完成审批、取消和模拟运输执行。',
              icon: {
                type: 'svg',
                value: VEHICLE_PICKUP_ICON,
                color: '#1f6f5f'
              },
              operations: [
                {
                  name: 'create-vehicle-pickup-requests',
                  displayName: '创建自提申请',
                  description: '在对话中校验车辆并直接创建自提申请。',
                  access: 'write'
                },
                {
                  name: 'review-vehicle-pickup-requests',
                  displayName: '审批与查询申请',
                  description: '查看自提申请，执行通过、系统重校验、驳回和取消。',
                  access: 'read'
                },
                {
                  name: 'execute-vehicle-pickup-requests',
                  displayName: '模拟运输执行',
                  description: '对已审批申请模拟承运商运输指令执行。',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: VEHICLE_PICKUP_VIEW_KEY,
              displayName: '车辆自提工作台',
              description: '店端、审批人和承运商共用的申请列表、状态筛选与详情工作台。'
            },
            {
              type: 'tool',
              name: VEHICLE_PICKUP_MIDDLEWARE_NAME,
              displayName: '车辆自提工具',
              description: '提供车辆可提校验、申请创建和包含详情的统一申请查询。'
            },
            {
              type: 'assistant-template',
              name: VEHICLE_PICKUP_TEMPLATE_KEY,
              displayName: '车辆自提助手模板',
              description: '预置对话校验、创建申请、审批查询和运输执行流程。'
            }
          ]
        },
        runtime: {
          middlewareProviders: [VEHICLE_PICKUP_MIDDLEWARE_NAME],
          viewProviders: [VEHICLE_PICKUP_PROVIDER_KEY],
          templateProviders: [VEHICLE_PICKUP_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: VEHICLE_PICKUP_ICON,
      color: '#1f6f5f'
    },
    displayName: '车辆自提',
    description: '通过对话校验车辆并创建自提申请，在统一工作台完成审批、取消和模拟运输执行。',
    keywords: ['vehicle', 'pickup', 'approval', 'workflow', 'remote-component'],
    author: 'TTDNR'
  },
  config: {
    schema: VehiclePickupConfigSchema,
    defaults: readVehiclePickupEnvDefaults()
  },
  templates: vehiclePickupTemplates,
  register(ctx) {
    ctx.logger.log('register vehicle-pickup plugin')
    return { module: VehiclePickupPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('vehicle-pickup plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('vehicle-pickup plugin stopped')
  }
}

export default plugin

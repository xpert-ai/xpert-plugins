import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  AGENT_KEYS,
  FACTORY_FEATURE,
  FACTORY_ICON,
  FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
  FACTORY_MANAGER_TEMPLATE_KEY,
  FACTORY_PLUGIN_NAME,
  FACTORY_TEMPLATE_KEY,
  FACTORY_TEMPLATE_PROVIDER_KEY,
  FACTORY_WORKBENCH_FEATURE
} from './constants.js'
import { buildRoleAssistantDsl } from './factory-assistant-dsl.js'
import {
  FACTORY_ROLE_ASSISTANTS,
  type FactoryRoleAssistantDefinition
} from './factory-assistant-definitions.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const FACTORY_TEMPLATE_DEFINITION = {
  key: FACTORY_TEMPLATE_KEY,
  title: '工厂异常恢复编排助手',
  description: '通过必需的 External Xpert 直连编排独立角色 Assistants，推进异常研判、审批、受控执行与恢复验证。',
  avatar: {
    emoji: { id: 'factory', unified: '1f3ed' },
    background: 'rgb(231, 248, 241)'
  },
  startPrompts: [
    '请研判当前 M-07 严重异常，并并行协调设备、质量、生产和资源 Assistants。',
    '请读取这个工厂事件的最新进度，说明阻塞项和下一步。',
    '方案 B 已经批准，请检查执行确认并完成恢复验证。'
  ]
} as const

export const FACTORY_MANAGER_TEMPLATE_DEFINITION = {
  key: FACTORY_MANAGER_TEMPLATE_KEY,
  title: '工厂运营管理监控助手',
  description: '只读监控组织范围内的异常恢复风险、泳道阻塞、恢复吞吐和智能体执行健康度。',
  avatar: {
    emoji: { id: 'bar_chart', unified: '1f4ca' },
    background: 'rgb(235, 244, 255)'
  },
  startPrompts: [
    '请汇总当前组织内活动异常、严重风险和等待审批事件。',
    '哪些角色泳道存在阻塞，最近失败的智能体执行是什么？',
    '请说明平均响应与恢复时间，以及避免的停机和损失。'
  ]
} as const

const capabilities = [
  ...Object.values(FACTORY_FEATURE),
  FACTORY_WORKBENCH_FEATURE,
  'factory-operations-assistant-template'
]

export const factoryOperationsTemplates: XpertTemplateContribution[] = [
  ...FACTORY_ROLE_ASSISTANTS.map(roleTemplateContribution),
  {
    key: FACTORY_TEMPLATE_DEFINITION.key,
    name: FACTORY_TEMPLATE_DEFINITION.key,
    title: FACTORY_TEMPLATE_DEFINITION.title,
    description: FACTORY_TEMPLATE_DEFINITION.description,
    avatar: FACTORY_TEMPLATE_DEFINITION.avatar,
    icon: FACTORY_ICON,
    category: 'Operations',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities,
        requiredPlugins: [FACTORY_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'factory-operations',
          managedBy: 'data-xpert'
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities,
        requiredPlugins: [FACTORY_PLUGIN_NAME]
      }
    },
    dslContent: readDsl('factory-operations-assistant.yaml'),
    order: 20,
    default: false,
    startPrompts: [...FACTORY_TEMPLATE_DEFINITION.startPrompts],
    releaseNotes: 'Requires a Case Project and dispatches portable External Assistant Tasks through the managed queue.',
    xpertName: FACTORY_TEMPLATE_DEFINITION.title,
    providerKey: FACTORY_TEMPLATE_PROVIDER_KEY,
    primaryAgentKey: AGENT_KEYS.coordinator
  },
  {
    key: FACTORY_MANAGER_TEMPLATE_DEFINITION.key,
    name: FACTORY_MANAGER_TEMPLATE_DEFINITION.key,
    title: FACTORY_MANAGER_TEMPLATE_DEFINITION.title,
    description: FACTORY_MANAGER_TEMPLATE_DEFINITION.description,
    avatar: FACTORY_MANAGER_TEMPLATE_DEFINITION.avatar,
    icon: FACTORY_ICON,
    category: 'Operations',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [
          FACTORY_FEATURE.coordination,
          FACTORY_FEATURE.monitoring,
          FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
          'factory-operations-assistant-template'
        ],
        requiredPlugins: [FACTORY_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'factory-operations-management',
          managedBy: 'data-xpert'
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: [
          FACTORY_FEATURE.coordination,
          FACTORY_FEATURE.monitoring,
          FACTORY_MANAGEMENT_DASHBOARD_FEATURE,
          'factory-operations-assistant-template'
        ],
        requiredPlugins: [FACTORY_PLUGIN_NAME]
      }
    },
    dslContent: readDsl('factory-operations-manager.yaml'),
    order: 40,
    default: false,
    startPrompts: [...FACTORY_MANAGER_TEMPLATE_DEFINITION.startPrompts],
    releaseNotes: 'Adds the ECharts management monitoring dashboard and governed App entry.',
    xpertName: FACTORY_MANAGER_TEMPLATE_DEFINITION.title,
    providerKey: FACTORY_TEMPLATE_PROVIDER_KEY,
    primaryAgentKey: 'Agent_FactoryOperationsManager'
  }
]

function readDsl(templateFile: string) {
  const candidates = [
    join(moduleDir, '..', templateFile),
    join(moduleDir, templateFile),
    join(process.cwd(), 'src', templateFile),
    join(process.cwd(), 'dist', templateFile)
  ]
  const path = candidates.find(existsSync)
  if (!path) {
    throw new Error(`Factory Operations Assistant DSL not found: ${candidates.join(', ')}`)
  }
  return readFileSync(path, 'utf8')
}

function roleTemplateContribution(
  definition: FactoryRoleAssistantDefinition
): XpertTemplateContribution {
  const roleCapabilities = definition.middleware.map(({ feature }) => feature)
  return {
    key: definition.key,
    name: definition.key,
    title: definition.title,
    description: definition.description,
    avatar: definition.avatar,
    icon: FACTORY_ICON,
    category: 'Operations',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: roleCapabilities,
        requiredPlugins: [FACTORY_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'factory-operations',
          roleKey: definition.roleKey,
          laneKey: definition.laneKey,
          managedBy: 'data-xpert'
        }
      },
      xpert: {
        types: ['assistant-template'],
        capabilities: roleCapabilities,
        requiredPlugins: [FACTORY_PLUGIN_NAME]
      }
    },
    dslContent: buildRoleAssistantDsl(definition),
    order: definition.order,
    default: false,
    startPrompts: [...definition.startPrompts],
    releaseNotes: 'Factory Operations v4 role Assistant with project-required workspace scope.',
    xpertName: definition.title,
    providerKey: FACTORY_TEMPLATE_PROVIDER_KEY,
    primaryAgentKey: definition.agentKey
  }
}

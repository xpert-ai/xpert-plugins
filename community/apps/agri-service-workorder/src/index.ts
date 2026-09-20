import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  AgriServicePluginConfigFormSchema,
  AgriServicePluginConfigSchema,
  readAgriServicePluginEnvDefaults
} from './lib/agri-service-workorder.config'
import { AgriServicePlugin } from './lib/agri-service-workorder.plugin'
import {
  AGRI_SERVICE_FEATURE,
  AGRI_SERVICE_ICON,
  AGRI_SERVICE_MIDDLEWARE_NAME,
  AGRI_SERVICE_PROVIDER_KEY,
  AGRI_SERVICE_TEMPLATE_PROVIDER_KEY,
  AGRI_SERVICE_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { AgriServiceTemplates } from './lib/agri-service-workorder.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = AgriServicePluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          AGRI_SERVICE_FEATURE,
          'agri-service-report-entry',
          'agri-service-review-desk',
          'agri-service-workorder-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'agri-service-workorder',
              displayName: '农服工单智能填报',
              description:
                '把农户电话/微信里的农服需求转成可复核的结构化工单，支持人工确认、补充、查询恢复与失败重试。',
              icon: {
                type: 'svg',
                value: AGRI_SERVICE_ICON,
                color: '#3f6212'
              },
              operations: [
                {
                  name: 'create-agri-service-work-orders',
                  displayName: '智能填报农服工单',
                  description: '从自然语言农服描述生成待确认工单。',
                  access: 'write'
                },
                {
                  name: 'import-agri-service-catalog',
                  displayName: '导入候选主数据',
                  description: '导入作物、村组、服务类型等候选数据。',
                  access: 'write'
                },
                {
                  name: 'review-agri-service-work-orders',
                  displayName: '审核农服工单',
                  description: '审核、补充、确认或驳回农服工单。',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: AGRI_SERVICE_WORKBENCH_VIEW_KEY,
              displayName: '农服工单工作台',
              description: '农服需求填报、工单审核与处理状态工作台。'
            },
            {
              type: 'tool',
              name: AGRI_SERVICE_MIDDLEWARE_NAME,
              displayName: '农服工单工具',
              description: '保存、查询、补充农服工单的 Assistant 中间件工具。'
            },
            {
              type: 'assistant-template',
              name: 'agri-service-workorder-assistant',
              displayName: '农服工单助手模板',
              description: '预置的农服工单智能填报助手模板。'
            }
          ]
        },
        runtime: {
          middlewareProviders: [AGRI_SERVICE_MIDDLEWARE_NAME],
          viewProviders: [AGRI_SERVICE_PROVIDER_KEY],
          templateProviders: [AGRI_SERVICE_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: AGRI_SERVICE_ICON,
      color: '#3f6212'
    },
    displayName: '农服工单智能填报',
    description: '从自然语言农服需求生成可复核工单，并完成确认、补充与查询闭环。',
    keywords: ['agriculture', 'work-order', 'farm-service', 'view-extension', 'remote-component', 'agent-tool'],
    author: 'Interview Candidate'
  },
  config: {
    schema: ConfigSchema,
    formSchema: AgriServicePluginConfigFormSchema,
    defaults: readAgriServicePluginEnvDefaults()
  },
  templates: AgriServiceTemplates,
  register(ctx) {
    ctx.logger.log('register agri-service-workorder plugin')
    return { module: AgriServicePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('agri-service-workorder plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('agri-service-workorder plugin stopped')
  }
}

export default plugin

import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PLUGIN_NAMESPACE, PROVIDER_KEY, TEMPLATE_KEY, VIEW_KEY } from './lib/constants.js'
import { templates } from './lib/templates.js'
import { TicketTriagePlugin } from './lib/ticket-triage.plugin.js'

const version = z.object({ version: z.string() }).parse(
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
).version

const configSchema = z.object({}).strict()

const displayName = { en_US: 'Ticket triage board', zh_Hans: '工单分诊台' }
const description = {
  en_US: 'Turns a support backlog into reviewed triage proposals: the assistant recommends, a human confirms.',
  zh_Hans: '把客服待办变成经过审核的分诊结论：AI 提建议，人工做确认。'
}

const app: PluginMarketplaceContribution = {
  type: 'app',
  name: PLUGIN_NAME,
  displayName,
  description,
  icon: { type: 'font', value: 'ri-customer-service-2-line' },
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: TEMPLATE_KEY,
    workspace: { mode: 'dedicated', name: displayName, sharing: 'organization' },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: {
        en_US: 'Every ticket gets a decision, and every decision has a name on it.',
        zh_Hans: '每张工单都有结论，每个结论都有人负责。'
      },
      developer: 'ticket-triage',
      features: [
        {
          key: 'backlog',
          title: { en_US: 'Backlog on one board', zh_Hans: '待办集中一块板' },
          description: {
            en_US: 'Pending, proposed, confirmed and failed tickets in one view.',
            zh_Hans: '待处理、已建议、已确认、已失败都在一个视图里。'
          }
        },
        {
          key: 'human_gate',
          title: { en_US: 'AI proposes, human confirms', zh_Hans: 'AI 提建议，人工确认' },
          description: {
            en_US: 'A proposal never closes a ticket on its own.',
            zh_Hans: '建议本身不会关闭工单。'
          }
        },
        {
          key: 'retry',
          title: { en_US: 'Retry after failure', zh_Hans: '失败可重试' },
          description: {
            en_US: 'A rejected or failed triage returns to the queue without duplicating anything.',
            zh_Hans: '被退回或失败的分诊回到队列，不会重复产生业务结果。'
          }
        }
      ],
      dataScope: {
        en_US: 'Tickets are scoped to the tenant, organization, workspace and user of the host.',
        zh_Hans: '工单按宿主所属租户、组织、工作区与用户隔离。'
      },
      initializationSummary: {
        en_US: 'Install the plugin, open the ticket board in the assistant workbench, load the demo tickets, then ask the assistant to triage one.',
        zh_Hans: '安装插件，在助手工作台打开工单分诊板，载入演示工单，然后让助手为其中一张做分诊。'
      }
    },
    entry: { type: 'assistant-chat' }
  }
} as unknown as PluginMarketplaceContribution

const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version,
    level: 'tenant',
    artifactNamespace: PLUGIN_NAMESPACE,
    displayName,
    description,
    author: 'community',
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [FEATURE],
        marketplace: {
          contents: [
            app,
            {
              type: 'assistant-template',
              name: TEMPLATE_KEY,
              displayName: { en_US: 'Support ticket triage', zh_Hans: '客服工单分诊' },
              description
            },
            { type: 'view', name: VIEW_KEY, displayName: { en_US: 'Ticket triage board', zh_Hans: '工单分诊板' } }
          ]
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE_NAME],
          viewProviders: [PROVIDER_KEY],
          templateProviders: ['ticket-triage.templates']
        }
      }
    }
  },
  config: { schema: configSchema },
  templates,
  register() {
    return { module: TicketTriagePlugin, global: true }
  }
}

export default plugin
export { plugin }

import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { TypeOrmModule } from './host-orm.js'
import { XpertTypeEnum, type PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { XpertServerPlugin, type XpertPlugin, type XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  FEATURE,
  ICON,
  MIDDLEWARE,
  packageMetadata,
  PLUGIN_NAME,
  TEMPLATE_KEY,
  TEMPLATE_PROVIDER,
  title,
  VIEW_KEY,
  VIEW_PROVIDER,
} from './constants.js'
import { TriageMiddleware } from './middleware.js'
import { TriageModel } from './model.js'
import { TicketService } from './service.js'
import { FeedbackTicket } from './ticket.entity.js'
import { FeedbackView } from './view.js'

const description = {
  en_US: 'Turn a customer report into an evidence-backed triage proposal for human confirmation.',
  zh_Hans: '把客户原话整理为附原文依据的分诊建议，由客服核对并确认。',
}
const template: XpertTemplateContribution = {
  key: TEMPLATE_KEY,
  name: 'Feedback triage assistant',
  title: '客户反馈分诊助手',
  description: description.zh_Hans,
  category: 'Customer support',
  type: XpertTypeEnum.Agent,
  targetApps: ['xpert'],
  targetAppMeta: {
    xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN_NAME] },
  },
  dslContent: readFileSync(new URL('../templates/feedback-triage.yaml', import.meta.url), 'utf8'),
  startPrompts: ['查看我最近提交的反馈。'],
  providerKey: TEMPLATE_PROVIDER,
  default: false,
}
const app: PluginMarketplaceContribution = {
  name: 'feedback-triage',
  type: 'app',
  displayName: title,
  description,
  icon: ICON,
  appConfig: {
    scope: 'organization',
    assistantTemplateKey: TEMPLATE_KEY,
    workspace: { mode: 'dedicated', name: title, sharing: 'organization' },
    knowledgebases: [],
    modelRequirements: { primary: true },
    entry: { type: 'assistant-chat' },
  },
}
@XpertServerPlugin({
  entities: [FeedbackTicket],
  imports: [TypeOrmModule.forFeature([FeedbackTicket])],
  providers: [TicketService, TriageModel, TriageMiddleware, FeedbackView],
})
class FeedbackTriageModule {}

const plugin: XpertPlugin = {
  meta: {
    name: PLUGIN_NAME,
    version: packageMetadata.version,
    level: packageMetadata.xpert.plugin.level,
    artifactNamespace: packageMetadata.xpert.plugin.artifactNamespace,
    displayName: '客户反馈分诊',
    description: description.en_US,
    author: 'Kang Ningning',
    category: 'middleware',
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'assistant-template', 'workbench-view'],
        capabilities: [FEATURE],
        marketplace: {
          contents: [
            app,
            { name: TEMPLATE_KEY, type: 'assistant-template', displayName: template.title },
            { name: VIEW_KEY, type: 'view', displayName: title },
          ],
        },
        runtime: {
          middlewareProviders: [MIDDLEWARE],
          viewProviders: [VIEW_PROVIDER],
          templateProviders: [TEMPLATE_PROVIDER],
        },
      },
    },
  },
  config: { schema: z.object({}).strict() },
  templates: [template],
  register() {
    return { module: FeedbackTriageModule, global: true }
  },
}
export default plugin

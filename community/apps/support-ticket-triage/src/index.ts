import 'reflect-metadata'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'node:fs'
import { z } from 'zod/v3'
import { feature, middlewareName, pluginName, providerKey, templateKey, templateProvider, viewKey } from './constants.js'
import { SupportTicketTriageMiddleware } from './middleware.js'
import { TicketRecord } from './ticket.entity.js'
import { TicketService } from './ticket.service.js'
import { SupportTicketTriageView } from './view.js'

const { version, xpert } = z.object({
  version: z.string(),
  xpert: z.object({ plugin: z.object({ level: z.literal('tenant'), artifactNamespace: z.string() }) }),
}).parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
const title = { en_US: 'Support Ticket Triage', zh_Hans: '客服工单分诊' }
const description = {
  en_US: 'Summarize and prioritize incoming support tickets for human review.',
  zh_Hans: '为客服来信生成摘要、类别和优先级建议，由客服审核确认。',
}

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([TicketRecord])],
  entities: [TicketRecord],
  providers: [TicketService, SupportTicketTriageMiddleware, SupportTicketTriageView],
})
class SupportTicketTriagePlugin {}

const configSchema = z.object({}).strict()
export const plugin: XpertPlugin<z.infer<typeof configSchema>> = {
  meta: {
    name: pluginName, version, ...xpert.plugin,
    displayName: title.en_US, description: description.en_US, author: 'lumingfei9527',
    category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-app', 'assistant-template', 'workbench-view'], capabilities: [feature],
      marketplace: { contents: [
        { type: 'assistant-template', name: templateKey, displayName: title, description },
        { type: 'view', name: viewKey, displayName: title },
      ] },
      runtime: { middlewareProviders: [middlewareName], viewProviders: [providerKey], templateProviders: [templateProvider] },
    } },
  },
  config: { schema: configSchema },
  templates: [{
    key: templateKey, name: title.en_US, title: title.zh_Hans, description: description.zh_Hans,
    category: 'Customer Support', type: XpertTypeEnum.Agent, targetApps: ['xpert'],
    targetAppMeta: { xpert: {
      types: ['business-assistant'], capabilities: [feature], requiredPlugins: [pluginName],
      defaultConfig: { viewProvider: providerKey },
    } },
    providerKey: templateProvider, order: 20, default: false,
    dslContent: readFileSync(new URL('./assistant.yaml', import.meta.url), 'utf8'),
    startPrompts: ['打开工单分诊工作台，粘贴一封脱敏客服来信。'],
  }],
  register() { return { module: SupportTicketTriagePlugin, global: true } },
}

export default plugin

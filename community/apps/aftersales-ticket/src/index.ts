import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { Ticket } from './ticket.entity.js'
import { TicketService } from './ticket.service.js'
import { TicketView } from './ticket.view.js'
import { TicketMiddleware } from './ticket.middleware.js'
import { templates } from './ticket.templates.js'
import { FEATURE, MIDDLEWARE, PROVIDER, TEMPLATE } from './constants.js'

const metadata = z.object({
  name: z.string(),
  version: z.string(),
  xpert: z.object({
    plugin: z.object({
      level: z.literal('tenant'),
      artifactNamespace: z.literal('aftersales_ticket')
    })
  })
}).parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))

@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([Ticket])],
  entities: [Ticket],
  providers: [TicketService, TicketView, TicketMiddleware]
})
export class AftersalesTicketPlugin {}

const appMeta = {
  types: ['business-app', 'assistant-template', 'workbench-view', 'assistant-tool'],
  capabilities: [FEATURE],
  marketplace: {
    contents: [{ type: 'view', name: PROVIDER, displayName: '售后工单' }]
  },
  runtime: {
    middlewareProviders: [MIDDLEWARE],
    viewProviders: [PROVIDER],
    templateProviders: ['aftersales_ticket.templates']
  }
}

const plugin: XpertPlugin = {
  meta: {
    name: metadata.name,
    version: metadata.version,
    ...metadata.xpert.plugin,
    author: 'Hengw7403-del',
    displayName: '售后工单处理工作台',
    description: '售后工单录入、AI 分析与人工审核',
    targetApps: ['xpert', 'data-xpert'],
    category: 'middleware',
    targetAppMeta: {
      xpert: appMeta,
      'data-xpert': appMeta
    }
  },
  templates,
  config: { schema: z.object({}).strict() },
  register() { return { module: AftersalesTicketPlugin, global: true } }
}

export default plugin

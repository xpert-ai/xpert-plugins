import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { configSchema, FEATURE, key, MIDDLEWARE, NAMESPACE, PROVIDER, VIEW, type Config } from './domain.js'
import { CONTEXT, TriageService } from './service.js'
import { TicketEntity } from './ticket.entity.js'
import { TriageMiddleware } from './middleware.js'
import { TriageView } from './view.js'

const pkg = z.object({ name: z.string(), version: z.string(), xpert: z.object({ plugin: z.object({ level: z.literal('system'), artifactNamespace: z.literal(NAMESPACE) }) }) })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
@XpertServerPlugin({ imports: [TypeOrmModule.forFeature([TicketEntity])], entities: [TicketEntity],
  providers: [TriageService, TriageMiddleware, TriageView], exports: [TriageService] })
export class SupportTriagePlugin {}

const plugin: XpertPlugin<z.input<typeof configSchema>> = {
  meta: {
    name: pkg.name, version: pkg.version, level: pkg.xpert.plugin.level, artifactNamespace: pkg.xpert.plugin.artifactNamespace,
    displayName: 'Support Triage', description: 'Customer support intake, AI triage and human review.', author: 'Community', category: 'middleware', targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['business-app', 'assistant-template', 'workbench-view'], capabilities: [FEATURE],
      runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [PROVIDER], templateProviders: [key('templates')] },
      marketplace: { contents: [{ type: 'view', name: VIEW, displayName: { en_US: 'Support triage', zh_Hans: '工单分诊' } },
        { type: 'assistant-template', name: 'support-triage-assistant', displayName: 'Support Triage Assistant' }] } }
    }
  },
  config: { schema: configSchema, defaults: configSchema.parse({}) },
  templates: [{ key: 'support-triage-assistant', name: 'Support Triage Assistant', title: '客服工单分诊助手',
    description: 'Collect support requests, produce AI triage and review in Workbench.', type: XpertTypeEnum.Agent, category: 'Customer Support', targetApps: ['xpert'],
    targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [pkg.name], defaultConfig: { viewProvider: PROVIDER } } },
    dslContent: readFileSync(new URL('./assistant.yaml', import.meta.url), 'utf8'), startPrompts: ['打开工单分诊工作台，录入一条工单并进行 AI 分诊。'],
    providerKey: key('templates'), default: false }],
  register(context) { return { module: SupportTriagePlugin, global: true, providers: [{ provide: CONTEXT, useValue: context }] } }
}
export default plugin

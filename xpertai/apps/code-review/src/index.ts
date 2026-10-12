import 'reflect-metadata'
import { TypeOrmModule } from '@nestjs/typeorm'
import { configSchema, type Config } from './automation-domain.js'
import { ReviewRepository, ReviewRun, ReviewDelivery } from './automation-entities.js'
import { GitHubApp } from './github-app.js'
import { Repositories } from './repositories.js'
import { Automation, AutomationProcessor } from './automation.js'
import { GitHubWebhook } from './webhook.js'
import { configForm } from './config-form.js'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN, FEATURE, PROVIDER, MIDDLEWARE, NAMESPACE } from './domain.js'
import { Review } from './entity.js'
import { Reviews, CONTEXT } from './backend.js'
import { ReviewView, icon } from './view.js'
import { ReviewMiddleware } from './middleware.js'
import { templates, appContribution } from './templates.js'
const entities = [Review, ReviewRepository, ReviewRun, ReviewDelivery]
@XpertServerPlugin({ imports: [TypeOrmModule.forFeature(entities)], entities, controllers: [GitHubWebhook],
  providers: [Reviews, ReviewView, ReviewMiddleware, GitHubApp, Repositories, Automation, AutomationProcessor] })
export class CodeReviewPlugin {
  constructor(private readonly automation: Automation) {}
  async onPluginBootstrap() { await this.automation.recover() }
}
const plugin: XpertPlugin<Config> = {
  meta: { name: PLUGIN, version: '0.1.0', level: 'system', artifactNamespace: NAMESPACE, author: 'XpertAI',
    displayName: 'Code Review', description: 'Version-aware pull request review with private drafts and confirmed GitHub submission.', icon, category: 'middleware',
    targetApps: ['xpert', 'data-xpert'], targetAppMeta: {
      xpert: { types: ['business-app', 'workbench-view', 'assistant-tool'], capabilities: [FEATURE], runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [PROVIDER], templateProviders: ['code_review.templates'] }, marketplace: { contents: [appContribution] } },
      'data-xpert': { types: ['workbench-view', 'assistant-tool'], capabilities: [FEATURE], runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [PROVIDER] } }
    }
  }, config: { schema: configSchema, formSchema: configForm }, templates,
  register(context) { return { module: CodeReviewPlugin, global: true, providers: [{ provide: CONTEXT, useValue: context }] } }
}
export default plugin

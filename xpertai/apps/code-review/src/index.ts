import 'reflect-metadata'
import { createRequire } from 'node:module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { configSchema, type Config } from './automation-domain.js'
import { ReviewRepository, ReviewRun, ReviewDelivery, ReviewPolicyAudit } from './automation-entities.js'
import { GitHubApp } from './github-app.js'
import { Repositories } from './repositories.js'
import { Automation, AutomationProcessor } from './automation.js'
import { GitHubWebhook } from './webhook.js'
import { configForm } from './config-form.js'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN, FEATURE, PROVIDER, MIDDLEWARE } from './domain.js'
import { Review } from './entity.js'
import { Reviews, CONTEXT } from './backend.js'
import { ReviewWorkbench } from './workbench.js'
import { ReviewView } from './view.js'
import { icon } from './icon.js'
import { ReviewMiddleware } from './middleware.js'
import { templates, appContribution } from './templates.js'
import { ReviewPipelineBinding, ReviewPipelineEvidence, ReviewPipelineDelivery } from './pipeline/entity.js'
import { ReviewPipelineContribution } from './pipeline/configuration.js'
import { ReviewPipelineCatalog } from './pipeline/catalog.js'
import { ReviewPipelineAutomation } from './pipeline/automation.js'
import { ReviewPipelineService } from './pipeline/service.js'
import { ReviewPipelineOperations } from './pipeline/operations.js'
import { reviewPipelineAdapters } from './pipeline/adapters.js'
import { CodeReviewCapability } from './capability.js'
import { ReviewEventSubscription, ReviewEvents } from './event-subscription.js'
import { CodeReviewGitHubTrigger } from './github-trigger.js'
import { WorkflowDiagnosis } from './workflow-entity.js'
import { WorkflowDiagnostics } from './workflow-diagnostics.js'
const packageJson = createRequire(import.meta.url)('../package.json') as {
  version: string
  xpert: {
    plugin: {
      level: NonNullable<XpertPlugin['meta']['level']>
      artifactNamespace: string
    }
  }
}
const entities = [
  ReviewEventSubscription,
  WorkflowDiagnosis,
  Review,
  ReviewRepository,
  ReviewPolicyAudit,
  ReviewRun,
  ReviewDelivery,
  ReviewPipelineBinding,
  ReviewPipelineEvidence,
  ReviewPipelineDelivery
]
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(entities)],
  entities,
  controllers: [GitHubWebhook],
  providers: [
    CodeReviewCapability,
    ReviewEvents,
    CodeReviewGitHubTrigger,
    WorkflowDiagnostics,
    Reviews,
    ReviewView,
    ReviewWorkbench,
    ReviewMiddleware,
    GitHubApp,
    Repositories,
    Automation,
    AutomationProcessor,
    ReviewPipelineContribution,
    ReviewPipelineService,
    ReviewPipelineCatalog,
    ReviewPipelineAutomation,
    ReviewPipelineOperations,
    ...reviewPipelineAdapters
  ]
})
export class CodeReviewPlugin {
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private stopped = false
  constructor(private readonly automation: Automation) {}
  onPluginBootstrap() { this.stopped = false; this.scheduleRecovery() }
  onApplicationBootstrap() { this.scheduleRecovery() }
  onPluginDestroy() { this.stopped = true; clearTimeout(this.recoveryTimer) }
  private scheduleRecovery(delay = 0) {
    if (this.stopped) return
    clearTimeout(this.recoveryTimer)
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      // Plugin bootstrap can precede host CQRS registration. Let host startup finish;
      // re-arm the existing idempotent queue only after live identity resolution succeeds.
      void this.automation.recover().then(recovered => {
        if (recovered === false) this.scheduleRecovery(5000)
      }).catch(() => this.scheduleRecovery(5000))
    }, delay)
    this.recoveryTimer.unref?.()
  }
}

const plugin: XpertPlugin<Config> = {
  meta: {
    name: PLUGIN,
    version: packageJson.version,
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
    author: 'XpertAI',
    displayName: 'Code Review',
    description: 'Version-aware pull request review with private drafts and confirmed GitHub submission.',
    icon,
    category: 'middleware',
    targetApps: ['xpert', 'data-xpert'],
    targetAppMeta: {
      xpert: {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities: [FEATURE],
        runtime: {
          middlewareProviders: [MIDDLEWARE],
          viewProviders: [PROVIDER],
          templateProviders: ['code_review.templates']
        },
        marketplace: { contents: [appContribution] }
      },
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool'],
        capabilities: [FEATURE],
        runtime: { middlewareProviders: [MIDDLEWARE], viewProviders: [PROVIDER] }
      }
    }
  },
  config: { schema: configSchema, formSchema: configForm },
  permissions: [{ type: 'integration', service: 'github', operations: ['read'] }],
  templates,
  register(context) {
    return { module: CodeReviewPlugin, global: true, providers: [{ provide: CONTEXT, useValue: context }] }
  }
}
export default plugin

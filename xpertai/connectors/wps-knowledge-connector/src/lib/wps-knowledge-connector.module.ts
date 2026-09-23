import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { WpsKnowledgeConnectorStrategy } from './wps-knowledge-connector.strategy.js'
import { WpsKnowledgeRuntimeMiddleware } from './wps-knowledge-runtime.middleware.js'
import { WpsKnowledgeService } from './wps-knowledge.service.js'
import { WpsKnowledgeSkillHubClient } from './wps-knowledge-skillhub.client.js'
import { WpsSkillHubAuthClient } from './wps-skillhub-auth.client.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    WpsSkillHubAuthClient,
    WpsKnowledgeSkillHubClient,
    WpsKnowledgeService,
    WpsKnowledgeConnectorStrategy,
    WpsKnowledgeRuntimeMiddleware
  ]
})
export class WpsKnowledgeConnectorPluginModule {}

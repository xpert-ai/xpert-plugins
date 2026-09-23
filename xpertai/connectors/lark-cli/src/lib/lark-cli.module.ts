import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { LarkBootstrapService } from './lark-bootstrap.service.js'
import { LarkConnectorStrategy } from './lark-connector.strategy.js'
import { LarkConnectorRuntimeMiddleware } from './lark-connector-runtime.middleware.js'
import { LarkCLISkillMiddleware } from './lark.middleware.js'
import { LarkSkillValidator } from './lark.validator.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    LarkBootstrapService,
    LarkConnectorStrategy,
    LarkCLISkillMiddleware,
    LarkConnectorRuntimeMiddleware,
    LarkSkillValidator
  ]
})
export class LarkCliPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}

import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { LarkBootstrapService } from './lark-bootstrap.service.js'
import { LarkCLISkillMiddleware } from './lark.middleware.js'
import { LarkSkillValidator } from './lark.validator.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    LarkBootstrapService,
    LarkCLISkillMiddleware,
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

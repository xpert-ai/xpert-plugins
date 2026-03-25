import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { MinerUBootstrapService } from './mineru-bootstrap.service.js'
import { MinerUCLISkillMiddleware } from './mineru.middleware.js'
import { MinerUSkillValidator } from './mineru.validator.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    MinerUBootstrapService,
    MinerUCLISkillMiddleware,
    MinerUSkillValidator
  ]
})
export class MinerUCliPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}

import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ClarificationMiddleware } from './clarification.middleware.js'
import { ClarificationService } from './clarification.service.js'

@XpertServerPlugin({
  imports: [],
  providers: [ClarificationService, ClarificationMiddleware]
})
export class ClarificationPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ClarificationPluginModule.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${ClarificationPluginModule.name} is being destroyed...`)
    }
  }
}

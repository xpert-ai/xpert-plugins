import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { AdvisorMiddleware } from './advisor.middleware.js'

@XpertServerPlugin({
  providers: [AdvisorMiddleware]
})
export class AdvisorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  private logEnabled = true

  onPluginBootstrap(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${AdvisorPluginModule.name} is being bootstrapped...`)
    }
  }

  onPluginDestroy(): void | Promise<void> {
    if (this.logEnabled) {
      console.log(`${AdvisorPluginModule.name} is being destroyed...`)
    }
  }
}

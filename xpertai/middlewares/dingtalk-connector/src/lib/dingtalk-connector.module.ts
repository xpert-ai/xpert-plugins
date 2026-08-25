import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DingTalkConnectorRuntimeMiddleware } from './middlewares/dingtalk-connector-runtime.middleware.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'

@XpertServerPlugin({
  imports: [],
  providers: [DingTalkConnectorStrategy, DingTalkConnectorRuntimeMiddleware]
})
export class DingTalkConnectorPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}

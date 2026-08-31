import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DingTalkDwsAuthClient } from './api/dingtalk-dws-auth.client.js'
import { DingTalkCliBootstrapService } from './middlewares/dingtalk-cli-bootstrap.service.js'
import { DingTalkConnectorRuntimeMiddleware } from './middlewares/dingtalk-connector-runtime.middleware.js'
import { DingTalkConnectorStrategy } from './dingtalk-connector.strategy.js'

@XpertServerPlugin({
  providers: [
    DingTalkDwsAuthClient,
    DingTalkConnectorStrategy,
    DingTalkCliBootstrapService,
    DingTalkConnectorRuntimeMiddleware
  ]
})
export class DingTalkConnectorPluginModule {}

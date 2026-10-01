import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { CtripWendaoClient } from './ctrip-wendao.client.js'
import { CtripWendaoConnectorStrategy } from './ctrip-wendao-connector.strategy.js'
import { CtripWendaoRuntimeMiddleware } from './ctrip-wendao-runtime.middleware.js'

@XpertServerPlugin({
  imports: [],
  providers: [CtripWendaoClient, CtripWendaoConnectorStrategy, CtripWendaoRuntimeMiddleware]
})
export class CtripWendaoConnectorPluginModule {}

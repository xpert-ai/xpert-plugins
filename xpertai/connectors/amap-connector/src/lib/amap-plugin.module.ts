import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { AmapWebServiceClient } from './client/amap-webservice.client.js'
import { AmapConnectorStrategy } from './connector/amap-connector.strategy.js'
import { AmapConnectorRuntimeMiddleware } from './middlewares/amap-connector-runtime.middleware.js'

@XpertServerPlugin({
  imports: [],
  providers: [AmapWebServiceClient, AmapConnectorStrategy, AmapConnectorRuntimeMiddleware],
  exports: [AmapWebServiceClient, AmapConnectorStrategy]
})
export class AmapPluginModule {}

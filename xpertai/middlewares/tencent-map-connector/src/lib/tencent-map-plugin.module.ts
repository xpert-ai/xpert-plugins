import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TencentMapWebServiceClient } from './client/tencent-map-webservice.client.js'
import { TencentMapConnectorStrategy } from './connector/tencent-map-connector.strategy.js'
import { TencentMapConnectorRuntimeMiddleware } from './middlewares/tencent-map-connector-runtime.middleware.js'

@XpertServerPlugin({
  imports: [],
  providers: [TencentMapWebServiceClient, TencentMapConnectorStrategy, TencentMapConnectorRuntimeMiddleware],
  exports: [TencentMapWebServiceClient, TencentMapConnectorStrategy]
})
export class TencentMapPluginModule {}

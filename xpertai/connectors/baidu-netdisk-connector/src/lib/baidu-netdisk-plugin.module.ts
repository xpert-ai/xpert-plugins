import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { BaiduNetdiskClient } from './client/baidu-netdisk.client.js'
import { BaiduNetdiskConnectorStrategy } from './connector/baidu-netdisk-connector.strategy.js'
import { BaiduNetdiskOAuthClient } from './connector/baidu-netdisk-oauth.client.js'
import { BaiduNetdiskRuntimeMiddleware } from './middlewares/baidu-netdisk-runtime.middleware.js'
import { BaiduNetdiskConfigService } from './plugin-config.js'
import { BaiduNetdiskIntegrationStrategy } from './baidu-netdisk-integration.strategy.js'
import { BaiduNetdiskOAuthConfigService } from './connector/baidu-netdisk-oauth-config.service.js'

@XpertServerPlugin({
  imports: [],
  providers: [
    BaiduNetdiskConfigService,
    BaiduNetdiskIntegrationStrategy,
    BaiduNetdiskOAuthConfigService,
    BaiduNetdiskOAuthClient,
    BaiduNetdiskClient,
    BaiduNetdiskConnectorStrategy,
    BaiduNetdiskRuntimeMiddleware
  ],
  exports: [BaiduNetdiskClient, BaiduNetdiskConnectorStrategy]
})
export class BaiduNetdiskPluginModule {}

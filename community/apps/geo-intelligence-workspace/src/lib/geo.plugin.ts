import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { GeoEngineClient } from './geo.service'
import { GeoMiddleware } from './geo.middleware'
import { GeoViewProvider } from './geo-view.provider'

@XpertServerPlugin({
  providers: [GeoEngineClient, GeoMiddleware, GeoViewProvider],
  exports: [GeoEngineClient]
})
export class GeoPlugin {}

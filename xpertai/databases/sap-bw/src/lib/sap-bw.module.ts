import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { SapBwDataSourceStrategy } from './sap-bw.strategy.js'

@XpertServerPlugin({
  providers: [SapBwDataSourceStrategy]
})
export class SapBwPlugin {}

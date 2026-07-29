import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { KingbaseDataSourceStrategy } from './kingbase.strategy.js'

@XpertServerPlugin({
  providers: [KingbaseDataSourceStrategy]
})
export class KingbasePlugin {}

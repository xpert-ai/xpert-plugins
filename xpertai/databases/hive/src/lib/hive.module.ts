import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { HiveDataSourceStrategy } from './hive.strategy.js'

@XpertServerPlugin({
  providers: [HiveDataSourceStrategy]
})
export class HivePlugin {}

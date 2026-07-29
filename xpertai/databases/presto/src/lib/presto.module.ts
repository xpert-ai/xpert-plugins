import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PrestoDataSourceStrategy } from './presto.strategy.js'

@XpertServerPlugin({
  providers: [PrestoDataSourceStrategy]
})
export class PrestoPlugin {}

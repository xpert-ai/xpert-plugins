import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TrinoDataSourceStrategy } from './trino.strategy.js'

@XpertServerPlugin({
  providers: [TrinoDataSourceStrategy]
})
export class TrinoPlugin {}

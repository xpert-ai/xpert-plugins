import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PostgresDataSourceStrategy } from './postgres.strategy.js'

@XpertServerPlugin({
  providers: [PostgresDataSourceStrategy]
})
export class PostgresPlugin {}

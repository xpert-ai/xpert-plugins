import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { ClickHouseDataSourceStrategy } from './clickhouse.strategy.js'

@XpertServerPlugin({
  providers: [ClickHouseDataSourceStrategy]
})
export class ClickHousePlugin {}

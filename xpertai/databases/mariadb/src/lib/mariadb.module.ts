import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { MariaDbDataSourceStrategy } from './mariadb.strategy.js'

@XpertServerPlugin({
  providers: [MariaDbDataSourceStrategy]
})
export class MariaDbPlugin {}

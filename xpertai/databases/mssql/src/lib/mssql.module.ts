import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { MssqlDataSourceStrategy } from './mssql.strategy.js'

@XpertServerPlugin({
  providers: [MssqlDataSourceStrategy]
})
export class MssqlPlugin {}

import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { RedshiftDataSourceStrategy } from './redshift.strategy.js'

@XpertServerPlugin({
  providers: [RedshiftDataSourceStrategy]
})
export class RedshiftPlugin {}

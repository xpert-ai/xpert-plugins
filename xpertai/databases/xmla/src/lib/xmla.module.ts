import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { XmlaDataSourceStrategy } from './xmla.strategy.js'

@XpertServerPlugin({
  providers: [XmlaDataSourceStrategy]
})
export class XmlaPlugin {}

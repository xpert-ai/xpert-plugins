import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { KlingVideoStrategy } from './strategy.js'

@XpertServerPlugin({ providers: [KlingVideoStrategy] })
export class KlingPluginModule {}

import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { KlingVideoStrategy } from './strategy.js'
import { KlingProviderStrategy } from './provider.strategy.js'
import { KlingVideoGenerationModel } from './model.js'
import { KlingVideoJobProcessor } from './job.js'

@XpertServerPlugin({
  providers: [KlingProviderStrategy, KlingVideoGenerationModel, KlingVideoStrategy, KlingVideoJobProcessor]
})
export class KlingPluginModule {}

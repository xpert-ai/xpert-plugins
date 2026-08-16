import { ConfigModule } from '@nestjs/config'
import {
  IOnPluginBootstrap,
  IOnPluginDestroy,
  XpertServerPlugin
} from '@xpert-ai/plugin-sdk'
import { VeoStrategy } from './strategy.js'
import { VeoProviderStrategy } from './provider.strategy.js'
import { VeoVideoGenerationModel } from './model.js'
import { VeoVideoJobProcessor } from './job.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [VeoProviderStrategy, VeoVideoGenerationModel, VeoStrategy, VeoVideoJobProcessor]
})
export class VeoPluginModule
  implements IOnPluginBootstrap, IOnPluginDestroy
{
  onPluginBootstrap(): void {
    console.log('VeoPluginModule is being bootstrapped...')
  }

  onPluginDestroy(): void {
    console.log('VeoPluginModule is being destroyed...')
  }
}

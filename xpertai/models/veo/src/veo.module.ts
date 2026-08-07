import { ConfigModule } from '@nestjs/config'
import {
  IOnPluginBootstrap,
  IOnPluginDestroy,
  XpertServerPlugin
} from '@xpert-ai/plugin-sdk'
import { VeoStrategy } from './strategy.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [VeoStrategy]
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

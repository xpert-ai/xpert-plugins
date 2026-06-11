import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { XpertAIBrowserLabToolsetStrategy } from './browser-toolset.strategy'

@XpertServerPlugin({
  providers: [XpertAIBrowserLabToolsetStrategy]
})
export class XpertAIBrowserLabPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${XpertAIBrowserLabPlugin.name} bootstrapped`)
  }

  onPluginDestroy(): void {
    console.log(`${XpertAIBrowserLabPlugin.name} destroyed`)
  }
}

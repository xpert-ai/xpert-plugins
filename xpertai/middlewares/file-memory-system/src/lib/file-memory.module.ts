import { IOnPluginBootstrap, IOnPluginDestroy, XpertServerPlugin } from '@xpert-ai/plugin-sdk'

@XpertServerPlugin({
  imports: [],
  providers: []
})
export class FileMemoryPluginModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void | Promise<void> {
    return undefined
  }

  onPluginDestroy(): void | Promise<void> {
    return undefined
  }
}

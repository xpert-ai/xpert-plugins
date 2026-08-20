import { ConfigModule } from '@nestjs/config'
import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from './provider.strategy.js'
import { XirangLargeLanguageModel } from './llm/llm.js'
import { XirangTextEmbeddingModel } from './text-embedding/text-embedding.js'
import { XirangRerankModel } from './rerank/rerank.js'
import { XirangImageGenerationModel } from './image/image.js'

@XpertServerPlugin({
  imports: [ConfigModule],
  providers: [
    XirangProviderStrategy,
    XirangLargeLanguageModel,
    XirangTextEmbeddingModel,
    XirangRerankModel,
    XirangImageGenerationModel
  ]
})
export class XirangModule implements IOnPluginBootstrap, IOnPluginDestroy {
  onPluginBootstrap(): void {
    console.log(`${XirangModule.name} is being bootstrapped...`)
  }

  onPluginDestroy(): void {
    console.log(`${XirangModule.name} is being destroyed...`)
  }
}


import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from './tongyi.js'
import { TongyiLargeLanguageModel } from './llm/llm.js'
import { TongyiRerankModel } from './rerank/index.js'
import { TongyiSpeech2TextModel } from './speech2text/speech2text.js'
import { TongyiTextEmbeddingModel } from './text-embedding/text-embedding.js'
import { TongyiTTSModel } from './tts/tts.js'


@XpertServerPlugin({
  imports: [],
  providers: [TongyiProviderStrategy, TongyiLargeLanguageModel, TongyiRerankModel, TongyiSpeech2TextModel, TongyiTextEmbeddingModel, TongyiTTSModel],
})
export class TongyiProviderModule {}

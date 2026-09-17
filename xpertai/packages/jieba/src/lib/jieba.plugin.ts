import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { JiebaKeywordAnalyzer } from './jieba.strategy.js'

@XpertServerPlugin({
  providers: [JiebaKeywordAnalyzer],
  exports: [JiebaKeywordAnalyzer]
})
export class JiebaPlugin {}

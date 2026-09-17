import { Injectable } from '@nestjs/common'
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict.js'
import { KeywordAnalyzerStrategy } from '@xpert-ai/plugin-sdk'
import type { IKeywordAnalyzerStrategy } from '@xpert-ai/plugin-sdk'

@Injectable()
@KeywordAnalyzerStrategy('jieba')
export class JiebaKeywordAnalyzer implements IKeywordAnalyzerStrategy {
  readonly meta = {
    id: 'jieba',
    label: 'Jieba',
    languages: ['zh', 'en'],
    revision: 'jieba-2.0.3-default-search-nfkc-v1'
  }
  private readonly jieba = Jieba.withDict(dict)

  readonly analyze: IKeywordAnalyzerStrategy['analyze'] = async (text) => {
    return this.jieba
      .cutForSearch(text.normalize('NFKC').toLowerCase(), false)
      .filter((term) => /[\p{L}\p{N}]/u.test(term))
  }
}

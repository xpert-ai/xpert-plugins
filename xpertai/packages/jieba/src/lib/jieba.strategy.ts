import { Injectable } from '@nestjs/common'
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict.js'
import { KeywordAnalyzerStrategy } from './keyword-analyzer.sdk.mock.js'
import type { IKeywordAnalyzerStrategy } from './keyword-analyzer.sdk.mock.js'

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

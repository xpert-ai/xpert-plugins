// Temporary copy of the pending SDK contract. Replace with SDK imports before publication.
import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '@xpert-ai/plugin-sdk'

export interface IKeywordAnalyzerStrategy {
  readonly meta: {
    id: string
    label: string
    languages: string[]
    /** Change whenever index/query compatibility changes, including dictionary updates. */
    revision: string
  }

  analyze(text: string, purpose: 'index' | 'query'): Promise<readonly string[]>
}

export const KEYWORD_ANALYZER_STRATEGY = 'KEYWORD_ANALYZER_STRATEGY'
export const KeywordAnalyzerStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(KEYWORD_ANALYZER_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, KEYWORD_ANALYZER_STRATEGY)
  )

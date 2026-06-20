import { Document } from '@langchain/core/documents'
import { TongyiRerank } from './rerank.js'

describe('TongyiRerank', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('uses the configured base URL and filters by scoreThreshold only when provided', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output: {
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.2 }
          ]
        }
      })
    } as Response)

    const reranker = new TongyiRerank({
      apiKey: 'test-key',
      model: 'gte-rerank-v2',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1'
    })

    const results = await reranker.rerank(
      [
        new Document({ pageContent: 'first' }),
        new Document({ pageContent: 'second' })
      ],
      'query',
      { topN: 2, scoreThreshold: 0.5 }
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://dashscope-intl.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank'
    )
    expect(results).toEqual([{ index: 0, relevanceScore: 0.9 }])
  })

  it('does not filter rerank results when scoreThreshold is omitted', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output: {
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.2 }
          ]
        }
      })
    } as Response)

    const reranker = new TongyiRerank({
      apiKey: 'test-key',
      model: 'gte-rerank-v2'
    })

    await expect(
      reranker.rerank(
        [
          new Document({ pageContent: 'first' }),
          new Document({ pageContent: 'second' })
        ],
        'query',
        { topN: 2 }
      )
    ).resolves.toEqual([
      { index: 0, relevanceScore: 0.9 },
      { index: 1, relevanceScore: 0.2 }
    ])
  })
})

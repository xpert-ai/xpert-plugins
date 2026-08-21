import { buildRerankBody, getRerankModelId, getRerankRequest, mapRerankResults } from './protocol.js'

describe('Xirang Rerank protocol selection', () => {
  it('uses the official route and Bearer provider AppKey by default', () => {
    expect(getRerankRequest({ app_key: 'qwen-key' })).toEqual({
      path: '/rerank',
      authorization: 'Bearer qwen-key',
      official: true
    })
  })

  it('corrects the former raw-AppKey setting for the official endpoint', () => {
    expect(getRerankRequest({ app_key: 'app-key', rerank_auth_scheme: 'raw' })).toEqual({
      path: '/rerank',
      authorization: 'Bearer app-key',
      official: true
    })
  })

  it('allows an explicit path, auth scheme, and separate key', () => {
    expect(getRerankRequest({
      app_key: 'provider-key',
      rerank_path: 'reranks',
      rerank_auth_scheme: 'bearer',
      rerank_api_key: 'rerank-key'
    })).toEqual({
      path: '/reranks',
      authorization: 'Bearer rerank-key',
      official: false
    })
  })

  it('allows raw authorization only for an explicit custom gateway', () => {
    expect(getRerankRequest({
      app_key: 'custom-key',
      endpoint_url: 'https://gateway.example.com/v1',
      rerank_auth_scheme: 'raw'
    })).toEqual({
      path: '/rerank',
      authorization: 'custom-key',
      official: false
    })
  })

  it('requires the Tianyi model ID for the official endpoint', () => {
    expect(() => getRerankModelId('qwen3-rerank', { app_key: 'app-key' }))
      .toThrow('天翼云模型详情页顶部的模型 ID')
    expect(getRerankModelId('qwen3-rerank', {
      app_key: 'app-key',
      endpoint_model_name: 'model-id-123'
    })).toBe('model-id-123')
  })

  it('uses the display model name for a custom compatible endpoint', () => {
    expect(getRerankModelId('qwen3-rerank', {
      app_key: 'app-key',
      rerank_path: '/reranks'
    })).toBe('qwen3-rerank')
  })

  it('builds the official Tianyi body and preserves relevance scores', () => {
    expect(buildRerankBody(
      'model-id-123',
      '什么是人工智能',
      ['人工智能正在快速发展。', '量子计算是计算科学的前沿领域。'],
      1,
      { app_key: 'app-key', rerank_instruct: 'must not be sent' },
      { official: true }
    )).toEqual({
      model: 'model-id-123',
      query: '什么是人工智能',
      documents: [
        '人工智能正在快速发展。',
        '量子计算是计算科学的前沿领域。'
      ],
      top_n: 1,
      return_documents: false
    })
    expect(mapRerankResults([
      { index: 0, relevance_score: 0.992597 }
    ], undefined, 1)).toEqual([{ index: 0, relevanceScore: 0.992597 }])
  })

  it('keeps the customer-compatible /reranks request shape explicit', () => {
    expect(buildRerankBody(
      'qwen3-rerank',
      '查询',
      ['文档一', '文档二'],
      1,
      {
        app_key: 'provider-key',
        rerank_instruct: 'Retrieve relevant passages.'
      },
      { official: false }
    )).toEqual({
      model: 'qwen3-rerank',
      query: '查询',
      documents: ['文档一', '文档二'],
      top_n: 1,
      instruct: 'Retrieve relevant passages.'
    })
  })
})

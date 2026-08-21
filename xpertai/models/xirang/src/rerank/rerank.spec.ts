import { buildRerankBody, extractRerankResults, getRerankModelId, getRerankRequest, mapRerankResults } from './protocol.js'

describe('Xirang Rerank protocol selection', () => {
  it('selects the BGE official route and model ID automatically', () => {
    expect(getRerankRequest({ app_key: 'bge-key' }, 'BGE-Reranker-Large')).toEqual({
      path: '/rerank',
      authorization: 'Bearer bge-key',
      official: true,
      protocol: 'flat'
    })
    expect(getRerankModelId('BGE-Reranker-Large', { app_key: 'bge-key' }))
      .toBe('0cb4c1ed8f374eadbe8bffe30bd039dc')
  })

  it('corrects the former raw-AppKey setting for the official endpoint', () => {
    expect(getRerankRequest({ app_key: 'app-key', rerank_auth_scheme: 'raw' }, 'BGE-Reranker-V2-m3')).toEqual({
      path: '/rerank',
      authorization: 'Bearer app-key',
      official: true,
      protocol: 'flat'
    })
  })

  it('selects the Qwen endpoint and model ID automatically', () => {
    expect(getRerankRequest({ app_key: 'qwen-key' }, 'qwen3-rerank')).toEqual({
      path: '/reranks',
      authorization: 'Bearer qwen-key',
      official: true,
      protocol: 'flat'
    })
    expect(getRerankModelId('qwen3-rerank', { app_key: 'qwen-key' }))
      .toBe('a18944d8204c4e969cd4635c28af56e5')
  })

  it('selects the GTE nested endpoint and model ID automatically', () => {
    expect(getRerankRequest({ app_key: 'gte-key' }, 'gte-rerank-v2')).toEqual({
      path: '/services/rerank/text-rerank/text-rerank',
      authorization: 'Bearer gte-key',
      official: true,
      protocol: 'nested'
    })
    expect(getRerankModelId('gte-rerank-v2', { app_key: 'gte-key' }))
      .toBe('c5f2125a07474e31b6926e184ea8627e')
  })

  it('allows an explicit path, auth scheme, and separate key for custom gateways', () => {
    expect(getRerankRequest({
      app_key: 'provider-key',
      endpoint_url: 'https://gateway.example.com/v1',
      rerank_path: 'reranks',
      rerank_auth_scheme: 'bearer',
      rerank_api_key: 'rerank-key'
    }, 'qwen3-rerank')).toEqual({
      path: '/reranks',
      authorization: 'Bearer rerank-key',
      official: false,
      protocol: 'flat'
    })
  })

  it('allows raw authorization only for an explicit custom gateway', () => {
    expect(getRerankRequest({
      app_key: 'custom-key',
      endpoint_url: 'https://gateway.example.com/v1',
      rerank_auth_scheme: 'raw'
    }, 'custom-rerank')).toEqual({
      path: '/rerank',
      authorization: 'custom-key',
      official: false,
      protocol: 'flat'
    })
  })

  it('requires the Tianyi model ID for the official endpoint', () => {
    expect(() => getRerankModelId('unknown-rerank', { app_key: 'app-key' }))
      .toThrow('天翼云模型详情页顶部的模型 ID')
    expect(getRerankModelId('unknown-rerank', {
      app_key: 'app-key',
      endpoint_model_name: 'model-id-123'
    })).toBe('model-id-123')
  })

  it('uses the display model name for a custom compatible endpoint', () => {
    expect(getRerankModelId('qwen3-rerank', {
      app_key: 'app-key',
      endpoint_url: 'https://gateway.example.com/v1',
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
      { official: true, protocol: 'flat' }
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

  it('builds the GTE nested body and reads output.results', () => {
    expect(buildRerankBody(
      'c5f2125a07474e31b6926e184ea8627e',
      '查询',
      ['文档一', '文档二'],
      2,
      { app_key: 'gte-key', rerank_instruct: 'ignored' },
      { official: true, protocol: 'nested' }
    )).toEqual({
      model: 'c5f2125a07474e31b6926e184ea8627e',
      input: { query: '查询', documents: ['文档一', '文档二'] },
      parameters: { return_documents: false, top_n: 2 }
    })
    expect(extractRerankResults({ output: { results: [{ index: 1, relevance_score: 0.9 }] } }))
      .toEqual([{ index: 1, relevance_score: 0.9 }])
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
      { official: false, protocol: 'flat' }
    )).toEqual({
      model: 'qwen3-rerank',
      query: '查询',
      documents: ['文档一', '文档二'],
      top_n: 1,
      instruct: 'Retrieve relevant passages.'
    })
  })
})

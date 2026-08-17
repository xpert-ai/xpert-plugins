import { XpertQuotationKnowledgebaseAdapter } from './xpert-quotation-knowledgebase.adapter.js'

describe('XpertQuotationKnowledgebaseAdapter', () => {
  const adapter = new XpertQuotationKnowledgebaseAdapter()

  it('searches each connected knowledgebase without private metadata filters and restores provenance', async () => {
    const search = jest.fn(async ({ knowledgebaseIds }: { knowledgebaseIds: string[] }) => [{
      id: `chunk-${knowledgebaseIds[0]}`,
      pageContent: `content from ${knowledgebaseIds[0]}`,
      metadata: { chunkId: `chunk-${knowledgebaseIds[0]}`, score: knowledgebaseIds[0] === 'kb-2' ? 0.95 : 0.8 }
    }])

    const result = await adapter.searchConnected({
      scope: { tenantId: 'tenant-1', organizationId: 'org-1' },
      knowledgebase: { search } as never,
      knowledgebaseIds: ['kb-1', 'kb-2', 'kb-1'],
      query: '墙面乳胶漆',
      topK: 5,
      source: 'test',
      requestId: 'request-1'
    })

    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenNthCalledWith(1, expect.objectContaining({
      knowledgebaseIds: ['kb-1'],
      query: '墙面乳胶漆',
      retrieval: { mode: 'hybrid' }
    }))
    expect(search.mock.calls[0][0]).not.toHaveProperty('filter')
    expect(result.documents.map((document) => document.metadata?.knowledgebaseId)).toEqual(['kb-2', 'kb-1'])
    expect(result.failedKnowledgebaseIds).toEqual([])
  })

  it('returns successful results when one connected knowledgebase fails', async () => {
    const search = jest.fn(async ({ knowledgebaseIds }: { knowledgebaseIds: string[] }) => {
      if (knowledgebaseIds[0] === 'kb-failed') throw new Error('unavailable')
      return [{ id: 'chunk-1', pageContent: '可用证据', metadata: { score: 0.8 } }]
    })

    const result = await adapter.searchConnected({
      scope: {},
      knowledgebase: { search } as never,
      knowledgebaseIds: ['kb-failed', 'kb-ready'],
      query: '定额',
      topK: 5,
      source: 'test',
      requestId: 'request-2'
    })

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].metadata?.knowledgebaseId).toBe('kb-ready')
    expect(result.failedKnowledgebaseIds).toEqual(['kb-failed'])
  })

  it('supports a bounded deep vector search for long price books', async () => {
    const search = jest.fn(async () => [])
    await adapter.searchConnected({
      scope: {}, knowledgebase: { search } as never, knowledgebaseIds: ['kb-price'],
      query: '建筑、装饰工程普工 日工资', topK: 80, retrievalMode: 'vector',
      source: 'price-deep', requestId: 'request-deep'
    })
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      k: 80,
      retrieval: { mode: 'vector' }
    }))
  })

  it('routes consumption and price searches to different connected knowledgebases by platform name', async () => {
    const list = jest.fn().mockResolvedValue([
      { id: 'kb-consumption', name: '江苏消耗量定额库' },
      { id: 'kb-price', name: '南京价格库' }
    ])
    const search = jest.fn(async ({ knowledgebaseIds }: { knowledgebaseIds: string[] }) => [{
      pageContent: knowledgebaseIds[0],
      metadata: { score: 1 }
    }])
    const knowledgebase = { list, search } as never

    const consumption = await adapter.searchConnected({
      scope: { workspaceId: 'workspace-1' }, knowledgebase,
      knowledgebaseIds: ['kb-consumption', 'kb-price'], role: 'consumption',
      query: '平整场地', topK: 5, source: 'consumption-test', requestId: 'request-consumption'
    })
    const price = await adapter.searchConnected({
      scope: { workspaceId: 'workspace-1' }, knowledgebase,
      knowledgebaseIds: ['kb-consumption', 'kb-price'], role: 'price',
      query: '普工 工日', topK: 5, source: 'price-test', requestId: 'request-price'
    })

    expect(list).toHaveBeenCalledWith({ workspaceId: 'workspace-1', limit: 100 })
    expect(consumption.knowledgebaseIds).toEqual(['kb-consumption'])
    expect(price.knowledgebaseIds).toEqual(['kb-price'])
    expect(search.mock.calls.map(([input]) => input.knowledgebaseIds)).toEqual([
      ['kb-consumption'],
      ['kb-price']
    ])
  })

  it('rejects ambiguous multi-knowledgebase routing instead of searching every connected library', async () => {
    const search = jest.fn()
    await expect(adapter.searchConnected({
      scope: {},
      knowledgebase: {
        list: jest.fn().mockResolvedValue([
          { id: 'kb-a', name: '工程资料' },
          { id: 'kb-b', name: '项目资料' }
        ]),
        search
      } as never,
      knowledgebaseIds: ['kb-a', 'kb-b'], role: 'price', query: '普工 工日', topK: 5,
      source: 'price-test', requestId: 'request-unrouted'
    })).rejects.toThrow('没有可识别的价格知识库')
    expect(search).not.toHaveBeenCalled()
  })

  it('requires an Agent-connected knowledgebase and the runtime capability', async () => {
    await expect(adapter.searchConnected({
      scope: {}, knowledgebase: { search: jest.fn() } as never, knowledgebaseIds: [], query: '定额', topK: 5,
      source: 'test', requestId: 'request-3'
    })).rejects.toThrow('not connected')

    await expect(adapter.searchConnected({
      scope: {}, knowledgebase: null, knowledgebaseIds: ['kb-1'], query: '定额', topK: 5,
      source: 'test', requestId: 'request-4'
    })).rejects.toThrow('runtime capability is unavailable')
  })
})

jest.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: class MilvusClient {},
  DataType: { JSON: 'JSON' },
  ErrorCode: { SUCCESS: 'Success' }
}))

import { Milvus } from './index.js'

describe('Milvus Knowledge Filter V2', () => {
  it('rejects Milvus servers older than 2.6.2', async () => {
    const store = createStore({ getVersion: jest.fn().mockResolvedValue({ version: '2.6.1' }) })
    await expect(store.assertFilterV2Capabilities()).rejects.toThrow('>= 2.6.2')
  })

  it('idempotently creates the JSON flat index and schema-driven array indexes', async () => {
    const indexDescriptions: Array<{ index_name: string }> = []
    const createIndex = jest.fn(async (input) => {
      indexDescriptions.push({ index_name: input.index_name })
      return success()
    })
    const store = createStore({
      getVersion: jest.fn().mockResolvedValue({ version: '2.6.2' }),
      hasCollection: jest.fn().mockResolvedValue({ value: true, status: success() }),
      describeCollection: jest.fn().mockResolvedValue({
        schema: { fields: [{ name: 'filterAttributes' }] }
      }),
      describeIndex: jest.fn().mockImplementation(async () => ({
        status: success(),
        index_descriptions: [...indexDescriptions]
      })),
      createIndex
    })

    const indexes = [
      { path: 'filterAttributes["metadata"]["tags"]', type: 'string[]' as const },
      { path: 'filterAttributes["chunkMetadata"]["scores"]', type: 'number[]' as const }
    ]
    await store.ensureFilterV2Schema(indexes)
    await store.ensureFilterV2Schema(indexes)

    expect(createIndex).toHaveBeenCalledTimes(3)
    expect(createIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        field_name: 'filterAttributes',
        extra_params: expect.objectContaining({ index_type: 'INVERTED' })
      })
    )
    const calls = createIndex.mock.calls.map(([input]) => JSON.parse(input.extra_params.params))
    expect(calls).toContainEqual({
      json_path: 'filterAttributes["metadata"]["tags"]',
      json_cast_type: 'ARRAY_VARCHAR'
    })
    expect(calls).toContainEqual({
      json_path: 'filterAttributes["chunkMetadata"]["scores"]',
      json_cast_type: 'ARRAY_DOUBLE'
    })
  })

  it('uses partial_update and resolves physical primary keys from stable chunk IDs', async () => {
    const upsert = jest.fn().mockResolvedValue({ status: success() })
    const store = createStore({
      getVersion: jest.fn().mockResolvedValue({ version: '2.6.17' }),
      hasCollection: jest.fn().mockResolvedValue({ value: true, status: success() }),
      describeCollection: jest.fn().mockResolvedValue({
        schema: { fields: [{ name: 'filterAttributes' }] }
      }),
      describeIndex: jest.fn().mockResolvedValue({
        status: success(),
        index_descriptions: [{ index_name: 'filterAttributes_flat' }]
      }),
      loadCollectionSync: jest.fn(),
      query: jest.fn().mockResolvedValue({
        status: success(),
        data: [
          { langchain_primaryid: 'physical-1', chunkId: 'chunk-1' },
          { langchain_primaryid: 'physical-2', chunkId: 'chunk-2' }
        ]
      }),
      upsert,
      flushSync: jest.fn()
    })

    const count = await store.partialUpdateFilterAttributes([
      { chunkId: 'chunk-1', filterAttributes: { metadata: { domain: '水利' } } },
      { chunkId: 'chunk-2', filterAttributes: { metadata: { domain: '物流' } } }
    ])

    expect(count).toBe(2)
    expect(upsert).toHaveBeenCalledWith({
      collection_name: 'test_collection',
      partial_update: true,
      data: [
        { langchain_primaryid: 'physical-1', filterAttributes: { metadata: { domain: '水利' } } },
        { langchain_primaryid: 'physical-2', filterAttributes: { metadata: { domain: '物流' } } }
      ]
    })
  })

  it('rejects array index paths outside the registered filter attribute scopes', async () => {
    const store = createStore({
      getVersion: jest.fn().mockResolvedValue({ version: '2.6.17' }),
      hasCollection: jest.fn().mockResolvedValue({ value: true, status: success() }),
      describeCollection: jest.fn().mockResolvedValue({ schema: { fields: [{ name: 'filterAttributes' }] } }),
      describeIndex: jest.fn().mockResolvedValue({ status: success(), index_descriptions: [] }),
      createIndex: jest.fn().mockResolvedValue(success())
    })

    await expect(store.ensureFilterV2Schema([{ path: 'other["metadata"]["tags"]', type: 'string[]' }])).rejects.toThrow(
      'Invalid Knowledge Filter V2 JSON path'
    )
  })
})

function createStore(client: Record<string, jest.Mock>) {
  const store = new Milvus({} as any, {
    collectionName: 'test_collection',
    url: 'http://127.0.0.1:19530',
    autoId: false
  })
  store.client = client as any
  return store
}

function success() {
  return { error_code: 'Success', reason: '' }
}

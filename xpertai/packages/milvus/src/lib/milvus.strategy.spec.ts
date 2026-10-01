jest.mock('@xpert-ai/plugin-sdk', () => ({ VectorStoreStrategy: () => () => undefined }))

import { ConfigService } from '@nestjs/config'
import { Milvus } from './milvus/index.js'
import { MilvusStrategy } from './milvus.strategy.js'

const mockConnect = jest.fn(() => Promise.resolve())

jest.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: class {
    connectPromise = mockConnect()
    getVersion = jest.fn().mockResolvedValue({ version: '2.6.2' })
    hasCollection = jest.fn().mockResolvedValue({ value: true, status: { error_code: 'Success' } })
    loadCollectionSync = jest.fn().mockResolvedValue({ error_code: 'Success' })
    deleteEntities = jest.fn().mockResolvedValue({ status: { error_code: 'Success' } })
    delete = jest.fn().mockResolvedValue({ status: { error_code: 'Success' } })
  },
  DataType: { JSON: 'JSON' },
  ErrorCode: { SUCCESS: 'Success' }
}))

async function createStore() {
  const strategy = new MilvusStrategy(new ConfigService({ MILVUS_URI: 'localhost:19531' }))
  const store = await strategy.createStore({ embedQuery: jest.fn(), embedDocuments: jest.fn() }, { collectionName: 'test' })
  if (!(store instanceof Milvus)) throw new Error('Expected Milvus store')
  return store
}

describe('Milvus deletion readiness', () => {
  it('rejects connection failures through createStore', async () => {
    mockConnect.mockImplementationOnce(() => Promise.reject(new Error('connection unavailable')))
    await expect(createStore()).rejects.toThrow('connection unavailable')
  })

  it('loads the collection before deleting by metadata', async () => {
    const store = await createStore()
    await store.delete({ filter: 'documentId == "test"' })
    const loaded = jest.mocked(store.client.loadCollectionSync)
    const deleted = jest.mocked(store.client.deleteEntities)
    expect(loaded).toHaveBeenCalledWith({ collection_name: '_test' })
    expect(loaded.mock.invocationCallOrder[0]).toBeLessThan(deleted.mock.invocationCallOrder[0])
  })

  it('loads the collection before deleting by IDs', async () => {
    const store = await createStore()
    await store.delete({ ids: ['chunk-1'] })
    expect(store.client.loadCollectionSync).toHaveBeenCalled()
    expect(store.client.delete).toHaveBeenCalledWith({ collection_name: '_test', ids: ['chunk-1'] })
  })

  it('treats a missing collection as already empty', async () => {
    const store = await createStore()
    jest.mocked(store.client.hasCollection).mockResolvedValueOnce({ value: false, status: { error_code: 'Success', reason: '' } })
    await expect(store.delete({ ids: ['chunk-1'] })).resolves.toBeUndefined()
    expect(store.client.loadCollectionSync).not.toHaveBeenCalled()
    expect(store.client.delete).not.toHaveBeenCalled()
  })

  it('propagates load failure without deleting', async () => {
    const store = await createStore()
    jest.mocked(store.client.loadCollectionSync).mockRejectedValueOnce(new Error('unavailable'))
    await expect(store.delete({ ids: ['chunk-1'] })).rejects.toThrow('unavailable')
    expect(store.client.delete).not.toHaveBeenCalled()
  })
})

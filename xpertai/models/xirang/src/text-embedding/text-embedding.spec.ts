import { AiModelTypeEnum, defaultModelConfiguration } from '@xpert-ai/contracts'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { XirangTextEmbeddingModel } from './text-embedding.js'

describe('imported Xirang embedding configuration', () => {
  it('uses edited dimensions, batch size and client concurrency', () => {
    const manager = new XirangTextEmbeddingModel(new XirangProviderStrategy())
    const embedding = manager.getEmbeddingInstance({ model: 'text-embedding-v4', copilot: { modelProvider: { credentials: { app_key: 'key' } } } }, {
      modelProperties: { model_configuration: {
        ...defaultModelConfiguration(AiModelTypeEnum.TEXT_EMBEDDING), dimensions: 1024, batchSize: 8, maxConcurrency: 3
      } }
    })
    expect(embedding.dimensions).toBe(1024)
    expect(embedding.batchSize).toBe(8)
    expect(embedding.caller.maxConcurrency).toBe(3)
  })
})

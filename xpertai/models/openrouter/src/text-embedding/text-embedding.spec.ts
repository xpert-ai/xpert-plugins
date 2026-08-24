jest.mock('@langchain/openai', () => {
  const actual = jest.requireActual('@langchain/openai')
  return {
    ...actual,
    OpenAIEmbeddings: jest.fn().mockImplementation((fields) => ({
      fields,
      embedQuery: jest.fn().mockResolvedValue([0.1, 0.2])
    }))
  }
})

import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { OpenAIEmbeddings } from '@langchain/openai'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { OpenRouterTextEmbeddingModel } from './text-embedding.js'

const mockedOpenAIEmbeddings = OpenAIEmbeddings as jest.Mock

describe('OpenRouterTextEmbeddingModel', () => {
  let embeddings: OpenRouterTextEmbeddingModel

  beforeEach(() => {
    mockedOpenAIEmbeddings.mockClear()
    embeddings = new OpenRouterTextEmbeddingModel(new OpenRouterProviderStrategy())
  })

  it('creates an OpenAI-compatible embedding client with the selected model and endpoint', () => {
    embeddings.getEmbeddingInstance({
      model: 'openai/text-embedding-3-small',
      copilot: {
        modelProvider: {
          credentials: {
            api_key: 'test-key',
            endpoint_url: 'https://router.example.com/api/v1/'
          }
        }
      }
    } as any)

    expect(mockedOpenAIEmbeddings).toHaveBeenCalledWith({
      apiKey: 'test-key',
      model: 'openai/text-embedding-3-small',
      configuration: {
        baseURL: 'https://router.example.com/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://xpertai.cn/',
          'X-Title': 'XpertAI'
        }
      }
    })
  })

  it('validates embedding credentials through the embedding endpoint', async () => {
    const credentials = { api_key: 'test-key' }

    await expect(embeddings.validateCredentials('openai/text-embedding-3-small', credentials)).resolves.toBeUndefined()
    expect(mockedOpenAIEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        model: 'openai/text-embedding-3-small'
      })
    )
    expect(embeddings.modelType).toBe(AiModelTypeEnum.TEXT_EMBEDDING)
  })
})

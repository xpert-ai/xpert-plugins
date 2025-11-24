import 'dotenv/config';

import { ICopilotModel } from '@metad/contracts'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { XinferenceTextEmbeddingModel } from './text-embedding.js'

describe('XinferenceTextEmbeddingModel (live xinference)', () => {
  let embeddingModel: XinferenceTextEmbeddingModel
  let provider: XinferenceProviderStrategy

  const serverUrl = process.env.XINFERENCE_SERVER_URL as string
  const apiKey = process.env.XINFERENCE_API_KEY as string
  const embeddingModelUid =
    process.env.XINFERENCE_EMBEDDING_MODEL
  const testQuery = 'Xinference 可以支持哪些文本嵌入模型？'
  const testTexts = [
          'LangChain 提供了丰富的工具帮助快速构建 LLM 应用。',
          'Xinference 的文本嵌入模型可用于语义搜索与向量检索。',
          'Rerank 模型可以帮助提升检索结果的相关性。'
        ]

  beforeAll(() => {
    jest.resetModules()

    provider = new XinferenceProviderStrategy()
    ;(provider as any).credentials = {
      api_key: apiKey,
      server_url: serverUrl,
      model_uid: embeddingModelUid
    }

    embeddingModel = new XinferenceTextEmbeddingModel(provider)
  })

  it(
    'validates credentials against a live Xinference deployment',
    async () => {
      const credentials = {
        api_key: apiKey,
        server_url: serverUrl,
        model_uid: embeddingModelUid
      }

      await expect(embeddingModel.validateCredentials(embeddingModelUid ?? '', credentials)).resolves.toBeUndefined()
    },
    10000
  )

  it('generates real embeddings for documents and a query', async () => {
    const copilotModel = {
      model: embeddingModelUid,
      copilot: {
        modelProvider: provider
      }
    } as unknown as ICopilotModel

    const embeddings = embeddingModel.getEmbeddingInstance(copilotModel, {
      modelProperties: {
        api_key: apiKey,
        server_url: serverUrl,
        model_uid: embeddingModelUid
      },
      verbose: false,
      handleLLMTokens: (input) => {
        console.log('LLM Tokens:', input)
      }
    })

    const documentVectors = await embeddings.embedDocuments(testTexts)
    const queryVector = await embeddings.embedQuery(testQuery)

    console.log('Xinference embedding sample vector:', documentVectors[0]?.slice(0, 5))

    expect(documentVectors.length).toBe(testTexts.length)
    expect(documentVectors[0]?.length ?? 0).toBeGreaterThan(0)
    expect(documentVectors[0]?.every((value: number) => Number.isFinite(value))).toBe(true)
    expect(Array.isArray(queryVector)).toBe(true)
    expect(queryVector.length).toBeGreaterThan(0)
    expect(queryVector.every((value: number) => Number.isFinite(value))).toBe(true)
  })
})

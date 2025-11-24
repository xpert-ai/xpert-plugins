import 'dotenv/config';

import { Document } from '@langchain/core/documents'
import { ICopilotModel } from '@metad/contracts'
import { XinferenceRerankModel } from './rerank.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'

describe('XinferenceRerankModel (live xinference)', () => {
  let rerankModel: XinferenceRerankModel
  let provider: XinferenceProviderStrategy

  const serverUrl = process.env.XINFERENCE_SERVER_URL as string
  const apiKey = process.env.XINFERENCE_API_KEY as string
  const rerankModelUid = process.env.XINFERENCE_RERANK_MODEL ?? process.env.XINFERENCE_MODEL_UID
  const testQuery = process.env.XINFERENCE_RERANK_QUERY ?? '哪个文档在介绍 LangChain？'
  const rawDocuments = [
      'LangChain 是一个用于构建大型语言模型应用的开源框架。',
      'Xinference 提供了推理、向量化和 rerank 等多种模型能力。',
      'OpenAI 近期发布了多个全新的嵌入模型。'
    ]

  const testDocuments = rawDocuments.map(
    (content, index) =>
      new Document({
        pageContent: content,
        metadata: { id: index }
      })
  )

  beforeAll(() => {
    jest.resetModules()

    provider = new XinferenceProviderStrategy()
    ;(provider as any).credentials = {
      api_key: apiKey,
      server_url: serverUrl,
      model_uid: rerankModelUid
    }

    rerankModel = new XinferenceRerankModel(provider)
  })

  it(
    'validates credentials against a live Xinference deployment',
    async () => {
      const credentials = {
        api_key: apiKey,
        server_url: serverUrl,
        model_uid: rerankModelUid
      }

      await expect(rerankModel.validateCredentials(rerankModelUid ?? '', credentials)).resolves.toBeUndefined()
    },
    10000
  )

  it('performs a real rerank request', async () => {
    const copilotModel = {
      model: rerankModelUid,
      copilot: {
        modelProvider: provider
      }
    } as unknown as ICopilotModel

    const reranker = await rerankModel.getReranker(copilotModel, {
      modelProperties: {
        api_key: apiKey,
        server_url: serverUrl,
        model_uid: rerankModelUid
      },
      verbose: false,
      handleLLMTokens: (input) => {
        console.log('Rerank token:', input)
      }
    })

    const topN = Math.min(2, testDocuments.length)
    const results = await reranker.rerank(testDocuments, testQuery, {
      model: rerankModelUid ?? '',
      topN,
      returnDocuments: true
    })

    console.log('Xinference rerank response:', results)

    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.relevanceScore).toBeGreaterThanOrEqual(0)
    expect(results[0]?.document?.pageContent?.length ?? 0).toBeGreaterThan(0)
  })
})

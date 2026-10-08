import { OpenAIEmbeddings } from '@langchain/openai'
import { AiProviderRole } from '@xpert-ai/contracts'
import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { TongyiCredentials } from '../types.js'
import { TONGYI_MULTIMODAL_EMBEDDING_MODEL, TongyiMultimodalEmbeddings } from './multimodal-embeddings.js'
import { TongyiTextEmbeddingModel } from './text-embedding.js'

const credentials: TongyiCredentials = { dashscope_api_key: 'test-key' }
const nativePath = '/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding'

function vector(value: number) {
  return Array.from({ length: 1024 }, () => value)
}

function result(index: number, value = index) {
  return { index, embedding: vector(value), type: 'text' }
}

function response(embeddings = [result(0)]) {
  return new Response(JSON.stringify({ output: { embeddings } }), { status: 200 })
}

function copilotModel(
  model = TONGYI_MULTIMODAL_EMBEDDING_MODEL,
  options = { max_chunks: 10 },
  providerCredentials = credentials
): Parameters<TongyiTextEmbeddingModel['getEmbeddingInstance']>[0] {
  return {
    model,
    options,
    copilot: {
      role: AiProviderRole.Primary,
      copilotModel: { model: TONGYI_MULTIMODAL_EMBEDDING_MODEL },
      modelProvider: { credentials: providerCredentials }
    }
  }
}

describe('Tongyi embedding routing', () => {
  const manager = new TongyiTextEmbeddingModel(new TongyiProviderStrategy())

  afterEach(() => jest.restoreAllMocks())

  it('uses the native adapter for the model and its Copilot fallback', () => {
    expect(manager.getEmbeddingInstance(copilotModel())).toBeInstanceOf(TongyiMultimodalEmbeddings)
    expect(manager.getEmbeddingInstance(copilotModel(''))).toBeInstanceOf(TongyiMultimodalEmbeddings)
  })

  it('preserves OpenAI-compatible text models and configured batch sizes', () => {
    const embedding = manager.getEmbeddingInstance(copilotModel('text-embedding-v3', { max_chunks: 7 }))
    expect(embedding).toBeInstanceOf(OpenAIEmbeddings)
    expect(embedding).toMatchObject({ model: 'text-embedding-v3', batchSize: 7 })
  })

  it('sends credential validation through the native endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response())
    await manager.validateCredentials(TONGYI_MULTIMODAL_EMBEDDING_MODEL, credentials)
    expect(fetchMock).toHaveBeenCalledWith(`https://dashscope.aliyuncs.com${nativePath}`, expect.objectContaining({
      body: JSON.stringify({ model: TONGYI_MULTIMODAL_EMBEDDING_MODEL, input: { contents: [{ text: 'ping' }] } })
    }))
  })

  it('keeps ordinary text-model credential validation on the existing adapter', async () => {
    const embedQuery = jest.spyOn(OpenAIEmbeddings.prototype, 'embedQuery').mockResolvedValue([1, 2])
    await manager.validateCredentials('text-embedding-v3', credentials)
    expect(embedQuery).toHaveBeenCalledWith('ping')
  })

  it('surfaces native credential failures without retrying unauthorized requests', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'InvalidApiKey', message: 'Invalid API-key provided.', request_id: 'request-401'
    }), { status: 401 }))
    await expect(manager.validateCredentials(TONGYI_MULTIMODAL_EMBEDDING_MODEL, credentials))
      .rejects.toThrow(CredentialsValidateFailedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('declares the native model text context limit', () => {
    const model = manager.predefinedModels().find((item) => item.model === TONGYI_MULTIMODAL_EMBEDDING_MODEL)
    expect(model?.model_properties).toMatchObject({ context_size: 512 })
  })
})

describe('Tongyi native multimodal text embeddings', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it.each([
    [credentials, 'https://dashscope.aliyuncs.com'],
    [{ ...credentials, use_international_endpoint: 'true' }, 'https://dashscope-intl.aliyuncs.com'],
    [{ ...credentials, api_host: 'workspace.cn-beijing.maas.aliyuncs.com', use_international_endpoint: true },
      'https://workspace.cn-beijing.maas.aliyuncs.com'],
    [{ ...credentials, api_host: 'http://localhost:8080///' }, 'http://localhost:8080']
  ])('embeds queries with the configured API host %j', async (providerCredentials, host) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response([result(0, 42)]))
    const embeddings = new TongyiMultimodalEmbeddings({ credentials: providerCredentials })
    await expect(embeddings.embedQuery('机座\n功率')).resolves.toEqual(vector(42))
    expect(fetchMock).toHaveBeenCalledWith(`${host}${nativePath}`, expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TONGYI_MULTIMODAL_EMBEDDING_MODEL, input: { contents: [{ text: '机座\n功率' }] } }),
      signal: expect.any(AbortSignal)
    }))
  })

  it('batches documents and restores vector order using per-request indices', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response([result(1, 20), result(0, 10)]))
      .mockResolvedValueOnce(response([result(0, 30)]))
    const manager = new TongyiTextEmbeddingModel(new TongyiProviderStrategy())
    const embeddings = manager.getEmbeddingInstance(copilotModel(TONGYI_MULTIMODAL_EMBEDDING_MODEL, { max_chunks: 2 }))
    await expect(embeddings.embedDocuments(['first', 'second', 'third']))
      .resolves.toEqual([vector(10), vector(20), vector(30)])
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { model: TONGYI_MULTIMODAL_EMBEDDING_MODEL, input: { contents: [{ text: 'first' }, { text: 'second' }] } },
      { model: TONGYI_MULTIMODAL_EMBEDDING_MODEL, input: { contents: [{ text: 'third' }] } }
    ])
  })

  it('caps oversized configured batches at the provider limit of 20', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, index) => result(index))))
      .mockResolvedValueOnce(response([result(0, 20)]))
    const embeddings = new TongyiMultimodalEmbeddings({ credentials, batchSize: 100 })
    await expect(embeddings.embedDocuments(Array.from({ length: 21 }, (_, index) => `${index}`)))
      .resolves.toEqual(Array.from({ length: 21 }, (_, index) => vector(index)))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not request embeddings for an empty document list', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    await expect(new TongyiMultimodalEmbeddings({ credentials }).embedDocuments([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid batch size %s', (batchSize) => {
    expect(() => new TongyiMultimodalEmbeddings({ credentials, batchSize })).toThrow('positive integer')
  })

  it.each([
    ['missing vector', [result(0)]],
    ['duplicate index', [result(0), result(0)]],
    ['out-of-range index', [result(0), result(2)]]
  ])('rejects %s instead of corrupting document/vector correspondence', async (_, entries) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(entries))
    await expect(new TongyiMultimodalEmbeddings({ credentials }).embedDocuments(['one', 'two']))
      .rejects.toThrow('input indices')
  })

  it.each([
    { output: { embeddings: [{ ...result(0), embedding: [1, 2] }] } },
    { output: { embeddings: [{ ...result(0), type: 'image' }] } },
    { output: { embeddings: [{ ...result(0), embedding: [...vector(0).slice(1), null] }] } },
    { output: {} }
  ])('rejects malformed success responses without retrying', async (body) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)))
    await expect(new TongyiMultimodalEmbeddings({ credentials }).embedQuery('one')).rejects.toThrow('invalid response')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves HTTP status, provider error and request id', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'InvalidParameter', message: 'Text is too long', request_id: 'request-400'
    }), { status: 400 }))
    await expect(new TongyiMultimodalEmbeddings({ credentials }).embedQuery('one')).rejects.toThrow(
      'HTTP 400 {"code":"InvalidParameter","message":"Text is too long","request_id":"request-400"}'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves provider errors even in an HTTP-success response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'InvalidParameter', message: 'Invalid input', request_id: 'request-200'
    })))
    await expect(new TongyiMultimodalEmbeddings({ credentials }).embedQuery('one'))
      .rejects.toThrow('InvalidParameter: Invalid input (request_id: request-200)')
  })

  it('retries throttling through the shared LangChain caller', async () => {
    jest.useFakeTimers()
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(response([result(0, 7)]))
    const pending = new TongyiMultimodalEmbeddings({ credentials, maxRetries: 1 }).embedQuery('one')
    await jest.runAllTimersAsync()
    await expect(pending).resolves.toEqual(vector(7))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

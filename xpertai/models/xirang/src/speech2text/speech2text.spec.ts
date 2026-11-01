import { HumanMessage } from '@langchain/core/messages'
import { XirangAsrChatModel, XirangSpeechToTextModel } from './speech2text.js'
import { XirangProviderStrategy } from '../provider.strategy.js'

const credentials = { app_key: 'test-app-key', asr_format: 'wav' }
const audio = [new HumanMessage({ content: [{ url: 'https://audio.example.test/file.wav' }] })]
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
const task = (status: string, results?: object[]) => ({ output: { task_id: 'task-1', task_status: status, results } })

describe('Xirang speech recognition', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch')
  afterEach(() => fetchMock.mockReset())
  afterAll(() => fetchMock.mockRestore())

  it('uses the synchronous speech endpoint and only the required format', async () => {
    fetchMock.mockResolvedValue(response({ output: { text: '完整转写' } }))
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'sync', model: 'qwen-audio-3.0-asr-flash' })
    expect((await model.invoke(audio)).content).toBe('完整转写')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ai.ctaigw.cn/v1/services/aigc/multimodal-generation/generation')
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-app-key', 'Content-Type': 'application/json', 'X-DashScope-SSE': 'disable' })
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'qwen-audio-3.0-asr-flash', input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'https://audio.example.test/file.wav' } }] }] },
      parameters: { format: 'wav' }
    })
  })

  it('accepts an explicit audio Data URI for synchronous recognition', async () => {
    fetchMock.mockResolvedValue(response({ output: { text: 'ok' } }))
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'sync', model: 'qwen-audio-3.0-asr-flash' })
    await model.invoke([new HumanMessage({ content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,AQACAA==' } }] })])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('submits once, polls with GET and downloads without gateway credentials', async () => {
    fetchMock.mockResolvedValueOnce(response(task('PENDING')))
      .mockResolvedValueOnce(response(task('SUCCEEDED', [{ subtask_status: 'SUCCEEDED', transcription_url: 'https://results.example.test/result.json' }])))
      .mockResolvedValueOnce(response({ transcripts: [{ text: '完整结果', sentences: [{ text: '不重复拼接' }] }] }))
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'async', model: 'fun-asr' })
    expect((await model.invoke(audio)).content).toBe('完整结果')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: 'fun-asr', input: { file_urls: ['https://audio.example.test/file.wav'] } })
    expect(fetchMock.mock.calls[1][0]).toBe('https://ai.ctaigw.cn/v1/tasks/task-1')
    expect(fetchMock.mock.calls[1][1]?.method ?? 'GET').toBe('GET')
    expect(fetchMock.mock.calls[2][1]?.headers).toBeUndefined()
    expect(fetchMock.mock.calls[2][1]?.redirect).toBe('error')
  })

  it('rejects a failed subtask even if the overall task succeeded', async () => {
    fetchMock.mockResolvedValue(response(task('SUCCEEDED', [{ subtask_status: 'FAILED' }])))
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'async', model: 'fun-asr' })
    await expect(model.invoke(audio)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['FAILED', 'CANCELED', 'UNKNOWN'])('stops on terminal task state %s', async (status) => {
    fetchMock.mockResolvedValue(response(task(status)))
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'async', model: 'fun-asr' })
    await expect(model.invoke(audio)).rejects.toThrow(status)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancels polling without resubmitting the task', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => { controller.abort(); return response(task('PENDING')) })
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'async', model: 'fun-asr' })
    await expect(model.invoke(audio, { signal: controller.signal })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid input and Data URIs for asynchronous recognition', async () => {
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'async', model: 'fun-asr' })
    await expect(model.invoke('plain text')).rejects.toThrow()
    await expect(model.invoke([new HumanMessage({ content: [{ url: 'data:audio/wav;base64,AQACAA==' }] })])).rejects.toThrow('publicly accessible')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not expose credentials in HTTP errors or return an empty success', async () => {
    fetchMock.mockResolvedValue(response({ error: { message: credentials.app_key } }, 401))
    const model = new XirangAsrChatModel({ ...credentials, protocol: 'sync', model: 'qwen-audio-3.0-asr-flash' })
    await expect(model.invoke(audio)).rejects.toThrow('HTTP 401')
    fetchMock.mockResolvedValue(response({ error: { message: 'failed' } }))
    await expect(model.invoke(audio)).rejects.toThrow()
  })

  it('requires an explicit protocol for unknown manual models and preserves the model ID', async () => {
    const manager = new XirangSpeechToTextModel(new XirangProviderStrategy())
    await expect(manager.validateCredentials('unknown-asr', credentials)).rejects.toThrow('Select an ASR protocol')
    fetchMock.mockResolvedValue(response({ data: [] }))
    await expect(manager.validateCredentials('unknown-asr', { ...credentials, asr_protocol: 'async' })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

jest.mock('./audio-download.js', () => ({ readPublicAudioUrl: jest.fn() }))
import { readPublicAudioUrl } from './audio-download.js'
import { HumanMessage } from '@langchain/core/messages'
import { AiProviderRole } from '@xpert-ai/contracts'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { SiliconflowSpeech2TextModel } from './index.js'
import { SiliconflowTranscriptionModel } from './transcription.js'

const audio = new HumanMessage({ content: [{ type: 'input_audio', input_audio: { data: Buffer.from('audio').toString('base64'), format: 'wav' } }] })
const client = () => new SiliconflowTranscriptionModel({ apiKey: 'test', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3-ASR-1.7B' })
describe('SiliconFlow transcription', () => {
  afterEach(() => jest.restoreAllMocks())

  it('accepts the uploaded-file URL shape used by the host speech service', async () => {
    jest.mocked(readPublicAudioUrl).mockResolvedValue('data:audio/wav;base64,YXVkaW8=')
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"text":"host transcript"}'))
    const output = await client().invoke([new HumanMessage({ content: [{ url: 'https://files.example.com/audio.wav' }] })])
    expect(output.content).toBe('host transcript')
    expect(readPublicAudioUrl).toHaveBeenCalledWith('https://files.example.com/audio.wav', undefined)
  })

  it('posts multipart audio to the selected endpoint and returns the transcript', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"text":"你好"}'))
    const manager = new SiliconflowSpeech2TextModel(new SiliconflowProviderStrategy())
    const model = manager.getChatModel({ model: 'Qwen/Qwen3-ASR-1.7B', copilot: { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test', use_international_endpoint: true } } } })
    expect((await model.invoke([audio])).content).toBe('你好')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.siliconflow.com/v1/audio/transcriptions')
    expect(init?.headers).toEqual({ Authorization: 'Bearer test' })
    const body = init?.body
    expect(body).toBeInstanceOf(FormData)
    if (!(body instanceof FormData)) throw new Error('Expected FormData')
    expect(body.get('model')).toBe('Qwen/Qwen3-ASR-1.7B')
    const file = body.get('file')
    if (!(file instanceof Blob)) throw new Error('Expected audio Blob')
    expect(await file.text()).toBe('audio')
    expect(file.type).toBe('audio/wav')
  })
  it('fails on provider errors and malformed responses instead of returning empty generations', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret', { status: 401 }))
    await expect(client().invoke([audio])).rejects.toThrow('HTTP 401')
    fetchMock.mockResolvedValue(new Response('{}'))
    await expect(client().invoke([audio])).rejects.toThrow('invalid response')
  })
  it('rejects remote URLs, invalid encoding and conflicting MIME types before I/O', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    for (const data of ['https://example.org/a.wav', 'bad!', 'data:audio/mpeg;base64,YQ==']) {
      await expect(client().invoke([new HumanMessage({ content: [{ type: 'input_audio', input_audio: { data, format: 'wav' } }] })])).rejects.toThrow()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

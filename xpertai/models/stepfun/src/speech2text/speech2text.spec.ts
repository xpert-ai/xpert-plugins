jest.mock('./audio-download.js', () => ({ readPublicAudioUrl: jest.fn() }))
import { readPublicAudioUrl } from './audio-download.js'
import { HumanMessage } from '@langchain/core/messages'
import { StepAudioAsrChatModel } from './speech2text.js'

const audio = new HumanMessage({ content: [{ type: 'input_audio', input_audio: { data: Buffer.from('fixture audio').toString('base64'), format: 'wav' } }] })
const client = () => new StepAudioAsrChatModel({ apiKey: 'test', model: 'stepaudio-3-asr-max' })
const sse = (data: string) => new Response(data, { headers: { 'content-type': 'text/event-stream' } })

describe('StepAudio ASR', () => {
  afterEach(() => jest.restoreAllMocks())

  it('accepts the uploaded-file URL shape used by the host speech service', async () => {
    jest.mocked(readPublicAudioUrl).mockResolvedValue('data:audio/wav;base64,YXVkaW8=')
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(sse('data: {"type":"transcript.text.done","text":"host transcript"}\n\n'))
    const output = await client().invoke([new HumanMessage({ content: [{ url: 'https://files.example.com/audio.wav' }] })])
    expect(output.content).toBe('host transcript')
    expect(readPublicAudioUrl).toHaveBeenCalledWith('https://files.example.com/audio.wav', undefined)
  })

  it('sends the native JSON contract and assembles SSE frames across byte boundaries', async () => {
    const bytes = new TextEncoder().encode('data: {"type":"transcript.text.delta","delta":"你"}\r\n\r\ndata: {"type":"transcript.text.done","text":"你好","usage":{"input_tokens":12,"output_tokens":2,"total_tokens":14}}\r\n\r\n')
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() } })
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
    const output = await client().invoke([audio])
    expect(output.content).toBe('你好')
    expect(output.response_metadata).toMatchObject({ usage: { total_tokens: 14 } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.stepfun.com/v1/audio/asr/sse')
    expect(JSON.parse(String(init?.body))).toMatchObject({ audio: { input: { transcription: { model: 'stepaudio-3-asr-max', enable_itn: true }, format: { type: 'wav' } } } })
    expect(output.usage_metadata).toBeUndefined() // ASR tokens do not establish billed audio duration.
  })
  it.each([
    ['data: {"type":"transcript.text.delta","delta":"partial"}\n\n', 'without a final'],
    ['data: {"type":"error","message":"secret"}\n\n', 'error event'],
    ['data: {"type":"transcript.text.done","text":42}\n\n', 'invalid event']
  ])('rejects incomplete or invalid streams (%s)', async (body, error) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(sse(body))
    await expect(client().invoke([audio])).rejects.toThrow(error)
  })
  it('does not fetch caller-provided URLs or send invalid audio', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    const bad = new HumanMessage({ content: [{ type: 'input_audio', input_audio: { data: 'https://private.example/audio.wav' } }] })
    await expect(client().invoke([bad])).rejects.toThrow('format')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('honors cancellation before starting a provider request', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    await expect(client()._generate([audio], { signal: AbortSignal.abort() })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

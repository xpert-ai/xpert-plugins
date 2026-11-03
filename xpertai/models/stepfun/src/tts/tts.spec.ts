import { HumanMessage } from '@langchain/core/messages'
import { StepAudioTTSChatModel } from './tts.js'

const client = () => new StepAudioTTSChatModel({ apiKey: 'test', model: 'stepaudio-3-tts', voice: 'zixinnansheng', speed: 1.5 })
describe('StepAudio TTS', () => {
  afterEach(() => jest.restoreAllMocks())
  it('returns an audio content block using the selected voice and speed', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('audio', { headers: { 'content-type': 'audio/mpeg' } }))
    const result = await client().invoke([new HumanMessage('你好')])
    expect(result.content).toEqual([{ type: 'audio', data: Buffer.from('audio').toString('base64'), mime_type: 'audio/mpeg' }])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ model: 'stepaudio-3-tts', input: '你好', voice: 'zixinnansheng', speed: 1.5, response_format: 'mp3', stream_format: 'audio' })
  })
  it('rejects oversized inputs before I/O and rejects JSON or empty audio responses', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    await expect(client().invoke([new HumanMessage('a'.repeat(1001))])).rejects.toThrow('1000')
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }))
    await expect(client().invoke('hi')).rejects.toThrow('non-audio')
    fetchMock.mockResolvedValue(new Response('', { headers: { 'content-type': 'audio/mpeg' } }))
    await expect(client().invoke('hi')).rejects.toThrow('empty audio')
  })
})

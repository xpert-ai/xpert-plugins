import { HumanMessage } from '@langchain/core/messages'
import { AiProviderRole } from '@xpert-ai/contracts'
import { OpenRouterTTSModel } from './tts.js'
import { OpenRouterSpeech2TextModel } from '../speech2text/speech2text.js'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { OpenRouterTranscriptionModel } from '../speech2text/transcription.js'

it('uses the binary speech and JSON transcription endpoints', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(Buffer.from('audio'), { headers: { 'Content-Type': 'audio/mpeg' } }))
    .mockResolvedValueOnce(Response.json({ text: 'transcribed' }))
  const provider = new OpenRouterProviderStrategy()
  const copilot = { role: AiProviderRole.Primary, modelProvider: { credentials: { api_key: 'test', endpoint_url: 'https://example.test/v1/' } } }
  try {
    const tts = new OpenRouterTTSModel(provider).getChatModel({ copilot, model: 'hexgrad/kokoro-82m' })
    const speech = await tts.invoke('read aloud')
    expect(speech.content).toEqual([{ type: 'audio', mime_type: 'audio/mpeg', data: 'YXVkaW8=' }])
    const stt = new OpenRouterSpeech2TextModel(provider).getChatModel({ copilot, model: 'deepgram/nova-3' })
    const input_audio = { format: 'wav', data: 'YXVkaW8=' }
    const transcript = await stt.invoke([new HumanMessage({ content: [{ type: 'input_audio', input_audio }] })])
    expect(transcript.content).toBe('transcribed')
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://example.test/v1/audio/speech', 'https://example.test/v1/audio/transcriptions'])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: 'hexgrad/kokoro-82m', input: 'read aloud', voice: 'af_heart', response_format: 'mp3'
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ model: 'deepgram/nova-3', input_audio })
  } finally { fetchMock.mockRestore() }
})

it.each([
  ['audio/x-wav', 'wav'],
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/mp3', 'mp3'],
])('transcribes a Workspace Files data URL with MIME type %s', async (mime, format) => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ text: 'heard' }))
  try {
    const stt = new OpenRouterTranscriptionModel({ apiKey: 'test', baseUrl: 'https://example.test/v1', model: 'deepgram/nova-3' })
    const result = await stt.invoke([new HumanMessage({ content: [{ url: `data:${mime};base64,YXVkaW8=` }] })])
    expect(result.content).toBe('heard')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: 'deepgram/nova-3', input_audio: { format, data: 'YXVkaW8=' }
    })
  } finally { fetchMock.mockRestore() }
})

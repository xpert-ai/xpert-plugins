import { HumanMessage } from '@langchain/core/messages'
import { OpenRouterTTSChatModel } from './tts.js'
import { OpenRouterTranscriptionModel } from '../speech2text/transcription.js'

it('uses the binary speech and JSON transcription endpoints', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(Buffer.from('audio'), { headers: { 'Content-Type': 'audio/mpeg' } }))
    .mockResolvedValueOnce(Response.json({ text: 'transcribed' }))
  const fields = { apiKey: 'test', baseUrl: 'https://example.test/v1' }
  try {
    const tts = new OpenRouterTTSChatModel({ ...fields, model: 'hexgrad/kokoro-82m', voice: 'af_heart' })
    const speech = await tts.invoke('read aloud')
    expect(speech.content).toEqual([{ type: 'audio', mime_type: 'audio/mpeg', data: 'YXVkaW8=' }])
    const stt = new OpenRouterTranscriptionModel({ ...fields, model: 'deepgram/nova-3' })
    const input_audio = { format: 'wav', data: 'YXVkaW8=' }
    const transcript = await stt.invoke([new HumanMessage({ content: [{ type: 'input_audio', input_audio }] })])
    expect(transcript.content).toBe('transcribed')
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://example.test/v1/audio/speech', 'https://example.test/v1/audio/transcriptions'])
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ model: 'deepgram/nova-3', input_audio })
  } finally { fetchMock.mockRestore() }
})

import { HumanMessage } from '@langchain/core/messages'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { Speech2TextChatModel, TongyiSpeech2TextModel } from './speech2text.js'

describe('Speech2TextChatModel', () => {
  afterEach(() => jest.restoreAllMocks())

  it.each([undefined, 'paraformer-v2', 'paraformer-8k-v2'])('transcribes a file using model %s', async (model) => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_id: 'task-1' } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              task_status: 'SUCCEEDED',
              results: [{ transcription_url: 'https://example.com/result.json' }]
            }
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ sentences: [{ text: 'hello' }] }] })))
    const chat = new Speech2TextChatModel({ apiKey: 'test-key', model })
    const result = await chat.invoke([new HumanMessage({ content: [{ url: 'https://example.com/audio.wav' }] })])

    expect(fetchMock.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: model ?? 'paraformer-v2',
      input: { file_urls: ['https://example.com/audio.wav'] }
    })
    expect(result.content).toBe('hello')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('advertises the HTTP file model instead of the incorrectly named realtime model', () => {
    const catalog = new TongyiSpeech2TextModel(new TongyiProviderStrategy()).predefinedModels()
    expect(catalog.find((entry) => entry.model === 'paraformer-v2')).toMatchObject({
      model_type: 'speech2text',
      model_properties: { file_upload_limit: 100 }
    })
    expect(catalog.some((entry) => entry.model === 'paraformer-realtime-v2')).toBe(false)
  })
})

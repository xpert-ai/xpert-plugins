import { HumanMessage } from '@langchain/core/messages'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { XirangSpeechToTextModel } from './speech2text.js'
import { XirangTextToSpeechModel } from '../tts/tts.js'
import { ttsModel } from '../tts/protocol.js'

describe('Xirang speech registration and manual properties', () => {
  afterEach(() => jest.restoreAllMocks())

  it('exposes speech model definitions and type-specific manual credentials', () => {
    const provider = new XirangProviderStrategy()
    const asr = new XirangSpeechToTextModel(provider)
    const tts = new XirangTextToSpeechModel(provider)
    expect(provider.getProviderSchema().supported_model_types).toEqual(expect.arrayContaining(['speech2text', 'tts']))
    const fields = provider.getProviderSchema().model_credential_schema.credential_form_schemas
    for (const variable of ['tts_app_id', 'tts_app_key', 'tts_region']) {
      expect(fields.find((field) => field.variable === variable)).toMatchObject({ required: true, show_on: [{ variable: '__model_type', value: 'tts' }] })
    }
    expect(asr.getModelSchema('qwen-audio-3.0-asr-flash').model_type).toBe('speech2text')
    expect(tts.getModelSchema(ttsModel).model_type).toBe('tts')
    expect(tts.getModelSchema(ttsModel).parameter_rules.map((rule) => rule.name)).toEqual(['voice', 'speech_rate', 'volume'])
  })

  it('routes a manually configured model using its explicit protocol and exact ID', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ output: { text: 'manual transcript' } })))
    const manager = new XirangSpeechToTextModel(new XirangProviderStrategy())
    expect(manager.getModelSchema('opaque-speech-model', { asr_protocol: 'sync' })).toMatchObject({ model_type: 'speech2text', parameter_rules: [] })
    const model = manager.getChatModel({ model: 'opaque-speech-model' }, {
      modelProperties: { app_key: 'manual-key', asr_protocol: 'sync', asr_format: 'mp3' },
      handleLLMTokens: jest.fn(), verbose: false
    })
    expect((await model.invoke([new HumanMessage({ content: [{ url: 'https://example.test/audio.mp3' }] })])).content).toBe('manual transcript')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.model).toBe('opaque-speech-model')
    expect(body.parameters).toEqual({ format: 'mp3' })
    expect(body.temperature).toBeUndefined()
  })

  it('keeps discovery restricted by its shared contract instead of misclassifying speech', async () => {
    const provider = new XirangProviderStrategy()
    new XirangSpeechToTextModel(provider)
    new XirangTextToSpeechModel(provider)
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'qwen-audio-3.0-asr-flash' }, { id: 'supernaturalrt', model_type: 'tts' }
    ] })))
    expect(await provider.discoverModels({ app_key: 'key' })).toEqual([])
  })
})

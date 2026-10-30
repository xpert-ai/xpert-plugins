jest.mock('@xpert-ai/contracts', () => ({
  AiProviderRole: { Primary: 'primary' },
  AiModelTypeEnum: {
    LLM: 'llm'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  ModelProvider: class {},
  LargeLanguageModel: class {
    constructor(readonly modelProvider: unknown, readonly modelType: unknown) {}

    createHandleUsageCallbacks() {
      return []
    }

    createHandleLLMErrorCallbacks() {
      return {}
    }

    getModelProfile() {
      return {}
    }
  }
}))

import { AiProviderRole, ICopilotModel } from '@xpert-ai/contracts'
import { HumanMessage, ToolMessage } from '@langchain/core/messages'
import { OpenAIProviderStrategy } from '../provider.strategy.js'
import { OpenAILargeLanguageModel } from './llm.js'
import { OpenAICredentials, OpenAIModelOptions } from '../types.js'

function createCopilotModel(
  model: string,
  options: OpenAIModelOptions,
  credentials: OpenAICredentials = { api_key: 'test-key' }
): ICopilotModel {
  return {
    model,
    options,
    copilot: {
      role: AiProviderRole.Primary,
      modelProvider: {
        credentials,
      },
    },
  }
}

describe('OpenAILargeLanguageModel', () => {
  let provider: OpenAIProviderStrategy
  let llm: OpenAILargeLanguageModel

  beforeEach(() => {
    provider = new OpenAIProviderStrategy()
    llm = new OpenAILargeLanguageModel(provider)
  })

  it('maps GPT-5.4 options to Responses API parameters', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4', {
        temperature: 0.4,
        top_p: 0.7,
        max_tokens: 1024,
        reasoning_effort: 'high',
      })
    )

    const params = model.invocationParams()

    expect(params.model).toBe('gpt-5.4')
    expect(params.temperature).toBe(0.4)
    expect(params.top_p).toBe(0.7)
    expect(params).toMatchObject({ max_output_tokens: 1024, stream: true })
    expect(params).toMatchObject({ reasoning: { effort: 'high', summary: 'auto' } })
  })

  it('clamps official OpenAI max_tokens below the Responses API minimum', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4', {
        max_tokens: 5,
      })
    )

    const params = model.invocationParams()

    expect(params).toMatchObject({ max_output_tokens: 16 })
  })

  it('normalizes legacy GPT-5.4 reasoning values to the official enum', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4', {
        reasoning_effort: 'minimal',
      })
    )

    const params = model.invocationParams()

    expect('reasoning' in params ? params.reasoning : undefined).toEqual({ effort: 'none', summary: 'auto' })
  })

  it('suppresses unsupported GPT-5 Pro parameters on the official endpoint', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.4-pro', {
        temperature: 0.4,
        top_p: 0.7,
        reasoning_effort: 'low',
      })
    )

    const params = model.invocationParams()

    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
    expect('reasoning' in params ? params.reasoning : undefined).toEqual({ effort: 'medium', summary: 'auto' })
    expect('text' in params ? params.text?.format : undefined).toBeUndefined()
  })

  it('normalizes legacy Codex reasoning values to the supported enum', () => {
    const model = llm.getChatModel(
      createCopilotModel('gpt-5.3-codex', {
        reasoning_effort: 'minimal',
      })
    )

    const params = model.invocationParams()

    expect('reasoning' in params ? params.reasoning : undefined).toEqual({ effort: 'low', summary: 'auto' })
  })

  it('keeps auto sampling disabled for custom endpoints', () => {
    const model = llm.getChatModel(
      createCopilotModel(
        'gpt-5.4',
        {
          temperature: 0.5,
          top_p: 0.8,
        },
        {
          api_key: 'test-key',
          endpoint_url: 'https://gateway.example.com/v1',
        }
      )
    )

    const params = model.invocationParams()

    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
  })

  it.each(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-sol'])(
    'preserves real Responses SDK options for %s', (name) => {
      const model = llm.getChatModel(createCopilotModel(name, {
        reasoning_effort: 'max', max_tokens: 8192, streaming: false, temperature: 0.5, top_p: 0.8
      }))
      expect(model.invocationParams()).toMatchObject({
        model: name, max_output_tokens: 8192, stream: false, reasoning: { effort: 'max', summary: 'auto' }
      })
      expect(model.invocationParams().temperature).toBeUndefined()
      expect(model.invocationParams().top_p).toBeUndefined()
    }
  )

  it('uses medium reasoning and omits sampling when options are absent', () => {
    const params = llm.getChatModel(createCopilotModel('gpt-6.1-terra', {})).invocationParams()
    expect(params).toMatchObject({ stream: true, reasoning: { effort: 'medium', summary: 'auto' } })
    expect(params.temperature).toBeUndefined()
  })

  it('allows sampling for Terra with none and removes it after a call-level reasoning override', () => {
    const model = llm.getChatModel(createCopilotModel('gpt-6.1-terra', {
      reasoning_effort: 'none', temperature: 0.3, top_p: 0.8
    }))
    expect(model.invocationParams()).toMatchObject({ temperature: 0.3, top_p: 0.8, reasoning: { effort: 'none' } })
    const params = model.invocationParams({ reasoning: { effort: 'high' } })
    expect(params).toMatchObject({ reasoning: { effort: 'high' } })
    expect(params.temperature).toBeUndefined()
    expect(params.top_p).toBeUndefined()
  })

  it('preserves explicit sampling support on a custom gateway', () => {
    const params = llm.getChatModel(createCopilotModel('gpt-6.1-terra', {
      reasoning_effort: 'high', temperature: 0.3, top_p: 0.8, max_tokens: 1234
    }, { api_key: 'test-key', endpoint_url: 'https://gateway.example.com/v1', sampling_parameters: 'enabled' }))
      .invocationParams()
    expect(params).toMatchObject({ temperature: 0.3, top_p: 0.8, max_output_tokens: 1234, stream: false })
  })

  it('serializes tools, vision and structured output into an actual Responses request', async () => {
    const requests: string[] = []
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://api.openai.com/v1/responses')
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body')
      requests.push(init.body)
      return new Response(JSON.stringify({
        id: 'resp_test', object: 'response', status: 'completed', model: 'gpt-6.1-terra',
        output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] }],
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12,
          input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 1 } }
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    try {
      const model = llm.getChatModel(createCopilotModel('gpt-6.1-terra', {
        reasoning_effort: 'max', streaming: false, max_tokens: 4096,
        temperature: 0.5, top_p: 0.8, response_format: 'json_object'
      }))
      const result = await model.invoke([['human', [
        { type: 'text', text: 'Inspect this image and return JSON.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
      ]]], { tools: [{ type: 'function', function: {
        name: 'lookup', description: 'Look up an item', parameters: { type: 'object', properties: {} }
      } }] })
      expect(requests).toHaveLength(1)
      expect(JSON.parse(requests[0])).toMatchObject({
        model: 'gpt-6.1-terra', stream: false, max_output_tokens: 4096,
        reasoning: { effort: 'max', summary: 'auto' }, text: { format: { type: 'json_object' } },
        tools: [{ type: 'function', name: 'lookup' }],
        input: [{ role: 'user', content: [
          { type: 'input_text' }, { type: 'input_image', image_url: 'data:image/png;base64,AA==' }
        ] }]
      })
      expect(JSON.parse(requests[0])).not.toHaveProperty('temperature')
      expect(JSON.parse(requests[0])).not.toHaveProperty('top_p')
      expect(result.content).toEqual([{ type: 'text', text: '{"ok":true}', annotations: [] }])
      expect(result.usage_metadata).toMatchObject({ input_tokens: 10, output_tokens: 2,
        input_token_details: { cache_read: 3 }, output_token_details: { reasoning: 1 } })
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('round-trips a Responses function call and its tool result', async () => {
    const requests: string[] = []
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body')
      requests.push(init.body)
      const output = requests.length === 1
        ? [{ type: 'function_call', id: 'fc_lookup', call_id: 'call_lookup', name: 'lookup', arguments: '{"id":"42"}', status: 'completed' }]
        : [{ type: 'message', id: 'msg_done', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'Found item 42', annotations: [] }] }]
      return new Response(JSON.stringify({
        id: `resp_${requests.length}`, object: 'response', status: 'completed', model: 'gpt-6.1-terra', output
      }), { headers: { 'Content-Type': 'application/json' } })
    })
    try {
      const model = llm.getChatModel(createCopilotModel('gpt-6.1-terra', { streaming: false }))
        .bindTools([{ type: 'function', function: {
          name: 'lookup', description: 'Find an item', parameters: {
            type: 'object', properties: { id: { type: 'string' } }, required: ['id']
          }
        } }])
      const human = new HumanMessage('Find item 42')
      const first = await model.invoke([human])
      expect(first.tool_calls).toEqual([{ type: 'tool_call', name: 'lookup', args: { id: '42' }, id: 'call_lookup' }])
      const result = await model.invoke([human, first, new ToolMessage({ tool_call_id: 'call_lookup', content: 'Item 42' })])
      expect(result.text).toBe('Found item 42')
      expect(requests).toHaveLength(2)
      expect(JSON.parse(requests[1]).input).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'function_call', call_id: 'call_lookup', name: 'lookup', arguments: '{"id":"42"}' }),
        expect.objectContaining({ type: 'function_call_output', call_id: 'call_lookup', output: 'Item 42' })
      ]))
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('preserves the streaming reasoning summary before the final text', async () => {
    const events = [
      { type: 'response.created', response: { id: 'resp_stream', model: 'gpt-6.1-terra', output: [] } },
      { type: 'response.reasoning_summary_text.delta', item_id: 'rs_test', output_index: 0, summary_index: 0, delta: 'Thinking' },
      { type: 'response.output_text.delta', item_id: 'msg_test', output_index: 1, content_index: 0, delta: 'Done' },
      { type: 'response.completed', response: { id: 'resp_stream', model: 'gpt-6.1-terra', status: 'completed', output: [],
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12,
          input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 1 } } } }
    ]
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'Content-Type': 'text/event-stream' } }
    ))
    try {
      const model = llm.getChatModel(createCopilotModel('gpt-6.1-terra', { streaming: true, reasoning_effort: 'high' }))
      const chunks = []
      for await (const chunk of await model.stream('Hello')) chunks.push(chunk)
      expect(chunks.map((chunk) => chunk.text).join('')).toBe('Done')
      expect(chunks.map((chunk) => chunk.additional_kwargs.reasoning_content ?? '').join('')).toBe('Thinking')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(chunks.find((chunk) => chunk.usage_metadata)?.usage_metadata).toMatchObject({
        input_token_details: { cache_read: 3 }, output_token_details: { reasoning: 1 }
      })
    } finally {
      fetchMock.mockRestore()
    }
  })
})

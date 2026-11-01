import { compatibleResponsesTransport } from './native.js'
import { OpenAICompatibleProviderStrategy } from './provider.strategy.js'
import { OAIAPICompatLargeLanguageModel } from './llm/llm.js'
import { ModelFeature } from '@xpert-ai/contracts'
import { ChatOpenAIResponses } from '@langchain/openai'

const credentials = {
  api_protocol: 'responses' as const,
  api_key: 'server-only',
  endpoint_url: 'https://relay.example/v1',
  endpoint_model_name: 'custom-coding',
  reasoning_effort: 'xhigh',
  mode: 'chat',
  context_size: '32768',
  max_tokens_to_sample: '8192',
  function_calling_type: 'multi_tool_call',
  stream_function_calling: 'supported',
  vision_support: 'no_support'
}

describe('native OpenAI-compatible Responses', () => {
  it('preserves opaque reasoning and multiple tool results through serialization', async () => {
    const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
    const generate = compatibleResponsesTransport(credentials, fetcher)
    const input = [
      { type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [] },
      { type: 'function_call', call_id: 'a', name: 'lookup', arguments: '{"id":"alpha"}' },
      { type: 'function_call', call_id: 'b', name: 'lookup', arguments: '{"id":"beta"}' },
      { type: 'function_call_output', call_id: 'a', output: '7' },
      { type: 'function_call_output', call_id: 'b', output: '11' }
    ]
    const body = { model: 'assistant-default', input, stream: true, store: true }
    const signal = AbortSignal.timeout(1000)
    await generate(body, {}, signal)
    const [url, options] = fetcher.mock.calls[0]
    expect(url.toString()).toBe('https://relay.example/v1/responses')
    expect(options?.signal).toBe(signal)
    expect(options?.redirect).toBe('error')
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer server-only')
    expect(JSON.parse(String(options?.body))).toEqual({ ...body, model: 'custom-coding', store: false, reasoning: { effort: 'xhigh' } })
    expect(body.store).toBe(true)
    expect(JSON.parse(String(options?.body)).input).toEqual(input)
  })

  it('preserves explicit caller effort and fails closed on unsupported values or protocol', async () => {
    const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'))
    const generate = compatibleResponsesTransport(credentials, fetcher)
    await generate({ model: 'coding', reasoning: { effort: 'high', summary: 'auto' } }, {}, AbortSignal.timeout(1000))
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).reasoning).toEqual({ effort: 'high', summary: 'auto' })
    expect(() => generate({ model: 'coding', reasoning: { effort: 'unknown' } }, {}, AbortSignal.timeout(1000))).toThrow()
    expect(() => compatibleResponsesTransport({ ...credentials, api_protocol: 'chat' })).toThrow()
    expect(() => compatibleResponsesTransport({ ...credentials, api_key: '' })).toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('advertises native protocol, numeric limits and tool support only when selected', () => {
    const llm = new OAIAPICompatLargeLanguageModel(new OpenAICompatibleProviderStrategy())
    const schema = llm.getCustomizableModelSchemaFromCredentials('coding', credentials)
    expect(schema?.native_protocols).toEqual(['openai_responses'])
    expect(schema?.model_properties?.context_size).toBe(32768)
    expect(schema?.parameter_rules?.find((rule) => rule.name === 'max_tokens')?.max).toBe(8192)
    expect(schema?.parameter_rules?.find((rule) => rule.name === 'reasoning_effort')?.default).toBe('xhigh')
    expect(schema?.parameter_rules?.map((rule) => rule.name)).not.toContain('enable_thinking')
    expect(schema?.features).toEqual(expect.arrayContaining([ModelFeature.TOOL_CALL, ModelFeature.MULTI_TOOL_CALL]))
    expect(llm.getCustomizableModelSchemaFromCredentials('coding', { ...credentials, api_protocol: 'chat' })?.native_protocols).toBeUndefined()
  })

  it('uses Responses for the parent assistant without injecting Chat-only defaults', () => {
    const llm = new OAIAPICompatLargeLanguageModel(new OpenAICompatibleProviderStrategy())
    const model = llm.getChatModel({ model: 'coding', options: { reasoning_effort: 'high', max_tokens: 8192 } }, undefined, credentials)
    expect(model).toBeInstanceOf(ChatOpenAIResponses)
    expect(model.modelKwargs).toEqual({ store: false, include: ['reasoning.encrypted_content'], reasoning: { effort: 'high' } })
    expect(model.temperature).toBeUndefined()
    expect(model.maxTokens).toBe(8192)
    expect(model.invocationParams()).toMatchObject({ reasoning: { effort: 'high' }, max_output_tokens: 8192, store: false })
  })
})

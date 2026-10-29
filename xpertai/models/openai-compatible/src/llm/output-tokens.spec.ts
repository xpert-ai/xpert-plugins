import { resolveModelParameterOptions } from '@xpert-ai/contracts'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'
import { OpenAICompatModelCredentials } from '../types.js'
import { OAIAPICompatLargeLanguageModel } from './llm.js'

describe.each(['responses', 'chat'] as const)('%s output token defaults', (api_protocol) => {
  const credentials: OpenAICompatModelCredentials = {
    api_protocol,
    api_key: 'test-only',
    endpoint_url: 'https://relay.example/v1',
    mode: 'chat',
    context_size: '256000',
    max_tokens_to_sample: '128000',
    vision_support: 'no_support'
  }
  let llm: OAIAPICompatLargeLanguageModel

  beforeEach(() => {
    llm = new OAIAPICompatLargeLanguageModel(new OpenAICompatibleProviderStrategy())
  })

  it('uses the configured provider output limit when initializing assistant parameters', () => {
    const rules = llm.getParameterRules('custom-model', credentials)
    const options = resolveModelParameterOptions({}, rules)
    expect(rules.find((rule) => rule.name === 'max_tokens')).toMatchObject({ max: 128000, default: 128000 })
    expect(options.max_tokens).toBe(128000)
  })

  it.each([undefined, {}])('uses the same output limit without UI-initialized options: %j', (options) => {
    const model = llm.getChatModel({ model: 'custom-model', options }, undefined, credentials)
    expect(model.maxTokens).toBe(128000)
    expect(model.invocationParams()).toMatchObject(
      api_protocol === 'responses' ? { max_output_tokens: 128000 } : { max_tokens: 128000 }
    )
  })

  it.each([512, 8192])('preserves an explicitly saved assistant limit of %i', (max_tokens) => {
    const options = resolveModelParameterOptions({ max_tokens }, llm.getParameterRules('custom-model', credentials))
    const model = llm.getChatModel({ model: 'custom-model', options }, undefined, credentials)
    expect(options.max_tokens).toBe(max_tokens)
    expect(model.maxTokens).toBe(max_tokens)
  })

  it('caps the default by context capacity in both schema and requests', () => {
    const smallerContext = { ...credentials, context_size: '4096' }
    const rule = llm.getParameterRules('custom-model', smallerContext).find((rule) => rule.name === 'max_tokens')
    expect(rule).toMatchObject({ max: 4096, default: 4096 })
    expect(llm.getChatModel({ model: 'custom-model' }, undefined, smallerContext).maxTokens).toBe(4096)
  })

  it('retains the legacy context_length fallback when no output limit is configured', () => {
    const schema = llm.getCustomizableModelSchemaFromCredentials('custom-model', { api_protocol, context_length: 8192 })
    expect(schema?.parameter_rules.find((rule) => rule.name === 'max_tokens')).toMatchObject({ max: 8192, default: 8192 })
  })

  it('keeps the existing safe context fallback for invalid credential limits', () => {
    const invalidLimits = { ...credentials, context_size: '', max_tokens_to_sample: '-1' }
    expect(llm.getParameterRules('custom-model', invalidLimits).find((rule) => rule.name === 'max_tokens'))
      .toMatchObject({ max: 2048, default: 2048 })
    expect(llm.getChatModel({ model: 'custom-model' }, undefined, invalidLimits).maxTokens).toBe(2048)
  })
})

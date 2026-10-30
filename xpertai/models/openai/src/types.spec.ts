import { OpenAIBaseInput } from '@langchain/openai'
import {
  isOpenAIOfficialBaseUrl,
  isOpenAIGPT5ProModel,
  normalizeOpenAIMaxTokens,
  normalizeOpenAIBaseUrl,
  normalizeOpenAIReasoningEffort,
  getSupportedOpenAIReasoningEfforts,
  OpenAICredentials,
  OpenAIDefaultBaseUrl,
  OpenAIResponsesMinOutputTokens,
  shouldEnableResponseFormat,
  shouldEnableSamplingParameters,
  toCredentialKwargs
} from './types.js'

describe('OpenAI credential kwargs', () => {
  it('uses default OpenAI base URL when endpoint is omitted', () => {
    const credentials: OpenAICredentials = {
      api_key: 'test-key'
    }

    const result = toCredentialKwargs(credentials)
    const _typeCheck: OpenAIBaseInput = result

    expect(result.apiKey).toBe('test-key')
    expect(result.configuration.baseURL).toBe(OpenAIDefaultBaseUrl)
  })

  it('appends /v1 when endpoint only contains host', () => {
    expect(normalizeOpenAIBaseUrl('https://api.example.com')).toBe('https://api.example.com/v1')
    expect(normalizeOpenAIBaseUrl('https://api.example.com/')).toBe('https://api.example.com/v1')
    expect(normalizeOpenAIBaseUrl('https://api.example.com。')).toBe('https://api.example.com/v1')
  })

  it('keeps existing versioned or custom path unchanged', () => {
    expect(normalizeOpenAIBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
    expect(normalizeOpenAIBaseUrl('https://gateway.example.com/openai/v1')).toBe(
      'https://gateway.example.com/openai/v1'
    )
  })

  it('detects official OpenAI base URL host', () => {
    expect(isOpenAIOfficialBaseUrl('https://api.openai.com/v1')).toBe(true)
    expect(isOpenAIOfficialBaseUrl('https://api.example.com/v1')).toBe(false)
  })

  it('detects GPT-5 Pro model variants', () => {
    expect(isOpenAIGPT5ProModel('gpt-5-pro')).toBe(true)
    expect(isOpenAIGPT5ProModel('gpt-5.2-pro')).toBe(true)
    expect(isOpenAIGPT5ProModel('gpt-5.4-pro')).toBe(true)
    expect(isOpenAIGPT5ProModel('gpt-5.4')).toBe(false)
  })

  it('supports configurable sampling parameter strategy', () => {
    expect(shouldEnableSamplingParameters('enabled', 'https://api.example.com/v1', 'gpt-5.4-pro')).toBe(
      true
    )
    expect(shouldEnableSamplingParameters('disabled', 'https://api.openai.com/v1', 'gpt-5.4')).toBe(
      false
    )
    expect(shouldEnableSamplingParameters('auto', 'https://api.openai.com/v1', 'gpt-5.4')).toBe(true)
    expect(shouldEnableSamplingParameters('auto', 'https://api.openai.com/v1', 'gpt-5.4-pro')).toBe(
      false
    )
    expect(shouldEnableSamplingParameters('auto', 'https://api.example.com/v1', 'gpt-5.4')).toBe(false)
  })

  it('disables response_format for official GPT-5 Pro models only', () => {
    expect(shouldEnableResponseFormat('https://api.openai.com/v1', 'gpt-5.4')).toBe(true)
    expect(shouldEnableResponseFormat('https://api.openai.com/v1', 'gpt-5.4-pro')).toBe(false)
    expect(shouldEnableResponseFormat('https://gateway.example.com/v1', 'gpt-5.4-pro')).toBe(true)
  })

  it('clamps official OpenAI max_tokens to the Responses API minimum', () => {
    expect(normalizeOpenAIMaxTokens(5, 'https://api.openai.com/v1')).toBe(OpenAIResponsesMinOutputTokens)
    expect(normalizeOpenAIMaxTokens(64, 'https://api.openai.com/v1')).toBe(64)
  })

  it('keeps custom-endpoint max_tokens unchanged', () => {
    expect(normalizeOpenAIMaxTokens(5, 'https://gateway.example.com/v1')).toBe(5)
  })

  it.each(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-sol'])(
    'applies the explicit reasoning and sampling contract for %s', (model) => {
      expect(normalizeOpenAIReasoningEffort(model)).toBe('medium')
      expect(normalizeOpenAIReasoningEffort(model, 'max')).toBe('max')
      expect(normalizeOpenAIReasoningEffort(model, 'minimal')).toBe('low')
      expect(shouldEnableSamplingParameters('auto', undefined, model)).toBe(false)
      expect(shouldEnableSamplingParameters('enabled', undefined, model, 'high')).toBe(false)
      expect(shouldEnableSamplingParameters('enabled', 'https://gateway.example.com/v1', model, 'high')).toBe(true)
    }
  )

  it.each(['gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-sol'])('allows sampling without reasoning for %s', (model) => {
    expect(getSupportedOpenAIReasoningEfforts(model)).toContain('none')
    expect(shouldEnableSamplingParameters('auto', undefined, model, 'none')).toBe(true)
    expect(shouldEnableSamplingParameters('disabled', undefined, model, 'none')).toBe(false)
  })

  it.each(['gpt-6-astra', 'gpt-6.1-sol'])('does not silently disable reasoning for %s', (model) => {
    expect(getSupportedOpenAIReasoningEfforts(model)).not.toContain('none')
    expect(normalizeOpenAIReasoningEffort(model, 'none')).toBe('low')
    expect(shouldEnableSamplingParameters('enabled', undefined, model, 'none')).toBe(false)
  })

  it('does not infer capabilities for an unknown model from a name prefix', () => {
    expect(getSupportedOpenAIReasoningEfforts('gpt-6-future')).toBeUndefined()
    expect(normalizeOpenAIReasoningEffort('gpt-6-future', 'high')).toBeUndefined()
  })
})

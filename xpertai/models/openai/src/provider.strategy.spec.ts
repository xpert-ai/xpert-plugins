const validateCredentials = jest.fn()

jest.mock('@xpert-ai/contracts', () => ({
  AiModelTypeEnum: {
    LLM: 'llm'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  ModelProvider: class {
    getModelManager() {
      return {
        validateCredentials
      }
    }

    getProviderSchema() {
      return { provider: 'openai' }
    }
  },
  CredentialsValidateFailedError: class extends Error {}
}))

import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { OpenAIProviderStrategy } from './provider.strategy.js'
import { OpenAICredentials } from './types.js'

describe('OpenAIProviderStrategy', () => {
  let strategy: OpenAIProviderStrategy
  let credentials: OpenAICredentials

  beforeEach(() => {
    validateCredentials.mockReset()
    strategy = new OpenAIProviderStrategy()
    credentials = {
      api_key: 'test-api-key',
      endpoint_url: 'https://gateway.example.com/v1'
    }
  })

  it('prefers GPT-5.4 for provider credential validation', async () => {
    validateCredentials.mockResolvedValue(undefined)

    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
    expect(validateCredentials).toHaveBeenCalledTimes(1)
    expect(validateCredentials).toHaveBeenCalledWith('gpt-5.4', credentials)
  })

  it('falls back to older GPT-5 models when the first candidate is unsupported', async () => {
    validateCredentials
      .mockRejectedValueOnce(new CredentialsValidateFailedError("The 'gpt-5.4' model is not supported"))
      .mockResolvedValueOnce(undefined)

    await expect(strategy.validateProviderCredentials(credentials)).resolves.toBeUndefined()
    expect(validateCredentials).toHaveBeenNthCalledWith(1, 'gpt-5.4', credentials)
    expect(validateCredentials).toHaveBeenNthCalledWith(2, 'gpt-5', credentials)
  })

  it('does not retry when the failure is unrelated to model availability', async () => {
    const error = new CredentialsValidateFailedError('Incorrect API key provided')
    validateCredentials.mockRejectedValue(error)

    await expect(strategy.validateProviderCredentials(credentials)).rejects.toBe(error)
    expect(validateCredentials).toHaveBeenCalledTimes(1)
    expect(validateCredentials).toHaveBeenCalledWith('gpt-5.4', credentials)
  })

  it('validates official credentials without requiring access to a legacy probe model', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(String(url)).toBe('https://api.openai.com/v1/models')
      expect(init?.method).toBe('GET')
      return new Response(JSON.stringify({ object: 'list', data: [{ id: 'gpt-6.1-terra', object: 'model' }] }),
        { headers: { 'Content-Type': 'application/json' } })
    })
    try {
      await expect(strategy.validateProviderCredentials({ api_key: 'test-api-key' })).resolves.toBeUndefined()
      expect(validateCredentials).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('returns an official authentication error without falling back to paid generation', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Invalid API key', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    ))
    try {
      await expect(strategy.validateProviderCredentials({ api_key: 'test-api-key' }))
        .rejects.toThrow(CredentialsValidateFailedError)
      expect(validateCredentials).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      fetchMock.mockRestore()
    }
  })
})

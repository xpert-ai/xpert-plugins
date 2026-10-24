const validateCredentials = jest.fn()

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  ModelProvider: class {
    getModelManager() { return { validateCredentials } }
  }
}))

import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { VolcengineProviderStrategy } from './provider.strategy.js'

describe('Volcengine provider credential validation', () => {
  const provider = new VolcengineProviderStrategy()
  beforeEach(() => validateCredentials.mockReset())

  it.each([undefined, '', '   '])('rejects a missing or blank key: %p', async (ark_api_key) => {
    await expect(provider.validateProviderCredentials({ ark_api_key })).rejects.toBeInstanceOf(CredentialsValidateFailedError)
    expect(validateCredentials).not.toHaveBeenCalled()
  })

  it('requires the host to test a user-selected model, never a fixed model or undocumented list API', async () => {
    expect(provider.credentialValidation).toEqual({ mode: 'model', modelTypes: [AiModelTypeEnum.LLM] })
    expect('discoverModels' in provider).toBe(false)
    await provider.validateProviderCredentials({ ark_api_key: 'test-key', api_endpoint_host: 'https://proxy.example/api/v3' })
    expect(validateCredentials).not.toHaveBeenCalled()
  })

  it.each(['bad-url', 'ftp://example.com', 'https://user:password@example.com'])('rejects an invalid endpoint: %s', async (api_endpoint_host) => {
    await expect(provider.validateProviderCredentials({ ark_api_key: 'test-key', api_endpoint_host }))
      .rejects.toBeInstanceOf(CredentialsValidateFailedError)
    expect(validateCredentials).not.toHaveBeenCalled()
  })
})

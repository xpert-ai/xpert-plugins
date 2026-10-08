const validateCredentials = jest.fn()

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  ModelProvider: class {
    getModelManager() {
      return { validateCredentials }
    }
  }
}))

import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { VolcengineProviderStrategy } from './provider.strategy.js'

describe('Volcengine provider credential validation', () => {
  const provider = new VolcengineProviderStrategy()

  beforeEach(() => validateCredentials.mockReset())

  it.each([undefined, '', '   '])('rejects a missing or blank key: %p', async (ark_api_key) => {
    await expect(provider.validateProviderCredentials({ ark_api_key })).rejects.toBeInstanceOf(
      CredentialsValidateFailedError
    )
    expect(validateCredentials).not.toHaveBeenCalled()
  })

  it('waits for remote validation and forwards the configured endpoint', async () => {
    const credentials = { ark_api_key: 'test-key', api_endpoint_host: 'https://proxy.example.com/api/v3' }
    let complete: () => void = () => undefined
    validateCredentials.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve }))
    let validated = false
    const pending = provider.validateProviderCredentials(credentials).then(() => { validated = true })

    await Promise.resolve()
    expect(validated).toBe(false)
    expect(validateCredentials).toHaveBeenCalledWith('doubao-seed-2-0-mini-260215', credentials)
    complete()
    await pending
    expect(validated).toBe(true)
  })

  it.each(['Invalid API key', 'Forbidden', 'Request timed out'])('rejects failed validation: %s', async (message) => {
    const error = new CredentialsValidateFailedError(message)
    validateCredentials.mockRejectedValue(error)
    await expect(provider.validateProviderCredentials({ ark_api_key: 'invalid-key' })).rejects.toBe(error)
  })
})

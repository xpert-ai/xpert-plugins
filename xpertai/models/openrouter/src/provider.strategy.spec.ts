jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  ModelProvider: class {
    getProviderSchema() {
      return { provider: 'openrouter' }
    }
  }
}))

import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { OpenRouterProviderStrategy } from './provider.strategy.js'
import { OpenRouterAiBaseUrl } from './types.js'

describe('OpenRouterProviderStrategy', () => {
  let strategy: OpenRouterProviderStrategy

  beforeEach(() => {
    strategy = new OpenRouterProviderStrategy()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('validates credentials through the current API key endpoint', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await expect(strategy.validateProviderCredentials({ api_key: 'test-api-key' })).resolves.toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledWith(`${OpenRouterAiBaseUrl}/key`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-api-key'
      }
    })
  })

  it('returns the provider error when the API key is rejected', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }))

    await expect(strategy.validateProviderCredentials({ api_key: 'invalid-api-key' })).rejects.toEqual(
      new CredentialsValidateFailedError('Unauthorized')
    )
  })
})

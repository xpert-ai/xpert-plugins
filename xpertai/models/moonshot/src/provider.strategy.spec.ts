jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  ModelProvider: class {
    getProviderSchema() {
      return { provider: 'moonshot' };
    }
  },
}));

import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk';
import { MoonshotProviderStrategy } from './provider.strategy.js';
import { MoonshotBaseUrl, MoonshotCredentials } from './types.js';

describe('MoonshotProviderStrategy', () => {
  let strategy: MoonshotProviderStrategy;

  beforeEach(() => {
    strategy = new MoonshotProviderStrategy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates credentials through the model list endpoint', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const credentials: MoonshotCredentials = {
      api_key: 'test-api-key',
    };

    await expect(
      strategy.validateProviderCredentials(credentials)
    ).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(`${MoonshotBaseUrl}/models`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-api-key',
      },
    });
  });

  it('uses the API Base saved by the provider form', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const credentials: MoonshotCredentials = {
      api_key: 'test-api-key',
      endpoint_url: ' https://proxy.example.com/v1/ ',
      base_url: 'https://legacy.example.com/v1',
    };

    await strategy.validateProviderCredentials(credentials);

    expect(strategy.getBaseUrl(credentials)).toBe(
      'https://proxy.example.com/v1/'
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://proxy.example.com/v1/models',
      expect.any(Object)
    );
  });

  it('keeps legacy base_url credentials working', () => {
    expect(
      strategy.getBaseUrl({
        api_key: 'test-api-key',
        base_url: ' https://legacy.example.com/v1 ',
      })
    ).toBe('https://legacy.example.com/v1');
  });

  it('returns the provider error when credential validation fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('Permission denied', { status: 403 }));

    await expect(
      strategy.validateProviderCredentials({ api_key: 'test-api-key' })
    ).rejects.toEqual(
      new CredentialsValidateFailedError('Permission denied')
    );
  });
});

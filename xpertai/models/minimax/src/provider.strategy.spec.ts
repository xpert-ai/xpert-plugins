jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
  CredentialsValidateFailedError: class extends Error {},
  ModelProvider: class {}
}));

import { CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from './provider.strategy.js';
import { toCredentialKwargs } from './types.js';

describe('MiniMax provider credential validation', () => {
  const provider = new MiniMaxProviderStrategy();
  const credentials = { api_key: 'test-key', group_id: 'test-group' };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([undefined, 'https://proxy.example.com', 'https://proxy.example.com/v1/'])(
    'validates using the authenticated model list at %p', async (base_url) => {
      fetchSpy.mockResolvedValue(Response.json({ object: 'list', data: [] }));
      await expect(provider.validateProviderCredentials({ ...credentials, base_url })).resolves.toBeUndefined();
      expect(provider.getBaseUrl({ ...credentials, base_url })).toBe(
        toCredentialKwargs({ ...credentials, base_url }).configuration.baseURL
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        base_url ? 'https://proxy.example.com/v1/models' : 'https://api.minimaxi.com/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-key' },
          signal: expect.any(AbortSignal)
        })
      );
    }
  );

  it.each([401, 403, 429, 500])('rejects HTTP %s', async (status) => {
    fetchSpy.mockResolvedValue(new Response(null, { status }));
    await expect(provider.validateProviderCredentials(credentials)).rejects.toBeInstanceOf(CredentialsValidateFailedError);
  });

  it.each([
    { error: { message: 'Invalid API key' }, data: [] },
    { base_resp: { status_code: 1004, status_msg: 'Authentication failed' }, data: [] },
    {}, null
  ])('rejects an API error or malformed success body: %p', async (body) => {
    fetchSpy.mockResolvedValue(Response.json(body));
    await expect(provider.validateProviderCredentials(credentials)).rejects.toBeInstanceOf(CredentialsValidateFailedError);
  });

  it('rejects a proxy HTML page', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>Login</html>'));
    await expect(provider.validateProviderCredentials(credentials)).rejects.toBeInstanceOf(CredentialsValidateFailedError);
  });

  it.each([new Error('Network failure'), new DOMException('Timed out', 'TimeoutError')])(
    'rejects network failures: %p', async (error) => {
      fetchSpy.mockRejectedValue(error);
      await expect(provider.validateProviderCredentials(credentials)).rejects.toBeInstanceOf(CredentialsValidateFailedError);
    }
  );

  it.each([
    { ...credentials, api_key: ' ' },
    { ...credentials, group_id: ' ' },
    { ...credentials, base_url: 'invalid-url' }
  ])('rejects incomplete credentials before calling the API', async (input) => {
    await expect(provider.validateProviderCredentials(input)).rejects.toBeInstanceOf(CredentialsValidateFailedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

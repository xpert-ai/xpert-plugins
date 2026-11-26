import { HunyuanOpenAIBaseUrl, HunyuanTokenHubBaseUrl, toCredentialKwargs } from './types.js'

it('routes Hy4 to TokenHub, keeps the historical endpoint and honors overrides', () => {
  const credentials = { api_key: 'test' }
  for (const model of ['hy4', 'hy4-flash']) expect(toCredentialKwargs(credentials, model).configuration.baseURL).toBe(HunyuanTokenHubBaseUrl)
  expect(toCredentialKwargs(credentials, 'hunyuan-turbos-latest').configuration.baseURL).toBe(HunyuanOpenAIBaseUrl)
  expect(toCredentialKwargs({ ...credentials, endpoint_url: 'https://example.test/v1/' }, 'hy4').configuration.baseURL).toBe('https://example.test/v1')
})

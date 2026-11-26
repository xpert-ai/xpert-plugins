import { HunyuanLargeLanguageModel } from './llm/llm.js'
import { HunyuanProviderStrategy } from './provider.strategy.js'
import { HunyuanTokenHubBaseUrl, toCredentialKwargs } from './types.js'

const credentials = { api_key: 'test' }

afterEach(() => jest.restoreAllMocks())

it('routes predefined models and explicit TokenHub role model IDs to the live endpoint', () => {
  for (const model of ['hy4', 'hy4-flash', 'hunyuan-role-latest', 'hy-role']) {
    expect(toCredentialKwargs(credentials, model)).toMatchObject({
      model, configuration: { baseURL: HunyuanTokenHubBaseUrl }
    })
  }
  const models = new HunyuanLargeLanguageModel(new HunyuanProviderStrategy()).predefinedModels().map(schema => schema.model)
  expect(models).toEqual(expect.arrayContaining(['hy4', 'hy4-flash']))
  expect(models).not.toContain('hunyuan-role')
  expect(models).not.toContain('hunyuan-turbos-latest')
})

it('validates TokenHub credentials with one authenticated model-list request', async () => {
  const request = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ data: [{ id: 'hy4' }] }))
  await new HunyuanProviderStrategy().validateProviderCredentials(credentials)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith(HunyuanTokenHubBaseUrl + '/models', expect.objectContaining({
    headers: { Authorization: 'Bearer test' }
  }))
})

it.each<[Response, string]>([
  [new Response(null, { status: 401 }), 'HTTP 401'],
  [Response.json({}), 'invalid model list']
])('rejects an unsuccessful TokenHub credential check', async (response, message) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(response)
  await expect(new HunyuanProviderStrategy().validateProviderCredentials(credentials)).rejects.toThrow(message)
})

it('keeps custom endpoint and model overrides for inference and validation', async () => {
  const provider = new HunyuanProviderStrategy()
  const manager = new HunyuanLargeLanguageModel(provider)
  const validate = jest.spyOn(manager, 'validateCredentials').mockResolvedValue(undefined)
  const custom = { ...credentials, endpoint_url: 'https://example.test/v1/' }
  const request = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ data: [] }))
  await provider.validateProviderCredentials(custom)
  expect(request).toHaveBeenCalledWith('https://example.test/v1/models', expect.anything())
  expect(validate).not.toHaveBeenCalled()
  request.mockResolvedValueOnce(new Response(null, { status: 405 }))
  await provider.validateProviderCredentials(custom)
  expect(validate).toHaveBeenCalledWith('hunyuan-turbos-latest', custom)
  const role = { ...custom, endpoint_model_name: 'hunyuan-role-latest' }
  await provider.validateProviderCredentials(role)
  expect(validate).toHaveBeenCalledWith('hunyuan-role-latest', role)
  expect(toCredentialKwargs(role, 'hy4')).toMatchObject({
    model: 'hunyuan-role-latest', configuration: { baseURL: 'https://example.test/v1' }
  })
})

it('keeps a rejected official regional endpoint on TokenHub', async () => {
  const provider = new HunyuanProviderStrategy()
  const validate = jest.spyOn(new HunyuanLargeLanguageModel(provider), 'validateCredentials').mockResolvedValue(undefined)
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
  await expect(provider.validateProviderCredentials({ ...credentials, endpoint_url: 'https://tokenhub-intl.tencentmaas.com/v1' }))
    .rejects.toThrow('HTTP 404')
  expect(validate).not.toHaveBeenCalled()
})

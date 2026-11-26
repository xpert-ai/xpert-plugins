import { GeminiProviderStrategy } from '../provider.strategy.js'
import { GeminiLargeLanguageModel } from './llm.js'

it('removes shut-down models while keeping the two restricted 2.5 models for existing projects', () => {
  const provider = new GeminiProviderStrategy()
  const schemas = new GeminiLargeLanguageModel(provider).predefinedModels()
  const models = new Map(schemas.map(schema => [schema.model, schema]))
  for (const id of ['gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.5-pro-preview-06-05', 'gemini-3-pro-preview', 'gemini-3-pro-image-preview']) {
    expect(models.has(id)).toBe(false)
  }
  for (const id of ['gemini-2.5-flash', 'gemini-2.5-pro']) expect(models.get(id)?.deprecated).toBe(true)
  for (const id of ['gemini-2.5-flash-lite', 'gemini-4-carbon', 'gemini-flash-lite-latest']) {
    expect(models.has(id)).toBe(true)
    expect(models.get(id)?.deprecated).not.toBe(true)
  }
})

it('checks new credentials using the Flash-Lite alias', async () => {
  const provider = new GeminiProviderStrategy()
  const manager = new GeminiLargeLanguageModel(provider)
  const validate = jest.spyOn(manager, 'validateCredentials').mockResolvedValue(undefined)
  await provider.validateProviderCredentials({ google_api_key: 'test' })
  expect(validate).toHaveBeenCalledWith('gemini-flash-lite-latest', { google_api_key: 'test' })
})

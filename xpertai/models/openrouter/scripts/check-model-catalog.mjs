import { OpenRouterProviderStrategy } from '../dist/provider.strategy.js'
import { OpenRouterLargeLanguageModel } from '../dist/llm/llm.js'
import { OpenRouterSpeech2TextModel } from '../dist/speech2text/speech2text.js'
import { OpenRouterTTSModel } from '../dist/tts/tts.js'

const baseUrl = 'https://openrouter.ai/api/v1'
const provider = new OpenRouterProviderStrategy()

async function catalog(path) {
  const response = await fetch(baseUrl + path, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status} for ${path}`)
  return (await response.json()).data
}

const catalogs = [
  ['chat', new OpenRouterLargeLanguageModel(provider), '/models'],
  ['speech', new OpenRouterTTSModel(provider), '/audio/speech/models'],
  ['transcription', new OpenRouterSpeech2TextModel(provider), '/models?output_modalities=transcription']
]
for (const [name, manager, path] of catalogs) {
  const entries = await catalog(path)
  if (!Array.isArray(entries) || !entries.length) throw new Error(`Empty or invalid ${name} catalog`)
  const published = new Map(entries.map(entry => [entry.id, entry]))
  const models = manager.predefinedModels()
  if (!models.length) throw new Error(`Packaged ${name} catalog is empty`)
  let unavailable = 0
  for (const { model, model_properties: properties } of models) {
    if (published.has(model)) {
      if (name === 'speech') {
        const defaultSupported = published.get(model).endpoints.some(endpoint =>
          endpoint.output_modalities.some(({ supported_parameters: params }) =>
            params?.response_format?.values?.includes('mp3') && params?.voice?.values?.includes(properties.default_voice)
          )
        )
        if (!defaultSupported) throw new Error(`${model} has no route for its default voice and MP3`)
      }
      continue
    }
    // OpenRouter can omit a working alias from the chat index.
    if (name === 'chat') {
      const detail = await catalog(`/models/${model}/endpoints`)
      if (!Array.isArray(detail?.endpoints)) throw new Error(`Invalid endpoint response for ${model}`)
      if (detail.endpoints.length) continue
    }
    console.error(`${name}: ${model} has no public route`)
    unavailable++
  }
  console.log(`${name}: ${models.length} packaged, ${unavailable} unavailable`)
  if (unavailable) process.exitCode = 1
}

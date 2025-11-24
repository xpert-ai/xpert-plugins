import { XinferenceLargeLanguageModel } from './llm.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { ModelFeature, ParameterType } from '@metad/contracts'

const provider = new XinferenceProviderStrategy()
const llm = new XinferenceLargeLanguageModel(provider)

const credentials = {
  completion_type: 'chat',
  support_function_call: true,
  support_vision: false,
  context_length: 4096,
  api_key: 'test',
  server_url: 'http://localhost:9997'
}

const schema = llm.getCustomizableModelSchemaFromCredentials('test-model', credentials)

console.log('Schema:', JSON.stringify(schema, null, 2))

if (schema?.features?.includes(ModelFeature.TOOL_CALL)) {
  console.log('✅ Tool call feature detected')
} else {
  console.error('❌ Tool call feature NOT detected')
}

if (schema?.parameter_rules?.find((r) => r.name === 'presence_penalty')) {
  console.log('✅ Presence penalty rule detected')
} else {
  console.error('❌ Presence penalty rule NOT detected')
}

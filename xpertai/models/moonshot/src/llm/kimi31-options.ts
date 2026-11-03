import type { ChatOpenAIFields } from '@langchain/openai'
import { normalizeMoonshotJsonSchema, type MoonshotJsonSchema } from './moonshot-json-schema.js'

type Kimi31Options = {
  max_completion_tokens?: number
  reasoning_effort?: string
  response_format?: string
  json_schema?: string | MoonshotJsonSchema
}

/** K3.1 uses completion tokens and always-on thinking, independent of temperature. */
export function buildKimi31Options(options: Kimi31Options): NonNullable<ChatOpenAIFields['modelKwargs']> {
  const effort = options.reasoning_effort ?? 'max'
  if (!['low', 'high', 'max'].includes(effort)) throw new Error('Kimi K3.1: unsupported reasoning_effort')
  const max = options.max_completion_tokens ?? 131072
  if (!Number.isInteger(max) || max < 1 || max > 1048576) throw new Error('Kimi K3.1: invalid max_completion_tokens')
  const params: NonNullable<ChatOpenAIFields['modelKwargs']> = {
    max_completion_tokens: max,
    reasoning_effort: effort
  }
  if (options.response_format === 'json_schema') {
    const schema: MoonshotJsonSchema = typeof options.json_schema === 'string'
      ? JSON.parse(options.json_schema)
      : options.json_schema
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Kimi K3.1: json_schema must be an object')
    params.response_format = { type: 'json_schema', json_schema: { name: 'response', schema: normalizeMoonshotJsonSchema(schema) } }
  } else if (options.response_format === 'text' || options.response_format === 'json_object') {
    params.response_format = { type: options.response_format }
  } else if (options.response_format !== undefined) {
    throw new Error('Kimi K3.1: unsupported response_format')
  }
  return params
}

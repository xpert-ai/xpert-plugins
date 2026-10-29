// Native requests keep Responses items intact. Credentials are supplied only by the host.
import { z } from 'zod'
import { nativeModelTransport, type NativeModelBody, type NativeModelClient } from '@xpert-ai/plugin-sdk'

export const reasoningEffortSchema = z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const nativeCredentialsSchema = z.object({
  api_protocol: z.literal('responses'),
  api_key: z.string().min(1),
  endpoint_url: z.string().url(),
  endpoint_model_name: z.string().min(1).optional(),
  disable_prompt_cache_key: z.boolean().optional(),
  reasoning_effort: reasoningEffortSchema.optional()
})

export function compatibleResponsesTransport(properties: unknown, fetcher?: typeof fetch): NativeModelClient['generate'] {
  const settings = nativeCredentialsSchema.parse(properties)
  const generate = nativeModelTransport({
    protocol: 'openai_responses',
    baseUrl: settings.endpoint_url,
    authorization: `Bearer ${settings.api_key}`,
    fetch: fetcher
  })
  return (body, headers, signal) => {
    const request: NativeModelBody = { ...body, store: false }
    if (settings.disable_prompt_cache_key) delete request.prompt_cache_key
    if (settings.endpoint_model_name) request.model = settings.endpoint_model_name
    const reasoning = request.reasoning
    if (reasoning != null) {
      const parsed = z.object({ effort: reasoningEffortSchema.optional() }).parse(reasoning)
      if (typeof reasoning !== 'object' || Array.isArray(reasoning)) throw new Error('Invalid reasoning options')
      if (parsed.effort === undefined && settings.reasoning_effort)
        request.reasoning = { ...reasoning, effort: settings.reasoning_effort }
    } else if (settings.reasoning_effort) request.reasoning = { effort: settings.reasoning_effort }
    return generate(request, headers, signal)
  }
}

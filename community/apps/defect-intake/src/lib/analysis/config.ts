import { z } from 'zod/v3'
const modelOptionsSchema = z.object({ temperature: z.number().min(0).max(2).nullish(), max_tokens: z.number().int().positive().nullish() }).passthrough()
export function modelInvocationOptions(options: unknown) {
  const configured = modelOptionsSchema.parse(options ?? {})
  return { ...configured, temperature: configured.temperature ?? 0.2, maxRetries: 0, max_tokens: Math.min(configured.max_tokens ?? 8192, 8192) }
}
export const analysisConfigSchema = z.object({
  model: z.object({
    copilotId: z.string().uuid(), model: z.string().min(1).max(120), modelType: z.literal('llm').optional(),
    options: modelOptionsSchema.nullish()
  }).passthrough().nullish()
}).strict()

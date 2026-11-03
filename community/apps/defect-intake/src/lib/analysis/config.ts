import { z } from 'zod/v3'
export const analysisConfigSchema = z.object({
  model: z.object({
    copilotId: z.string().uuid(), model: z.string().min(1).max(120), modelType: z.literal('llm').optional(),
    options: z.object({ temperature: z.number().min(0).max(2).nullish() }).passthrough().nullish()
  }).passthrough().nullish()
}).strict()

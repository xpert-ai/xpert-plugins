import { z } from 'zod/v3'
import { CTRIP_WENDAO_MAX_QUERY_LENGTH } from './constants.js'

export const queryCtripWendaoSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(CTRIP_WENDAO_MAX_QUERY_LENGTH)
      .describe('A complete travel question, including relevant city, dates, budget, and preferences.')
  })
  .strict()

export type QueryCtripWendaoToolInput = z.infer<typeof queryCtripWendaoSchema>

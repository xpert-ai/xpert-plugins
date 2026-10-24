import type { z } from 'zod'
import { z as zod } from 'zod'

export const FactoryConfigSchema = zod
  .object({
    mode: zod.enum(['simulation', 'external']),
    debug: zod.boolean()
  })
  .strict()

export type FactoryConfig = z.infer<typeof FactoryConfigSchema>
export const FACTORY_CONFIG = Symbol('FACTORY_CONFIG')

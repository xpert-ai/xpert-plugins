import { z } from 'zod'
export const ConfigSchema = z
  .object({ mode: z.literal('mock'), debug: z.boolean() })
  .strict()
export const RUNTIME_SCOPE = Symbol('MATERIAL_IDENTITY_RUNTIME_SCOPE')
export interface InstallationScope {
  scopeKey: string
}

import { z } from 'zod/v3'
import { requestHost } from './bridge'

export async function libraryAction<T>(actionKey: string, input: object, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const result = z.object({ success: z.literal(true), data: z.unknown() }).parse(await requestHost('executeAction', { actionKey, input }))
  return schema.parse(result.data)
}

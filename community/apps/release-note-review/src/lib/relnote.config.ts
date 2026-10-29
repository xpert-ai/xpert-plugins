import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const RelnotePluginConfigSchema = z.object({ failureInjection: z.enum(['none', 'read', 'save']).default('none') })
export type RelnotePluginConfig = z.infer<typeof RelnotePluginConfigSchema>
export const RelnotePluginConfigFormSchema = { type: 'object', properties: { failureInjection: { type: 'string', title: text('Failure injection', '故障注入'), description: text('Demo-only failure injection for retry verification.', '仅用于演示失败重试验收。'), enum: ['none', 'read', 'save'] } } } satisfies JsonSchemaObjectType
export function readRelnotePluginEnvDefaults(): RelnotePluginConfig { return { failureInjection: 'none' } }

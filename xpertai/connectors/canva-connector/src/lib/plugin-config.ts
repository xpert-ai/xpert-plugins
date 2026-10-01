import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

/**
 * Legacy direct-login settings remain parseable so existing credentials can be
 * refreshed. New connections always resolve their client from System Integration.
 */
export const CanvaPluginConfigSchema = z
  .object({
    mcpRegistration: z.enum(['dcr', 'static']).default('dcr'),
    mcpClientId: z.string().trim().min(1).max(512).optional()
  })
  .strict()
  .superRefine((config, context) => {
    if (config.mcpRegistration === 'static' && !config.mcpClientId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mcpClientId'],
        message: 'mcpClientId is required when mcpRegistration is static'
      })
    }
  })

export type CanvaPluginConfig = z.infer<typeof CanvaPluginConfigSchema>

export const CanvaPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}

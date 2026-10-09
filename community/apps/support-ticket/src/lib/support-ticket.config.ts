import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

/**
 * `aiTimeoutSeconds` is the watchdog budget the workbench uses while waiting for the
 * assistant tool call. When it elapses the ticket is marked failed with a readable reason
 * and can be retried without creating a second business record.
 */
export const SupportTicketPluginConfigSchema = z.object({
  aiTimeoutSeconds: z.number().int().min(15).max(600).default(90)
})

export type SupportTicketConfig = z.infer<typeof SupportTicketPluginConfigSchema>

export const SUPPORT_TICKET_CONFIG = Symbol('SUPPORT_TICKET_CONFIG')

export const SupportTicketPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    aiTimeoutSeconds: {
      type: 'number',
      title: {
        en_US: 'AI processing timeout (seconds)',
        zh_Hans: 'AI 处理超时（秒）'
      },
      minimum: 15,
      maximum: 600,
      default: 90
    }
  }
}

export function readSupportTicketPluginEnvDefaults(): SupportTicketConfig {
  const rawTimeout = Number(process.env['SUPPORT_TICKET_AI_TIMEOUT_SECONDS'])
  return {
    aiTimeoutSeconds: Number.isInteger(rawTimeout) && rawTimeout >= 15 && rawTimeout <= 600 ? rawTimeout : 90
  }
}

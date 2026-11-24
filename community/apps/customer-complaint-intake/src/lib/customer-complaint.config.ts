import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const CustomerComplaintPluginConfigSchema = z.object({
  debug: z.boolean().default(false)
})

export const CustomerComplaintPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    debug: {
      type: 'boolean',
      title: {
        en_US: 'Debug logging',
        zh_Hans: '调试日志'
      },
      default: false
    }
  }
}

export function readCustomerComplaintPluginEnvDefaults() {
  return {
    debug: process.env['CUSTOMER_COMPLAINT_DEBUG'] === 'true'
  }
}

import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const ScrapeTaskIntakePluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dedupeLookbackDays: z.number().int().min(1).max(30).default(7)
})

export const ScrapeTaskIntakePluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: {
        en_US: 'Enabled',
        zh_Hans: '启用'
      },
      default: true
    },
    dedupeLookbackDays: {
      type: 'number',
      title: {
        en_US: 'Duplicate task lookback days',
        zh_Hans: '重复任务回溯天数'
      },
      minimum: 1,
      maximum: 30,
      default: 7
    }
  }
}

export function readScrapeTaskIntakePluginEnvDefaults() {
  const rawLookbackDays = Number(process.env['SCRAPE_TASK_INTAKE_DEDUPE_LOOKBACK_DAYS'])
  return {
    enabled: process.env['SCRAPE_TASK_INTAKE_ENABLED'] !== 'false',
    dedupeLookbackDays: Number.isInteger(rawLookbackDays) && rawLookbackDays > 0 ? rawLookbackDays : 7
  }
}
